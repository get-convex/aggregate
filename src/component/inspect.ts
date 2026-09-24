import { getConvexSize, v } from "convex/values";
import { components } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { type DatabaseReader, query } from "./_generated/server.js";
import { getTree, type Namespace, p } from "./btree.js";
import schema from "./schema.js";
import { OPS_WORKER_NAME } from "./worker.js";

export const display = query({
  args: { namespace: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const tree = await getTree(ctx.db, args.namespace);
    if (!tree) {
      return "empty";
    }
    return await displayNode(ctx.db, tree.root);
  },
});

async function displayNode(
  db: DatabaseReader,
  node: Id<"btreeNode">,
  depth: number = 0,
) {
  const n = (await db.get("btreeNode", node))!;
  for (let i = 0; i < n.items.length; i++) {
    if (n.subtrees.length > 0) {
      await displayNode(db, n.subtrees[i], depth + 1);
    }
    console.log(" ".repeat(depth) + p(n.items[i].k));
  }
  if (n.subtrees.length > 0) {
    await displayNode(db, n.subtrees[n.subtrees.length - 1], depth + 1);
  }
}

export const dump = query({
  args: { namespace: v.optional(v.any()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await dumpTree(ctx.db, args.namespace);
  },
});

export async function dumpTree(db: DatabaseReader, namespace: Namespace) {
  const t = (await getTree(db, namespace))!;
  return dumpNode(db, t.root);
}

/// Prints keys in-order, with brackets for each node.
async function dumpNode(
  db: DatabaseReader,
  node: Id<"btreeNode">,
): Promise<string> {
  const n = (await db.get("btreeNode", node))!;
  let s = "[";
  if (n.subtrees.length === 0) {
    s += n.items
      .map((i) => i.k)
      .map(p)
      .join(", ");
  } else {
    const subtrees = await Promise.all(
      n.subtrees.map((subtree) => dumpNode(db, subtree)),
    );
    for (let i = 0; i < n.items.length; i++) {
      s += `${subtrees[i]}, ${p(n.items[i].k)}, `;
    }
    s += subtrees[n.items.length];
  }
  s += "]";
  return s;
}

export const inspectNode = query({
  args: { node: v.optional(v.string()), namespace: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tree = await getTree(ctx.db, args.namespace);
    if (!tree) {
      console.log("no tree");
      return;
    }
    let n = await ctx.db.get("btreeNode", tree.root);
    if (args.node) {
      n = await ctx.db.get("btreeNode", args.node as Id<"btreeNode">);
    }
    if (!n) {
      console.log("no node");
      return;
    }
    console.log("btreeNode", n._id);
    console.log("aggregate", n.aggregate);
    for (let i = 0; i < n.items.length; i++) {
      if (n.subtrees.length > 0) {
        console.log("subtree", n.subtrees[i]);
      }
      console.log("item", n.items[i]);
    }
    if (n.subtrees.length > 0) {
      console.log("subtree", n.subtrees[n.subtrees.length - 1]);
    }
  },
});

export const listTrees = query({
  args: {
    take: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      ...schema.tables.btree.validator.fields,
      _id: v.id("btree"),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const values = await ctx.db.query("btree").take(args.take ?? 100);
    return values;
  },
});

export const listTreeNodes = query({
  args: {
    take: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      ...schema.tables.btreeNode.validator.fields,
      _id: v.id("btreeNode"),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const values = await ctx.db.query("btreeNode").take(args.take ?? 100);
    return values;
  },
});

// How many queued rows `queueStats` looks at by default, and the most it will
// ever look at. Counting the whole queue is unbounded O(n) document reads, and
// `enqueueOperations` packs rows up to MAX_BYTES_PER_ENTRY (100 KiB), so an
// unbounded count would blow the 16 MiB read limit exactly when the queue is
// deepest — which is when you most want the number. Callers get a bounded count
// plus `truncated`.
const DEFAULT_STATS_LIMIT = 128;
const MAX_STATS_LIMIT = 1024;
// Stop early if the rows read get large, for the same reason getBatch budgets
// its reads — and with the same 4 MiB budget getBatch gives itself.
const STATS_READ_BUDGET_BYTES = 4 * 1024 * 1024;

/**
 * Inspect the async-write queue: how many enqueued operations are still waiting
 * to be applied, and whether the background worker is running.
 *
 * Bounded — it looks at up to `limit` queued rows (default 128, max 1024) and
 * sets `truncated` when there are more, so it stays cheap on a deep queue. One
 * transaction can hold several rows, so `limit` bounds rows, not transactions.
 * When `truncated` is true, `rows`/`operations`/`bytes` are lower bounds and
 * `newestObservedCommitTs` is the last row looked at rather than the newest
 * queued one, so `newestObservedCommitTs - oldestCommitTs` understates lag.
 *
 * Deliberately says nothing about how far the worker has drained: the cursor
 * lives in the batch worker's high-churn state document, so reading it would
 * invalidate this query — and anything subscribed to it — every cycle.
 * `operations` already says what's left to do.
 *
 * Never asserts the queue is empty, unlike the read and write paths that throw
 * `PENDING_OPERATIONS`: reading a non-empty queue is the entire point.
 */
export const queueStats = query({
  args: {
    limit: v.optional(v.number()),
    // Set false to skip the nested batch-worker status query: one fewer nested
    // query, and the result stops invalidating when the worker transitions
    // between idle and running.
    includeWorker: v.optional(v.boolean()),
  },
  returns: v.object({
    rows: v.number(),
    operations: v.number(),
    bytes: v.number(),
    truncated: v.boolean(),
    oldestCommitTs: v.union(v.int64(), v.null()),
    newestObservedCommitTs: v.union(v.int64(), v.null()),
    worker: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("stopped"),
      v.null(),
    ),
  }),
  handler: async (ctx, { limit, includeWorker }) => {
    // `v.number()` admits NaN and Infinity, and a NaN cap would make the row
    // check below never fire, so anything non-finite falls back to the default.
    const requested =
      limit === undefined || !Number.isFinite(limit)
        ? DEFAULT_STATS_LIMIT
        : Math.floor(limit);
    const cap = Math.min(Math.max(requested, 1), MAX_STATS_LIMIT);
    let rows = 0;
    let operations = 0;
    let bytes = 0;
    let truncated = false;
    let oldestCommitTs: bigint | null = null;
    let newestObservedCommitTs: bigint | null = null;
    for await (const row of ctx.db
      .query("pendingOperations")
      .withIndex("by_commitTs")) {
      if (rows >= cap || bytes >= STATS_READ_BUDGET_BYTES) {
        truncated = true;
        break;
      }
      rows++;
      operations += row.operations.length;
      bytes += getConvexSize(row);
      // A row's commitTs is late-bound: inside its own enqueuing transaction it
      // reads back as a placeholder rather than a bigint. A committed row always
      // has a real one, but guard anyway (as getBatch does).
      const ts = row.commitTs;
      if (typeof ts === "bigint") {
        if (oldestCommitTs === null) oldestCommitTs = ts;
        newestObservedCommitTs = ts;
      }
    }
    const worker =
      includeWorker === false
        ? null
        : await ctx.runQuery(components.batchWorker.lib.status, {
            name: OPS_WORKER_NAME,
          });
    return {
      rows,
      operations,
      bytes,
      truncated,
      oldestCommitTs,
      newestObservedCommitTs,
      worker: worker?.kind ?? null,
    };
  },
});

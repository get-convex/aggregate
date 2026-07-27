import { getConvexSize, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import {
  assertNoPendingOperations,
  DEFAULT_MAX_NODE_SIZE,
  deleteHandler,
  deleteIfExistsHandler,
  getOrCreateTree,
  getTree,
  insertHandler,
  OPS_WORKER_NAME,
  replaceHandler,
  replaceOrInsertHandler,
} from "./btree.js";
import { enqueueOperation } from "./worker.js";
import { components, internal } from "./_generated/api.js";
import { vOperation } from "./schema.js";

export const init = mutation({
  args: {
    maxNodeSize: v.optional(v.number()),
    rootLazy: v.optional(v.boolean()),
    namespace: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, { maxNodeSize, rootLazy, namespace }) => {
    const existing = await getTree(ctx.db, namespace);
    if (existing) {
      throw new Error("tree already initialized");
    }
    await getOrCreateTree(
      ctx.db,
      namespace,
      maxNodeSize ?? DEFAULT_MAX_NODE_SIZE,
      rootLazy ?? true,
    );
  },
});

/**
 * Call this mutation to reduce contention at the expense of more reads.
 * This is useful if writes are frequent and serializing all writes is
 * detrimental.
 * Lazy roots are the default; use `clear` to revert to eager roots.
 */
export const makeRootLazy = mutation({
  args: { namespace: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tree = await getOrCreateTree(
      ctx.db,
      args.namespace,
      DEFAULT_MAX_NODE_SIZE,
      true,
    );
    await ctx.db.patch("btreeNode", tree.root, { aggregate: undefined });
  },
});

export const insert = mutation({
  args: {
    key: v.any(),
    value: v.any(),
    summand: v.optional(v.number()),
    namespace: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertNoPendingOperations(ctx);
    await insertHandler(ctx, args);
  },
});

// delete is a keyword, hence the underscore.
export const delete_ = mutation({
  args: { key: v.any(), namespace: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertNoPendingOperations(ctx);
    await deleteHandler(ctx, args);
  },
});

export const replace = mutation({
  args: {
    currentKey: v.any(),
    newKey: v.any(),
    value: v.any(),
    summand: v.optional(v.number()),
    namespace: v.optional(v.any()),
    newNamespace: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertNoPendingOperations(ctx);
    await replaceHandler(ctx, args);
  },
});

export const deleteIfExists = mutation({
  args: { key: v.any(), namespace: v.optional(v.any()) },
  handler: async (ctx, args) => {
    await assertNoPendingOperations(ctx);
    await deleteIfExistsHandler(ctx, args);
  },
});

export const replaceOrInsert = mutation({
  args: {
    currentKey: v.any(),
    newKey: v.any(),
    value: v.any(),
    summand: v.optional(v.number()),
    namespace: v.optional(v.any()),
    newNamespace: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertNoPendingOperations(ctx);
    await replaceOrInsertHandler(ctx, args);
  },
});

export const enqueue = mutation({
  args: {
    operation: vOperation,
  },
  returns: v.null(),
  handler: async (ctx, { operation }) => {
    await enqueueOperation(ctx, operation);
  },
});

// How many queued rows `queueStats` looks at by default, and the
// most it will ever look at. Counting the whole queue is unbounded O(n) document
// reads, and a single pendingOperations row can approach Convex's ~1 MiB document
// limit — so an unbounded count would blow the 16 MiB read limit exactly when
// the queue is deepest, which is when you most want the number. Callers get a
// bounded count plus `truncated`.
const DEFAULT_STATS_LIMIT = 128;
const MAX_STATS_LIMIT = 1024;
// Stop early if the rows read get large, for the same reason getBatch budgets
// its reads. Half of getBatch's budget: this query does nothing else.
const STATS_READ_BUDGET_BYTES = 4 * 1024 * 1024;

/**
 * Inspect the async-write queue: how many enqueued operations are still waiting
 * to be applied, and whether the background worker is running.
 *
 * Bounded — it looks at up to `limit` queued rows (default 128, max 1024) and
 * sets `truncated` when there are more, so it stays cheap on a deep queue. One
 * transaction can hold several rows, so `limit` bounds rows, not transactions.
 * `rows`/`operations`/`bytes` are lower bounds when `truncated` is true.
 *
 * Deliberately says nothing about how far the worker has drained. The cursor
 * lives in the batch worker, which rewrites it every cycle, so reading it here
 * would make this query — and anything subscribed to it — invalidate on every
 * cycle. `operations` already says what's left to do.
 *
 * Unlike the other reads here, this never calls `assertNoPendingOperations`: reading a
 * non-empty queue is the entire point.
 */
export const queueStats = query({
  args: {
    limit: v.optional(v.number()),
    // Set false to skip the nested batch-worker status query. Cheaper on a hot
    // subscription: the worker rewrites its status document as it runs, so
    // reading it makes this query re-run on that cadence.
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
    const cap = Math.min(
      Math.max(limit ?? DEFAULT_STATS_LIMIT, 1),
      MAX_STATS_LIMIT,
    );
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
      // has a real one, but guard anyway (as processBatch does).
      const ts = row.commitTs;
      if (typeof ts === "bigint") {
        if (oldestCommitTs === null) oldestCommitTs = ts;
        newestObservedCommitTs = ts;
      }
    }
    const worker =
      includeWorker === false
        ? null
        : ((await ctx.runQuery(components.batchWorker.lib.status, {
            name: OPS_WORKER_NAME,
          })) ?? null);
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

/**
 * Reinitialize the aggregate data structure, clearing all data.
 * maxNodeSize is the sharding coefficient for the underlying btree.
 * rootLazy is whether to compute aggregates at the root eagerly or lazily.
 * If either is not provided, the existing value is preserved.
 */
export const clear = mutation({
  args: {
    namespace: v.optional(v.any()),
    maxNodeSize: v.optional(v.number()),
    rootLazy: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { maxNodeSize, rootLazy, namespace }) => {
    await assertNoPendingOperations(ctx);
    const tree = await getTree(ctx.db, namespace);
    let existingRootLazy = true;
    let existingMaxNodeSize = DEFAULT_MAX_NODE_SIZE;
    if (tree) {
      await ctx.db.delete("btree", tree._id);
      const root = (await ctx.db.get("btreeNode", tree.root))!;
      existingRootLazy = root.aggregate === undefined;
      existingMaxNodeSize = tree.maxNodeSize;
      await ctx.scheduler.runAfter(0, internal.btree.deleteTreeNodes, {
        node: tree.root,
      });
    }
    await getOrCreateTree(
      ctx.db,
      namespace,
      maxNodeSize ?? existingMaxNodeSize,
      rootLazy ?? existingRootLazy,
    );
  },
});

import { ConvexError, v, type Value } from "convex/values";
import { mutation, type DatabaseWriter } from "./_generated/server.js";
import {
  DEFAULT_MAX_NODE_SIZE,
  deleteHandler,
  getOrCreateTree,
  getTree,
  insertHandler,
  type Key,
  type Namespace,
} from "./btree.js";
import { internal } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";

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
    await ctx.db.patch(tree.root, { aggregate: undefined });
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
  handler: insertHandler,
});

// delete is a keyword, hence the underscore.
export const delete_ = mutation({
  args: { key: v.any(), namespace: v.optional(v.any()) },
  returns: v.null(),
  handler: deleteHandler,
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
  handler: replaceHandler,
});

async function replaceHandler(
  ctx: { db: DatabaseWriter },
  args: {
    currentKey: Key;
    newKey: Key;
    value: Value;
    summand?: number;
    namespace?: Namespace;
    newNamespace?: Namespace;
  },
  treeArg?: Doc<"btree">,
  newTreeArg?: Doc<"btree">,
) {
  await deleteHandler(
    ctx,
    {
      key: args.currentKey,
      namespace: args.namespace,
    },
    treeArg,
  );
  await insertHandler(
    ctx,
    {
      key: args.newKey,
      value: args.value,
      summand: args.summand,
      namespace: args.newNamespace,
    },
    newTreeArg,
  );
}

export const deleteIfExists = mutation({
  args: { key: v.any(), namespace: v.optional(v.any()) },
  handler: deleteIfExistsHandler,
});

async function deleteIfExistsHandler(
  ctx: { db: DatabaseWriter },
  args: { key: Key; namespace?: Namespace },
  treeArg?: Doc<"btree">,
) {
  try {
    await deleteHandler(ctx, args, treeArg);
  } catch (e) {
    if (e instanceof ConvexError && e.data?.code === "DELETE_MISSING_KEY") {
      return;
    }
    throw e;
  }
}

export const replaceOrInsert = mutation({
  args: {
    currentKey: v.any(),
    newKey: v.any(),
    value: v.any(),
    summand: v.optional(v.number()),
    namespace: v.optional(v.any()),
    newNamespace: v.optional(v.any()),
  },
  handler: replaceOrInsertHandler,
});

async function replaceOrInsertHandler(
  ctx: { db: DatabaseWriter },
  args: {
    currentKey: Key;
    newKey: Key;
    value: Value;
    summand?: number;
    namespace?: Namespace;
    newNamespace?: Namespace;
  },
  treeArg?: Doc<"btree">,
  newTreeArg?: Doc<"btree">,
) {
  try {
    await deleteHandler(
      ctx,
      {
        key: args.currentKey,
        namespace: args.namespace,
      },
      treeArg,
    );
  } catch (e) {
    if (!(e instanceof ConvexError && e.data?.code === "DELETE_MISSING_KEY")) {
      throw e;
    }
  }
  await insertHandler(
    ctx,
    {
      key: args.newKey,
      value: args.value,
      summand: args.summand,
      namespace: args.newNamespace,
    },
    newTreeArg,
  );
}

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
    const tree = await getTree(ctx.db, namespace);
    let existingRootLazy = true;
    let existingMaxNodeSize = DEFAULT_MAX_NODE_SIZE;
    if (tree) {
      await ctx.db.delete(tree._id);
      const root = (await ctx.db.get(tree.root))!;
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

/**
 * Batch mutation that processes multiple operations efficiently by fetching
 * the tree once and passing it to all handlers.
 */
export const batch = mutation({
  args: {
    operations: v.array(
      v.union(
        v.object({
          type: v.literal("insert"),
          key: v.any(),
          value: v.any(),
          summand: v.optional(v.number()),
          namespace: v.optional(v.any()),
        }),
        v.object({
          type: v.literal("delete"),
          key: v.any(),
          namespace: v.optional(v.any()),
        }),
        v.object({
          type: v.literal("replace"),
          currentKey: v.any(),
          newKey: v.any(),
          value: v.any(),
          summand: v.optional(v.number()),
          namespace: v.optional(v.any()),
          newNamespace: v.optional(v.any()),
        }),
        v.object({
          type: v.literal("deleteIfExists"),
          key: v.any(),
          namespace: v.optional(v.any()),
        }),
        v.object({
          type: v.literal("replaceOrInsert"),
          currentKey: v.any(),
          newKey: v.any(),
          value: v.any(),
          summand: v.optional(v.number()),
          namespace: v.optional(v.any()),
          newNamespace: v.optional(v.any()),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { operations }) => {
    // Map to store trees for each namespace
    const treesMap = new Map<string, ReturnType<typeof getOrCreateTree>>();

    // Helper function to get or create tree for a namespace
    const getTreeForNamespace = async (namespace: any) => {
      // Use a sentinel value for undefined namespace since JSON.stringify(undefined) returns undefined
      const key =
        namespace === undefined ? "__undefined__" : JSON.stringify(namespace);
      if (!treesMap.has(key)) {
        treesMap.set(
          key,
          getOrCreateTree(ctx.db, namespace, DEFAULT_MAX_NODE_SIZE, true),
        );
      }
      return await treesMap.get(key)!;
    };

    // Process operations in order
    for (const op of operations) {
      if (op.type === "insert") {
        const tree = await getTreeForNamespace(op.namespace);
        await insertHandler(
          ctx,
          {
            key: op.key,
            value: op.value,
            summand: op.summand,
            namespace: op.namespace,
          },
          tree,
        );
      } else if (op.type === "delete") {
        const tree = await getTreeForNamespace(op.namespace);
        await deleteHandler(
          ctx,
          {
            key: op.key,
            namespace: op.namespace,
          },
          tree,
        );
      } else if (op.type === "replace") {
        // Handle delete from original namespace
        const deleteTree = await getTreeForNamespace(op.namespace);
        // Handle insert to new namespace (which might be different)
        const insertTree = await getTreeForNamespace(op.newNamespace);
        await replaceHandler(
          ctx,
          {
            currentKey: op.currentKey,
            newKey: op.newKey,
            value: op.value,
            summand: op.summand,
          },
          deleteTree,
          insertTree,
        );
      } else if (op.type === "deleteIfExists") {
        const tree = await getTreeForNamespace(op.namespace);
        await deleteIfExistsHandler(
          ctx,
          { key: op.key, namespace: op.namespace },
          tree,
        );
      } else if (op.type === "replaceOrInsert") {
        // Handle delete from original namespace
        const deleteTree = await getTreeForNamespace(op.namespace);
        const newTree = await getTreeForNamespace(op.newNamespace);
        await replaceOrInsertHandler(
          ctx,
          {
            currentKey: op.currentKey,
            newKey: op.newKey,
            value: op.value,
            summand: op.summand,
            namespace: op.namespace,
            newNamespace: op.newNamespace,
          },
          deleteTree,
          newTree,
        );
      }
    }
  },
});

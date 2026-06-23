import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import {
  applyOperations,
  assertNoPendingOps,
  DEFAULT_MAX_NODE_SIZE,
  deleteHandler,
  deleteIfExistsHandler,
  enqueueOperations,
  getOrCreateTree,
  getTree,
  insertHandler,
  replaceHandler,
  replaceOrInsertHandler,
} from "./btree.js";
import { internal } from "./_generated/api.js";
import { vOperation } from "./schema.js";

export const init = mutation({
  args: {
    maxNodeSize: v.optional(v.number()),
    rootLazy: v.optional(v.boolean()),
    namespace: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, { maxNodeSize, rootLazy, namespace }) => {
    await assertNoPendingOps(ctx);
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
    await assertNoPendingOps(ctx);
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
    await assertNoPendingOps(ctx);
    await insertHandler(ctx, args);
  },
});

// delete is a keyword, hence the underscore.
export const delete_ = mutation({
  args: {
    key: v.any(),
    namespace: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertNoPendingOps(ctx);
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
    await assertNoPendingOps(ctx);
    await replaceHandler(ctx, args);
  },
});

export const deleteIfExists = mutation({
  args: {
    key: v.any(),
    namespace: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertNoPendingOps(ctx);
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
    await assertNoPendingOps(ctx);
    await replaceOrInsertHandler(ctx, args);
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
    await assertNoPendingOps(ctx);
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

/**
 * Apply multiple operations synchronously, fetching the tree once per namespace
 * and passing it to all handlers.
 */
export const batch = mutation({
  args: {
    operations: v.array(vOperation),
  },
  returns: v.null(),
  handler: async (ctx, { operations }) => {
    await assertNoPendingOps(ctx);
    await applyOperations(ctx, operations);
  },
});

/**
 * Enqueue operations to be applied asynchronously by the batch worker, as one
 * atomic batch. Use this instead of the synchronous mutations when you want to
 * avoid contending with the tree (the "stale" write path).
 */
export const enqueue = mutation({
  args: {
    operations: v.array(vOperation),
  },
  returns: v.null(),
  handler: async (ctx, { operations }) => {
    await enqueueOperations(ctx, operations);
  },
});

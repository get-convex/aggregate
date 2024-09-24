import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { DEFAULT_MAX_NODE_SIZE, deleteHandler, getOrCreateTree, getTree, insertHandler } from "./btree.js";
import { internal } from "./_generated/api.js";

export const init = mutation({
  args: { maxNodeSize: v.optional(v.number()), rootLazy: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { maxNodeSize, rootLazy }) => {
    const existing = await getTree(ctx.db);
    if (existing) {
      throw new Error("tree already initialized");
    }
    await getOrCreateTree(ctx.db, maxNodeSize ?? DEFAULT_MAX_NODE_SIZE, rootLazy ?? true);
  },
});

/**
 * Call this mutation to reduce contention at the expense of more reads.
 * This is useful if writes are frequent and serializing all writes is
 * detrimental.
 * Lazy roots are the default; use `clear` to revert to eager roots.
 */
export const makeRootLazy = mutation({
  args: { },
  returns: v.null(),
  handler: async (ctx) => {
    const tree = await getOrCreateTree(ctx.db, DEFAULT_MAX_NODE_SIZE, true);
    await ctx.db.patch(tree.root, { aggregate: undefined });
  },
});

export const insert = mutation({
  args: { key: v.any(), value: v.any(), summand: v.optional(v.number()) },
  returns: v.null(),
  handler: insertHandler,
});

// delete is a keyword, hence the underscore.
export const delete_ = mutation({
  args: { key: v.any() },
  returns: v.null(),
  handler: deleteHandler,
});

export const replace = mutation({
  args: { currentKey: v.any(), newKey: v.any(), value: v.any(), summand: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteHandler(ctx, { key: args.currentKey });
    await insertHandler(ctx, { key: args.newKey, value: args.value, summand: args.summand });
  },
});

export const deleteIfExists = mutation({
  args: { key: v.any() },
  handler: async (ctx, { key }) => {
    try {
      await deleteHandler(ctx, { key });
    } catch (e) {
      if (e instanceof ConvexError && e.data?.code === "DELETE_MISSING_KEY") {
        return;
      }
      throw e;
    }
  },
});

export const replaceOrInsert = mutation({
  args: { currentKey: v.any(), newKey: v.any(), value: v.any(), summand: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
      await deleteHandler(ctx, { key: args.currentKey });
    } catch (e) {
      if (e instanceof ConvexError && e.data?.code === "DELETE_MISSING_KEY") {
        return;
      }
      throw e;
    }
    await insertHandler(ctx, { key: args.newKey, value: args.value, summand: args.summand });
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
    maxNodeSize: v.optional(v.number()),
    rootLazy: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { maxNodeSize, rootLazy }) => {
    const tree = await getTree(ctx.db);
    let existingRootLazy = true;
    let existingMaxNodeSize = DEFAULT_MAX_NODE_SIZE;
    if (tree) {
      await ctx.db.delete(tree._id);
      const root = (await ctx.db.get(tree.root))!;
      existingRootLazy = root.aggregate === undefined;
      existingMaxNodeSize = tree.maxNodeSize;
      await ctx.scheduler.runAfter(0, internal.btree.deleteTreeNodes, { node: tree.root });
    }
    await getOrCreateTree(ctx.db, maxNodeSize ?? existingMaxNodeSize, rootLazy ?? existingRootLazy);
  },
});

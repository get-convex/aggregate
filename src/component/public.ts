import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server.js";
import {
  DEFAULT_MAX_NODE_SIZE,
  deleteHandler,
  getOrCreateTree,
  getTree,
  insertHandler,
} from "./btree.js";
import { internal } from "./_generated/api.js";

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
      rootLazy ?? true
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
      true
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
  handler: async (ctx, args) => {
    await deleteHandler(ctx, {
      key: args.currentKey,
      namespace: args.namespace,
    });
    await insertHandler(ctx, {
      key: args.newKey,
      value: args.value,
      summand: args.summand,
      namespace: args.newNamespace,
    });
  },
});

export const deleteIfExists = mutation({
  args: { key: v.any(), namespace: v.optional(v.any()) },
  handler: async (ctx, { key, namespace }) => {
    try {
      await deleteHandler(ctx, { key, namespace });
    } catch (e) {
      if (e instanceof ConvexError && e.data?.code === "DELETE_MISSING_KEY") {
        return;
      }
      throw e;
    }
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
    try {
      await deleteHandler(ctx, {
        key: args.currentKey,
        namespace: args.namespace,
      });
    } catch (e) {
      if (
        !(e instanceof ConvexError && e.data?.code === "DELETE_MISSING_KEY")
      ) {
        throw e;
      }
    }
    await insertHandler(ctx, {
      key: args.newKey,
      value: args.value,
      summand: args.summand,
      namespace: args.newNamespace,
    });
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
      rootLazy ?? existingRootLazy
    );
  },
});

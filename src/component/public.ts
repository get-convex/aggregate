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
        v.object({
          type: v.literal("insertIfDoesNotExist"),
          key: v.any(),
          value: v.any(),
          summand: v.optional(v.number()),
          namespace: v.optional(v.any()),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { operations }) => {
    // Group operations by namespace to fetch each tree once
    const namespaceGroups = new Map<string, typeof operations>();
    for (const op of operations) {
      const namespace = "namespace" in op ? op.namespace : undefined;
      // Use a sentinel value for undefined namespace since JSON.stringify(undefined) returns undefined
      const key = namespace === undefined ? "__undefined__" : JSON.stringify(namespace);
      if (!namespaceGroups.has(key)) {
        namespaceGroups.set(key, []);
      }
      namespaceGroups.get(key)!.push(op);
    }

    // Process each namespace group
    for (const [namespaceKey, ops] of namespaceGroups.entries()) {
      const namespace = namespaceKey === "__undefined__" ? undefined : JSON.parse(namespaceKey);
      const tree = await getOrCreateTree(
        ctx.db,
        namespace,
        DEFAULT_MAX_NODE_SIZE,
        true,
      );

      // Process operations in order
      for (const op of ops) {
        if (op.type === "insert") {
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
          await deleteHandler(
            ctx,
            {
              key: op.key,
              namespace: op.namespace,
            },
            tree,
          );
        } else if (op.type === "replace") {
          await deleteHandler(
            ctx,
            {
              key: op.currentKey,
              namespace: op.namespace,
            },
            tree,
          );
          await insertHandler(
            ctx,
            {
              key: op.newKey,
              value: op.value,
              summand: op.summand,
              namespace: op.newNamespace,
            },
            tree,
          );
        } else if (op.type === "deleteIfExists") {
          try {
            await deleteHandler(
              ctx,
              { key: op.key, namespace: op.namespace },
              tree,
            );
          } catch (e) {
            if (
              e instanceof ConvexError &&
              e.data?.code === "DELETE_MISSING_KEY"
            ) {
              continue;
            }
            throw e;
          }
        } else if (op.type === "replaceOrInsert") {
          try {
            await deleteHandler(
              ctx,
              {
                key: op.currentKey,
                namespace: op.namespace,
              },
              tree,
            );
          } catch (e) {
            if (
              !(e instanceof ConvexError && e.data?.code === "DELETE_MISSING_KEY")
            ) {
              throw e;
            }
          }
          await insertHandler(
            ctx,
            {
              key: op.newKey,
              value: op.value,
              summand: op.summand,
              namespace: op.newNamespace,
            },
            tree,
          );
        } else if (op.type === "insertIfDoesNotExist") {
          // insertIfDoesNotExist is implemented as replaceOrInsert
          try {
            await deleteHandler(
              ctx,
              {
                key: op.key,
                namespace: op.namespace,
              },
              tree,
            );
          } catch (e) {
            if (
              !(e instanceof ConvexError && e.data?.code === "DELETE_MISSING_KEY")
            ) {
              throw e;
            }
          }
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
        }
      }
    }
  },
});

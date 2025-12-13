/**
 * Example of using the batch API for efficient writes.
 *
 * This demonstrates how to use the `.buffer()` method to queue write
 * operations and flush them in a batch, reducing the number of mutations
 * and improving performance.
 */

import { DirectAggregate } from "@convex-dev/aggregate";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api.js";
import { v } from "convex/values";
import { customMutation } from "convex-helpers/server/customFunctions";

const aggregate = new DirectAggregate<{
  Key: number;
  Id: string;
}>(components.batchedWrites);

/**
 * Basic example: Enable buffering, queue operations, then flush manually.
 */
export const basicBatchedWrites = mutation({
  args: {
    count: v.number(),
  },
  handler: async (ctx, { count }) => {
    // Enable buffering mode - modifies the aggregate instance in place
    aggregate.buffer(true);

    // Queue multiple insert operations
    for (let i = 0; i < count; i++) {
      await aggregate.insert(ctx, {
        key: i,
        id: `item-${i}`,
        sumValue: i * 10,
      });
    }

    // Disable buffering after we're done
    aggregate.buffer(false);
    // Flush all buffered operations in a single batch
    await aggregate.flush(ctx);

    // Read operations work normally (and auto-flush if needed)
    const total = await aggregate.count(ctx);

    return { inserted: count, total };
  },
});

/**
 * Advanced example: Use custom functions with onSuccess callback.
 *
 * This pattern is useful when you are also using triggers, to avoid all
 * triggered writes calling the component individually.
 */

// Create a custom mutation that uses buffered aggregate
const mutationWithBuffering = customMutation(mutation, {
  args: {},
  input: async () => {
    aggregate.buffer(true);
    return {
      ctx: {},
      args: {},
      onSuccess: async ({ ctx }) => {
        await aggregate.flush(ctx);
      },
    };
  },
});

/**
 * Example using custom function with onSuccess callback.
 *
 * This demonstrates the recommended pattern for batching:
 * - Enable buffering at the start (in customCtx)
 * - Queue operations throughout the function using the global aggregate
 * - Flush in the onSuccess callback
 */
export const batchedWritesWithOnSuccess = mutationWithBuffering({
  args: {
    items: v.array(
      v.object({
        key: v.number(),
        id: v.string(),
        value: v.number(),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    // Queue all operations - they're stored in memory, not sent yet
    // We use the global 'aggregate' instance which has buffering enabled
    for (const item of items) {
      await aggregate.insert(ctx, {
        key: item.key,
        id: item.id,
        sumValue: item.value,
      });
    }

    return {
      queued: items.length,
    };
  },
});

/**
 * Complex example: Mix different operation types in a batch.
 */
export const complexBatchedOperations = mutation({
  args: {
    inserts: v.array(
      v.object({
        key: v.number(),
        id: v.string(),
        value: v.number(),
      }),
    ),
    deletes: v.array(
      v.object({
        key: v.number(),
        id: v.string(),
      }),
    ),
    updates: v.array(
      v.object({
        oldKey: v.number(),
        newKey: v.number(),
        id: v.string(),
        value: v.number(),
      }),
    ),
  },
  handler: async (ctx, { inserts, deletes, updates }) => {
    // Enable buffering
    aggregate.buffer(true);

    // Queue inserts
    for (const item of inserts) {
      await aggregate.insert(ctx, {
        key: item.key,
        id: item.id,
        sumValue: item.value,
      });
    }

    // Queue deletes
    for (const item of deletes) {
      await aggregate.deleteIfExists(ctx, {
        key: item.key,
        id: item.id,
      });
    }

    // Queue updates (replace operations)
    for (const item of updates) {
      await aggregate.replaceOrInsert(
        ctx,
        { key: item.oldKey, id: item.id },
        { key: item.newKey, sumValue: item.value },
      );
    }

    // Flush all operations at once
    await aggregate.flush(ctx);

    // Disable buffering
    aggregate.buffer(false);

    return {
      operations: {
        inserts: inserts.length,
        deletes: deletes.length,
        updates: updates.length,
      },
    };
  },
});

/**
 * Performance comparison: Batched vs unbatched writes.
 */
export const comparePerformance = mutation({
  args: {
    count: v.number(),
    useBatching: v.boolean(),
  },
  handler: async (ctx, { count, useBatching }) => {
    const start = Date.now();

    if (useBatching) {
      // Batched approach
      aggregate.buffer(true);

      for (let i = 0; i < count; i++) {
        await aggregate.insert(ctx, {
          key: 1000000 + i,
          id: `perf-test-${i}`,
          sumValue: i,
        });
      }

      await aggregate.flush(ctx);
      aggregate.buffer(false);
    } else {
      // Unbatched approach
      for (let i = 0; i < count; i++) {
        await aggregate.insert(ctx, {
          key: 1000000 + i,
          id: `perf-test-${i}`,
          sumValue: i,
        });
      }
    }

    const duration = Date.now() - start;

    return {
      method: useBatching ? "batched" : "unbatched",
      count,
      durationMs: duration,
    };
  },
});

/**
 * Example showing automatic flush on read operations.
 */
export const autoFlushOnRead = mutation({
  args: {
    count: v.number(),
  },
  handler: async (ctx, { count }) => {
    // Enable buffering
    aggregate.buffer(true);

    // Queue some operations
    for (let i = 0; i < count; i++) {
      await aggregate.insert(ctx, {
        key: 2000000 + i,
        id: `auto-flush-${i}`,
        sumValue: i,
      });
    }

    // This read operation automatically flushes the buffer first
    // So we'll see the correct count including the queued operations
    const total = await aggregate.count(ctx, {
      bounds: {
        lower: { key: 2000000, inclusive: true },
      },
    });

    // Disable buffering
    aggregate.buffer(false);

    return {
      queued: count,
      totalInRange: total,
    };
  },
});

/**
 * Example: Batch operations with namespace grouping.
 *
 * When you have operations across multiple namespaces,
 * the batch mutation automatically groups them and fetches
 * each namespace's tree only once.
 */
export const batchedWritesWithNamespaces = mutation({
  args: {
    operations: v.array(
      v.object({
        namespace: v.string(),
        key: v.number(),
        id: v.string(),
        value: v.number(),
      }),
    ),
  },
  handler: async (ctx, { operations }) => {
    // Create a namespaced aggregate
    const namespacedAggregate = new DirectAggregate<{
      Key: number;
      Id: string;
      Namespace: string;
    }>(components.batchedWrites);

    // Enable buffering
    namespacedAggregate.buffer(true);

    // Queue operations - they'll be grouped by namespace internally
    for (const op of operations) {
      await namespacedAggregate.insert(ctx, {
        namespace: op.namespace,
        key: op.key,
        id: op.id,
        sumValue: op.value,
      });
    }

    // Flush all operations
    // The batch mutation will group by namespace automatically
    await namespacedAggregate.flush(ctx);

    // Disable buffering
    namespacedAggregate.buffer(false);

    // Count unique namespaces
    const namespaces = new Set(operations.map((op) => op.namespace));

    return {
      operations: operations.length,
      namespaces: namespaces.size,
      message: `Processed ${operations.length} operations across ${namespaces.size} namespaces in a single batch`,
    };
  },
});

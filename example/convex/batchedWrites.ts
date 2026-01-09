/**
 * Example of using the batch API for efficient writes.
 *
 * This demonstrates how to use the `.buffer()` method to queue write
 * operations and flush them in a batch, reducing the number of mutations
 * and improving performance.
 *
 * This is especially useful when using triggers, as it batches all triggered
 * aggregate writes into a single component call instead of one per write.
 */

import { DirectAggregate, TableAggregate } from "@convex-dev/aggregate";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api.js";
import { v } from "convex/values";
import { customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "./_generated/dataModel";

const aggregate = new DirectAggregate<{
  Key: number;
  Id: string;
}>(components.batchedWrites);

// Example with TableAggregate and Triggers
const leaderboardAggregate = new TableAggregate<{
  Key: number;
  DataModel: DataModel;
  TableName: "leaderboard";
}>(components.batchedWrites, {
  sortKey: (doc) => -doc.score, // Negative for descending order
  sumValue: (doc) => doc.score,
});

/**
 * Basic example: Enable buffering, queue operations, then flush manually.
 */
export const basicBatchedWrites = mutation({
  args: {
    count: v.number(),
  },
  handler: async (ctx, { count }) => {
    // Enable buffering mode - modifies the aggregate instance in place
    aggregate.startBuffering();

    // Queue multiple insert operations
    for (let i = 0; i < count; i++) {
      await aggregate.insert(ctx, {
        key: i,
        id: `item-${i}`,
        sumValue: i * 10,
      });
    }

    // Disable buffering after we're done
    aggregate.finishBuffering(ctx);

    // Read operations work normally (and auto-flush if needed)
    const total = await aggregate.count(ctx);

    return { inserted: count, total };
  },
});

/**
 * Advanced example: Use custom functions with Triggers and buffering.
 *
 * This is the RECOMMENDED pattern when using triggers!
 *
 * When using triggers, each table write triggers an aggregate write.
 * If you insert 100 rows, that's 100 separate calls to the aggregate component.
 * With buffering, all 100 writes are batched into a single component call.
 *
 * Performance benefits:
 * - Single component call instead of N calls
 * - Single tree fetch instead of N fetches
 * - Better handling of write contention
 */

// Set up triggers
const triggers = new Triggers<DataModel>();
triggers.register("leaderboard", leaderboardAggregate.trigger());

// Create a custom mutation that:
// 1. Wraps the database with triggers
// 2. Enables buffering before the mutation runs
// 3. Flushes after the mutation completes successfully
const mutationWithTriggers = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    // Enable buffering for all aggregate operations
    leaderboardAggregate.startBuffering();

    return {
      ctx: {
        // Wrap db with triggers
        ...triggers.wrapDB(ctx),
      },
      args: {},
      onSuccess: async ({ ctx }) => {
        // Flush all buffered operations in a single batch
        await leaderboardAggregate.finishBuffering(ctx);
      },
    };
  },
});

/**
 * Example: Add multiple scores with triggers and batching.
 *
 * Without buffering: Each insert triggers a separate aggregate.insert call
 * With buffering: All inserts are batched into one aggregate.batch call
 */
export const addMultipleScores = mutationWithTriggers({
  args: {
    scores: v.array(
      v.object({
        name: v.string(),
        score: v.number(),
      }),
    ),
  },
  handler: async (ctx, { scores }) => {
    // Just insert into the table - the trigger automatically
    // updates the aggregate, and buffering batches all the updates
    for (const { name, score } of scores) {
      await ctx.db.insert("leaderboard", { name, score });
    }

    return {
      inserted: scores.length,
      message: `Added ${scores.length} scores with batched aggregate updates`,
    };
  },
});

/**
 * Example: Update multiple scores - shows replace operations are also batched
 */
export const updateMultipleScores = mutationWithTriggers({
  args: {
    updates: v.array(
      v.object({
        id: v.id("leaderboard"),
        newScore: v.number(),
      }),
    ),
  },
  handler: async (ctx, { updates }) => {
    // Each patch triggers aggregate.replace, all batched together
    for (const { id, newScore } of updates) {
      await ctx.db.patch(id, { score: newScore });
    }

    return {
      updated: updates.length,
      message: `Updated ${updates.length} scores with batched aggregate updates`,
    };
  },
});

/**
 * Example showing the difference with and without batching
 */
export const compareTriggersWithAndWithoutBatching = mutation({
  args: {
    count: v.number(),
    useBatching: v.boolean(),
  },
  handler: async (ctx, { count, useBatching }) => {
    const start = Date.now();

    const customCtx = triggers.wrapDB(ctx);
    if (useBatching) {
      // With batching: all aggregate operations batched into one call
      leaderboardAggregate.startBuffering();

      for (let i = 0; i < count; i++) {
        await customCtx.db.insert("leaderboard", {
          name: `player-${i}`,
          score: Math.floor(Math.random() * 1000),
        });
      }

      await leaderboardAggregate.finishBuffering(ctx);
    } else {
      // Without batching: each insert makes a separate aggregate call

      for (let i = 0; i < count; i++) {
        await customCtx.db.insert("leaderboard", {
          name: `player-${i}`,
          score: Math.floor(Math.random() * 1000),
        });
      }
    }

    const duration = Date.now() - start;

    return {
      method: useBatching ? "with batching" : "without batching",
      count,
      durationMs: duration,
      message: useBatching
        ? `1 batched call to aggregate component`
        : `${count} individual calls to aggregate component`,
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
    aggregate.startBuffering();

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

    // Flush all operations at once and stop buffering
    await aggregate.finishBuffering(ctx);

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
      aggregate.startBuffering();

      for (let i = 0; i < count; i++) {
        await aggregate.insert(ctx, {
          key: 1000000 + i,
          id: `perf-test-${i}`,
          sumValue: i,
        });
      }

      await aggregate.finishBuffering(ctx);
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
    aggregate.startBuffering();

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

    // Flush all operations at once and stop buffering
    await aggregate.finishBuffering(ctx);

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
    namespacedAggregate.startBuffering();

    // Queue operations - they'll be grouped by namespace internally
    for (const op of operations) {
      await namespacedAggregate.insert(ctx, {
        namespace: op.namespace,
        key: op.key,
        id: op.id,
        sumValue: op.value,
      });
    }

    // Flush all operations and stop buffering
    // The batch mutation will group by namespace automatically
    await namespacedAggregate.finishBuffering(ctx);

    // Count unique namespaces
    const namespaces = new Set(operations.map((op) => op.namespace));

    return {
      operations: operations.length,
      namespaces: namespaces.size,
      message: `Processed ${operations.length} operations across ${namespaces.size} namespaces in a single batch`,
    };
  },
});

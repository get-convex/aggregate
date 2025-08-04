/**
 * Example showing B-tree visualization as scores are added.
 * Demonstrates the underlying B-tree structure using the inspect dump function.
 */

import { DirectAggregate } from "@convex-dev/aggregate";
import {
  mutation,
  query,
  internalMutation,
} from "../../example/convex/_generated/server";
import { components } from "../../example/convex/_generated/api";
import { v } from "convex/values";

const btreeAggregate = new DirectAggregate<{
  Key: number;
  Id: string;
}>(components.btreeAggregate);

export const addScore = mutation({
  args: {
    name: v.string(),
    score: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const id = `${args.name}-${Date.now()}`;
    await btreeAggregate.insert(ctx, {
      key: args.score,
      id: id,
      sumValue: args.score,
    });
    return id;
  },
});

export const removeScore = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, { id }) => {
    // Find the entry in the aggregate by ID and delete it
    for await (const entry of btreeAggregate.iter(ctx, {
      bounds: undefined,
      order: "asc",
    })) {
      if (entry.id === id) {
        await btreeAggregate.delete(ctx, entry);
        return;
      }
    }
  },
});

export const getAllScores = query({
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      score: v.number(),
    })
  ),
  handler: async (ctx) => {
    const scores = [];
    for await (const entry of btreeAggregate.iter(ctx, {
      bounds: undefined,
      order: "desc", // Show highest scores first
    })) {
      // Extract name from the ID (format: "name-timestamp")
      const name = entry.id.split("-").slice(0, -1).join("-");
      scores.push({
        id: entry.id,
        name: name,
        score: entry.key,
      });
    }
    return scores;
  },
});

export const countScores = query({
  handler: async (ctx) => {
    return await btreeAggregate.count(ctx);
  },
});

/**
 * Get the B-tree structure as structured data
 */
export const getBTreeStructured = query({
  returns: v.any(),
  handler: async (ctx) => {
    // Use the inspect component to get structured tree data with aggregates
    return await ctx.runQuery(components.btreeAggregate.inspect.dump, {
      namespace: undefined,
      format: "structured",
    });
  },
});

/**
 * Clear the B-tree and reinitialize with custom settings
 */
export const clearBTree = mutation({
  args: {
    maxNodeSize: v.optional(v.number()),
    rootLazy: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Clear and reinitialize the aggregate with custom settings
    await ctx.runMutation(components.btreeAggregate.public.clear, {
      namespace: undefined,
      maxNodeSize: args.maxNodeSize ?? 4, // Default to 4 for educational purposes
      rootLazy: args.rootLazy ?? true,
    });

    return null;
  },
});

/**
 * Add a predefined score entry for demonstration
 */
export const addDemoScore = mutation({
  args: {},
  returns: v.object({
    name: v.string(),
    score: v.number(),
    id: v.string(),
  }),
  handler: async (ctx) => {
    // Predefined demo entries to show B-tree splits
    const demoEntries = [
      { name: "Alice", score: 85 },
      { name: "Bob", score: 92 },
      { name: "Carol", score: 78 },
      { name: "David", score: 95 },
      { name: "Eve", score: 88 },
      { name: "Frank", score: 76 },
      { name: "Grace", score: 94 },
      { name: "Henry", score: 82 },
      { name: "Ivy", score: 91 },
      { name: "Jack", score: 87 },
      { name: "Kate", score: 89 },
      { name: "Leo", score: 93 },
    ];

    // Get current count to cycle through entries
    const currentCount = await btreeAggregate.count(ctx);
    const entry = demoEntries[currentCount % demoEntries.length];

    const id = `${entry.name}-${Date.now()}`;
    await btreeAggregate.insert(ctx, {
      key: entry.score,
      id: id,
      sumValue: entry.score,
    });

    return {
      name: entry.name,
      score: entry.score,
      id,
    };
  },
});

// ----- internal -----

export const resetAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    console.log("Resetting B-tree demo...");

    // Reset aggregate
    await btreeAggregate.clear(ctx);

    console.log("B-tree demo reset complete");
    return null;
  },
});

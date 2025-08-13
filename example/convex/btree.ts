/**
 * Example showing B-tree visualization as scores are added.
 * Demonstrates the underlying B-tree structure using the inspect dump function.
 */

import { DirectAggregate } from "@convex-dev/aggregate";
import { mutation, query, internalMutation } from "./_generated/server";
import { api, components } from "./_generated/api";
import { v } from "convex/values";
import { resetStatusValidator } from "./utils/resetStatus";
import { FunctionReturnType } from "convex/server";

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

export const deleteItem = mutation({
  args: {
    id: v.string(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    await btreeAggregate.delete(ctx, {
      key: args.score,
      id: args.id,
    });
  },
});

export const listTrees = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.runQuery(components.btreeAggregate.inspect.listTrees, {
      take: 100,
    });
  },
});

export const listNodes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.runQuery(components.btreeAggregate.inspect.listTreeNodes, {
      take: 100,
    });
  },
});

export type BTreeDoc = FunctionReturnType<typeof api.btree.listTrees>[number];
export type BTreeNodeDoc = FunctionReturnType<
  typeof api.btree.listNodes
>[number];

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const count = await btreeAggregate.count(ctx);
    if (count === 0) return null;

    const mean = (await btreeAggregate.sum(ctx)) / count;
    const median = (await btreeAggregate.at(ctx, Math.floor(count / 2))).key;
    const p75 = (await btreeAggregate.at(ctx, Math.floor(count * 0.75))).key;
    const p95 = (await btreeAggregate.at(ctx, Math.floor(count * 0.95))).key;
    const min = (await btreeAggregate.min(ctx))!.key;
    const max = (await btreeAggregate.max(ctx))!.key;

    return {
      count,
      mean,
      median,
      p75,
      p95,
      max,
      min,
    };
  },
});

// ---- internal ----

export const resetAll = internalMutation({
  args: {},
  returns: resetStatusValidator,
  handler: async (ctx): Promise<"all_reset" | "partial_reset"> => {
    await btreeAggregate.clearAll(ctx);
    return "all_reset";
  },
});

export const addSampleData = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    console.log("Adding sample data to btree...");

    // Add sample scores with different names to demonstrate the B-tree structure
    const sampleData = [
      { name: "Alice", score: 95 },
      { name: "Bob", score: 87 },
      { name: "Charlie", score: 92 },
      { name: "Diana", score: 78 },
      { name: "Eve", score: 88 },
      { name: "Frank", score: 94 },
      { name: "Grace", score: 82 },
      { name: "Henry", score: 90 },
      { name: "Iris", score: 85 },
      { name: "Jack", score: 93 },
      { name: "Kate", score: 89 },
      { name: "Liam", score: 91 },
      { name: "Mia", score: 86 },
      { name: "Noah", score: 96 },
      { name: "Olivia", score: 84 },
      { name: "Paul", score: 97 },
      { name: "Quinn", score: 83 },
      { name: "Ruby", score: 98 },
      { name: "Sam", score: 81 },
      { name: "Tina", score: 99 },
    ];

    for (const { name, score } of sampleData) {
      const id = `${name}-${Date.now()}-${Math.random()}`;
      await btreeAggregate.insert(ctx, {
        key: score,
        id: id,
        sumValue: score,
      });
    }

    console.log(`Added ${sampleData.length} sample entries to btree`);
    return null;
  },
});

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
import { api, components } from "../../example/convex/_generated/api";
import { v } from "convex/values";
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
    return await ctx.runQuery(components.btreeAggregate.inspect.listTrees);
  },
});

export const listNodes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.runQuery(components.btreeAggregate.inspect.listTreeNodes);
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

    const [sum, medianItem, p75Item, p95Item, minItem, maxItem] =
      await Promise.all([
        btreeAggregate.sum(ctx),
        btreeAggregate.at(ctx, Math.floor(count / 2)),
        btreeAggregate.at(ctx, Math.floor(count * 0.75)),
        btreeAggregate.at(ctx, Math.floor(count * 0.95)),
        btreeAggregate.min(ctx),
        btreeAggregate.max(ctx),
      ]);

    return {
      count,
      mean: sum / count,
      median: medianItem.key,
      p75: p75Item.key,
      p95: p95Item.key,
      max: maxItem && maxItem.key,
      min: minItem && minItem.key,
    };
  },
});

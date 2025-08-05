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
export type BTreeNodeDoc = FunctionReturnType<typeof api.btree.listNodes>[number];

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

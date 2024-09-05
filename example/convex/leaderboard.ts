import { v, Validator } from "convex/values";
import { BTree, initBTree } from "../../src/client/index.js";
import {
  customMutation,
} from "convex-helpers/server/customFunctions";
import { mutation, query, components, QueryCtx, internalMutation, internalQuery } from "./_generated/server";
import { DataModel, Doc } from "./_generated/dataModel";
import { FunctionReference, FunctionVisibility } from "convex/server";
import { internal } from "./_generated/api";
import { WithTriggers, withTriggers, atomicMutators, TriggerArgs } from "@convex-dev/triggers";

const withAllTriggers: WithTriggers<DataModel> = withTriggers<DataModel>(components.triggers, {
  leaderboard: {
    atomicMutators: internal.leaderboard,
    triggers: [
      components.aggregateByScore.btree.trigger as FunctionReference<"mutation", FunctionVisibility, TriggerArgs<DataModel, "leaderboard">, null>,
      components.aggregateScoreByUser.btree.trigger as FunctionReference<"mutation", FunctionVisibility, TriggerArgs<DataModel, "leaderboard">, null>,
    ],
  },
});

export const { atomicInsert, atomicPatch, atomicReplace, atomicDelete } = atomicMutators("leaderboard");

const mutationWithTriggers = customMutation(
  mutation,
  withAllTriggers,
);

export const getByScore = internalQuery({
  args: { doc: v.any() as Validator<Doc<"leaderboard">> },
  returns: v.object({ key: v.number(), summand: v.optional(v.number()) }),
  handler: async (_ctx, { doc }) => {
    return { key: -doc.score };
  }
});

export const getScoreByUser = internalQuery({
  args: { doc: v.any() as Validator<Doc<"leaderboard">> },
  returns: v.object({ key: v.string(), summand: v.optional(v.number()) }),
  handler: async (_ctx, { doc }) => {
    return { key: doc.name, summand: doc.score };
  }
});

export const initAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    await initBTree(ctx, components.aggregateByScore, internal.leaderboard.getByScore);
    await initBTree(ctx, components.aggregateScoreByUser, internal.leaderboard.getScoreByUser);
  },
});

function aggregateByScore(ctx: QueryCtx) {
  return new BTree<DataModel, "leaderboard", number>(
    ctx,
    components.aggregateByScore
  );
}

function aggregateScoreByUser(ctx: QueryCtx) {
  return new BTree<DataModel, "leaderboard", string>(
    ctx,
    components.aggregateScoreByUser
  );
}

export const scoresAtRanks = query({
  args: {
    ranks: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const scores = await Promise.all(
      args.ranks.map((rank) => aggregateByScore(ctx).at(rank))
    );
    const results = await Promise.all(
      scores.map(async (score) => ctx.db.get(score.v))
    );
    return results;
  },
});

export const rankOfScore = query({
  args: {
    score: v.number(),
  },
  handler: async (ctx, args) => {
    return await aggregateByScore(ctx).indexOf(-args.score);
  },
});

export const addScore = mutationWithTriggers({
  args: {
    name: v.string(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("leaderboard", { name: args.name, score: args.score });
  },
});

export const countScores = query({
  handler: async (ctx) => {
    return await aggregateByScore(ctx).count();
  },
});

function previousString(s: string) {
  if (s === "") {
    return s;
  }
  return s.slice(0, s.length - 1) + String.fromCharCode(s.charCodeAt(s.length - 1) - 1) + '~';
}

export const userAverageScore = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const aggregate = aggregateScoreByUser(ctx);
    // countBetween and sumBetween are exclusive.
    const nameBefore = previousString(args.name);
    const nameAfter = args.name + ' ';
    const count = await aggregate.countBetween(nameBefore, nameAfter);
    if (!count) {
      throw new Error("no scores for " + args.name);
    }
    const sum = await aggregate.sumBetween(nameBefore, nameAfter);
    return sum / count;
  },
});

export const sumNumbers = query({
  handler: async (ctx) => {
    return await aggregateByScore(ctx).sum();
  },
});

export const backfillAggregates = mutationWithTriggers({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(components.aggregateByScore.btree.clearTree, { });
    await ctx.runMutation(components.aggregateScoreByUser.btree.clearTree, { });

    for await (const doc of ctx.db.query("leaderboard")) {
      await ctx.db.patch("leaderboard", doc._id, {});
      console.log("backfilled", doc.name, doc.score);
    }
  },
});

export const validateAggregates = query({
  args: {},
  handler: async (ctx) => {
    await aggregateByScore(ctx).validate();
    await aggregateScoreByUser(ctx).validate();
  },
});

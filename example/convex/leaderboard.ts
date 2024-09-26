/**
 * Example of a game leaderboard implemented with Convex.
 */

import { Aggregate } from "@convex-dev/aggregate";
import { mutation, query, internalMutation } from "./_generated/server";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";

const aggregateByScore = new Aggregate<number, Id<"leaderboard">>(components.aggregateByScore);
const aggregateScoreByUser = new Aggregate<[string, number], Id<"leaderboard">>(components.aggregateScoreByUser);

export const backfillAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    await aggregateByScore.clear(ctx);
    await aggregateScoreByUser.clear(ctx);

    for await (const doc of ctx.db.query("leaderboard")) {
      await aggregateByScore.insert(ctx, doc.score, doc._id);
      await aggregateScoreByUser.insert(ctx, [doc.name, doc.score], doc._id, doc.score);
      console.log("backfilled", doc.name, doc.score);
    }
  },
});

export const addScore = mutation({
  args: {
    name: v.string(),
    score: v.number(),
  },
  returns: v.id("leaderboard"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("leaderboard", { name: args.name, score: args.score });
    await aggregateByScore.insert(ctx, args.score, id);
    await aggregateScoreByUser.insert(ctx, [args.name, args.score], id, args.score);
    return id;
  },
});

export const removeScore = mutation({
  args: {
    id: v.id("leaderboard"),
  },
  handler: async (ctx, { id }) => {
    const doc = (await ctx.db.get(id))!;
    await ctx.db.delete(id);
    await aggregateByScore.delete(ctx, doc.score, id);
    await aggregateScoreByUser.delete(ctx, [doc.name, doc.score], id);
  },
});

export const countScores = query({
  handler: async (ctx) => {
    return await aggregateByScore.count(ctx);
  },
});

export const scoreAtRank = query({
  args: {
    rank: v.number(),
  },
  handler: async (ctx, { rank }) => {
    const score = await aggregateByScore.at(ctx, -rank-1);
    return await ctx.db.get(score.id);
  },
});

export const scoresInOrder = query({
  handler: async (ctx) => {
    let count = 0;
    for await (const { id, key } of aggregateByScore.iter(ctx, undefined, "desc")) {
      if (count >= 200) {
        console.log("...");
        break;
      }
      console.log("score", key, id);
      count += 1;
    }
  },
});

/**
 * Where does a score rank in the overall leaderboard?
 */
export const rankOfScore = query({
  args: {
    score: v.number(),
  },
  handler: async (ctx, args) => {
    return await aggregateByScore.offsetUntil(ctx, args.score);
  },
});

const MAX_SCORE = 10000;
const MIN_SCORE = -10000;

export const userAverageScore = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const bounds = {
      lower: { key: [args.name, MIN_SCORE] as [string, number], inclusive: true },
      upper: { key: [args.name, MAX_SCORE] as [string, number], inclusive: true },
    };
    const count = await aggregateScoreByUser.count(ctx, bounds);
    if (!count) {
      throw new ConvexError("no scores for " + args.name);
    }
    const sum = await aggregateScoreByUser.sum(ctx, bounds);
    return sum / count;
  },
});

export const userHighScore = query({
  args: {
    name: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const item = await aggregateScoreByUser.max(ctx, {
      lower: { key: [args.name, MIN_SCORE], inclusive: true },
      upper: { key: [args.name, MAX_SCORE], inclusive: true },
    });
    if (!item) {
      throw new ConvexError("no scores for " + args.name);
    }
    return item.summand;
  },
});

export const sumNumbers = query({
  handler: async (ctx) => {
    return await aggregateScoreByUser.sum(ctx);
  },
});

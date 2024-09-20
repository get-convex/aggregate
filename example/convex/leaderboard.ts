import { Aggregate, AggregateWriter } from "@convex-dev/aggregate";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";

const aggregateByScore = new Aggregate<number, Id<"leaderboard">>(components.aggregateByScore);
const aggregateByScoreWriter = new AggregateWriter<number, Id<"leaderboard">>(components.aggregateByScore);

const aggregateScoreByUser = new Aggregate<string, Id<"leaderboard">>(components.aggregateScoreByUser);
const aggregateScoreByUserWriter = new AggregateWriter<string, Id<"leaderboard">>(components.aggregateScoreByUser);

export const initAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    await aggregateByScoreWriter.init(ctx);
    await aggregateScoreByUserWriter.init(ctx);
  },
});

export const backfillAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    await aggregateByScoreWriter.clear(ctx);
    await aggregateScoreByUserWriter.clear(ctx);

    for await (const doc of ctx.db.query("leaderboard")) {
      await aggregateByScoreWriter.insert(ctx, -doc.score, doc._id);
      await aggregateScoreByUserWriter.insert(ctx, doc.name, doc._id, doc.score);
      console.log("backfilled", doc.name, doc.score);
    }
  },
});

export const makeRootLazy = internalMutation({
  args: {},
  handler: async (ctx) => {
    await aggregateByScoreWriter.makeRootLazy(ctx);
    await aggregateScoreByUserWriter.makeRootLazy(ctx);
  },
});

export const validateAggregates = internalQuery({
  args: {},
  handler: async (ctx) => {
    await aggregateByScore.validate(ctx);
    await aggregateScoreByUser.validate(ctx);
  },
});

export const addScore = mutation({
  args: {
    name: v.string(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("leaderboard", { name: args.name, score: args.score });
    await aggregateByScoreWriter.insert(ctx, -args.score, id);
    await aggregateScoreByUserWriter.insert(ctx, args.name, id, args.score);
  },
});

export const removeScore = mutation({
  args: {
    id: v.id("leaderboard"),
  },
  handler: async (ctx, { id }) => {
    const doc = (await ctx.db.get(id))!;
    await ctx.db.delete(id);
    await aggregateByScoreWriter.delete(ctx, -doc.score, id);
    await aggregateScoreByUserWriter.delete(ctx, doc.name, id);
  },
});

export const countScores = query({
  handler: async (ctx) => {
    return await aggregateByScore.count(ctx);
  },
});

export const scoresAtRanks = query({
  args: {
    ranks: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const scores = await Promise.all(
      args.ranks.map((rank) => aggregateByScore.at(ctx, rank))
    );
    const results = await Promise.all(
      scores.map(async (score) => ctx.db.get(score.id))
    );
    return results;
  },
});

export const rankOfScore = query({
  args: {
    score: v.number(),
  },
  handler: async (ctx, args) => {
    return await aggregateByScore.rankOf(ctx, -args.score);
  },
});

export const userAverageScore = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const bounds = {
      lower: { key: args.name, inclusive: true },
      upper: { key: args.name, inclusive: true },
    };
    const count = await aggregateScoreByUser.count(ctx, bounds);
    if (!count) {
      throw new ConvexError("no scores for " + args.name);
    }
    const sum = await aggregateScoreByUser.sum(ctx, bounds);
    return sum / count;
  },
});

export const sumNumbers = query({
  handler: async (ctx) => {
    return await aggregateScoreByUser.sum(ctx);
  },
});

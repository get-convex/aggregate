import { v } from "convex/values";
import { query } from "./_generated/server";
import { aggregateByScore, aggregateScoreByUser, mutationWithTriggers } from "./leaderboard";

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

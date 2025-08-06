/**
 * Example of a game leaderboard implemented with Convex.
 */

import { TableAggregate } from "@convex-dev/aggregate";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
} from "../../example/convex/_generated/server";
import { components, internal } from "../../example/convex/_generated/api";
import { DataModel } from "../../example/convex/_generated/dataModel";
import { v } from "convex/values";
import { Migrations } from "@convex-dev/migrations";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();

const aggregateByScore = new TableAggregate<{
  Key: number;
  DataModel: DataModel;
  TableName: "leaderboard";
}>(components.aggregateByScore, {
  sortKey: (doc) => doc.score,
});
const aggregateScoreByUser = new TableAggregate<{
  Key: [string, number];
  DataModel: DataModel;
  TableName: "leaderboard";
}>(components.aggregateScoreByUser, {
  sortKey: (doc) => [doc.name, doc.score],
  sumValue: (doc) => doc.score,
});

export const addScore = mutation({
  args: {
    name: v.string(),
    score: v.number(),
  },
  returns: v.id("leaderboard"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("leaderboard", {
      name: args.name,
      score: args.score,
    });
    const doc = await ctx.db.get(id);
    await aggregateByScore.insert(ctx, doc!);
    await aggregateScoreByUser.insert(ctx, doc!);
    return id;
  },
});

export const removeScore = mutation({
  args: {
    id: v.id("leaderboard"),
  },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    await ctx.db.delete(id);
    await aggregateByScore.delete(ctx, doc!);
    await aggregateScoreByUser.delete(ctx, doc!);
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
    const score = await aggregateByScore.at(ctx, -rank - 1);
    return await ctx.db.get(score.id);
  },
});

export const pageOfScores = query({
  args: {
    offset: v.number(),
    numItems: v.number(),
  },
  handler: async (ctx, { offset, numItems }) => {
    const scores = await ctx.db
      .query("leaderboard")
      .orderBy("score", "desc")
      .skip(offset)
      .take(numItems);

    return scores;
  },
});

export const pageOfScores = query({
  args: {
    offset: v.number(),
    numItems: v.number(),
  },
  handler: async (ctx, { offset, numItems }) => {
    const scores = [];
    let count = 0;
    let skipped = 0;

    for await (const { id, key: _key } of aggregateByScore.iter(ctx, {
      bounds: undefined,
      order: "desc",
    })) {
      // Skip items until we reach the offset
      if (skipped < offset) {
        skipped += 1;
        continue;
      }

      // Stop when we have enough items
      if (count >= numItems) {
        break;
      }

      const doc = await ctx.db.get(id);
      if (!doc) continue;
      scores.push(doc);
      count += 1;
    }

    return scores;
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
    return await aggregateByScore.indexOf(ctx, args.score, { order: "desc" });
  },
});

export const userAverageScore = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const count = await aggregateScoreByUser.count(ctx, {
      bounds: { prefix: [args.name] },
    });
    if (!count) return null;
    const sum = await aggregateScoreByUser.sum(ctx, {
      bounds: { prefix: [args.name] },
    });
    return sum / count;
  },
});

export const userHighScore = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await aggregateScoreByUser.max(ctx, {
      bounds: { prefix: [args.name] },
    });
    if (!item) return null;
    return item.sumValue;
  },
});

export const sumNumbers = query({
  handler: async (ctx) => {
    return await aggregateScoreByUser.sum(ctx);
  },
});

export const add100MockScores = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const playerNames = [
      "Jamie",
      "James",
      "Indy",
      "Gautam",
      "Nipunn",
      "Emma",
      "Tom",
      "Rebecca",
      "Ian",
      "Jordan",
      "Abhi",
      "Wayne",
      "Ari",
      "Christina",
      "Liz",
      "Mike",
      "Geoffry",
      "Nicolas",
    ];

    const mockScores = [];
    for (let i = 0; i < 100; i++) {
      const randomName =
        playerNames[Math.floor(Math.random() * playerNames.length)];
      // Generate scores with some variety - mostly between 100-1000, with some outliers
      let score;
      const rand = Math.random();
      if (rand < 0.1) {
        // 10% chance for very high scores (1000-5000)
        score = Math.floor(Math.random() * 4000) + 1000;
      } else if (rand < 0.2) {
        // 10% chance for low scores (10-100)
        score = Math.floor(Math.random() * 90) + 10;
      } else {
        // 80% chance for normal scores (100-1000)
        score = Math.floor(Math.random() * 900) + 100;
      }

      mockScores.push({ name: randomName, score });
    }

    // Insert all scores and update aggregates
    for (const mockScore of mockScores) {
      const id = await ctx.db.insert("leaderboard", mockScore);
      const doc = await ctx.db.get(id);
      await aggregateByScore.insert(ctx, doc!);
      await aggregateScoreByUser.insert(ctx, doc!);
    }

    return null;
  },
});

// ---- migrations ----

export const backfillAggregatesMigration = migrations.define({
  table: "leaderboard",
  migrateOne: async (ctx, doc) => {
    await aggregateByScore.insertIfDoesNotExist(ctx, doc);
    await aggregateScoreByUser.insertIfDoesNotExist(ctx, doc);
    console.log("backfilled", doc.name, doc.score);
  },
});

// This is what you can run, from the Convex dashboard or with `npx convex run`,
// to backfill aggregates for existing leaderboard entries, if you created the
// leaderboard before adding the aggregate components.
export const runAggregateBackfill = migrations.runner(
  internal.leaderboard.backfillAggregatesMigration
);

// ---- internal ----

const _clearAggregates = async (ctx: MutationCtx) => {
  await aggregateByScore.clear(ctx);
  await aggregateScoreByUser.clear(ctx);
};

export const clearAggregates = internalMutation(_clearAggregates);

export const resetAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    console.log("Resetting leaderboard...");

    // Clear docs
    const leaderboardDocs = await ctx.db.query("leaderboard").collect();
    for (const doc of leaderboardDocs) await ctx.db.delete(doc._id);

    // Reset aggregate
    await _clearAggregates(ctx);

    console.log("Leaderboard reset complete");
    return null;
  },
});

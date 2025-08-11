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
import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";

const aggregateByScore = new TableAggregate<{
  Key: number;
  DataModel: DataModel;
  TableName: "leaderboard";
}>(components.aggregateByScore, {
  sortKey: (doc) => -doc.score,
});

const aggregateScoreByUser = new TableAggregate<{
  Key: [string, number];
  DataModel: DataModel;
  TableName: "leaderboard";
}>(components.aggregateScoreByUser, {
  sortKey: (doc) => [doc.name, doc.score],
  sumValue: (doc) => doc.score,
});

const triggers = new Triggers<DataModel>();

triggers.register("leaderboard", aggregateByScore.trigger());
triggers.register("leaderboard", aggregateScoreByUser.trigger());

const mutationWithTriggers = customMutation(
  mutation,
  customCtx(triggers.wrapDB)
);

export const addScore = mutationWithTriggers({
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
    return id;
  },
});

export const removeScore = mutationWithTriggers({
  args: {
    id: v.id("leaderboard"),
  },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const updateScore = mutationWithTriggers({
  args: {
    id: v.id("leaderboard"),
    name: v.string(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
      score: args.score,
    });
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
    const firstInPage = await aggregateByScore.at(ctx, offset);

    const page = await aggregateByScore.paginate(ctx, {
      bounds: {
        lower: {
          key: firstInPage.key,
          id: firstInPage.id,
          inclusive: true,
        },
      },
      pageSize: numItems,
    });

    const scores = await Promise.all(
      page.page.map((doc) => ctx.db.get(doc.id))
    );

    return scores.filter((d) => d !== undefined);
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
    return await aggregateByScore.indexOf(ctx, -args.score);
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

export const addMockScores = mutationWithTriggers({
  args: {
    count: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
    for (let i = 0; i < args.count; i++) {
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
    }

    return null;
  },
});

// ---- migrations ----

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();

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

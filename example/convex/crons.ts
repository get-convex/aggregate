import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { resetWithoutTriggers } from "./photos";

export const resetAllData = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    console.log("Starting daily data reset...");

    await ctx.runMutation(internal.photos.resetWithoutTriggers);
    // Reset all modules in parallel for better performance
    // await Promise.all([
    //   ctx.runMutation(internal.leaderboard.resetLeaderboard),

    //   ctx.runMutation(internal.shuffle.resetShuffle),
    //   ctx.runMutation(internal.stats.resetStats),
    // ]);

    // // Seed some initial data
    // await ctx.runMutation(internal.crons.seedInitialData);

    console.log("Daily data reset completed successfully!");
    return null;
  },
});

/**
 * Seed some initial data after reset.
 * This directly inserts data since aggregates have been cleared.
 * The aggregates will be rebuilt through triggers when data is accessed.
 */
export const seedInitialData = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // await ctx.runMutation(internal.shuffle.addAllMusic, {
    //   titles: [
    //     "Bohemian Rhapsody - Queen",
    //     "Stairway to Heaven - Led Zeppelin",
    //     "Hotel California - Eagles",
    //     "Imagine - John Lennon",
    //     "Sweet Child O' Mine - Guns N' Roses",
    //   ],
    // });

    // // Add some initial photos directly
    // const initialPhotos = [
    //   {
    //     album: "Nature",
    //     url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
    //   },
    //   {
    //     album: "Nature",
    //     url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
    //   },
    //   {
    //     album: "Cities",
    //     url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000",
    //   },
    //   {
    //     album: "Cities",
    //     url: "https://images.unsplash.com/photo-1444723121867-7a241cacace9",
    //   },
    //   {
    //     album: "People",
    //     url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d",
    //   },
    // ];

    // for (const photo of initialPhotos) await ctx.db.insert("photos", photo);

    // await ctx.runMutation(api.leaderboard.add100MockScores);

    console.log("Initial data seeded - aggregates will rebuild when accessed");
    return null;
  },
});

// Create and configure the cron job
const crons = cronJobs();

// Run data reset every 24 hours (at midnight)
crons.interval(
  "daily data reset",
  { hours: 24 },
  internal.crons.resetAllData,
  {}
);

export default crons;

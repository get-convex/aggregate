import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const resetAndSeed = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log("Starting daily data reset...");

    // Reset each module sequentially; bail early and reschedule if any aren't done yet
    if (
      (await ctx.runMutation(internal.leaderboard.resetAll)) === "partial_reset"
    ) {
      await ctx.scheduler.runAfter(0, internal.crons.resetAndSeed, {});
      return null;
    }
    if ((await ctx.runMutation(internal.photos.resetAll)) === "partial_reset") {
      await ctx.scheduler.runAfter(0, internal.crons.resetAndSeed, {});
      return null;
    }
    if (
      (await ctx.runMutation(internal.shuffle.resetAll)) === "partial_reset"
    ) {
      await ctx.scheduler.runAfter(0, internal.crons.resetAndSeed, {});
      return null;
    }
    if ((await ctx.runMutation(internal.stats.resetAll)) === "partial_reset") {
      await ctx.scheduler.runAfter(0, internal.crons.resetAndSeed, {});
      return null;
    }
    if ((await ctx.runMutation(internal.btree.resetAll)) === "partial_reset") {
      await ctx.scheduler.runAfter(0, internal.crons.resetAndSeed, {});
      return null;
    }

    await ctx.runMutation(api.leaderboard.addMockScores, { count: 500 });

    // Add some initial photos
    await ctx.runMutation(internal.photos.addPhotos, {
      photos: [
        {
          album: "Nature",
          url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
        },
        {
          album: "Nature",
          url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
        },
        {
          album: "Nature",
          url: "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
        },
        {
          album: "Nature",
          url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05",
        },
        {
          album: "Nature",
          url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b",
        },
        {
          album: "Nature",
          url: "https://images.unsplash.com/photo-1501436513145-30f24e19fcc4",
        },
        {
          album: "Nature",
          url: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e",
        },
        {
          album: "Cities",
          url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000",
        },
        {
          album: "Cities",
          url: "https://images.unsplash.com/photo-1444723121867-7a241cacace9",
        },
        {
          album: "People",
          url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d",
        },
      ],
    });

    await ctx.runMutation(internal.shuffle.addAll, {
      titles: [
        "Bohemian Rhapsody - Queen",
        "Stairway to Heaven - Led Zeppelin",
        "Hotel California - Eagles",
        "Imagine - John Lennon",
        "Sweet Child O' Mine - Guns N' Roses",
        "Smells Like Teen Spirit - Nirvana",
        "Hey Jude - The Beatles",
        "Like a Rolling Stone - Bob Dylan",
        "Billie Jean - Michael Jackson",
        "Comfortably Numb - Pink Floyd",
        "Let It Be - The Beatles",
        "Wonderwall - Oasis",
        "Purple Rain - Prince",
        "Yesterday - The Beatles",
        "Losing My Religion - R.E.M.",
        "Hallelujah - Jeff Buckley",
        "No Woman, No Cry - Bob Marley",
        "Livin' on a Prayer - Bon Jovi",
        "Every Breath You Take - The Police",
        "Africa - Toto",
        "Don't Stop Believin' - Journey",
        "Back in Black - AC/DC",
        "Wish You Were Here - Pink Floyd",
        "November Rain - Guns N' Roses",
        "One - U2",
        "Paint It Black - The Rolling Stones",
        "Creep - Radiohead",
        "Enter Sandman - Metallica",
        "With or Without You - U2",
        "Heroes - David Bowie",
        "Blackbird - The Beatles",
        "Nothing Else Matters - Metallica",
        "Space Oddity - David Bowie",
        "Under Pressure - Queen & David Bowie",
        "Sultans of Swing - Dire Straits",
        "Imagine Dragons - Radioactive",
      ],
    });

    await ctx.runMutation(api.stats.addLatencies, {
      latencies: (() => {
        const latencies = new Set<number>();
        while (latencies.size < 55) {
          latencies.add(Math.floor(Math.random() * 1000) + 50);
        }
        return Array.from(latencies);
      })(),
    });

    // Add sample data to btree
    await ctx.runMutation(internal.btree.addSampleData);

    console.log("Daily data reset completed successfully!");
    return null;
  },
});

// Create and configure the cron job
const crons = cronJobs();

// Run data reset every 24 hours (at midnight)
crons.interval(
  "daily data reset",
  { hours: 24 },
  internal.crons.resetAndSeed,
  {},
);

export default crons;

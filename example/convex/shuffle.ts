/**
 * Example of random selection and a paginated shuffle over a music library,
 * implemented with Convex.
 */

import { TableAggregate } from "@convex-dev/aggregate";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "./_generated/server.js";
import { components } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";
import { v } from "convex/values";
import { resetStatusValidator } from "./utils/resetStatus.js";
import Rand from "rand-seed";

const randomize = new TableAggregate<{
  DataModel: DataModel;
  TableName: "music";
  Key: null;
}>(components.music, {
  sortKey: () => null,
});

export const addMusic = mutation({
  args: { title: v.string() },
  handler: addMusicHandler,
});

async function addMusicHandler(ctx: MutationCtx, { title }: { title: string }) {
  const id = await ctx.db.insert("music", { title });
  const doc = await ctx.db.get(id);
  if (!doc) throw new Error("Failed to insert music");
  await randomize.insert(ctx, doc);
  return id;
}

export const removeMusic = mutation({
  args: {
    id: v.id("music"),
  },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return;
    await ctx.db.delete(id);
    await randomize.delete(ctx, doc);
  },
});

export const getRandomMusicTitle = query({
  args: {
    cacheBuster: v.optional(v.number()),
  },
  handler: async (ctx) => {
    const randomMusic = await randomize.random(ctx);
    if (!randomMusic) return null;
    const doc = await ctx.db.get(randomMusic.id);
    if (!doc) return null;
    return doc.title;
  },
});

/**
 * Get the total count of music items - demonstrates O(log(n)) count operation
 */
export const getTotalMusicCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    return await randomize.count(ctx);
  },
});

/**
 * Shuffles indexes in the music table and returns this shuffled table, paginated.
 * For the first page use {offset: 0, numItems:10} then use
 * {offset:10, numItems:10}, then {offset:20, numItems:10}, etc.
 * until you get an empty page.
 * To get a new shuffle change the `seed`.
 *
 * Note when the table changes, the entire list can change.
 * e.g. deleting the song at index 0 will make every song have a new index, but
 * the shuffle will still use the same indices so the list is effectively
 * reshuffled.
 */
export const shufflePaginated = query({
  args: {
    offset: v.number(),
    numItems: v.number(),
    seed: v.string(),
  },
  returns: v.object({
    items: v.array(v.string()),
    totalCount: v.number(),
    totalPages: v.number(),
    currentPage: v.number(),
    hasNextPage: v.boolean(),
    hasPrevPage: v.boolean(),
  }),
  handler: async (ctx, { offset, numItems, seed }) => {
    const count = await randomize.count(ctx);
    // `rand` is a seeded pseudo-random number generator.
    // Therefore it will return the same sequence of numbers for the same seed,
    // including if the seed is an empty string.
    const rand = new Rand(seed);

    const allIndexes = Array.from({ length: count }, (_, i) => i);

    // The time complexity of calculating `indexes` is O(count),
    // and that's on every page so the overall time for all pages (assuming you
    // call `shufflePaginated` repeatedly until the end of the table) is quadratic.
    // That sounds terrible but is actually fast enough since this shuffle
    // doesn't fetch any data from the database; it's just in-memory
    // calculations.

    // The heavy-weight part is fetching the data from the database, which is
    // O(numItems) for each page, and O(count) for all pages.
    shuffle(allIndexes, rand);

    const indexes = allIndexes.slice(offset, offset + numItems);

    const atIndexes = await Promise.all(
      indexes.map((i) => randomize.at(ctx, i))
    );

    const items = await Promise.all(
      atIndexes.map(async (atIndex) => {
        const doc = await ctx.db.get(atIndex.id);
        if (!doc) throw new Error("Failed to get music");
        return doc.title;
      })
    );

    const totalPages = Math.ceil(count / numItems);
    const currentPage = Math.floor(offset / numItems) + 1;

    return {
      items,
      totalCount: count,
      totalPages,
      currentPage,
      hasNextPage: offset + numItems < count,
      hasPrevPage: offset > 0,
    };
  },
});

// Fisher-Yates shuffle
function shuffle<T>(array: T[], rand: Rand): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rand.next() * (i + 1));
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
  return array;
}

// ----- internal -----

export const resetAll = internalMutation({
  args: {},
  returns: resetStatusValidator,
  handler: async (ctx) => {
    console.log("Resetting shuffle/music...");

    const batchSize = 1000;
    const docs = await ctx.db.query("music").take(batchSize);
    for (const doc of docs) await ctx.db.delete(doc._id);

    if (docs.length === batchSize) {
      console.log("Shuffle/music reset partially complete; more to delete");
      return "partial_reset";
    }

    await randomize.clearAll(ctx);
    console.log("Shuffle/music reset complete");
    return "all_reset";
  },
});

export const addAll = internalMutation({
  args: {
    titles: v.array(v.string()),
  },
  handler: async (ctx, { titles }) => {
    await Promise.all(titles.map((title) => addMusicHandler(ctx, { title })));
  },
});

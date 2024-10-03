/**
 * Example of random selection and a paginated shuffle over a music library,
 * implemented with Convex.
 */

import { Randomize } from "@convex-dev/aggregate";
import { mutation as rawMutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import Rand from 'rand-seed';
import { Triggers } from "convex-helpers/server/triggers";
import { customMutation } from "convex-helpers/server/customFunctions";

const randomize = new Randomize<DataModel, "music">(components.music);

const triggers = new Triggers<DataModel>();
triggers.register("music", randomize.trigger());
const mutation = customMutation(rawMutation, triggers.customFunctionWrapper());

export const addMusic = mutation({
  args: {
    title: v.string(),
  },
  returns: v.id("music"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("music", { title: args.title });
  },
});

export const removeMusic = mutation({
  args: {
    id: v.id("music"),
  },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const getRandomMusicTitle = query({
  args: {
    cacheBuster: v.optional(v.number()),
  },
  returns: v.string(),
  handler: async (ctx) => {
    const id = await randomize.random(ctx);
    if (!id) {
      throw new ConvexError("no music");
    }
    const doc = (await ctx.db.get(id))!;
    return doc.title;
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
  returns: v.array(v.string()),
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

    return await Promise.all(
      indexes.map(async (i) => {
        const id = await randomize.at(ctx, i);
        const doc = (await ctx.db.get(id))!;
        return doc.title;
      })
    );
  },
});

// Fisher-Yates shuffle
function shuffle<T>(array: T[], rand: Rand): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rand.next() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

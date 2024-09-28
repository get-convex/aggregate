/**
 * Example of a music shuffle implemented with Convex.
 */

import { Randomize } from "@convex-dev/aggregate";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import Rand from 'rand-seed';

const randomize = new Randomize<Id<"music">>(components.music);

export const addMusic = mutation({
  args: {
    title: v.string(),
  },
  returns: v.id("music"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("music", { title: args.title });
    await randomize.insert(ctx, id);
    return id;
  },
});

export const removeMusic = mutation({
  args: {
    id: v.id("music"),
  },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    await randomize.delete(ctx, id);
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

    // Calculate `indexes` to be the sequence of pseudo-random indexes up until
    // offset + numItems (or the end of the table if we reach that first),
    // without duplicates.
    const indexes: number[] = [];
    // The time complexity of calculating `indexes` is
    // O((offset + numItems) * count),
    // and that's on every page so the overall time for all pages (assuming you
    // call `shufflePaginated` repeatedly until the end of the table) is cubic.
    // That sounds terrible but is actually fast enough since this loop doesn't
    // fetch any data from the database; it's just in-memory calculations.
    const remainingIndexes = Array.from({ length: count }, (_, i) => i);
    while (indexes.length < offset + numItems && remainingIndexes.length > 0) {
      const randomRemaining = Math.floor(rand.next() * remainingIndexes.length);
      indexes.push(remainingIndexes[randomRemaining]);
      remainingIndexes.splice(randomRemaining, 1);
    }

    return await Promise.all(
      indexes.slice(offset).map(async (i) => {
        const id = await randomize.at(ctx, i);
        const doc = (await ctx.db.get(id))!;
        return doc.title;
      })
    );
  },
});
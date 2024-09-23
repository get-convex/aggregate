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
 * For the first page use {numItems:10} then use {offset:10, numItems:10},
 * then {offset:20, numItems:10}, etc. until you get an empty page.
 * To get a new shuffle change the `seed`.
 * 
 * Note when the table changes, the entire list can change.
 * e.g. deleting the song at index 0 will make every song have a new index, but
 * the shuffle will still use the same indices so the list is effectively
 * reshuffled.
 */
export const shufflePaginated = query({
  args: {
    offset: v.optional(v.number()),
    numItems: v.number(),
    seed: v.optional(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { offset, numItems, seed }) => {
    const count = await randomize.count(ctx);
    const rand = new Rand(seed ?? "");
    const iSeen = new Set<number>();
    while (iSeen.size < (offset ?? 0)) {
      const nextI = Math.floor(rand.next() * count);
      iSeen.add(nextI);
    }
    const indexes = [];
    while (indexes.length < numItems && iSeen.size < count) {
      const nextI = Math.floor(rand.next() * count);
      if (!iSeen.has(nextI)) {
        iSeen.add(nextI);
        indexes.push(nextI);
      }
    }
    return await Promise.all(
      indexes.map(async (i) => {
        const id = await randomize.at(ctx, i);
        const doc = (await ctx.db.get(id))!;
        return doc.title;
      })
    );
  },
});
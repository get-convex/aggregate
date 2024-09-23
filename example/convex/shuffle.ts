/**
 * Example of a music shuffle implemented with Convex.
 */

import { Randomize } from "@convex-dev/aggregate";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";

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

/*
export const shufflePaginated = query({
  args: {
    opts: paginationOptsValidator
  },
  returns: v.string(),
  handler: async (ctx) => {
    await randomize.shuffle(ctx);
  },
});
*/
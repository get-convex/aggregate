/**
 * Example of a photo gallery which doesn't change much, and you want to display
 * it with offset-based pagination. That is, each page has 10 items, and you can
 * jump to any page in O(log(n)) time.
 * The paginated list is sorted by _creationTime.
 */

import { Aggregate } from "@convex-dev/aggregate";
import { internalMutation, mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const photos = new Aggregate<number, Id<"photos">>(components.photos);

export const init = internalMutation({
  args: {},
  handler: async (ctx) => {
    // rootLazy can be false because the table doesn't change much, and this
    // makes aggregates faster (this is entirely optional).
    await photos.clear(ctx, 16, false);
  },
});

export const addPhoto = mutation({
  args: {
    url: v.string(),
  },
  returns: v.id("photos"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("photos", { url: args.url });
    const photo = (await ctx.db.get(id))!;
    await photos.insert(ctx, photo._creationTime, id);
    return id;
  },
});

/**
 * Call this with {offset:0, numItems:10} to get the first page of photos,
 * then {offset:10, numItems:10} to get the second page, etc.
 */
export const pageOfPhotos = query({
  args: {
    offset: v.number(),
    numItems: v.number(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { offset, numItems }) => {
    if (offset >= await photos.count(ctx)) {
      return [];
    }
    const { key: firstPhotoCreationTime } = await photos.at(ctx, offset);
    const photoDocs = await ctx.db.query("photos")
      .withIndex("by_creation_time", q=>q.gte("_creationTime", firstPhotoCreationTime))
      .take(numItems);
    return photoDocs.map((doc) => doc.url);
  },
});

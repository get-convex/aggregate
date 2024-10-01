/**
 * Example of a photo gallery which doesn't change much, and you want to display
 * it with offset-based pagination. That is, each page has 10 items, and you can
 * jump to any page in O(log(n)) time.
 * The paginated list is sorted by _creationTime.
 * 
 * Also demonstrates aggregates automatically updating when the underlying table changes.
 */

import { TableAggregate } from "@convex-dev/aggregate";
import { internalMutation as rawInternalMutation, mutation as rawMutation, query, MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { v } from "convex/values";
import { customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";

const photos = new TableAggregate<number, DataModel, "photos">(components.photos);

const triggers = new Triggers<DataModel>();

triggers.register("photos", photos.trigger<MutationCtx>(
  (doc) => doc._creationTime,
));

const mutation = customMutation(rawMutation, triggers.customFunctionWrapper());
const internalMutation = customMutation(rawInternalMutation, triggers.customFunctionWrapper());

export const init = internalMutation({
  args: {},
  handler: async (ctx) => {
    // rootLazy can be false because the table doesn't change much, and this
    // makes aggregates faster (this is entirely optional).
    // Also reducing node size uses less bandwidth, since nodes are smaller.
    await photos.clear(ctx, 4, false);
  },
});

export const addPhoto = mutation({
  args: {
    url: v.string(),
  },
  returns: v.id("photos"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("photos", { url: args.url });
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
    const { key: firstPhotoCreationTime } = await photos.at(ctx, offset);
    const photoDocs = await ctx.db.query("photos")
      .withIndex("by_creation_time", q=>q.gte("_creationTime", firstPhotoCreationTime))
      .take(numItems);
    return photoDocs.map((doc) => doc.url);
  },
});

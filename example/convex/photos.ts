/**
 * Example of a photo gallery which doesn't change much, and you want to display
 * it with offset-based pagination. That is, each page has 10 items, and you can
 * jump to any page in O(log(n)) time.
 * The paginated list is sorted by _creationTime.
 *
 * Also demonstrates aggregates automatically updating when the underlying table changes.
 */

import { TableAggregate } from "@convex-dev/aggregate";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
  query,
} from "../../example/convex/_generated/server";
import { api, components } from "../../example/convex/_generated/api";
import { DataModel } from "../../example/convex/_generated/dataModel";
import { v } from "convex/values";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";

const photos = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "photos";
}>(components.photos, {
  namespace: (doc) => doc.album,
  sortKey: (doc) => doc._creationTime,
});

const triggers = new Triggers<DataModel>();

triggers.register("photos", photos.trigger());

const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB)
);

export const addPhoto = mutation({
  args: {
    album: v.string(),
    url: v.string(),
  },
  returns: v.id("photos"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("photos", { album: args.album, url: args.url });
  },
});

/**
 * Call this with {offset:0, numItems:10} to get the first page of photos,
 * then {offset:10, numItems:10} to get the second page, etc.
 */
export const pageOfPhotos = query({
  args: {
    album: v.string(),
    offset: v.number(),
    numItems: v.number(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { offset, numItems, album }) => {
    // Check if the album has any photos first
    const firstPhoto = await ctx.db
      .query("photos")
      .withIndex("by_album_creation_time", (q) => q.eq("album", album))
      .first();
    if (!firstPhoto) return [];

    const { key: firstPhotoCreationTime } = await photos.at(ctx, offset, {
      namespace: album,
    });
    const photoDocs = await ctx.db
      .query("photos")
      .withIndex("by_album_creation_time", (q) =>
        q.eq("album", album).gte("_creationTime", firstPhotoCreationTime)
      )
      .take(numItems);
    return photoDocs.map((doc) => doc.url);
  },
});

// ----- internal -----

export const resetAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Just delete table records - triggers will automatically keep aggregate in sync
    const photosDocs = await ctx.db.query("photos").collect();
    for (const doc of photosDocs) await ctx.db.delete(doc._id);

    // rootLazy can be false because the table doesn't change much, and this
    // makes aggregates faster (this is entirely optional).
    // Also reducing node size uses less bandwidth, since nodes are smaller.
    await photos.clearAll(ctx, {
      maxNodeSize: 4,
      rootLazy: false,
    });
  },
});

export const addPhotos = internalMutation({
  args: {
    photos: v.array(v.object({ album: v.string(), url: v.string() })),
  },
  handler: async (ctx, { photos }) => {
    await Promise.all(
      photos.map((photo) =>
        ctx.db.insert("photos", { album: photo.album, url: photo.url })
      )
    );
  },
});

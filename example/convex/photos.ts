/**
 * Example of a photo gallery which doesn't change much, and you want to display
 * it with offset-based pagination. That is, each page has 10 items, and you can
 * jump to any page in O(log(n)) time.
 * The paginated list is sorted by _creationTime.
 *
 * Also demonstrates aggregates automatically updating when the underlying table changes.
 */

import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";
import { v } from "convex/values";
import { resetStatusValidator } from "./utils/resetStatus.js";
import {
  internalMutationWithTriggers,
  mutationWithTriggers,
  query,
  type MutationCtx,
} from "./utils/queued.js";
import { Triggers } from "convex-helpers/server/triggers";

export const photos = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "photos";
}>(components.photos, {
  namespace: (doc) => doc.album,
  sortKey: (doc) => doc._creationTime,
});

// `ctx.aggregateOpts` carries the app-wide queued-mode toggle; see utils/queued.ts.
const triggers = new Triggers<DataModel, MutationCtx>();

triggers.register("photos", (ctx, change) =>
  photos.trigger({ async: ctx.aggregateOpts.async })(ctx, change),
);

const mutation = mutationWithTriggers(triggers);

const internalMutation = internalMutationWithTriggers(triggers);

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
 * Get the total count of photos in an album - demonstrates O(log(n)) count operation
 */
export const photoCount = query({
  args: { album: v.string() },
  returns: v.number(),
  handler: async (ctx, { album }) => {
    return await photos.count(ctx, { namespace: album, ...ctx.aggregateOpts });
  },
});

/**
 * Call this with {offset:0, numItems:10} to get the first page of photos,
 * then {offset:10, numItems:10} to get the second page, etc.
 *
 * This demonstrates the key feature: O(log(n)) offset-based pagination!
 * Instead of scanning through all photos to find page N, we use the aggregate
 * to jump directly to the right position.
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

    // This is the magic! photos.at() gives us O(log(n)) lookup to any position
    const { key: firstPhotoCreationTime } = await photos.at(ctx, offset, {
      namespace: album,
      ...ctx.aggregateOpts,
    });

    const photoDocs = await ctx.db
      .query("photos")
      .withIndex("by_album_creation_time", (q) =>
        q.eq("album", album).gte("_creationTime", firstPhotoCreationTime),
      )
      .take(numItems);

    return photoDocs.map((doc) => doc.url);
  },
});

/**
 * Get all available albums - useful for the UI
 */
export const availableAlbums = query({
  args: {},
  returns: v.array(v.object({ name: v.string(), count: v.number() })),
  handler: async (ctx) => {
    // Get unique albums from the photos table
    const allPhotos = await ctx.db.query("photos").collect();
    const albumNames = [...new Set(allPhotos.map((photo) => photo.album))];

    // Get count for each album using the aggregate
    const albumsWithCounts = await Promise.all(
      albumNames.map(async (album) => ({
        name: album,
        count: await photos.count(ctx, {
          namespace: album,
          ...ctx.aggregateOpts,
        }),
      })),
    );

    return albumsWithCounts.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ----- internal -----

export const resetAll = internalMutation({
  args: {},
  returns: resetStatusValidator,
  handler: async (ctx) => {
    const batchSize = 1000;
    const docs = await ctx.db.query("photos").take(batchSize);
    for (const doc of docs) await ctx.db.delete("photos", doc._id);

    if (docs.length === batchSize) return "partial_reset";

    await photos.clearAll(ctx, {
      maxNodeSize: 4,
      rootLazy: false,
    });
    return "all_reset";
  },
});

export const addPhotos = internalMutation({
  args: {
    photos: v.array(v.object({ album: v.string(), url: v.string() })),
  },
  handler: async (ctx, { photos }) => {
    await Promise.all(
      photos.map((photo) =>
        ctx.db.insert("photos", { album: photo.album, url: photo.url }),
      ),
    );
  },
});

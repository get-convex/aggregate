import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // A single row holding the app-wide aggregate mode. See utils/queued.ts.
  settings: defineTable({
    queued: v.boolean(),
    // True while queued writes are still draining after the toggle was turned
    // off; the app keeps reading stale until they're applied.
    draining: v.boolean(),
  }),
  leaderboard: defineTable({
    name: v.string(),
    score: v.number(),
  }),
  music: defineTable({
    title: v.string(),
  }),
  photos: defineTable({
    album: v.string(),
    url: v.string(),
  }).index("by_album_creation_time", ["album"]),
});

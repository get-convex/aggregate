import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
  btreeDemo: defineTable({
    name: v.string(),
    score: v.number(),
  }),
});

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
});

import { v } from "convex/values";

export type ResetStatus = "all_reset" | "partial_reset";

export const resetStatusValidator = v.union(
  v.literal("all_reset"),
  v.literal("partial_reset"),
);

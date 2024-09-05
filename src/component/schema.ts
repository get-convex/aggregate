import { defineSchema, defineTable } from "convex/server";
import { Value as ConvexValue, Infer, v } from "convex/values";

const item = v.object({
  // key, usually an index key.
  k: v.any(),
  // value, usually an id.
  v: v.any(),
  // summand, to be aggregated by summing.
  s: v.number(),
});

export type Item = {
  k: ConvexValue;
  v: ConvexValue;
  s: number;
};

export const aggregate = v.object({
  count: v.number(),
  sum: v.number(),
});

export type Aggregate = Infer<typeof aggregate>;

export default defineSchema({
  // Singleton.
  btree: defineTable({
    root: v.id("btreeNode"),
    // function getKey({doc: DocumentByName<DataModel, T>}): { key: K; summand: number }
    getKey: v.string(),
    maxNodeSize: v.number(),
  }),
  btreeNode: defineTable({
    items: v.array(item),
    subtrees: v.array(v.id("btreeNode")),
    aggregate: v.optional(aggregate),
  }),
});

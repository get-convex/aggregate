import { describe, expect, test } from "vitest";
import { TableAggregate } from "./index.js";
import { initConvexTest, components } from "./setup.test.js";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  testItems: defineTable({
    name: v.string(),
    value: v.number(),
  }),
});

describe("TableAggregate", () => {
  test("should count zero items in empty table", async () => {
    const t = initConvexTest(schema);

    const aggregate = new TableAggregate(components.aggregate, {
      sortKey: (doc) => doc.value,
    });

    const result = await t.run(async (ctx) => {
      return await aggregate.count(ctx);
    });

    expect(result).toBe(0);
  });

  test("should count two items after inserting two documents", async () => {
    const t = initConvexTest(schema);

    const aggregate = new TableAggregate(components.aggregate, {
      sortKey: (doc) => doc.value,
    });

    await t.run(async (ctx) => {
      // Insert first document
      const id1 = await ctx.db.insert("testItems", {
        name: "first",
        value: 10,
      });
      const doc1 = await ctx.db.get(id1);
      await aggregate.insert(ctx, doc1!);

      // Insert second document
      const id2 = await ctx.db.insert("testItems", {
        name: "second",
        value: 20,
      });
      const doc2 = await ctx.db.get(id2);
      await aggregate.insert(ctx, doc2!);
    });

    const result = await t.run(async (ctx) => {
      return await aggregate.count(ctx);
    });

    expect(result).toBe(2);
  });
});

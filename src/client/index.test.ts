import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TableAggregate } from "./index.js";
import {
  components,
  componentSchema,
  componentModules,
  modules,
} from "./setup.test.js";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";

const schema = defineSchema({
  testItems: defineTable({
    name: v.string(),
    value: v.number(),
  }),
});

function setupTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("aggregate", componentSchema, componentModules);
  return t;
}

type ConvexTest = ReturnType<typeof setupTest>;

describe("TableAggregate", () => {
  describe("count", () => {
    let t: ConvexTest;
    let aggregate = new TableAggregate(components.aggregate, {
      sortKey: (doc) => doc.value,
    });

    beforeEach(() => {
      t = setupTest();
      aggregate = new TableAggregate(components.aggregate, {
        sortKey: (doc) => doc.value,
      });
    });

    const exec = async (_aggregate = aggregate) => {
      return await t.run(async (ctx) => {
        return await _aggregate.count(ctx);
      });
    };

    test("should count zero items in empty table", async () => {
      const result = await exec();
      expect(result).toBe(0);
    });

    test("should count two items after inserting two documents", async () => {
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

      const result = await exec();
      expect(result).toBe(2);
    });
  });

  describe("clearAll", () => {
    let t: ConvexTest;
    let aggregate = new TableAggregate(components.aggregate, {
      sortKey: (doc) => doc.value,
    });

    beforeEach(() => {
      vi.useFakeTimers();
      t = setupTest();
      aggregate = new TableAggregate(components.aggregate, {
        sortKey: (doc) => doc.value,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const exec = async (_aggregate = aggregate) => {
      await t.run(async (ctx) => {
        await _aggregate.clearAll(ctx);
      });
      // Wait for scheduled cleanup functions to complete
      // if we dont do this vitest will hang
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    };

    test("should clear all data when called on empty aggregate", async () => {
      await exec();

      const result = await t.run(async (ctx) => {
        return await aggregate.count(ctx);
      });

      expect(result).toBe(0);
    });

    test("should clear twice all data when called on empty aggregate", async () => {
      await exec();

      // This used to error, but now it doesn't
      await exec();

      const result = await t.run(async (ctx) => {
        return await aggregate.count(ctx);
      });

      expect(result).toBe(0);
    });

    test("should clear all data after inserting documents", async () => {
      // Insert some test documents
      await t.run(async (ctx) => {
        const id1 = await ctx.db.insert("testItems", {
          name: "first",
          value: 10,
        });
        const doc1 = await ctx.db.get(id1);
        await aggregate.insert(ctx, doc1!);

        const id2 = await ctx.db.insert("testItems", {
          name: "second",
          value: 20,
        });
        const doc2 = await ctx.db.get(id2);
        await aggregate.insert(ctx, doc2!);

        const id3 = await ctx.db.insert("testItems", {
          name: "third",
          value: 30,
        });
        const doc3 = await ctx.db.get(id3);
        await aggregate.insert(ctx, doc3!);
      });

      // Verify data exists
      const countBefore = await t.run(async (ctx) => {
        return await aggregate.count(ctx);
      });
      expect(countBefore).toBe(3);

      // Clear all data
      await exec();

      // Verify data is cleared
      const countAfter = await t.run(async (ctx) => {
        return await aggregate.count(ctx);
      });
      expect(countAfter).toBe(0);

      // Verify we can call clearAll again without errors
      await exec();

      const countAfterSecondClear = await t.run(async (ctx) => {
        return await aggregate.count(ctx);
      });
      expect(countAfterSecondClear).toBe(0);
    });
  });
});

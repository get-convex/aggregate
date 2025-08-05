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
import { DataModelFromSchemaDefinition } from "convex/server";

const schema = defineSchema({
  testItems: defineTable({
    name: v.string(),
    value: v.number(),
  }),
  photos: defineTable({
    album: v.string(),
    url: v.string(),
    score: v.number(),
  }),
});

function setupTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("aggregate", componentSchema, componentModules);
  return t;
}

type ConvexTest = ReturnType<typeof setupTest>;

type DataModel = DataModelFromSchemaDefinition<typeof schema>;

// Helper function to create aggregates with fresh instances
// if we dont do this we will get strange errors if we share instances between tests
function createAggregates() {
  const aggregate = new TableAggregate(components.aggregate, {
    sortKey: (doc) => doc.value,
  });

  const aggregateWithNamespace = new TableAggregate<{
    Namespace: string;
    Key: number;
    DataModel: DataModel;
    TableName: "photos";
  }>(components.aggregate, {
    namespace: (doc) => doc.album,
    sortKey: (doc) => doc.score, // Use score instead of _creationTime for predictable tests
  });

  return { aggregate, aggregateWithNamespace };
}

describe("TableAggregate", () => {
  describe("count", () => {
    let t: ConvexTest;

    let aggregate: ReturnType<typeof createAggregates>["aggregate"];

    beforeEach(() => {
      t = setupTest();
      ({ aggregate } = createAggregates());
    });

    const exec = async () => {
      return await t.run(async (ctx) => {
        return await aggregate.count(ctx);
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

    let aggregate: ReturnType<typeof createAggregates>["aggregate"];

    beforeEach(() => {
      vi.useFakeTimers();
      t = setupTest();
      ({ aggregate } = createAggregates());
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


describe("TableAggregate with namespace", () => {
  let t: ConvexTest;
  let aggregateWithNamespace: ReturnType<
    typeof createAggregates
  >["aggregateWithNamespace"];

  beforeEach(() => {
    t = setupTest();
    ({ aggregateWithNamespace } = createAggregates());
  });

  describe("count", () => {
    test("should allow count with namespace only (no bounds)", async () => {
      // With the updated type system, bounds are now optional even with namespace
      const result = await t.run(async (ctx) => {
        // This should work - namespace only, no bounds required
        return await aggregateWithNamespace.count(ctx, {
          namespace: "album1",
        });
      });

      expect(result).toBe(0);
    });

    test("should allow count with namespace and bounds", async () => {
      // You can still provide bounds if you want to
      const result = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "album1",
          bounds: { lower: { key: 0, inclusive: true } },
        });
      });

      expect(result).toBe(0);
    });

    test("should demonstrate namespace requirement with actual data", async () => {
      // Insert some test photos in different albums
      await t.run(async (ctx) => {
        const id1 = await ctx.db.insert("photos", {
          album: "vacation",
          url: "photo1.jpg",
          score: 10,
        });
        const doc1 = await ctx.db.get(id1);
        await aggregateWithNamespace.insert(ctx, doc1!);

        const id2 = await ctx.db.insert("photos", {
          album: "vacation",
          url: "photo2.jpg",
          score: 20,
        });
        const doc2 = await ctx.db.get(id2);
        await aggregateWithNamespace.insert(ctx, doc2!);

        const id3 = await ctx.db.insert("photos", {
          album: "family",
          url: "photo3.jpg",
          score: 30,
        });
        const doc3 = await ctx.db.get(id3);
        await aggregateWithNamespace.insert(ctx, doc3!);
      });

      // Count photos in "vacation" album - bounds no longer required
      const vacationCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
        });
      });

      expect(vacationCount).toBe(2);

      // Count photos in "family" album
      const familyCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "family",
        });
      });

      expect(familyCount).toBe(1);

      // You can still use bounds if you want to limit the range within a namespace
      const vacationCountWithBounds = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
          bounds: {},
        });
      });

      expect(vacationCountWithBounds).toBe(2);
    });

    test("should respect bounds when provided with namespace", async () => {
      // Insert photos with explicit scores for predictable bounds testing
      await t.run(async (ctx) => {
        const doc1 = { album: "vacation", url: "photo1.jpg", score: 10 };
        const doc2 = { album: "vacation", url: "photo2.jpg", score: 20 };
        const doc3 = { album: "vacation", url: "photo3.jpg", score: 30 };

        const id1 = await ctx.db.insert("photos", doc1);
        const id2 = await ctx.db.insert("photos", doc2);
        const id3 = await ctx.db.insert("photos", doc3);

        const insertedDoc1 = await ctx.db.get(id1);
        const insertedDoc2 = await ctx.db.get(id2);
        const insertedDoc3 = await ctx.db.get(id3);

        await aggregateWithNamespace.insert(ctx, insertedDoc1!);
        await aggregateWithNamespace.insert(ctx, insertedDoc2!);
        await aggregateWithNamespace.insert(ctx, insertedDoc3!);
      });

      // Count all photos in vacation album (no bounds)
      const totalCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
        });
      });
      expect(totalCount).toBe(3);

      // Count with lower bound - should exclude first photo (score 10)
      const countFromSecond = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
          bounds: {
            lower: { key: 20, inclusive: true },
          },
        });
      });
      expect(countFromSecond).toBe(2); // photos with score 20 and 30

      // Count with upper bound - should exclude third photo (score 30)
      const countUpToSecond = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
          bounds: {
            upper: { key: 20, inclusive: true },
          },
        });
      });
      expect(countUpToSecond).toBe(2); // photos with score 10 and 20

      // Count with both bounds - should only include middle photo
      const countMiddleOnly = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
          bounds: {
            lower: { key: 20, inclusive: true },
            upper: { key: 20, inclusive: true },
          },
        });
      });
      expect(countMiddleOnly).toBe(1); // only photo with score 20

      // Test simple lower bound
      const countWithLowerBound = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
          bounds: {
            lower: { key: 25, inclusive: true }, // Should only include photo with score 30
          },
        });
      });
      expect(countWithLowerBound).toBe(1); // Only photo with score 30

      // Test upper bound
      const countWithUpperBound = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
          bounds: {
            upper: { key: 15, inclusive: true }, // Should only include photo with score 10
          },
        });
      });
      expect(countWithUpperBound).toBe(1); // Only photo with score 10
    });

    test("comprehensive bounds and namespace test", async () => {
      // Insert test data across multiple namespaces
      await t.run(async (ctx) => {
        // Vacation album photos
        const vacation1 = { album: "vacation", url: "v1.jpg", score: 5 };
        const vacation2 = { album: "vacation", url: "v2.jpg", score: 15 };
        const vacation3 = { album: "vacation", url: "v3.jpg", score: 25 };

        // Family album photos
        const family1 = { album: "family", url: "f1.jpg", score: 10 };
        const family2 = { album: "family", url: "f2.jpg", score: 20 };

        for (const doc of [vacation1, vacation2, vacation3, family1, family2]) {
          const id = await ctx.db.insert("photos", doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregateWithNamespace.insert(ctx, insertedDoc!);
        }
      });

      // Test: Count all vacation photos (no bounds required!)
      const allVacationCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
        });
      });
      expect(allVacationCount).toBe(3);

      // Test: Count all family photos (no bounds required!)
      const allFamilyCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "family",
        });
      });
      expect(allFamilyCount).toBe(2);

      // Test: Count vacation photos with bounds - only high scores
      const highScoreVacationCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
          bounds: {
            lower: { key: 20, inclusive: true }, // score >= 20
          },
        });
      });
      expect(highScoreVacationCount).toBe(1); // Only score 25

      // Test: Count family photos with bounds - only low scores
      const lowScoreFamilyCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "family",
          bounds: {
            upper: { key: 15, inclusive: true }, // score <= 15
          },
        });
      });
      expect(lowScoreFamilyCount).toBe(1); // Only score 10
    });

    test("should isolate bounds within different namespaces", async () => {
      await t.run(async (ctx) => {
        // Insert photo in vacation album with score 15
        const vacationDoc = {
          album: "vacation",
          url: "vacation1.jpg",
          score: 15,
        };
        const vacationId = await ctx.db.insert("photos", vacationDoc);
        const insertedVacationDoc = await ctx.db.get(vacationId);
        await aggregateWithNamespace.insert(ctx, insertedVacationDoc!);

        // Insert photo in family album with score 25
        const familyDoc = { album: "family", url: "family1.jpg", score: 25 };
        const familyId = await ctx.db.insert("photos", familyDoc);
        const insertedFamilyDoc = await ctx.db.get(familyId);
        await aggregateWithNamespace.insert(ctx, insertedFamilyDoc!);
      });

      // Using bounds that would exclude family photo shouldn't affect family namespace count
      const familyCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "family",
          bounds: {
            upper: { key: 20, inclusive: true }, // Family photo has score 25, so this excludes it
          },
        });
      });
      expect(familyCount).toBe(0);

      // Count family photos without bounds should still work
      const familyCountNoBounds = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "family",
        });
      });
      expect(familyCountNoBounds).toBe(1);

      // Count vacation photos with bounds that would include family photo score
      const vacationCount = await t.run(async (ctx) => {
        return await aggregateWithNamespace.count(ctx, {
          namespace: "vacation",
          bounds: {
            upper: { key: 30, inclusive: true }, // Would include family score, but family is different namespace
          },
        });
      });
      // Should be 1 - only the vacation photo, not affected by family photo
      expect(vacationCount).toBe(1);
    });
  });
});
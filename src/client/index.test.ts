import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TableAggregate } from "./index.js";
import {
  components,
  componentSchema,
  componentModules,
  modules,
} from "./setup.test.js";
import {
  defineSchema,
  defineTable,
  type GenericMutationCtx,
} from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import type { DataModelFromSchemaDefinition } from "convex/server";

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
  const aggregate = new TableAggregate<{
    Key: number;
    DataModel: DataModel;
    TableName: "testItems";
  }>(components.aggregate, {
    sortKey: (doc) => doc.value,
    sumValue: (doc) => doc.value,
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

async function testItem(
  ctx: GenericMutationCtx<DataModel>,
  value: { name: string; value: number },
) {
  const id = await ctx.db.insert("testItems", {
    name: value.name,
    value: value.value,
  });
  return (await ctx.db.get(id))!;
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
        const doc1 = await testItem(ctx, { name: "first", value: 10 });
        await aggregate.insert(ctx, doc1);

        // Insert second document
        const doc2 = await testItem(ctx, { name: "second", value: 20 });
        await aggregate.insert(ctx, doc2);
      });

      const result = await exec();
      expect(result).toBe(2);
    });

    test("should paginate a single undefined namespace", async () => {
      await t.run(async (ctx) => {
        await aggregate.insert(
          ctx,
          await testItem(ctx, { name: "name", value: 1 }),
        );
        let count = 0;
        for await (const namespace of aggregate.iterNamespaces(ctx)) {
          expect(namespace).toBe(undefined);
          count++;
        }
        expect(count).toBe(1);
      });
    });
  });

  describe("countBatch", () => {
    let t: ConvexTest;

    const { aggregate } = createAggregates();

    beforeEach(() => {
      t = setupTest();
    });

    test("should count zero items in empty table", async () => {
      await t.run(async (ctx) => {
        const result = await aggregate.countBatch(ctx, [
          { bounds: { lower: { key: 0, inclusive: true } } },
          { bounds: { lower: { key: 0, inclusive: false } } },
        ]);
        expect(result.length).toBe(2);
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0);
        const result2 = await aggregate.countBatch(ctx, [{}, {}]);
        expect(result2.length).toBe(2);
        expect(result2[0]).toBe(0);
        expect(result2[1]).toBe(0);
      });
    });

    test("should count two items after inserting two documents", async () => {
      await t.run(async (ctx) => {
        const item1 = await testItem(ctx, { name: "name", value: 1 });
        await aggregate.insert(ctx, item1);
        await aggregate.insert(
          ctx,
          await testItem(ctx, { name: "name", value: 2 }),
        );
        const result = await aggregate.countBatch(ctx, [
          { bounds: { lower: { key: 1, inclusive: true } } },
        ]);
        expect(result.length).toBe(1);
        expect(result[0]).toBe(2);
        const result2 = await aggregate.countBatch(ctx, [
          {
            bounds: {
              lower: { key: 1, id: item1._id, inclusive: false },
              upper: { key: 2, inclusive: true },
            },
          },
        ]);
        expect(result2.length).toBe(1);
        expect(result2[0]).toBe(1);
      });
    });
  });

  describe("sumBatch", () => {
    let t: ConvexTest;

    const { aggregate } = createAggregates();

    beforeEach(() => {
      t = setupTest();
    });

    test("should sum zero in empty table", async () => {
      await t.run(async (ctx) => {
        const result = await aggregate.sumBatch(ctx, [
          { bounds: { lower: { key: 0, inclusive: true } } },
          { bounds: { lower: { key: 0, inclusive: false } } },
        ]);
        expect(result.length).toBe(2);
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0);
        const result2 = await aggregate.sumBatch(ctx, [{}, {}]);
        expect(result2.length).toBe(2);
        expect(result2[0]).toBe(0);
        expect(result2[1]).toBe(0);
      });
    });

    test("should sum items with different sumValues across multiple ranges", async () => {
      await t.run(async (ctx) => {
        const item1 = await testItem(ctx, { name: "name", value: 10 });
        await aggregate.insert(ctx, item1);
        const item2 = await testItem(ctx, { name: "name", value: 20 });
        await aggregate.insert(ctx, item2);
        const item3 = await testItem(ctx, { name: "name", value: 30 });
        await aggregate.insert(ctx, item3);

        const result = await aggregate.sumBatch(ctx, [
          { bounds: { lower: { key: 10, inclusive: true } } }, // All items: 10 + 20 + 30 = 60
          { bounds: { lower: { key: 20, inclusive: true } } }, // Items 2,3: 20 + 30 = 50
          {
            bounds: {
              lower: { key: 10, inclusive: true },
              upper: { key: 20, inclusive: true },
            },
          }, // Items 1,2: 10 + 20 = 30
        ]);
        expect(result.length).toBe(3);
        expect(result[0]).toBe(60);
        expect(result[1]).toBe(50);
        expect(result[2]).toBe(30);
      });
    });

    test("should handle exclusive bounds correctly", async () => {
      await t.run(async (ctx) => {
        const item1 = await testItem(ctx, { name: "name", value: 100 });
        await aggregate.insert(ctx, item1);
        const item2 = await testItem(ctx, { name: "name", value: 200 });
        await aggregate.insert(ctx, item2);

        const result = await aggregate.sumBatch(ctx, [
          {
            bounds: {
              lower: { key: 100, id: item1._id, inclusive: false },
              upper: { key: 200, inclusive: true },
            },
          }, // Only item2: 200
        ]);
        expect(result.length).toBe(1);
        expect(result[0]).toBe(200);
      });
    });
  });

  describe("atBatch", () => {
    const { aggregate } = createAggregates();

    let t: ConvexTest;
    beforeEach(() => {
      t = setupTest();
    });

    test("should find the only item in a single item table", async () => {
      await t.run(async (ctx) => {
        await aggregate.insert(
          ctx,
          await testItem(ctx, { name: "name", value: 1 }),
        );
        const result = await aggregate.atBatch(ctx, [{ offset: 0 }]);
        expect(result.length).toBe(1);
        expect(result[0].key).toBe(1);
        expect(result[0].sumValue).toBe(1);
      });
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

  describe("inclusive bounds behavior", () => {
    let t: ConvexTest;
    let aggregate: ReturnType<typeof createAggregates>["aggregate"];

    beforeEach(() => {
      t = setupTest();
      ({ aggregate } = createAggregates());
    });

    test("should respect inclusive vs exclusive lower bounds", async () => {
      await t.run(async (ctx) => {
        const docs = [
          { name: "item1", value: 10 },
          { name: "item2", value: 20 },
          { name: "item3", value: 30 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert("testItems", doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregate.insert(ctx, insertedDoc!);
        }
      });

      const countInclusiveLower = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            lower: { key: 20, inclusive: true },
          },
        });
      });
      expect(countInclusiveLower).toBe(2);

      const countExclusiveLower = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            lower: { key: 20, inclusive: false },
          },
        });
      });
      expect(countExclusiveLower).toBe(1);
    });

    test("should respect inclusive vs exclusive upper bounds", async () => {
      await t.run(async (ctx) => {
        const docs = [
          { name: "item1", value: 10 },
          { name: "item2", value: 20 },
          { name: "item3", value: 30 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert("testItems", doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregate.insert(ctx, insertedDoc!);
        }
      });

      const countInclusiveUpper = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            upper: { key: 20, inclusive: true },
          },
        });
      });
      expect(countInclusiveUpper).toBe(2);

      const countExclusiveUpper = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            upper: { key: 20, inclusive: false },
          },
        });
      });
      expect(countExclusiveUpper).toBe(1);
    });

    test("should respect inclusive vs exclusive bounds with both lower and upper", async () => {
      await t.run(async (ctx) => {
        const docs = [
          { name: "item1", value: 10 },
          { name: "item2", value: 20 },
          { name: "item3", value: 30 },
          { name: "item4", value: 40 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert("testItems", doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregate.insert(ctx, insertedDoc!);
        }
      });

      const countBothInclusive = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            lower: { key: 20, inclusive: true },
            upper: { key: 30, inclusive: true },
          },
        });
      });
      expect(countBothInclusive).toBe(2);

      const countBothExclusive = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            lower: { key: 20, inclusive: false },
            upper: { key: 30, inclusive: false },
          },
        });
      });
      expect(countBothExclusive).toBe(0);

      const countMixed1 = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            lower: { key: 20, inclusive: true },
            upper: { key: 30, inclusive: false },
          },
        });
      });
      expect(countMixed1).toBe(1);

      const countMixed2 = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            lower: { key: 20, inclusive: false },
            upper: { key: 30, inclusive: true },
          },
        });
      });
      expect(countMixed2).toBe(1);
    });

    test("should respect inclusive bounds with exact boundary matches", async () => {
      await t.run(async (ctx) => {
        const docs = [
          { name: "item1", value: 15 },
          { name: "item2", value: 20 },
          { name: "item3", value: 20 },
          { name: "item4", value: 25 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert("testItems", doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregate.insert(ctx, insertedDoc!);
        }
      });

      const countInclusiveLowerDupe = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            lower: { key: 20, inclusive: true },
          },
        });
      });
      expect(countInclusiveLowerDupe).toBe(3);

      const countExclusiveLowerDupe = await t.run(async (ctx) => {
        return await aggregate.count(ctx, {
          bounds: {
            lower: { key: 20, inclusive: false },
          },
        });
      });
      expect(countExclusiveLowerDupe).toBe(1);
    });

    test("should respect inclusive bounds with array keys", async () => {
      const aggregateWithArrayKeys = new TableAggregate(components.aggregate, {
        sortKey: (doc) => [doc.value, doc.name],
      });

      await t.run(async (ctx) => {
        const docs = [
          { name: "a", value: 10 },
          { name: "b", value: 20 },
          { name: "c", value: 20 },
          { name: "d", value: 30 },
        ];

        for (const doc of docs) {
          const id = await ctx.db.insert("testItems", doc);
          const insertedDoc = await ctx.db.get(id);
          await aggregateWithArrayKeys.insert(ctx, insertedDoc!);
        }
      });

      const countInclusiveArrayLower = await t.run(async (ctx) => {
        return await aggregateWithArrayKeys.count(ctx, {
          bounds: {
            lower: { key: [20, "b"], inclusive: true },
          },
        });
      });
      expect(countInclusiveArrayLower).toBe(3);

      const countExclusiveArrayLower = await t.run(async (ctx) => {
        return await aggregateWithArrayKeys.count(ctx, {
          bounds: {
            lower: { key: [20, "b"], inclusive: false },
          },
        });
      });
      expect(countExclusiveArrayLower).toBe(2);

      const countInclusiveArrayUpper = await t.run(async (ctx) => {
        return await aggregateWithArrayKeys.count(ctx, {
          bounds: {
            upper: { key: [20, "c"], inclusive: true },
          },
        });
      });
      expect(countInclusiveArrayUpper).toBe(3);

      const countExclusiveArrayUpper = await t.run(async (ctx) => {
        return await aggregateWithArrayKeys.count(ctx, {
          bounds: {
            upper: { key: [20, "c"], inclusive: false },
          },
        });
      });
      expect(countExclusiveArrayUpper).toBe(2);
    });
  });
});

describe("TableAggregate pagination", () => {
  const leaderboardSchema = defineSchema({
    leaderboard: defineTable({
      monthKey: v.string(),
      totalPoints: v.number(),
    }),
  });

  type LeaderboardDataModel =
    DataModelFromSchemaDefinition<typeof leaderboardSchema>;

  function setupLeaderboardTest() {
    const t = convexTest(leaderboardSchema, modules);
    t.registerComponent("aggregate", componentSchema, componentModules);
    return t;
  }

  test("paginate with pageSize=1 returns cursor when more items exist (customer scenario)", async () => {
    const t = setupLeaderboardTest();

    const leaderboardAggregate = new TableAggregate<{
      Namespace: string;
      Key: [number, string];
      DataModel: LeaderboardDataModel;
      TableName: "leaderboard";
    }>(components.aggregate, {
      namespace: (doc) => doc.monthKey,
      sortKey: (doc) => [-doc.totalPoints, doc._id],
    });

    await t.run(async (ctx) => {
      // Insert 3 items in the namespace (simulating the customer's scenario)
      const id1 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 376,
      });
      const doc1 = await ctx.db.get(id1);
      await leaderboardAggregate.insert(ctx, doc1!);

      const id2 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 60,
      });
      const doc2 = await ctx.db.get(id2);
      await leaderboardAggregate.insert(ctx, doc2!);

      const id3 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 6,
      });
      const doc3 = await ctx.db.get(id3);
      await leaderboardAggregate.insert(ctx, doc3!);

      // Verify count is 3
      const count = await leaderboardAggregate.count(ctx, {
        namespace: "2025-11",
      });
      expect(count).toBe(3);

      // Paginate with pageSize=1, order=asc
      const result = await leaderboardAggregate.paginate(ctx, {
        namespace: "2025-11",
        pageSize: 1,
        order: "asc",
      });

      expect(result.page.length).toBe(1);
      expect(result.isDone).toBe(false);
      expect(result.cursor).not.toBe("");
    });
  });

  test("paginate with pageSize=1 iterates through all items correctly (customer scenario)", async () => {
    const t = setupLeaderboardTest();

    const leaderboardAggregate = new TableAggregate<{
      Namespace: string;
      Key: [number, string];
      DataModel: LeaderboardDataModel;
      TableName: "leaderboard";
    }>(components.aggregate, {
      namespace: (doc) => doc.monthKey,
      sortKey: (doc) => [-doc.totalPoints, doc._id],
    });

    await t.run(async (ctx) => {
      // Insert 3 items
      const id1 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 376,
      });
      const doc1 = await ctx.db.get(id1);
      await leaderboardAggregate.insert(ctx, doc1!);

      const id2 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 60,
      });
      const doc2 = await ctx.db.get(id2);
      await leaderboardAggregate.insert(ctx, doc2!);

      const id3 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 6,
      });
      const doc3 = await ctx.db.get(id3);
      await leaderboardAggregate.insert(ctx, doc3!);

      // Paginate through all items with pageSize=1
      const allItems: Array<{ key: [number, string]; id: string }> = [];
      let cursor: string | undefined = undefined;
      let iterations = 0;
      const maxIterations = 10; // Safety limit

      while (iterations < maxIterations) {
        const result = await leaderboardAggregate.paginate(ctx, {
          namespace: "2025-11",
          pageSize: 1,
          order: "asc",
          cursor,
        });
        allItems.push(...result.page);
        if (result.isDone) {
          break;
        }
        cursor = result.cursor;
        iterations++;
      }

      expect(allItems.length).toBe(3);
      // Keys should be sorted in ascending order: [-376, ...], [-60, ...], [-6, ...]
      expect(allItems[0].key[0]).toBe(-376);
      expect(allItems[1].key[0]).toBe(-60);
      expect(allItems[2].key[0]).toBe(-6);
    });
  });

  test("paginate with pageSize=10 returns all items at once", async () => {
    const t = setupLeaderboardTest();

    const leaderboardAggregate = new TableAggregate<{
      Namespace: string;
      Key: [number, string];
      DataModel: LeaderboardDataModel;
      TableName: "leaderboard";
    }>(components.aggregate, {
      namespace: (doc) => doc.monthKey,
      sortKey: (doc) => [-doc.totalPoints, doc._id],
    });

    await t.run(async (ctx) => {
      // Insert 3 items
      const id1 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 376,
      });
      const doc1 = await ctx.db.get(id1);
      await leaderboardAggregate.insert(ctx, doc1!);

      const id2 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 60,
      });
      const doc2 = await ctx.db.get(id2);
      await leaderboardAggregate.insert(ctx, doc2!);

      const id3 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 6,
      });
      const doc3 = await ctx.db.get(id3);
      await leaderboardAggregate.insert(ctx, doc3!);

      // Paginate with pageSize=10 should return all 3 items
      const result = await leaderboardAggregate.paginate(ctx, {
        namespace: "2025-11",
        pageSize: 10,
        order: "asc",
      });

      expect(result.page.length).toBe(3);
      expect(result.isDone).toBe(true);
    });
  });

  test("iter with namespace and composite keys works correctly", async () => {
    const t = setupLeaderboardTest();

    const leaderboardAggregate = new TableAggregate<{
      Namespace: string;
      Key: [number, string];
      DataModel: LeaderboardDataModel;
      TableName: "leaderboard";
    }>(components.aggregate, {
      namespace: (doc) => doc.monthKey,
      sortKey: (doc) => [-doc.totalPoints, doc._id],
    });

    await t.run(async (ctx) => {
      // Insert 3 items
      const id1 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 376,
      });
      const doc1 = await ctx.db.get(id1);
      await leaderboardAggregate.insert(ctx, doc1!);

      const id2 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 60,
      });
      const doc2 = await ctx.db.get(id2);
      await leaderboardAggregate.insert(ctx, doc2!);

      const id3 = await ctx.db.insert("leaderboard", {
        monthKey: "2025-11",
        totalPoints: 6,
      });
      const doc3 = await ctx.db.get(id3);
      await leaderboardAggregate.insert(ctx, doc3!);

      // Use iter to get all items
      const allItems: Array<{ key: [number, string]; id: string }> = [];
      for await (const item of leaderboardAggregate.iter(ctx, {
        namespace: "2025-11",
        order: "asc",
        pageSize: 1, // Use small pageSize to test pagination
      })) {
        allItems.push(item);
      }

      expect(allItems.length).toBe(3);
      expect(allItems[0].key[0]).toBe(-376);
      expect(allItems[1].key[0]).toBe(-60);
      expect(allItems[2].key[0]).toBe(-6);
    });
  });
});

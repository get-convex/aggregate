import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema, { Item } from "./schema.js";
import { modules } from "./setup.test.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import {
  atOffsetHandler,
  aggregateBetweenHandler,
  deleteHandler,
  getHandler,
  insertHandler,
  offsetHandler,
  validateTree,
  getOrCreateTree,
  Value,
  offsetUntilHandler,
  atNegativeOffsetHandler,
  paginateHandler,
  batchAggregateBetweenHandler,
  batchAtOffsetHandler,
  batchAtNegativeOffsetHandler,
} from "./btree.js";
import { compareValues } from "./compare.js";
import { arbitraryValue } from "./arbitrary.helpers.js";
import { ConvexError, convexToJson, jsonToConvex } from "convex/values";

describe("btree", () => {
  test("insert", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      // Insert lots of keys. At each stage, the tree is valid.
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
        const get = await getHandler(ctx, { key });
        expect(get).toEqual({
          k: key,
          v: value,
          s: 0,
        });
      }
      await insert(1, "a");
      await insert(4, "b");
      await insert(3, "c");
      await insert(2, "d");
      await insert(5, "e");
      await insert(6, "e");
      await insert(7, "e");
      await insert(10, "e");
      await insert(0, "e");
      await insert(-1, "e");
      await insert(9, "e");
      await insert(8, "e");
    });
  });

  test("delete", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
        const get = await getHandler(ctx, { key });
        expect(get).toEqual({
          k: key,
          v: value,
          s: 0,
        });
      }
      // Delete keys. At each stage, the tree is valid.
      async function del(key: number) {
        await deleteHandler(ctx, { key });
        await validateTree(ctx, {});
        const get = await getHandler(ctx, { key });
        expect(get).toBeNull();
      }
      await insert(1, "a");
      await insert(2, "b");
      await del(1);
      await del(2);
      await insert(1, "a");
      await insert(2, "a");
      await insert(3, "c");
      await insert(4, "d");
      await insert(5, "e");
      await del(3);
      await insert(6, "e");
      await insert(7, "e");
      await insert(10, "e");
      await insert(0, "e");
      await insert(-1, "e");
      await insert(9, "e");
      await insert(8, "e");
      await del(-1);
      await del(6);
      await del(7);
      await del(0);
    });
  });

  test("atOffset and offsetOf", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
        const rank = await offsetHandler(ctx, { key });
        expect(rank).not.toBeNull();
        const atIndex = await atOffsetHandler(ctx, {
          offset: rank!,
        });
        expect(atIndex).toEqual({
          k: key,
          v: value,
          s: 0,
        });
      }
      async function checkRank(key: number, rank: number) {
        const r = await offsetHandler(ctx, { key });
        expect(r).toEqual(rank);
        const atOffset = await atOffsetHandler(ctx, { offset: rank });
        expect(atOffset.k).toEqual(key);
      }
      await insert(1, "a");
      await insert(4, "b");
      await insert(3, "c");
      await insert(2, "d");
      await insert(5, "e");
      await insert(6, "e");
      await insert(7, "e");
      await insert(10, "e");
      await insert(0, "e");
      await insert(-1, "e");
      await insert(9, "e");
      await insert(8, "e");
      await checkRank(-1, 0);
      await checkRank(10, 11);
      await checkRank(5, 6);
    });
  });

  test("countBetween", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
      }
      async function countBetween(
        k1: number | undefined,
        k2: number | undefined,
        count: number
      ) {
        const c = await aggregateBetweenHandler(ctx, { k1, k2 });
        expect(c).toEqual({
          count,
          sum: 0,
        });
      }
      await insert(0, "a");
      await insert(1, "a");
      await insert(2, "d");
      await insert(3, "c");
      await insert(4, "b");
      await insert(5, "e");
      await insert(6, "e");
      await insert(7, "e");
      await insert(8, "e");
      await insert(9, "e");
      await countBetween(-1, 10, 10);
      await countBetween(undefined, undefined, 10);
      await countBetween(4, 6, 1);
      await countBetween(0.5, 8.5, 8);
      await countBetween(6, 9, 2);
    });
  });

  test("sums", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string, summand: number) {
        const { sum: sumBefore } = await aggregateBetweenHandler(ctx, {});
        await insertHandler(ctx, { key, value, summand });
        await validateTree(ctx, {});
        const { sum: sumAfter } = await aggregateBetweenHandler(ctx, {});
        expect(sumAfter).toEqual(sumBefore + summand);
      }
      async function del(key: number) {
        const { sum: sumBefore } = await aggregateBetweenHandler(ctx, {});
        const itemBefore = await getHandler(ctx, { key });
        expect(itemBefore).not.toBeNull();
        await deleteHandler(ctx, { key });
        await validateTree(ctx, {});
        const { sum: sumAfter } = await aggregateBetweenHandler(ctx, {});
        expect(sumAfter).toEqual(sumBefore - itemBefore!.s);
      }
      await insert(1, "a", 1);
      await insert(4, "b", 2);
      await insert(3, "c", 3);
      await insert(2, "d", 4);
      await insert(5, "e", 5);
      await insert(6, "e", 6);
      await del(3);
      await del(2);
      await del(1);
      await del(5);
      await del(4);
    });
  });

  test("batchAggregateBetween", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string, summand: number) {
        await insertHandler(ctx, { key, value, summand });
        await validateTree(ctx, {});
      }
      
      await insert(0, "a", 1);
      await insert(1, "b", 2);
      await insert(2, "c", 3);
      await insert(3, "d", 4);
      await insert(4, "e", 5);
      await insert(5, "f", 6);
      await insert(6, "g", 7);
      await insert(7, "h", 8);
      await insert(8, "i", 9);
      await insert(9, "j", 10);

      const queries = [
        { k1: undefined, k2: undefined },
        { k1: 2, k2: 7 },
        { k1: 0, k2: 3 },
        { k1: 5, k2: undefined },
        { k1: undefined, k2: 4 },
      ];

      const batchResults = await batchAggregateBetweenHandler(ctx, { queries });
      
      expect(batchResults).toHaveLength(5);
      
      for (let i = 0; i < queries.length; i++) {
        const individualResult = await aggregateBetweenHandler(ctx, queries[i]);
        expect(batchResults[i]).toEqual(individualResult);
      }

      expect(batchResults[0].count).toEqual(10);
      expect(batchResults[1].count).toEqual(4);
      expect(batchResults[2].count).toEqual(2);
      expect(batchResults[3].count).toEqual(4);
      expect(batchResults[4].count).toEqual(4);
    });
  });

  test("batchAtOffset", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
      }
      
      await insert(0, "a");
      await insert(1, "b");
      await insert(2, "c");
      await insert(3, "d");
      await insert(4, "e");
      await insert(5, "f");
      await insert(6, "g");
      await insert(7, "h");

      const queries = [
        { offset: 0 },
        { offset: 3 },
        { offset: 7 },
        { offset: 2, k1: 1, k2: 6 },
        { offset: 0, k1: 3, k2: undefined },
      ];

      const batchResults = await batchAtOffsetHandler(ctx, { queries });
      
      expect(batchResults).toHaveLength(5);
      
      for (let i = 0; i < queries.length; i++) {
        const individualResult = await atOffsetHandler(ctx, queries[i]);
        expect(batchResults[i]).toEqual(individualResult);
      }

      expect(batchResults[0].k).toEqual(0);
      expect(batchResults[1].k).toEqual(3);
      expect(batchResults[2].k).toEqual(7);
      expect(batchResults[3].k).toEqual(4);
      expect(batchResults[4].k).toEqual(4);
    });
  });

  test("batchAtNegativeOffset", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx, {});
      }
      
      await insert(0, "a");
      await insert(1, "b");
      await insert(2, "c");
      await insert(3, "d");
      await insert(4, "e");
      await insert(5, "f");
      await insert(6, "g");
      await insert(7, "h");

      const queries = [
        { offset: 0 },
        { offset: 3 },
        { offset: 7 },
        { offset: 1, k1: 2, k2: 6 },
        { offset: 0, k1: undefined, k2: 5 },
      ];

      const batchResults = await batchAtNegativeOffsetHandler(ctx, { queries });
      
      expect(batchResults).toHaveLength(5);
      
      for (let i = 0; i < queries.length; i++) {
        const individualResult = await atNegativeOffsetHandler(ctx, queries[i]);
        expect(batchResults[i]).toEqual(individualResult);
      }

      expect(batchResults[0].k).toEqual(7);
      expect(batchResults[1].k).toEqual(4);
      expect(batchResults[2].k).toEqual(0);
      expect(batchResults[3].k).toEqual(4);
      expect(batchResults[4].k).toEqual(4);
    });
  });
});

describe("namespaced btree", () => {
  test("counts", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, "a", 4, false);
      await getOrCreateTree(ctx.db, "b", 4, false);
      async function insert(namespace: string, key: number, value: string) {
        await insertHandler(ctx, { key, value, namespace });
        await validateTree(ctx, { namespace });
      }
      async function count(namespace: string, count: number) {
        const c = await aggregateBetweenHandler(ctx, { namespace });
        expect(c).toEqual({
          count,
          sum: 0,
        });
      }
      await insert("a", 1, "a");
      await insert("a", 4, "b");
      await insert("a", 3, "c");
      await insert("a", 2, "d");
      await insert("a", 5, "e");
      await insert("b", 6, "e");
      await insert("b", 7, "e");
      await insert("b", 10, "e");
      await insert("b", 0, "e");
      await count("a", 5);
      await count("b", 4);
    });
  });

  test("batch functions with namespaces", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, "ns1", 4, false);
      await getOrCreateTree(ctx.db, "ns2", 4, false);
      
      async function insert(namespace: string, key: number, value: string, summand: number = 0) {
        await insertHandler(ctx, { key, value, namespace, summand });
        await validateTree(ctx, { namespace });
      }
      
      await insert("ns1", 1, "a", 10);
      await insert("ns1", 2, "b", 20);
      await insert("ns1", 3, "c", 30);
      await insert("ns2", 1, "x", 100);
      await insert("ns2", 2, "y", 200);
      await insert("ns2", 3, "z", 300);

      const batchCountQueries = [
        { namespace: "ns1" },
        { namespace: "ns2" },
        { namespace: "ns1", k1: 1, k2: 3 },
        { namespace: "ns2", k1: 2, k2: undefined },
      ];

      const batchCountResults = await batchAggregateBetweenHandler(ctx, { 
        queries: batchCountQueries 
      });
      
      expect(batchCountResults).toHaveLength(4);
      expect(batchCountResults[0].count).toEqual(3);
      expect(batchCountResults[0].sum).toEqual(60);
      expect(batchCountResults[1].count).toEqual(3);
      expect(batchCountResults[1].sum).toEqual(600);
      expect(batchCountResults[2].count).toEqual(1);
      expect(batchCountResults[3].count).toEqual(1);

      const batchAtQueries = [
        { offset: 0, namespace: "ns1" },
        { offset: 1, namespace: "ns2" },
        { offset: 0, namespace: "ns1", k1: 2, k2: undefined },
      ];

      const batchAtResults = await batchAtOffsetHandler(ctx, { 
        queries: batchAtQueries 
      });
      
      expect(batchAtResults).toHaveLength(3);
      expect(batchAtResults[0].k).toEqual(1);
      expect(batchAtResults[0].v).toEqual("a");
      expect(batchAtResults[1].k).toEqual(2);
      expect(batchAtResults[1].v).toEqual("y");
      expect(batchAtResults[2].k).toEqual(3);
      expect(batchAtResults[2].v).toEqual("c");

      const batchNegativeAtQueries = [
        { offset: 0, namespace: "ns1" },
        { offset: 1, namespace: "ns2" },
      ];

      const batchNegativeAtResults = await batchAtNegativeOffsetHandler(ctx, { 
        queries: batchNegativeAtQueries 
      });
      
      expect(batchNegativeAtResults).toHaveLength(2);
      expect(batchNegativeAtResults[0].k).toEqual(3);
      expect(batchNegativeAtResults[0].v).toEqual("c");
      expect(batchNegativeAtResults[1].k).toEqual(2);
      expect(batchNegativeAtResults[1].v).toEqual("y");
    });
  });
});

class SimpleBTree {
  private items: Item[] = [];
  constructor() {}
  sort() {
    this.items.sort((a, b) => {
      return compareValues(a.k, b.k);
    });
  }
  get(key: Value) {
    for (const item of this.items) {
      if (compareValues(item.k, key) === 0) {
        return item;
      }
    }
    return null;
  }
  insert(item: Item) {
    if (this.get(item.k) !== null) {
      throw new ConvexError("Key already exists");
    }
    this.items.push(item);
    this.sort();
  }
  delete(key: Value) {
    if (this.get(key) === null) {
      throw new ConvexError("Key does not exist");
    }
    this.items = this.items.filter((item) => {
      return compareValues(item.k, key) !== 0;
    });
  }
  offsetOf(key: Value, k1?: Value) {
    const items = this.itemsBetween(k1);
    for (let i = 0; i < items.length; i++) {
      if (compareValues(items[i].k, key) >= 0) {
        return i;
      }
    }
    return items.length;
  }
  offsetUntil(key: Value, k2?: Value) {
    const items = this.itemsBetween(undefined, k2);
    for (let i = 0; i < items.length; i++) {
      if (compareValues(items[items.length - i - 1].k, key) <= 0) {
        return i;
      }
    }
    return items.length;
  }
  itemsBetween(k1?: Value, k2?: Value) {
    const items = [];
    for (const item of this.items) {
      if (
        (k1 === undefined || compareValues(item.k, k1) > 0) &&
        (k2 === undefined || compareValues(item.k, k2) < 0)
      ) {
        items.push(item);
      }
    }
    return items;
  }
  countBetween(k1?: Value, k2?: Value) {
    return this.itemsBetween(k1, k2).length;
  }
  sumBetween(k1?: Value, k2?: Value) {
    return this.itemsBetween(k1, k2).reduce((sum, item) => {
      return sum + item.s;
    }, 0);
  }
  count() {
    return this.items.length;
  }
  sum() {
    return this.items.reduce((sum, item) => {
      return sum + item.s;
    }, 0);
  }
  paginate(
    limit: number,
    order: "asc" | "desc",
    cursor?: string,
    k1?: Value,
    k2?: Value
  ) {
    if (cursor !== undefined && cursor.length === 0) {
      throw new ConvexError("end cursor");
    }
    const startKey =
      cursor === undefined || order === "desc"
        ? k1
        : jsonToConvex(JSON.parse(cursor));
    const endKey =
      cursor === undefined || order === "asc"
        ? k2
        : jsonToConvex(JSON.parse(cursor));
    const items = this.itemsBetween(startKey, endKey);
    if (order === "desc") {
      items.reverse();
    }
    const isDone = items.length <= limit;
    const page = items.slice(0, limit);
    return {
      page,
      cursor: isDone
        ? ""
        : JSON.stringify(convexToJson(page[page.length - 1].k)),
      isDone,
    };
  }
}

function arbitraryUniformFloat(min: number, max: number) {
  // fc.float({min, max}) is not uniform: it skews towards 0 because it picks a
  // random mantissa and exponent.
  return fc
    .integer({ min: min * 1000, max: max * 1000 - 1 })
    .map((i) => i / 1000);
}
// Random between 0 and 1, multiplied by length of an array to get a random
// item in the array.
const arbitrary01 = arbitraryUniformFloat(0, 1);
const l = <L extends string>(l: L) => fc.constant(l);
const arbitraryWrite = fc.oneof(
  fc.record({
    type: l("insert"),
    key: arbitrary01,
    value: arbitrary01,
    summand: arbitraryUniformFloat(-10, 10),
  }),
  fc.record({ type: l("delete"), key: arbitrary01 })
);
const arbitraryRead = fc.oneof(
  fc.record({
    type: l("offsetOf"),
    key: arbitrary01,
    k1: fc.option(arbitrary01),
  }),
  fc.record({
    type: l("atOffset"),
    offset: arbitrary01,
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l("atNegativeOffset"),
    offset: arbitrary01,
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l("offsetUntil"),
    key: arbitrary01,
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l("countBetween"),
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l("sumBetween"),
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  }),
  fc.record({
    type: l("paginate"),
    limit: fc.integer({ min: 1, max: 10 }),
    order: fc.oneof(l("asc"), l("desc")),
    k1: fc.option(arbitrary01),
    k2: fc.option(arbitrary01),
  })
);
type InferArbitrary<T> = T extends fc.Arbitrary<infer U> ? U : never;

describe("btree matches simpler impl", () => {
  async function testBehaviorMatch({
    values,
    writes,
    reads,
    minNodeSize,
    rootLazy,
  }: {
    values: Value[];
    writes: InferArbitrary<typeof arbitraryWrite>[];
    reads: InferArbitrary<typeof arbitraryRead>[];
    minNodeSize: number;
    rootLazy: boolean;
  }) {
    const val = (r: number) => values[Math.floor(r * values.length)];
    const maybeVal = (r: number | null) => (r === null ? undefined : val(r));
    const except = async (f: () => Promise<void>) => {
      try {
        await f();
        return false;
      } catch (e) {
        if (e instanceof ConvexError) {
          return true;
        }
        throw e;
      }
    };
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, minNodeSize * 2, rootLazy);
      const simple = new SimpleBTree();
      // Do a bunch of writes.
      // If there are conflicts on insert and delete, assert they happen on
      // both the simple and complex implementations.
      for (const write of writes) {
        if (write.type === "insert") {
          expect(
            await except(() =>
              insertHandler(ctx, {
                key: val(write.key),
                value: val(write.value),
                summand: write.summand,
              })
            )
          ).toStrictEqual(
            await except(async () =>
              simple.insert({
                k: val(write.key),
                v: val(write.value),
                s: write.summand,
              })
            )
          );
        } else if (write.type === "delete") {
          expect(
            await except(() => deleteHandler(ctx, { key: val(write.key) }))
          ).toStrictEqual(
            await except(async () => simple.delete(val(write.key)))
          );
        }
      }
      await validateTree(ctx, {});
      // Do a bunch of reads.
      for (const read of reads) {
        if (read.type === "atOffset") {
          const itemsBetween = simple.itemsBetween(
            maybeVal(read.k1),
            maybeVal(read.k2)
          );
          if (itemsBetween.length === 0) {
            continue;
          }
          const i = Math.floor(read.offset * itemsBetween.length);
          const at = await atOffsetHandler(ctx, {
            offset: i,
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(at).toEqual(itemsBetween[i]);
        } else if (read.type === "atNegativeOffset") {
          const itemsBetween = simple.itemsBetween(
            maybeVal(read.k1),
            maybeVal(read.k2)
          );
          if (itemsBetween.length === 0) {
            continue;
          }
          const i = Math.floor(read.offset * itemsBetween.length);
          const at = await atNegativeOffsetHandler(ctx, {
            offset: i,
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(at).toEqual(itemsBetween[itemsBetween.length - i - 1]);
        } else if (read.type === "offsetOf") {
          const offset = await offsetHandler(ctx, {
            key: val(read.key),
            k1: maybeVal(read.k1),
          });
          expect(offset).toEqual(
            simple.offsetOf(val(read.key), maybeVal(read.k1))
          );
        } else if (read.type === "offsetUntil") {
          const offset = await offsetUntilHandler(ctx, {
            key: val(read.key),
            k2: maybeVal(read.k2),
          });
          expect(offset).toEqual(
            simple.offsetUntil(val(read.key), maybeVal(read.k2))
          );
        } else if (read.type === "countBetween") {
          const count = await aggregateBetweenHandler(ctx, {
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(count.count).toEqual(
            simple.countBetween(maybeVal(read.k1), maybeVal(read.k2))
          );
        } else if (read.type === "sumBetween") {
          const sum = await aggregateBetweenHandler(ctx, {
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(sum.sum).toBeCloseTo(
            simple.sumBetween(maybeVal(read.k1), maybeVal(read.k2))
          );
        } else if (read.type === "paginate") {
          let isDone = false;
          let cursor: string | undefined = undefined;
          while (!isDone) {
            const realPaginate = await paginateHandler(ctx, {
              limit: read.limit,
              cursor,
              order: read.order,
              k1: maybeVal(read.k1),
              k2: maybeVal(read.k2),
            });
            const simplePaginate = simple.paginate(
              read.limit,
              read.order,
              cursor,
              maybeVal(read.k1),
              maybeVal(read.k2)
            );
            expect(realPaginate.page).toEqual(simplePaginate.page);
            expect(realPaginate.isDone).toStrictEqual(simplePaginate.isDone);
            expect(realPaginate.cursor).toStrictEqual(simplePaginate.cursor);
            isDone = simplePaginate.isDone;
            cursor = simplePaginate.cursor;
          }
        }
      }
    });
  }

  // Trophies
  test("countBetween same keys", async () => {
    await testBehaviorMatch({
      values: [false, null, {}, "", 0],
      writes: [
        { type: "insert", key: 0.21, value: 0, summand: 0 },
        { type: "insert", key: 0.41, value: 0, summand: 0 },
        { type: "insert", key: 0.61, value: 0, summand: 0 },
        { type: "insert", key: 0, value: 0, summand: 0 },
        { type: "insert", key: 0.81, value: 0, summand: 0 },
      ],
      reads: [{ type: "countBetween", k1: 0, k2: 0 }],
      minNodeSize: 2,
      rootLazy: false,
    });
  });

  test("countBetween 2", async () => {
    await testBehaviorMatch({
      values: [4, 2, 0, 1, 3],
      writes: [
        { type: "insert", key: 0, value: 0, summand: 0 },
        { type: "insert", key: 0.2, value: 0, summand: 0 },
        { type: "insert", key: 0.4, value: 0, summand: 0 },
        { type: "insert", key: 0.6, value: 0, summand: 0 },
        { type: "insert", key: 0.8, value: 0, summand: 0 },
      ],
      reads: [{ type: "countBetween", k1: 0.4, k2: 0.2 }],
      minNodeSize: 2,
      rootLazy: false,
    });
  });

  test("offsetOf first subtree", async () => {
    await testBehaviorMatch({
      values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      writes: [
        { type: "insert", key: 0, value: 0, summand: 0 },
        { type: "insert", key: 0.1, value: 0, summand: 0 },
        { type: "insert", key: 0.2, value: 0, summand: 0 },
        { type: "insert", key: 0.3, value: 0, summand: 0 },
        { type: "insert", key: 0.4, value: 0, summand: 0 },
        { type: "insert", key: 0.5, value: 0, summand: 0 },
        { type: "insert", key: 0.6, value: 0, summand: 0 },
        { type: "insert", key: 0.7, value: 0, summand: 0 },
      ],
      reads: [{ type: "offsetOf", key: 0.1, k1: null }],
      minNodeSize: 2,
      rootLazy: false,
    });
  });

  fcTest.prop({
    values: fc.array(arbitraryValue, { minLength: 100, maxLength: 100 }),
    writes: fc.array(arbitraryWrite, { maxLength: 100 }),
    reads: fc.array(arbitraryRead, { maxLength: 20 }),
    minNodeSize: fc.integer({ min: 2, max: 9 }),
    rootLazy: fc.boolean(),
  })(
    "btree operations with arbitrary values match simple btree",
    testBehaviorMatch
  );

  fcTest.prop(
    {
      writes: fc.array(arbitraryWrite, { maxLength: 100 }),
      reads: fc.array(arbitraryRead, { maxLength: 20 }),
    },
    { numRuns: 100 }
  )(
    "btree operations on natural numbers match simple btree",
    async ({ writes, reads }) => {
      await testBehaviorMatch({
        values: Array.from({ length: 100 }, (_, i) => i),
        writes,
        reads,
        minNodeSize: 2,
        rootLazy: true,
      });
    }
  );
});

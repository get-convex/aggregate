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
  sumHandler,
  validateTree,
  getOrCreateTree,
  Value,
  countHandler,
} from "./btree.js";
import { compareValues } from "./compare.js";
import { arbitraryNiceFloat, arbitraryValue } from "./arbitrary.helpers.js";
import { ConvexError } from "convex/values";

describe("btree", () => {
  test("insert", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, 4, false);
      // Insert lots of keys. At each stage, the tree is valid.
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx);
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
      await getOrCreateTree(ctx.db, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx);
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
        await validateTree(ctx);
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
      await getOrCreateTree(ctx.db, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx);
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
      await getOrCreateTree(ctx.db, 4, false);
      async function insert(key: number, value: string) {
        await insertHandler(ctx, { key, value });
        await validateTree(ctx);
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
      await getOrCreateTree(ctx.db, 4, false);
      async function insert(key: number, value: string, summand: number) {
        const sumBefore = await sumHandler(ctx);
        await insertHandler(ctx, { key, value, summand });
        await validateTree(ctx);
        const sumAfter = await sumHandler(ctx);
        expect(sumAfter).toEqual(sumBefore + summand);
      }
      async function del(key: number) {
        const sumBefore = await sumHandler(ctx);
        const itemBefore = await getHandler(ctx, { key });
        expect(itemBefore).not.toBeNull();
        await deleteHandler(ctx, { key });
        await validateTree(ctx);
        const sumAfter = await sumHandler(ctx);
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
  atOffset(offset: number) {
    return this.items[offset];
  }
  offsetOf(key: Value) {
    for (let i = 0; i < this.items.length; i++) {
      if (compareValues(this.items[i].k, key) >= 0) {
        return i;
      }
    }
    return this.items.length;
  }
  itemsBetween(k1: Value, k2: Value) {
    const start = this.offsetOf(k1);
    const end = this.offsetOf(k2);
    return this.items.slice(start, end);
  }
  countBetween(k1: Value, k2: Value) {
    return this.itemsBetween(k1, k2).length;
  }
  sumBetween(k1: Value, k2: Value) {
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
}

// Random between 0 and 1, multiplied by length of an array to get a random
// item in the array.
const arbitrary01 = fc.float({ min: 0, max: 1, noNaN: true, maxExcluded: true });
const l = <L extends string>(l: L) => fc.constant(l);
const arbitraryWrite = fc.oneof(
  fc.record({ type: l("insert"), key: arbitrary01, value: arbitrary01, summand: arbitraryNiceFloat }),
  fc.record({ type: l("delete"), key: arbitrary01 }),
);
const arbitraryRead = fc.oneof(
  fc.record({ type: l("atOffset"), offset: arbitrary01 }),
  fc.record({ type: l("offsetOf"), key: arbitrary01 }),
  fc.record({ type: l("count") }),
  fc.record({ type: l("sum") }),
  fc.record({ type: l("countBetween"), k1: arbitrary01, k2: arbitrary01 }),
  fc.record({ type: l("sumBetween"), k1: arbitrary01, k2: arbitrary01 }),
);

describe("btree matches simpler impl", () => {
  fcTest.prop({
    values: fc.array(arbitraryValue, { minLength: 80, maxLength: 100 }),
    writes: fc.array(arbitraryWrite, { maxLength: 100 }),
    reads: fc.array(arbitraryRead, { maxLength: 20 }),
    minNodeSize: fc.integer({ min: 2, max: 9 }),
    rootLazy: fc.boolean(),
  })(
    "arbitrary btree operations match simple btree",
    async ({
      values,
      writes,
      reads,
      minNodeSize,
      rootLazy,
    }) => {
      const val = (r: number) => values[Math.floor(r * values.length)];
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
        await getOrCreateTree(ctx.db, minNodeSize * 2, rootLazy);
        const simple = new SimpleBTree();
        // Do a bunch of writes.
        // If there are conflicts on insert and delete, assert they happen on
        // both the simple and complex implementations.
        for (const write of writes) {
          if (write.type === "insert") {
            expect(await except(() =>
              insertHandler(ctx, {
                key: val(write.key),
                value: val(write.value),
                summand: write.summand,
              })
            )).toStrictEqual(await except(async () =>
              simple.insert({
                k: val(write.key),
                v: val(write.value),
                s: write.summand,
              })
            ));
          } else if (write.type === "delete") {
            expect(await except(() => 
              deleteHandler(ctx, { key: val(write.key) })
            )).toStrictEqual(await except(async () => 
              simple.delete(val(write.key))
            ));
          }
        }
        await validateTree(ctx);
        // Do a bunch of reads.
        for (const read of reads) {
          if (read.type === "atOffset") {
            if (simple.count() === 0) {
              continue;
            }
            const i = Math.floor(read.offset * simple.count());
            const at = await atOffsetHandler(ctx, { offset: i });
            expect(at).toEqual(simple.atOffset(i));
          } else if (read.type === "offsetOf") {
            const offset = await offsetHandler(ctx, { key: read.key });
            expect(offset).toEqual(simple.offsetOf(read.key));
          } else if (read.type === "count") {
            const count = await countHandler(ctx);
            expect(count).toEqual(simple.count());
          } else if (read.type === "sum") {
            const sum = await sumHandler(ctx);
            expect(sum).toBeCloseTo(simple.sum());
          } else if (read.type === "countBetween") {
            const count = await aggregateBetweenHandler(ctx, { k1: read.k1, k2: read.k2 });
            expect(count.count).toEqual(simple.countBetween(read.k1, read.k2));
          } else if (read.type === "sumBetween") {
            const sum = await aggregateBetweenHandler(ctx, { k1: read.k1, k2: read.k2 });
            expect(sum.sum).toEqual(simple.sumBetween(read.k1, read.k2));
          }
        }
      });
    },
  );
});

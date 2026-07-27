import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema, { type Item, type Operation } from "./schema.js";
import type { DatabaseWriter } from "./_generated/server.js";
import type { TransactionMetrics } from "convex/server";
import { modules } from "./setup.test.js";
import { test as fcTest, fc } from "@fast-check/vitest";
import {
  atOffsetHandler,
  budgetForCommit,
  hasBudgetForCommit,
  aggregateBetweenHandler,
  assertNoPendingCommits,
  deleteHandler,
  getHandler,
  insertHandler,
  offsetHandler,
  validateTree,
  getOrCreateTree,
  type Value,
  offsetUntilHandler,
  atNegativeOffsetHandler,
  paginateHandler,
  aggregateBetweenBatchHandler,
  atOffsetBatchHandler,
  type SharedLimit,
} from "./btree.js";
import { api, internal } from "./_generated/api.js";
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
        count: number,
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

  fcTest.prop({
    writes: fc.array(arbitraryWrite, { minLength: 0, maxLength: 20 }),
    aggregateQueries: fc.array(
      fc.record({
        k1: fc.option(arbitraryValue, { nil: undefined }),
        k2: fc.option(arbitraryValue, { nil: undefined }),
        namespace: fc.option(fc.string(), { nil: undefined }),
      }),
      { minLength: 1, maxLength: 5 },
    ),
  })(
    "batch functions match individual calls",
    async ({ writes, aggregateQueries }) => {
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
        await getOrCreateTree(ctx.db, undefined, 4, false);
        const simple = new SimpleBTree();

        for (const write of writes) {
          if (write.type === "insert") {
            expect(await except(() => insertHandler(ctx, write))).toStrictEqual(
              await except(async () =>
                simple.insert({
                  k: write.key,
                  v: write.value,
                  s: write.summand,
                }),
              ),
            );
          } else if (write.type === "delete") {
            expect(await except(() => deleteHandler(ctx, write))).toStrictEqual(
              await except(async () => simple.delete(write.key)),
            );
          }
        }

        if (aggregateQueries.length > 0) {
          const batchResults = await aggregateBetweenBatchHandler(ctx, {
            queries: aggregateQueries,
          });
          expect(batchResults).toHaveLength(aggregateQueries.length);

          for (let i = 0; i < aggregateQueries.length; i++) {
            const individualResult = await aggregateBetweenHandler(
              ctx,
              aggregateQueries[i],
            );
            expect(batchResults[i]).toEqual(individualResult);
          }
        }

        const totalCount = simple.count();
        if (totalCount > 0) {
          const offsetQueries = [
            { offset: 0, k1: undefined, k2: undefined, namespace: undefined },
            {
              offset: Math.floor(totalCount / 2),
              k1: undefined,
              k2: undefined,
              namespace: undefined,
            },
          ].filter((q) => q.offset < totalCount);

          if (offsetQueries.length > 0) {
            const batchResults = await atOffsetBatchHandler(ctx, {
              queries: offsetQueries,
            });
            expect(batchResults).toHaveLength(offsetQueries.length);

            for (let i = 0; i < offsetQueries.length; i++) {
              const individualResult = await atOffsetHandler(
                ctx,
                offsetQueries[i],
              );
              expect(batchResults[i]).toEqual(individualResult);
            }
          }

          const negativeOffsetQueries = [
            { offset: -1, k1: undefined, k2: undefined, namespace: undefined },
          ];

          let batchError = false;

          let batchResults: any = null;
          try {
            batchResults = await atOffsetBatchHandler(ctx, {
              queries: negativeOffsetQueries,
            });
          } catch (e) {
            if (e instanceof ConvexError) {
              batchError = true;
            } else {
              throw e;
            }
          }

          let individualError = false;
          let individualResults: any = null;
          try {
            individualResults = await Promise.all(
              negativeOffsetQueries.map((query) =>
                query.offset >= 0
                  ? atOffsetHandler(ctx, query)
                  : atNegativeOffsetHandler(ctx, {
                      ...query,
                      offset: -query.offset - 1,
                    }),
              ),
            );
          } catch (e) {
            if (e instanceof ConvexError) {
              individualError = true;
            } else {
              throw e;
            }
          }

          expect(batchError).toStrictEqual(individualError);
          if (!batchError && !individualError) {
            expect(batchResults).toEqual(individualResults);
          }
        }
      });
    },
  );
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
    k2?: Value,
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
  fc.record({ type: l("delete"), key: arbitrary01 }),
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
  }),
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
              }),
            ),
          ).toStrictEqual(
            await except(async () =>
              simple.insert({
                k: val(write.key),
                v: val(write.value),
                s: write.summand,
              }),
            ),
          );
        } else if (write.type === "delete") {
          expect(
            await except(() => deleteHandler(ctx, { key: val(write.key) })),
          ).toStrictEqual(
            await except(async () => simple.delete(val(write.key))),
          );
        }
      }
      await validateTree(ctx, {});
      // Do a bunch of reads.
      for (const read of reads) {
        if (read.type === "atOffset") {
          const itemsBetween = simple.itemsBetween(
            maybeVal(read.k1),
            maybeVal(read.k2),
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
            maybeVal(read.k2),
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
            simple.offsetOf(val(read.key), maybeVal(read.k1)),
          );
        } else if (read.type === "offsetUntil") {
          const offset = await offsetUntilHandler(ctx, {
            key: val(read.key),
            k2: maybeVal(read.k2),
          });
          expect(offset).toEqual(
            simple.offsetUntil(val(read.key), maybeVal(read.k2)),
          );
        } else if (read.type === "countBetween") {
          const count = await aggregateBetweenHandler(ctx, {
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(count.count).toEqual(
            simple.countBetween(maybeVal(read.k1), maybeVal(read.k2)),
          );
        } else if (read.type === "sumBetween") {
          const sum = await aggregateBetweenHandler(ctx, {
            k1: maybeVal(read.k1),
            k2: maybeVal(read.k2),
          });
          expect(sum.sum).toBeCloseTo(
            simple.sumBetween(maybeVal(read.k1), maybeVal(read.k2)),
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
              maybeVal(read.k2),
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
    testBehaviorMatch,
  );

  fcTest.prop(
    {
      writes: fc.array(arbitraryWrite, { maxLength: 100 }),
      reads: fc.array(arbitraryRead, { maxLength: 20 }),
    },
    { numRuns: 100 },
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
    },
  );
});

describe("stale / pendingCommits", () => {
  function setupTest(): TestConvex<typeof schema> {
    return convexTest(schema, modules);
  }

  // Seed a pendingCommits row directly with an explicit commitTs — the bigint
  // the backend would resolve `db.vars.commitTs` to. All the ops in one call
  // share a commit, in array order, mirroring one enqueuing transaction.
  // (The real `enqueue` path can't be unit-tested: convex-test doesn't provide
  // `db.vars.commitTs`.)
  async function seedCommit(
    ctx: { db: DatabaseWriter },
    commitTs: bigint,
    operations: Operation[],
  ) {
    await ctx.db.insert("pendingCommits", { commitTs, operations });
  }

  // A fresh transaction's metrics — every limit wide open — with specific limits
  // overridden to whatever the case under test needs.
  function metricsWith(
    overrides: Partial<TransactionMetrics>,
  ): TransactionMetrics {
    const wideOpen = (limit: number) => ({ used: 0, remaining: limit });
    return {
      bytesRead: wideOpen(16 * 1024 * 1024),
      bytesWritten: wideOpen(16 * 1024 * 1024),
      databaseQueries: wideOpen(4_096),
      documentsRead: wideOpen(32_000),
      documentsWritten: wideOpen(16_000),
      functionsScheduled: wideOpen(1_000),
      scheduledFunctionArgsBytes: wideOpen(16 * 1024 * 1024),
      ...overrides,
    };
  }

  // Caps as `budgetForCommit` would return them, wide open unless overridden.
  function limitsWith(overrides: Partial<Record<SharedLimit, number>>) {
    return {
      bytesRead: 16 * 1024 * 1024,
      bytesWritten: 16 * 1024 * 1024,
      databaseQueries: 4_096,
      documentsRead: 32_000,
      documentsWritten: 16_000,
      ...overrides,
    };
  }

  // Drive the worker's query/mutation pair to completion the way the batch
  // worker would, without needing `db.vars.commitTs`. Returns the cycle count.
  async function drain(t: TestConvex<typeof schema>): Promise<number> {
    let cycles = 0;
    for (;;) {
      const result = await t.query(internal.btree.getBatch, { name: "ops" });
      if (result.kind !== "work") break;
      await t.mutation(internal.btree.processBatch, {
        commits: result.batch.commits,
      });
      cycles++;
      if (cycles > 1000) throw new Error("drain did not converge");
    }
    return cycles;
  }

  test("drain applies queued ops (in enqueue order) and empties the queue", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      // One transaction's worth of ops share a commitTs and a row; array order
      // is enqueue order, so the delete of key 1 lands after its insert.
      await seedCommit(ctx, 1n, [
        { type: "insert", key: 1, value: "a" },
        { type: "insert", key: 2, value: "b" },
        { type: "delete", key: 1 },
      ]);
    });
    await drain(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingCommits").first()).toBeNull();
      expect(await getHandler(ctx, { key: 1 })).toBeNull();
      expect(await getHandler(ctx, { key: 2 })).toEqual({ k: 2, v: "b", s: 0 });
      // The cursor advanced to the drained commitTs.
      const state = await ctx.db.query("workerState").unique();
      expect(state?.latestCommitTs).toEqual(1n);
    });
  });

  test("drain of ops across several commitTs values applies them all", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      await seedCommit(ctx, 1n, [{ type: "insert", key: 1, value: "a" }]);
      await seedCommit(ctx, 2n, [
        { type: "insert", key: 2, value: "b" },
        { type: "insert", key: 3, value: "c" },
      ]);
    });
    await drain(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingCommits").first()).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(3);
    });
  });

  test("a single transaction's many ops all drain (flattened in order)", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      // One transaction = one row holding all its ops. The whole row is applied
      // in a cycle, its operations replayed in array order.
      const operations: Operation[] = Array.from({ length: 120 }, (_, i) => ({
        type: "insert" as const,
        key: i,
        value: `v${i}`,
      }));
      await seedCommit(ctx, 1n, operations);
    });
    await drain(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingCommits").first()).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(120);
    });
  });

  test("assertNoPendingCommits throws iff pendingCommits is non-empty", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await assertNoPendingCommits(ctx);
      await ctx.db.insert("pendingCommits", {
        commitTs: 1n,
        operations: [{ type: "delete", key: 1 }],
      });
      await expect(assertNoPendingCommits(ctx)).rejects.toThrow(/PENDING_COMMITS/);
    });
  });

  test("processBatch dead-letters a missing-key plain delete", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      await seedCommit(ctx, 1n, [{ type: "delete", key: 99 }]);
    });
    await drain(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingCommits").first()).toBeNull();
      const dead = await ctx.db.query("deadLetterCommits").collect();
      expect(dead).toHaveLength(1);
      expect(dead[0].commitTs).toEqual(1n);
      expect(dead[0].operations).toEqual([{ type: "delete", key: 99 }]);
      expect(dead[0].error).toMatch(/DELETE_MISSING_KEY/);
    });
  });

  test("a failing op rolls back its whole commit, and later commits still apply", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      // One transaction: two good inserts followed by a delete of a key that
      // was never there. The commit fails as a unit, so neither insert survives.
      await seedCommit(ctx, 1n, [
        { type: "insert", key: 1, value: "a" },
        { type: "insert", key: 2, value: "b" },
        { type: "delete", key: 99 },
      ]);
      // A later, independent transaction is unaffected by the bad one.
      await seedCommit(ctx, 2n, [{ type: "insert", key: 3, value: "c" }]);
    });
    await drain(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingCommits").first()).toBeNull();
      expect(await getHandler(ctx, { key: 1 })).toBeNull();
      expect(await getHandler(ctx, { key: 2 })).toBeNull();
      expect(await getHandler(ctx, { key: 3 })).toEqual({ k: 3, v: "c", s: 0 });
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(1);
      const dead = await ctx.db.query("deadLetterCommits").collect();
      expect(dead).toHaveLength(1);
      expect(dead[0].operations).toHaveLength(3);
      // The cursor still advanced past both commits.
      const state = await ctx.db.query("workerState").unique();
      expect(state?.latestCommitTs).toEqual(2n);
      await validateTree(ctx, {});
    });
  });

  test("a commit that fails mid-batch is retried before being dead-lettered", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      await seedCommit(ctx, 1n, [{ type: "insert", key: 1, value: "a" }]);
      // Fails, but not first in the batch — it could be failing only because
      // commit 1n already used part of this transaction, so it stays queued.
      await seedCommit(ctx, 2n, [{ type: "delete", key: 99 }]);
      await seedCommit(ctx, 3n, [{ type: "insert", key: 3, value: "c" }]);
    });

    // First cycle: 1n applies, 2n fails and ends the cycle, so 3n is untouched.
    const first = await t.query(internal.btree.getBatch, { name: "ops" });
    expect(first.kind).toEqual("work");
    if (first.kind !== "work") return;
    expect(first.batch.commits).toHaveLength(3);
    await t.mutation(internal.btree.processBatch, {
      commits: first.batch.commits,
    });
    await t.run(async (ctx) => {
      expect(
        (await ctx.db.query("pendingCommits").collect()).map((c) => c.commitTs),
      ).toEqual([2n, 3n]);
      expect(await ctx.db.query("deadLetterCommits").first()).toBeNull();
      expect((await ctx.db.query("workerState").unique())?.latestCommitTs).toEqual(
        1n,
      );
    });

    // 2n comes back first in the next batch, fails again on a fresh
    // transaction, and is dead-lettered — and 3n still gets applied.
    await drain(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingCommits").first()).toBeNull();
      const dead = await ctx.db.query("deadLetterCommits").collect();
      expect(dead).toHaveLength(1);
      expect(dead[0].commitTs).toEqual(2n);
      expect(await getHandler(ctx, { key: 1 })).toEqual({ k: 1, v: "a", s: 0 });
      expect(await getHandler(ctx, { key: 3 })).toEqual({ k: 3, v: "c", s: 0 });
      await validateTree(ctx, {});
    });
  });

  test("read query guards on pendingCommits unless stale", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      await insertHandler(ctx, { key: 1, value: "a" });
      await insertHandler(ctx, { key: 2, value: "b" });
      await ctx.db.insert("pendingCommits", {
        commitTs: 1n,
        operations: [{ type: "insert", key: 3, value: "c" }],
      });
    });
    // Non-stale read throws while the queue is non-empty.
    await expect(t.query(api.btree.aggregateBetween, {})).rejects.toThrow(
      /PENDING_COMMITS/,
    );
    // Stale read skips the guard and returns the current tree state.
    const { count } = await t.query(api.btree.aggregateBetween, {
      stale: true,
    });
    expect(count).toEqual(2);
  });

  test("processBatch stops a cycle short once transaction headroom runs low", async () => {
    // Enforce a write budget far smaller than the whole batch needs. getBatch
    // hands processBatch all 100 commits (their payload is only a few KB, well
    // under the byte budget); processBatch has to notice it's running out of room
    // and leave the rest for the next cycle rather than blow the limit — which
    // would abort the cycle, be retried forever, and wedge the queue.
    //
    // One insert per commit into a default-width tree, so a commit writes about
    // four documents — fewer than reserveOutsideCommit keeps back. convex-test
    // ignores the per-commit `transactionLimits`, so a commit here can overrun
    // the cap it was given; keeping commits smaller than the reserve is what
    // stops that from eating the headroom the cycle needs to finish up.
    const t = convexTest({
      schema,
      modules,
      // convex-test types this field as `Partial<TransactionMetrics>`, but the
      // values it actually reads are plain limit numbers.
      transactionLimits: { documentsWritten: 150 } as never,
    });
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 16, false);
      for (let txn = 0; txn < 100; txn++) {
        await seedCommit(ctx, BigInt(txn + 1), [
          { type: "insert", key: txn, value: `v${txn}` },
        ]);
      }
    });

    // A full batch comes back — it's processBatch that has to ration it.
    const result = await t.query(internal.btree.getBatch, { name: "ops" });
    expect(result.kind).toEqual("work");
    if (result.kind !== "work") return;
    expect(result.batch.commits).toHaveLength(64);

    // Everything still drains, just across many cycles, and nothing fails.
    const cycles = await drain(t);
    expect(cycles).toBeGreaterThan(1);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingCommits").first()).toBeNull();
      expect(await ctx.db.query("deadLetterCommits").first()).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(100);
      await validateTree(ctx, {});
    });
  });

  test("getBatch caps commits per cycle, not just bytes", async () => {
    // 100 tiny commits: their combined payload is nowhere near the byte budget,
    // so without a count cap getBatch would read every row in the queue.
    const t = setupTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      for (let txn = 0; txn < 100; txn++) {
        await seedCommit(ctx, BigInt(txn + 1), [
          { type: "insert", key: txn, value: `v${txn}` },
        ]);
      }
    });

    const result = await t.query(internal.btree.getBatch, { name: "ops" });
    expect(result.kind).toEqual("work");
    if (result.kind !== "work") return;
    expect(result.batch.commits).toHaveLength(64);

    // Still drains everything, just across more cycles.
    const cycles = await drain(t);
    expect(cycles).toBeGreaterThan(1);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingCommits").first()).toBeNull();
      expect(await ctx.db.query("deadLetterCommits").first()).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(100);
    });
  });

  test("budgetForCommit caps a commit below the reserve it keeps back", () => {
    const limits = budgetForCommit(
      metricsWith({
        bytesRead: { used: 1_000, remaining: 4_000_000 },
        bytesWritten: { used: 2_000, remaining: 4_000_000 },
        databaseQueries: { used: 10, remaining: 4_000 },
        documentsRead: { used: 20, remaining: 30_000 },
        documentsWritten: { used: 30, remaining: 15_000 },
      }),
      100_000,
    );
    // Every cap is strictly below what's left of the outer transaction, by
    // enough to write the dead-letter row and clean up after a failure.
    const slack = 64 * 1024;
    expect(limits.bytesWritten).toEqual(4_000_000 - 2 * 100_000 - slack);
    expect(limits.bytesRead).toEqual(4_000_000 - 100_000 - slack);
    expect(limits.documentsWritten).toEqual(15_000 - 8);
    expect(limits.documentsRead).toEqual(30_000 - 8);
    expect(limits.databaseQueries).toEqual(4_000 - 8);
  });

  test("hasBudgetForCommit once the reserve is all that's left", () => {
    // Every cap positive: there's something to give the commit.
    expect(hasBudgetForCommit(limitsWith({}))).toBe(true);
    // The reserve is all that's left of the write budget, so the cap comes out
    // negative. A commit run under it would fail no matter what it did.
    const write = budgetForCommit(
      metricsWith({ bytesWritten: { used: 15_000_000, remaining: 1_000 } }),
      1_000_000,
    );
    expect(write.bytesWritten).toBeLessThan(0);
    expect(hasBudgetForCommit(write)).toBe(false);
    // One exhausted limit is enough to stop, even with the rest wide open.
    const docs = budgetForCommit(
      metricsWith({ documentsWritten: { used: 15_994, remaining: 6 } }),
      0,
    );
    expect(docs.documentsWritten).toBeLessThan(0);
    expect(hasBudgetForCommit(docs)).toBe(false);
    // A cap of exactly zero is nothing to spend, so it's rejected too.
    expect(hasBudgetForCommit(limitsWith({ documentsWritten: 0 }))).toBe(false);
  });

  test("a first commit always has budget", () => {
    // The most the parent can have spent before the first commit of a batch:
    // getBatch read a full BATCH_MAX_BYTES of commits and 64 rows, and the
    // commit itself is as large as one can be. Even then every cap is positive,
    // so a batch always makes progress and can't be retried forever.
    const limits = budgetForCommit(
      metricsWith({
        bytesRead: { used: 4 * 1024 * 1024, remaining: 12 * 1024 * 1024 },
        documentsRead: { used: 70, remaining: 31_930 },
        databaseQueries: { used: 16, remaining: 4_080 },
      }),
      1024 * 1024,
    );
    expect(hasBudgetForCommit(limits)).toBe(true);
  });

  // Whether a commit too large to apply is dead-lettered while the cycle
  // survives can't be unit-tested: convex-test enforces only the top-level
  // transaction's limits and ignores the per-`runMutation` `transactionLimits`
  // option, so exceeding a sub-transaction's cap there also poisons the outer
  // transaction. Verify it against a backend that enforces nested limits.
  test.skip("processBatch dead-letters a commit that exceeds its sub-transaction limits", () => {});

  // The enqueue path (public.enqueue -> enqueueOperation -> db.vars.commitTs)
  // can't run under convex-test, which doesn't resolve late-bound commit
  // timestamps. Verify it against a backend that supports db.vars.commitTs.
  test.skip("enqueue writes a pendingCommits row keyed by the commit timestamp", () => {});

  // Same reason: the MAX_OPERATIONS_PER_COMMIT guard only fires on the second
  // and later enqueues within one transaction, which is exactly the path that
  // needs db.vars.commitTs to find the commit it's appending to.
  test.skip("enqueue rejects the 501st operation in one transaction", () => {});
});

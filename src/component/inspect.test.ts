import { assert, describe, expect, test } from "vitest";
import type { TestConvex } from "convex-test";
import schema, { type Operation } from "./schema.js";
import { initConvexTest } from "./setup.test.js";
import { getOrCreateTree } from "./btree.js";
import { api, internal } from "./_generated/api.js";
import { enqueueOperations, OPS_WORKER_NAME } from "./worker.js";

// Enqueue and return the commitTs of the new row.
async function enqueue(
  t: TestConvex<typeof schema>,
  ...operations: Operation[]
): Promise<bigint> {
  const commitTs = await t.run(async (ctx) => {
    await enqueueOperations(ctx, operations);
    return ctx.db.vars.commitTs;
  });
  assert(typeof commitTs === "bigint");
  return commitTs;
}

describe("queueStats", () => {
  test("reports an empty queue", async () => {
    const t = initConvexTest();
    expect(
      await t.query(api.inspect.queueStats, { includeWorker: false }),
    ).toMatchObject({
      rows: 0,
      operations: 0,
      truncated: false,
      oldestCommitTs: null,
      newestObservedCommitTs: null,
    });
  });

  test("counts rows and operations, and tracks the commitTs range", async () => {
    const t = initConvexTest();
    const first = await enqueue(t, { type: "insert", key: 1, value: "a" });
    await enqueue(
      t,
      { type: "insert", key: 2, value: "b" },
      { type: "insert", key: 3, value: "c" },
    );
    const last = await enqueue(t, { type: "delete", key: 1 });
    const stats = await t.query(api.inspect.queueStats, {
      includeWorker: false,
    });
    expect(stats).toMatchObject({
      rows: 3,
      operations: 4,
      truncated: false,
      oldestCommitTs: first,
      newestObservedCommitTs: last,
    });
    expect(stats.bytes).toBeGreaterThan(0);
  });

  test("counts down as the worker drains a commit part way", async () => {
    // The queue shrinks operation by operation, not just row by row: a commit
    // the cycle can't finish keeps its row, holding only what's left to apply.
    const t = initConvexTest({
      // A cycle stops once fewer than RESERVE_HEADROOM (100) writes are left,
      // and an insert into this tree costs about four, so this budget drains
      // roughly two dozen of the 60 operations below.
      transactionLimits: { documentsWritten: 200 },
    });
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    await enqueue(
      t,
      ...Array.from({ length: 60 }, (_, i) => ({
        type: "insert" as const,
        key: i,
        value: `v${i}`,
      })),
    );
    const before = await t.query(api.inspect.queueStats, {
      includeWorker: false,
    });
    expect(before).toMatchObject({ rows: 1, operations: 60 });

    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    assert(batch.kind === "work");
    await t.mutation(internal.worker.processBatch, { ...batch.batch });
    const after = await t.query(api.inspect.queueStats, {
      includeWorker: false,
    });
    expect(after.rows).toEqual(1);
    expect(60 - after.operations).toBeGreaterThanOrEqual(20);
    expect(60 - after.operations).toBeLessThanOrEqual(30);
  });

  test("reports the worker's status, and omits it on request", async () => {
    const t = initConvexTest();
    // `includeWorker` defaults to true; before anything enqueues there is no
    // worker to report on.
    expect(await t.query(api.inspect.queueStats, {})).toMatchObject({
      rows: 0,
      worker: null,
    });
    await enqueue(t, { type: "insert", key: 1, value: "a" });
    expect(await t.query(api.inspect.queueStats, {})).toMatchObject({
      rows: 1,
      worker: "running",
    });
    expect(
      await t.query(api.inspect.queueStats, { includeWorker: false }),
    ).toMatchObject({ rows: 1, worker: null });
  });

  test("bounds the scan and reports truncation", async () => {
    const t = initConvexTest();
    for (let i = 1; i <= 5; i++) {
      await enqueue(t, { type: "insert", key: i, value: `v${i}` });
    }
    expect(
      await t.query(api.inspect.queueStats, { limit: 2, includeWorker: false }),
    ).toMatchObject({ rows: 2, operations: 2, truncated: true });
    // A limit that exactly covers the queue is not truncation.
    expect(
      await t.query(api.inspect.queueStats, { limit: 5, includeWorker: false }),
    ).toMatchObject({ rows: 5, operations: 5, truncated: false });
  });

  test("clamps limit to a whole number in range", async () => {
    const t = initConvexTest();
    for (let i = 1; i <= 5; i++) {
      await enqueue(t, { type: "insert", key: i, value: `v${i}` });
    }
    const rowsFor = async (limit: number) =>
      (await t.query(api.inspect.queueStats, { limit, includeWorker: false }))
        .rows;
    expect(await rowsFor(0)).toEqual(1);
    expect(await rowsFor(-5)).toEqual(1);
    expect(await rowsFor(2.7)).toEqual(2);
    // `v.number()` admits these; they must not defeat the cap.
    expect(await rowsFor(NaN)).toEqual(5);
    expect(await rowsFor(Infinity)).toEqual(5);
  });

  test("stops early when the rows read exceed the byte budget", async () => {
    const t = initConvexTest();
    // MAX_BYTES_PER_ENTRY caps a row at 100 KiB, so ~50 of the fattest rows the
    // queue can hold overrun the query's 4 MiB read budget.
    const value = "x".repeat(100_000);
    for (let i = 1; i <= 50; i++) {
      await enqueue(t, { type: "insert", key: i, value });
    }
    const stats = await t.query(api.inspect.queueStats, {
      includeWorker: false,
    });
    expect(stats.truncated).toBe(true);
    // Neither the queue nor the 128-row default cap ended the scan, and the
    // bytes counted crossed the budget: the byte check is what stopped it.
    expect(stats.rows).toBeLessThan(50);
    expect(stats.bytes).toBeGreaterThanOrEqual(4 * 1024 * 1024);
  });
});

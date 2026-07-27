import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TestConvex } from "convex-test";
import type { TransactionMetrics } from "convex/server";
import { type CommitTsPlaceholder, getConvexSize } from "convex/values";
import schema, { type Operation } from "./schema.js";
import { initConvexTest } from "./setup.test.js";
import {
  aggregateBetweenHandler,
  getHandler,
  getOrCreateTree,
  insertHandler,
  validateTree,
} from "./btree.js";
import {
  BATCH_MAX_OPERATIONS,
  enqueueOperation,
  hasHeadroomToFinish,
  MAX_OPERATIONS_PER_ENTRY,
  OPS_WORKER_NAME,
  RESERVE_BYTES,
} from "./worker.js";
import { api, components, internal } from "./_generated/api.js";

// Use fake timers to drive the batch worker loop.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function expectBigint(value: bigint | CommitTsPlaceholder): bigint {
  assert(
    typeof value === "bigint",
    `expected a resolved commitTs, got ${String(value)}`,
  );
  return value;
}

// Enqueue and return the entry timestamp of the new row.
async function enqueue(
  t: TestConvex<typeof schema>,
  ...operations: Operation[]
): Promise<bigint> {
  const commitTs = await t.run(async (ctx) => {
    for (const operation of operations) {
      await enqueueOperation(ctx, operation);
    }
    // Resolved on the way out, once the transaction has a timestamp.
    return ctx.db.vars.commitTs;
  });
  return expectBigint(commitTs);
}

// Write the rows a transaction with more operations than one row holds leaves
// behind — several rows, one commitTs — without paying for the enqueues.
// Nothing pings the worker, so these drain through `drainManually`.
async function enqueueRows(
  t: TestConvex<typeof schema>,
  ...rows: Operation[][]
): Promise<bigint> {
  const commitTs = await t.run(async (ctx) => {
    for (const operations of rows) {
      await ctx.db.insert("pendingOperations", {
        commitTs: ctx.db.vars.commitTs,
        operations,
      });
    }
    return ctx.db.vars.commitTs;
  });
  return expectBigint(commitTs);
}

function inserts(from: number, count: number): Operation[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "insert" as const,
    key: from + i,
    value: `v${from + i}`,
  }));
}

// Run the worker loop to completion
async function drainViaWorker(t: TestConvex<typeof schema>): Promise<void> {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

// The cursor the batch worker has committed for our queue, or null before it
// has drained anything.
async function workerCursor(
  t: TestConvex<typeof schema>,
): Promise<bigint | null> {
  return await t.run(
    async (ctx) =>
      (await ctx.runQuery(components.batchWorker.lib.getCursor, {
        name: OPS_WORKER_NAME,
      })) as bigint | null,
  );
}

// Simulate the worker loop manually, threading the cursor the way the loop
// does, and report the cycles it took and where it left the cursor.
async function drainManually(
  t: TestConvex<typeof schema>,
): Promise<{ cycles: number; cursor: bigint | undefined }> {
  let cycles = 0;
  let cursor: bigint | undefined;
  for (;;) {
    const result = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    if (result.kind !== "work") break;
    const ret = await t.mutation(internal.worker.processBatch, {
      ...result.batch,
    });
    // The mutation's cursor wins over the query's, same as the loop.
    if (ret?.cursor !== undefined) cursor = expectBigint(ret.cursor);
    cycles++;
    if (cycles > 1000) throw new Error("drain did not converge");
  }
  return { cycles, cursor };
}

async function pendingOperationTimestamps(
  t: TestConvex<typeof schema>,
): Promise<bigint[]> {
  const timestamps = await t.run(async (ctx) =>
    (await ctx.db.query("pendingOperations").collect()).map((c) => c.commitTs),
  );
  return timestamps.map(expectBigint);
}

describe("enqueue", () => {
  test("one transaction's operations share a row keyed by its commitTs", async () => {
    const t = initConvexTest();
    // Two operations in one transaction share a row; a later transaction gets
    // its own, at a strictly later commitTs.
    const first = await enqueue(
      t,
      { type: "insert", key: 1, value: "a" },
      { type: "delete", key: 1 },
    );
    const second = await enqueue(t, { type: "insert", key: 2, value: "b" });
    expect(second).toBeGreaterThan(first);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("pendingOperations").collect();
      expect(rows.map((r) => expectBigint(r.commitTs))).toEqual([
        first,
        second,
      ]);
      expect(rows[0].operations).toEqual([
        { type: "insert", key: 1, value: "a" },
        { type: "delete", key: 1 },
      ]);
      expect(rows[1].operations).toEqual([
        { type: "insert", key: 2, value: "b" },
      ]);
    });
  });

  test("operations past MAX_OPERATIONS_PER_ENTRY spill onto a second row at the same commitTs", async () => {
    const t = initConvexTest();
    const extra = 3;
    const queued = MAX_OPERATIONS_PER_ENTRY + extra;
    const commitTs = await enqueue(t, ...inserts(0, queued));
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("pendingOperations").collect();
      // Both rows carry the transaction's commitTs, and _creationTime keeps
      // them behind it in the order the operations were enqueued.
      expect(rows.map((r) => expectBigint(r.commitTs))).toEqual([
        commitTs,
        commitTs,
      ]);
      expect(rows.map((r) => r.operations.length)).toEqual([
        MAX_OPERATIONS_PER_ENTRY,
        extra,
      ]);
      expect(rows.flatMap((r) => r.operations)).toEqual(inserts(0, queued));
    });
  });
});

describe("getBatch", () => {
  test("the cursor is inclusive, so rows at that commitTs are still picked up", async () => {
    // A cycle that drains one of a transaction's rows and stops moves the
    // cursor onto the commitTs those rows share. Reading strictly past it would
    // strand the rest of the transaction on the queue for good.
    const t = initConvexTest();
    const commitTs = await enqueueRows(t, inserts(0, 3));

    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
      cursor: commitTs,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    expect(batch.batch.entries).toHaveLength(1);
    expect(batch.batch.entries[0].commitTs).toEqual(commitTs);
    expect(batch.batch.entries[0].operations).toEqual(inserts(0, 3));
  });

  test("a batch carries at most BATCH_MAX_OPERATIONS operations", async () => {
    // Full rows, more of them than the cap allows in one cycle: getBatch takes
    // the ones that fit and leaves the rest.
    const t = initConvexTest();
    const rows = 3;
    const full = () => inserts(0, MAX_OPERATIONS_PER_ENTRY);
    await enqueueRows(t, full());
    await enqueueRows(t, full());
    const last = await enqueueRows(t, full());

    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    expect(rows * MAX_OPERATIONS_PER_ENTRY).toBeGreaterThan(
      BATCH_MAX_OPERATIONS,
    );
    expect(batch.batch.entries.flatMap((e) => e.operations)).toHaveLength(
      BATCH_MAX_OPERATIONS,
    );
    expect(batch.batch.entries.map((c) => c.commitTs)).not.toContain(last);
  });

  test("each entry keeps its own operations, in queue order", async () => {
    const t = initConvexTest();
    await enqueueRows(t, inserts(0, 2));
    await enqueueRows(t, inserts(2, 3));

    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    expect(batch.batch.entries.map((e) => e.operations)).toEqual([
      inserts(0, 2),
      inserts(2, 3),
    ]);
  });

  test("a batch stops just short of a quarter of the transaction's read limit", async () => {
    // A cycle reads its batch twice — once to build it, once to apply it — so
    // getBatch takes at most a quarter of the transaction's read budget and
    // leaves the rest of the queue to the cycles behind it.
    const bytesRead = 4 * 1024 * 1024;
    const maxBytes = bytesRead / 4;
    const t = initConvexTest({ transactionLimits: { bytesRead } });
    const value = "x".repeat(100_000);
    const queued = 20;
    for (let key = 0; key < queued; key++) {
      await enqueueRows(t, [{ type: "insert", key, value }]);
    }
    const sizes = await t.run(async (ctx) =>
      (await ctx.db.query("pendingOperations").collect()).map(getConvexSize),
    );

    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    const taken = batch.batch.entries.length;
    expect(taken).toBeGreaterThan(1);
    expect(taken).toBeLessThan(queued);
    const batched = sizes.slice(0, taken).reduce((a, b) => a + b, 0);
    expect(batched).toBeLessThanOrEqual(maxBytes);
    // And it stopped as late as it could: the next row would have gone over.
    expect(batched + sizes[taken]).toBeGreaterThan(maxBytes);
  });

  test("an entry larger than the whole budget comes back alone rather than wedging the queue", async () => {
    // A row too big for the budget can't be left behind — nothing smaller will
    // come along to make room for it, and the queue would wedge. It goes out
    // alone, and the rows behind it wait for the next cycle.
    const t = initConvexTest({ transactionLimits: { bytesRead: 256 * 1024 } });
    const value = "x".repeat(100_000);
    const oversized = await enqueueRows(t, [{ type: "insert", key: 0, value }]);
    await enqueueRows(t, [{ type: "insert", key: 1, value }]);

    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    expect(batch.batch.entries).toHaveLength(1);
    expect(batch.batch.entries[0].commitTs).toEqual(oversized);
  });
});

describe("draining", () => {
  test("an operation enqueued through the public mutation is applied, summand and all", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    await t.mutation(api.public.enqueue, {
      operation: { type: "insert", key: 1, value: "a", summand: 5 },
    });
    expect(await pendingOperationTimestamps(t)).toHaveLength(1);
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      expect(await aggregateBetweenHandler(ctx, {})).toEqual({
        count: 1,
        sum: 5,
      });
    });
  });

  test("an entry's operations apply in enqueue order, leaving the cursor on its commitTs", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    // Array order is enqueue order, so the delete of key 1 lands after its
    // insert.
    const commitTs = await enqueue(
      t,
      { type: "insert", key: 1, value: "a" },
      { type: "insert", key: 2, value: "b" },
      { type: "delete", key: 1 },
    );
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      expect(await getHandler(ctx, { key: 1 })).toBeNull();
      expect(await getHandler(ctx, { key: 2 })).toEqual({ k: 2, v: "b", s: 0 });
    });
    // The batch worker holds the cursor, advanced to the drained commitTs.
    expect(await workerCursor(t)).toEqual(commitTs);
  });

  test("several entries drain in one cycle, leaving the cursor on the last of them", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    await enqueue(t, { type: "insert", key: 1, value: "a" });
    const last = await enqueue(
      t,
      { type: "insert", key: 2, value: "b" },
      { type: "insert", key: 3, value: "c" },
    );
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(3);
    });
    expect(await workerCursor(t)).toEqual(last);
  });

  test("a cycle out of write headroom stops mid-entry, parks the cursor on it, and resumes there", async () => {
    // The cursor has to stop on the first entry the cycle didn't finish — reads
    // resume at it, so the operations still queued on that row are picked up
    // rather than skipped, and the entries behind it are left where they are.
    const t = initConvexTest({ transactionLimits: { documentsWritten: 50 } });
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    const partial = await enqueueRows(t, inserts(0, 30));
    const later = await enqueueRows(t, inserts(100, 2));
    expect(later).toBeGreaterThan(partial);

    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    expect(batch.batch.entries).toHaveLength(2);
    const ret = await t.mutation(internal.worker.processBatch, {
      ...batch.batch,
    });
    // The cursor moves onto the entry it got part way through, and the row
    // behind it waits for the next cycle.
    expect(ret?.cursor).toEqual(partial);
    expect(await pendingOperationTimestamps(t)).toEqual([partial, later]);

    const { cursor } = await drainManually(t);
    expect(cursor).toEqual(later);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(32);
      await validateTree(ctx, {});
    });
  });

  test("an enqueue after the loop has gone idle restarts it", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    await enqueue(t, { type: "insert", key: 1, value: "a" });
    await drainViaWorker(t);
    // The loop stops once the queue is empty; the next enqueue has to restart it.
    await enqueue(t, { type: "insert", key: 2, value: "b" });
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(2);
    });
  });
});

describe("operation types", () => {
  test("deleteIfExists no-ops on missing keys", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      await insertHandler(ctx, { key: 1, value: "a" });
    });
    await enqueue(
      t,
      { type: "deleteIfExists", key: 99 },
      { type: "deleteIfExists", key: 1 },
    );
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      expect(await ctx.db.query("deadLetterOperations").first()).toBeNull();
      expect(await getHandler(ctx, { key: 1 })).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(0);
      await validateTree(ctx, {});
    });
  });

  test("replaceOrInsert inserts a key that does not exist", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      await insertHandler(ctx, { key: 1, value: "a" });
    });
    await enqueue(
      t,
      { type: "replaceOrInsert", currentKey: 1, newKey: 2, value: "b" },
      { type: "replaceOrInsert", currentKey: 98, newKey: 99, value: "c" },
    );
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      expect(await ctx.db.query("deadLetterOperations").first()).toBeNull();
      expect(await getHandler(ctx, { key: 1 })).toBeNull();
      expect(await getHandler(ctx, { key: 2 })).toEqual({ k: 2, v: "b", s: 0 });
      expect(await getHandler(ctx, { key: 99 })).toEqual({
        k: 99,
        v: "c",
        s: 0,
      });
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(2);
      await validateTree(ctx, {});
    });
  });
});

describe("failures and dead letters", () => {
  test("a dead letter records the failing operation with its commitTs and error", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    const commitTs = await enqueue(t, { type: "delete", key: 99 });
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      const dead = await ctx.db.query("deadLetterOperations").collect();
      expect(dead).toHaveLength(1);
      expect(dead[0].commitTs).toEqual(commitTs);
      expect(dead[0].operation).toEqual({ type: "delete", key: 99 });
      expect(dead[0].error).toMatch(/DELETE_MISSING_KEY/);
    });
  });

  test("only the failing operation is dropped; its neighbours in the entry still apply", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    // One transaction: a delete of a key that was never there, sandwiched
    // between good inserts. Only the bad operation is skipped — its neighbours
    // are independent writes that happen to share a transaction.
    const bad = await enqueue(
      t,
      { type: "insert", key: 1, value: "a" },
      { type: "delete", key: 99 },
      { type: "insert", key: 2, value: "b" },
    );
    const last = await enqueue(t, { type: "insert", key: 3, value: "c" });
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      expect(await getHandler(ctx, { key: 1 })).toEqual({ k: 1, v: "a", s: 0 });
      expect(await getHandler(ctx, { key: 2 })).toEqual({ k: 2, v: "b", s: 0 });
      expect(await getHandler(ctx, { key: 3 })).toEqual({ k: 3, v: "c", s: 0 });
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(3);
      const dead = await ctx.db.query("deadLetterOperations").collect();
      expect(dead).toHaveLength(1);
      expect(dead[0].commitTs).toEqual(bad);
      expect(dead[0].operation).toEqual({ type: "delete", key: 99 });
      await validateTree(ctx, {});
    });
    // The cursor advanced past both entries.
    expect(await workerCursor(t)).toEqual(last);
  });

  test("the failing cycle commits only the dead letter and reports no cursor", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    const first = await enqueue(t, { type: "insert", key: 1, value: "a" });
    const bad = await enqueue(t, { type: "delete", key: 99 });
    const third = await enqueue(t, { type: "insert", key: 3, value: "c" });

    // The failure rolls the whole attempt back, so the cycle commits only the
    // dead letter and the entry that emptied out behind it. The operations
    // either side of it stay queued, and the cycle reports no cursor: it got no
    // further through the queue than the cycle before it did.
    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    expect(batch.batch.entries).toHaveLength(3);
    const ret = await t.mutation(internal.worker.processBatch, {
      ...batch.batch,
    });
    expect(ret?.cursor).toBeUndefined();
    expect(await pendingOperationTimestamps(t)).toEqual([first, third]);
    await t.run(async (ctx) => {
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(0);
    });

    // The next cycle gets the batch without the operation that threw.
    const { cycles, cursor } = await drainManually(t);
    expect(cycles).toEqual(1);
    expect(cursor).toEqual(third);
    expect(await pendingOperationTimestamps(t)).toEqual([]);
    await t.run(async (ctx) => {
      const dead = await ctx.db.query("deadLetterOperations").collect();
      expect(dead).toHaveLength(1);
      expect(dead[0].commitTs).toEqual(bad);
      expect(await getHandler(ctx, { key: 1 })).toEqual({ k: 1, v: "a", s: 0 });
      expect(await getHandler(ctx, { key: 3 })).toEqual({ k: 3, v: "c", s: 0 });
      await validateTree(ctx, {});
    });
  });

  test("a replace whose insert fails leaves neither half of it applied", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
      await insertHandler(ctx, { key: 1, value: "a" });
      await insertHandler(ctx, { key: 2, value: "b" });
    });
    // A replace is a delete followed by an insert, and this one's insert fails
    // on the key that is already there. The delete of key 1 has to go with it —
    // dead-lettering the operation is only safe if none of it stuck.
    const bad = await enqueue(t, {
      type: "replace",
      currentKey: 1,
      newKey: 2,
      value: "c",
    });
    await drainViaWorker(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      expect(await getHandler(ctx, { key: 1 })).toEqual({ k: 1, v: "a", s: 0 });
      expect(await getHandler(ctx, { key: 2 })).toEqual({ k: 2, v: "b", s: 0 });
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(2);
      const dead = await ctx.db.query("deadLetterOperations").collect();
      expect(dead).toHaveLength(1);
      expect(dead[0].commitTs).toEqual(bad);
      expect(dead[0].error).toMatch(/already exists/);
      await validateTree(ctx, {});
    });
  });

  test("each cycle cuts one failure out of the row and requeues the rest in order", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    // Two failures in the same entry, with good operations before, between,
    // and after them: each cycle drops one failure out of the middle of the
    // row, so what finally applies is exactly the operations that didn't
    // throw, in order.
    const commitTs = await enqueue(
      t,
      { type: "insert", key: 1, value: "a" },
      { type: "delete", key: 98 },
      { type: "insert", key: 2, value: "b" },
      { type: "delete", key: 99 },
      { type: "insert", key: 3, value: "c" },
      // Applies, because the failed delete of key 2's predecessor didn't.
      { type: "delete", key: 2 },
    );
    const { cycles, cursor } = await drainManually(t);
    expect(cycles).toEqual(3);
    expect(cursor).toEqual(commitTs);
    expect(await pendingOperationTimestamps(t)).toEqual([]);
    await t.run(async (ctx) => {
      const dead = await ctx.db.query("deadLetterOperations").collect();
      expect(dead.map((d) => d.operation)).toEqual([
        { type: "delete", key: 98 },
        { type: "delete", key: 99 },
      ]);
      expect(await getHandler(ctx, { key: 1 })).toEqual({ k: 1, v: "a", s: 0 });
      expect(await getHandler(ctx, { key: 2 })).toBeNull();
      expect(await getHandler(ctx, { key: 3 })).toEqual({ k: 3, v: "c", s: 0 });
      await validateTree(ctx, {});
    });
  });

  test("an entry emptied by a dead letter is retired, so the failure isn't recorded twice", async () => {
    // The cycle stops at the failure, so nothing is applied — but the entry the
    // failure came off has no operations left, so it still drains. The
    // operation has to be off the queue for good, or the next cycle would
    // dead-letter it a second time.
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    const bad = await enqueue(t, { type: "delete", key: 99 });
    const good = await enqueue(t, { type: "insert", key: 1, value: "a" });

    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    const ret = await t.mutation(internal.worker.processBatch, {
      ...batch.batch,
    });
    expect(ret?.cursor).toBeUndefined();
    expect(await pendingOperationTimestamps(t)).toEqual([good]);

    await drainManually(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      const dead = await ctx.db.query("deadLetterOperations").collect();
      expect(dead).toHaveLength(1);
      expect(dead[0].commitTs).toEqual(bad);
      expect(await getHandler(ctx, { key: 1 })).toEqual({ k: 1, v: "a", s: 0 });
    });
  });
});

describe("transaction limits", () => {
  test("a cycle stops between entries once it runs out of write headroom", async () => {
    // Enforce a write budget far smaller than the whole batch needs. getBatch
    // hands processBatch the whole queue (100 entries, well under both of its
    // budgets); processBatch has to notice it's running out of room and leave the
    // rest for the next cycle rather than blow the limit — which would abort the
    // cycle, be retried forever, and wedge the queue.
    const t = initConvexTest({ transactionLimits: { documentsWritten: 150 } });
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 16, false);
    });
    for (let txn = 0; txn < 100; txn++) {
      await enqueue(t, { type: "insert", key: txn, value: `v${txn}` });
    }

    // The whole queue comes back — it's processBatch that has to ration it.
    const batch = await t.query(internal.worker.getBatch, {
      name: OPS_WORKER_NAME,
    });
    expect(batch.kind).toEqual("work");
    if (batch.kind !== "work") return;
    expect(batch.batch.entries).toHaveLength(100);

    // Everything still drains, just across many cycles, and nothing fails.
    const { cycles } = await drainManually(t);
    expect(cycles).toBeGreaterThan(1);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pendingOperations").first()).toBeNull();
      expect(await ctx.db.query("deadLetterOperations").first()).toBeNull();
      const { count } = await aggregateBetweenHandler(ctx, {});
      expect(count).toEqual(100);
      await validateTree(ctx, {});
    });
  });

  describe("operation headroom", () => {
    const TRANSACTION_LIMITS = {
      bytesRead: 16 * 1024 * 1024,
      bytesWritten: 16 * 1024 * 1024,
      databaseQueries: 4_096,
      documentsRead: 32_000,
      documentsWritten: 16_000,
      functionsScheduled: 1_000,
      scheduledFunctionArgsBytes: 16 * 1024 * 1024,
    } satisfies Record<keyof TransactionMetrics, number>;

    // A fresh transaction's metrics with specific limits overridden to whatever
    // the case under test needs.
    function metricsWith(
      overrides: Partial<TransactionMetrics>,
    ): TransactionMetrics {
      const wideOpen = Object.fromEntries(
        Object.entries(TRANSACTION_LIMITS).map(([limit, total]) => [
          limit,
          { used: 0, remaining: total },
        ]),
      ) as TransactionMetrics;
      return { ...wideOpen, ...overrides };
    }

    test("hasHeadroomToFinish is false once the reserve is all that's left", () => {
      // A fresh transaction has room for another operation.
      expect(hasHeadroomToFinish(metricsWith({}))).toBe(true);
      // Down to the reserve, so there's only room to wrap up.
      expect(
        hasHeadroomToFinish(
          metricsWith({
            bytesWritten: {
              used: TRANSACTION_LIMITS.bytesWritten - RESERVE_BYTES,
              remaining: RESERVE_BYTES,
            },
          }),
        ),
      ).toBe(false);
      // One exhausted limit is enough to stop, with the rest wide open.
      expect(
        hasHeadroomToFinish(
          metricsWith({ documentsWritten: { used: 15_994, remaining: 6 } }),
        ),
      ).toBe(false);
    });
  });
});

describe("guards", () => {
  test("a cycle that commits nothing throws rather than spin", async () => {
    const t = initConvexTest();
    await t.run(async (ctx) => {
      await getOrCreateTree(ctx.db, undefined, 4, false);
    });
    // There's no batch a cycle can make no progress on — it applies something,
    // retires something, dead-letters something, or throws on its way out — so
    // the only way to reach either guard is to hand it nothing to do. The
    // worker would otherwise keep asking for the same batch, cursor unmoved,
    // forever.
    await expect(
      t.mutation(internal.worker.processBatch, { entries: [] }),
    ).rejects.toThrow(/empty batch/);
    await expect(
      t.mutation(internal.worker.processBatchInner, { entries: [] }),
    ).rejects.toThrow(/no progress/);
  });
});

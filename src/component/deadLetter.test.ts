import { describe, expect, test } from "vitest";
import type { TestConvex } from "convex-test";
import type { Id } from "./_generated/dataModel.js";
import { api } from "./_generated/api.js";
import type schema from "./schema.js";
import { initConvexTest } from "./setup.test.js";

// Dead-letter one operation per commitTs, ascending from 1n.
async function seed(
  t: TestConvex<typeof schema>,
  count: number,
): Promise<Id<"deadLetterOperations">[]> {
  return await t.run(async (ctx) => {
    const ids: Id<"deadLetterOperations">[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(
        await ctx.db.insert("deadLetterOperations", {
          commitTs: BigInt(i + 1),
          operation: { type: "delete", key: i },
          error: `failure ${i}`,
        }),
      );
    }
    return ids;
  });
}

describe("list", () => {
  test("returns entries oldest first, or newest first when descending", async () => {
    const t = initConvexTest();
    await seed(t, 3);
    const asc = await t.query(api.deadLetter.list, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(asc.isDone).toBe(true);
    expect(asc.page.map((e) => e.commitTs)).toEqual([1n, 2n, 3n]);
    const desc = await t.query(api.deadLetter.list, {
      paginationOpts: { numItems: 100, cursor: null },
      order: "desc",
    });
    expect(desc.page.map((e) => e.commitTs)).toEqual([3n, 2n, 1n]);
  });

  test("paginates", async () => {
    const t = initConvexTest();
    await seed(t, 5);
    const first = await t.query(api.deadLetter.list, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.isDone).toBe(false);
    expect(first.page.map((e) => e.commitTs)).toEqual([1n, 2n]);
    const second = await t.query(api.deadLetter.list, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page.map((e) => e.commitTs)).toEqual([3n, 4n]);
  });
});

describe("get", () => {
  test("returns the entry for the given id", async () => {
    const t = initConvexTest();
    const ids = await seed(t, 3);
    const entry = await t.query(api.deadLetter.get, { id: ids[2] });
    expect(entry?.commitTs).toEqual(3n);
  });

  test("returns null for an entry that is gone", async () => {
    const t = initConvexTest();
    const ids = await seed(t, 2);
    await t.mutation(api.deadLetter.delete_, { id: ids[0] });
    expect(await t.query(api.deadLetter.get, { id: ids[0] })).toBeNull();
    expect(await t.query(api.deadLetter.get, { id: ids[1] })).toMatchObject({
      commitTs: 2n,
    });
  });
});

describe("delete_", () => {
  test("deletes the given id", async () => {
    const t = initConvexTest();
    const ids = await seed(t, 3);
    expect(await t.mutation(api.deadLetter.delete_, { id: ids[0] })).toBe(true);
    const { page } = await t.query(api.deadLetter.list, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(page.map((e) => e.commitTs)).toEqual([2n, 3n]);
  });
});

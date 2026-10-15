import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TestConvex } from "convex-test";
import type { Id } from "./_generated/dataModel.js";
import { api } from "./_generated/api.js";
import type schema from "./schema.js";
import { getTree, type Namespace } from "./btree.js";
import { initConvexTest } from "./setup.test.js";

// Use fake timers so node cleanup only runs when a test drains it.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function insertKeys(
  t: TestConvex<typeof schema>,
  namespace: Namespace,
  keys: number[],
) {
  for (const key of keys) {
    await t.mutation(api.public.insert, {
      key,
      value: `v${key}`,
      summand: key,
      namespace,
    });
  }
}

function range(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + i);
}

async function count(t: TestConvex<typeof schema>, namespace: Namespace) {
  return await t.query(api.btree.aggregateBetween, { namespace });
}

async function namespaces(t: TestConvex<typeof schema>) {
  const { page } = await t.query(api.btree.paginateNamespaces, {
    limit: 100,
  });
  return page;
}

// Every node reachable from the namespace's root.
async function treeNodes(
  t: TestConvex<typeof schema>,
  namespace: Namespace,
): Promise<Id<"btreeNode">[]> {
  return await t.run(async (ctx) => {
    const tree = await getTree(ctx.db, namespace);
    if (!tree) {
      return [];
    }
    const nodes: Id<"btreeNode">[] = [];
    const toVisit = [tree.root];
    while (toVisit.length > 0) {
      const node = toVisit.pop()!;
      nodes.push(node);
      toVisit.push(...(await ctx.db.get("btreeNode", node))!.subtrees);
    }
    return nodes;
  });
}

async function allNodes(
  t: TestConvex<typeof schema>,
): Promise<Id<"btreeNode">[]> {
  return await t.run(async (ctx) =>
    (await ctx.db.query("btreeNode").collect()).map((node) => node._id),
  );
}

async function finishNodeCleanup(t: TestConvex<typeof schema>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("deleteNamespace", () => {
  test("returns false and creates nothing for a namespace with no tree", async () => {
    const t = initConvexTest();
    expect(
      await t.mutation(api.public.deleteNamespace, { namespace: "missing" }),
    ).toBe(false);
    expect(await namespaces(t)).toEqual([]);
    expect(await allNodes(t)).toEqual([]);
  });

  test("deletes the default namespace", async () => {
    const t = initConvexTest();
    await insertKeys(t, undefined, [1, 2, 3]);
    expect(await t.mutation(api.public.deleteNamespace, {})).toBe(true);
    await finishNodeCleanup(t);
    expect(await namespaces(t)).toEqual([]);
    expect(await allNodes(t)).toEqual([]);
    expect(await count(t, undefined)).toEqual({ count: 0, sum: 0 });
  });

  test("leaves other namespaces untouched", async () => {
    const t = initConvexTest();
    await insertKeys(t, "a", [1, 2, 3]);
    await insertKeys(t, "b", [4, 5]);
    await insertKeys(t, undefined, [6]);
    expect(
      await t.mutation(api.public.deleteNamespace, { namespace: "a" }),
    ).toBe(true);
    await finishNodeCleanup(t);
    expect(await count(t, "a")).toEqual({ count: 0, sum: 0 });
    expect(await count(t, "b")).toEqual({ count: 2, sum: 9 });
    expect(await count(t, undefined)).toEqual({ count: 1, sum: 6 });
    expect((await namespaces(t)).sort()).toEqual(["b", null]);
    await t.query(api.btree.validate, { namespace: "b" });
  });

  test("returns false the second time", async () => {
    const t = initConvexTest();
    await insertKeys(t, "a", [1]);
    expect(
      await t.mutation(api.public.deleteNamespace, { namespace: "a" }),
    ).toBe(true);
    expect(
      await t.mutation(api.public.deleteNamespace, { namespace: "a" }),
    ).toBe(false);
    await finishNodeCleanup(t);
    expect(await namespaces(t)).toEqual([]);
  });

  test("deletes every node of a multilevel tree", async () => {
    const t = initConvexTest();
    await t.mutation(api.public.init, { namespace: "a", maxNodeSize: 4 });
    await insertKeys(t, "a", range(0, 40));
    await insertKeys(t, "b", [100, 101]);
    const deletedNodes = await treeNodes(t, "a");
    const keptNodes = await treeNodes(t, "b");
    // Deep enough that the cleanup has to fan out past the root's children.
    expect(deletedNodes.length).toBeGreaterThan(5);

    expect(
      await t.mutation(api.public.deleteNamespace, { namespace: "a" }),
    ).toBe(true);
    // The tree is gone at once; its nodes go once scheduled functions run.
    expect(await namespaces(t)).toEqual(["b"]);
    expect(await allNodes(t)).toHaveLength(
      deletedNodes.length + keptNodes.length,
    );

    await finishNodeCleanup(t);
    expect((await allNodes(t)).sort()).toEqual(keptNodes.sort());
    expect(await count(t, "b")).toEqual({ count: 2, sum: 201 });
  });

  test("a write before the node cleanup finishes starts a fresh tree", async () => {
    const t = initConvexTest();
    await t.mutation(api.public.init, { namespace: "a", maxNodeSize: 4 });
    await insertKeys(t, "a", range(0, 40));
    const deletedNodes = await treeNodes(t, "a");

    expect(
      await t.mutation(api.public.deleteNamespace, { namespace: "a" }),
    ).toBe(true);
    await insertKeys(t, "a", [7, 1000]);
    await finishNodeCleanup(t);

    expect(await count(t, "a")).toEqual({ count: 2, sum: 1007 });
    await t.query(api.btree.validate, { namespace: "a" });
    const freshNodes = await treeNodes(t, "a");
    expect(freshNodes.some((node) => deletedNodes.includes(node))).toBe(false);
    expect((await allNodes(t)).sort()).toEqual(freshNodes.sort());
  });

  test("refuses while queued operations are pending", async () => {
    const t = initConvexTest();
    await insertKeys(t, "a", [1, 2]);
    await t.run(async (ctx) => {
      await ctx.db.insert("pendingOperations", {
        commitTs: 1n,
        operations: [{ type: "insert", key: 3, value: "c", namespace: "a" }],
      });
    });
    await expect(
      t.mutation(api.public.deleteNamespace, { namespace: "a" }),
    ).rejects.toThrow(/PENDING_OPERATIONS/);
    expect(
      await t.query(api.btree.aggregateBetween, {
        namespace: "a",
        stale: true,
      }),
    ).toEqual({ count: 2, sum: 3 });
    expect(await treeNodes(t, "a")).not.toEqual([]);
  });
});

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { DirectAggregate } from "./index.js";
import { components, modules } from "./setup.test.js";
import { defineSchema } from "convex/server";
import { register } from "../test.js";

const schema = defineSchema({});

function setupTest() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

test("buffer flush in mutation context", async () => {
  const t = setupTest();

  const aggregate = new DirectAggregate<{
    Key: number;
    Id: string;
  }>(components.aggregate);

  // Test that reading with buffered operations in a mutation works (auto-flushes)
  await t.run(async (ctx) => {
    aggregate.buffer(true);
    await aggregate.insert(ctx, { key: 1, id: "a" });
    await aggregate.insert(ctx, { key: 2, id: "b" });

    // This should work because we're in a mutation context and it auto-flushes
    const count = await aggregate.count(ctx);
    expect(count).toBe(2);

    aggregate.buffer(false);
  });

  // Test manual flush
  await t.run(async (ctx) => {
    aggregate.buffer(true);
    await aggregate.insert(ctx, { key: 3, id: "c" });

    // Manual flush
    await aggregate.flush(ctx);

    aggregate.buffer(false);

    const count = await aggregate.count(ctx);
    expect(count).toBe(3);
  });
});

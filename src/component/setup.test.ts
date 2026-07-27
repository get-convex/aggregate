/// <reference types="vite/client" />

import { test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
// convex-test's limit configuration: one flat number per limit. Not to be
// confused with `TransactionMetrics` from "convex/server", which is the
// used/remaining pairs `ctx.meta.getTransactionMetrics()` returns.
import type { TransactionMetrics as TransactionLimits } from "convex-test/dist/transactionMetrics.js";
import batchWorker from "@convex-dev/batch-worker/test";
import schema from "./schema.js";

export const modules = import.meta.glob("./**/*.*s");

/**
 * A test instance of this component running as its own deployment, with the
 * batch worker it mounts registered so `ping` and the worker loop work.
 *
 * Pass `transactionLimits` to enforce bandwidth limits; by default they are not
 * enforced, except where a nested call asks for tighter ones of its own.
 */
export function initConvexTest(options?: {
  transactionLimits?: Partial<TransactionLimits> | boolean;
}): TestConvex<typeof schema> {
  const t = convexTest({ schema, modules, ...options });
  batchWorker.register(t);
  return t;
}

test("setup", () => {});

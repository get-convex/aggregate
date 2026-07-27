/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { scheduleSlot } from "./bench";
import schema from "./schema";
import { register } from "@convex-dev/aggregate/test";
import type { BenchConfig } from "./utils/benchTypes";

const modules = import.meta.glob("./**/*.ts");

const eagerConfig: BenchConfig = {
  mode: "eager",
  scenario: "hot",
  totalOps: 100,
  opsPerMutation: 10,
  jobsPerWave: 5,
  shards: 1,
  seed: 1,
  timeoutMs: 60_000,
};

describe("bench", () => {
  function setupTest() {
    const t = convexTest(schema, modules);
    register(t, "benchAggregate");
    return t;
  }

  let t: ReturnType<typeof setupTest>;

  beforeEach(() => {
    vi.useFakeTimers();
    t = setupTest();
  });

  afterEach(async () => {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  test("an eager run completes and every op lands in the aggregate", async () => {
    const started = await t.mutation(api.bench.startRun, {
      config: eagerConfig,
      label: "eager-smoke",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    expect(run?.status).toBe("done");
    expect(run?.results?.ops.committed).toBe(100);
    expect(run?.results?.jobs.failed).toBe(0);

    // The aggregate itself agrees, read eagerly (no queue to block it).
    const probe = await t.query(api.bench.probeEagerRead);
    expect(probe).toEqual({ ok: true, count: 100 });
  });

  test("an eager run records clock-free per-op work metrics", async () => {
    const started = await t.mutation(api.bench.startRun, {
      config: eagerConfig,
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    // Each eager insert walks the btree, so it must write more than nothing.
    expect(run?.results?.work.documentsWrittenPerOp).toBeGreaterThan(0);
    expect(run?.results?.work.documentsReadPerOp).toBeGreaterThan(0);
  });

  test("spreads writes across namespaces in the sharded scenario", async () => {
    const started = await t.mutation(api.bench.startRun, {
      config: { ...eagerConfig, scenario: "sharded", shards: 4 },
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const jobs = await t.query(api.bench.getJobSeries, {
      runId: started.runId,
      kind: "write",
    });
    expect(jobs.length).toBeGreaterThan(0);
    const run = await t.query(api.bench.getRun, { runId: started.runId });
    expect(run?.results?.ops.committed).toBe(100);
  });

  test("refuses a second run while one is in progress", async () => {
    const first = await t.mutation(api.bench.startRun, { config: eagerConfig });
    expect(first.ok).toBe(true);
    const second = await t.mutation(api.bench.startRun, { config: eagerConfig });
    expect(second).toMatchObject({ ok: false, reason: "run_in_progress" });
  });

  test("rejects an invalid config before creating a run", async () => {
    const result = await t.mutation(api.bench.startRun, {
      config: { ...eagerConfig, scenario: "hot", shards: 8 },
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid_config" });
    expect(await t.query(api.bench.listRuns, {})).toHaveLength(0);
  });

  test("canStart reports a clean slate", async () => {
    const status = await t.query(api.bench.canStart);
    expect(status.canStart).toBe(true);
    expect(status.queue.rows).toBe(0);
  });

  test("resetAll clears runs and the aggregate", async () => {
    const started = await t.mutation(api.bench.startRun, {
      config: eagerConfig,
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.mutation(internal.bench.resetAll)).toBe("all_reset");
    expect(await t.query(api.bench.listRuns, {})).toHaveLength(0);
    expect(await t.query(api.bench.probeEagerRead)).toEqual({
      ok: true,
      count: 0,
    });
  });

  describe("suites", () => {
    test("scheduleSlot interleaves the modes across repeats", () => {
      const modes = ["async", "eager"] as const;
      // A,E,A,E,A,E — not A,A,A,E,E,E. Drift over the suite's lifetime then
      // lands on both modes equally.
      expect(
        [0, 1, 2, 3, 4, 5].map((i) => scheduleSlot(modes, i)),
      ).toEqual([
        { mode: "async", repeatIndex: 0 },
        { mode: "eager", repeatIndex: 0 },
        { mode: "async", repeatIndex: 1 },
        { mode: "eager", repeatIndex: 1 },
        { mode: "async", repeatIndex: 2 },
        { mode: "eager", repeatIndex: 2 },
      ]);
    });

    test("scheduleSlot handles a single-mode suite", () => {
      expect([0, 1].map((i) => scheduleSlot(["eager"], i))).toEqual([
        { mode: "eager", repeatIndex: 0 },
        { mode: "eager", repeatIndex: 1 },
      ]);
    });

    test("startSuite rejects a repeat count outside the allowed range", async () => {
      for (const repeats of [0, -1, 2.5, 11]) {
        const result = await t.mutation(api.bench.startSuite, {
          config: eagerConfig,
          repeats,
        });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected a rejection");
        expect(result.reason).toBe("invalid_config");
      }
      expect(await t.query(api.bench.listSuites, {})).toHaveLength(0);
    });

    test("startSuite starts exactly one run up front", async () => {
      const started = await t.mutation(api.bench.startSuite, {
        config: eagerConfig,
        repeats: 2,
        modes: ["eager"],
      });
      if (!started.ok) throw new Error("expected the suite to start");

      const suites = await t.query(api.bench.listSuites, {});
      expect(suites).toHaveLength(1);
      // Cursor advanced past the run it just started, and no further.
      expect(suites[0]).toMatchObject({ cursor: 1, repeats: 2, status: "running" });
      const runs = await t.query(api.bench.listRuns, {});
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ suiteId: started.suiteId, repeatIndex: 0 });
    });

    test("a suite runs every repeat and then marks itself done", async () => {
      const started = await t.mutation(api.bench.startSuite, {
        config: eagerConfig,
        repeats: 3,
        modes: ["eager"],
      });
      if (!started.ok) throw new Error("expected the suite to start");
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const suites = await t.query(api.bench.listSuites, {});
      expect(suites[0]).toMatchObject({ status: "done", cursor: 3 });
      const runs = await t.query(api.bench.listRuns, {});
      expect(runs).toHaveLength(3);
      expect(runs.every((r) => r.suiteId === started.suiteId)).toBe(true);
      expect(
        runs.map((r) => r.repeatIndex).sort((a, b) => (a ?? 0) - (b ?? 0)),
      ).toEqual([0, 1, 2]);
      // Every run produced results, so the dashboard has 3 samples to spread.
      expect(runs.every((r) => r.results !== undefined)).toBe(true);
    });

    test("startSuite refuses while another run is in flight", async () => {
      const first = await t.mutation(api.bench.startRun, {
        config: eagerConfig,
      });
      if (!first.ok) throw new Error("expected the run to start");
      const second = await t.mutation(api.bench.startSuite, {
        config: eagerConfig,
        repeats: 2,
      });
      expect(second.ok).toBe(false);
      if (second.ok) throw new Error("expected a rejection");
      expect(second.reason).toBe("run_in_progress");
    });

    test("cancelSuite stops the schedule from advancing", async () => {
      const started = await t.mutation(api.bench.startSuite, {
        config: eagerConfig,
        repeats: 3,
        modes: ["eager"],
      });
      if (!started.ok) throw new Error("expected the suite to start");
      await t.mutation(api.bench.cancelSuite, { suiteId: started.suiteId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const suites = await t.query(api.bench.listSuites, {});
      expect(suites[0]).toMatchObject({ status: "canceled" });
      // The first run was already in flight; repeats 2 and 3 never started.
      expect(await t.query(api.bench.listRuns, {})).toHaveLength(1);
    });

    test("resetAll clears suites along with their runs", async () => {
      const started = await t.mutation(api.bench.startSuite, {
        config: eagerConfig,
        repeats: 2,
        modes: ["eager"],
      });
      if (!started.ok) throw new Error("expected the suite to start");
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(await t.mutation(internal.bench.resetAll)).toBe("all_reset");
      expect(await t.query(api.bench.listSuites, {})).toHaveLength(0);
      expect(await t.query(api.bench.listRuns, {})).toHaveLength(0);
    });
  });

  // The queued path can't run here: `enqueue` needs `db.vars.commitTs`, which
  // convex-test doesn't resolve, and `ping` needs the nested batchWorker
  // component, which `@convex-dev/aggregate/test`'s `register` doesn't register.
  // Verify async runs against a real deployment via the dashboard.
  test.skip("an async run enqueues, drains, and reaches the same count", () => {});
});

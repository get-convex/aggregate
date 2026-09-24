/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
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
  fanOut: 5,
  shards: 1,
  timeoutMs: 60_000,
};

describe("bench", () => {
  function setupTest() {
    const t = convexTest(schema, modules);
    register(t, "benchAggregate");
    return t;
  }

  let t: ReturnType<typeof setupTest>;

  /** What the aggregate itself holds, read eagerly. Throws while ops are queued. */
  async function aggregateCount(namespace = "hot"): Promise<number> {
    const { count } = await t.query(
      components.benchAggregate.btree.aggregateBetween,
      { namespace },
    );
    return count;
  }

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
    expect(await aggregateCount()).toBe(100);
  });

  test("an eager run is consistent the moment its last write commits", async () => {
    // `watch` notices the enqueue finishing on one tick and only stamps the end
    // of the drain on the next, so an eager run's recorded end trailed its last
    // commit by a tick with nothing happening in between — a flat tail on the
    // consistency curve after it had reached zero, and a padded
    // time-to-consistency. An eager run has no drain to wait for.
    const started = await t.mutation(api.bench.startRun, {
      config: eagerConfig,
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    expect(run?.enqueueEndedAtMs).toBeDefined();
    expect(run?.drainEndedAtMs).toBe(run?.enqueueEndedAtMs);
    expect(run?.results?.drain.timeToDrainMs).toBe(0);
    expect(run?.results?.drain.resolutionMs).toBe(0);
    // The curve closes exactly where the run ends.
    const start = run?.enqueueStartedAtMs ?? run?.createdAtMs ?? 0;
    expect(run?.results?.consistency?.at(-1)).toEqual({
      elapsedMs: (run?.drainEndedAtMs ?? 0) - start,
      outstanding: 0,
      queued: 0,
    });
  });

  test("fan-out 1 runs the mutations one after another", async () => {
    // Lanes are what bound in-flight work. Without that bound a fan-out-1 run
    // reported concurrency.achieved of 114.
    const started = await t.mutation(api.bench.startRun, {
      config: { ...eagerConfig, fanOut: 1 },
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { lanes, jobs } = await t.run(async (ctx) => ({
      lanes: await ctx.db.query("benchLanes").collect(),
      jobs: await ctx.db.query("benchJobs").collect(),
    }));
    // One lane, and every job in the run went through it.
    expect(lanes).toHaveLength(1);
    expect(lanes[0].jobsSpawned).toBe(jobs.length);
    expect(jobs).toHaveLength(10); // 100 ops / 10 per mutation

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    expect(run?.results?.ops.committed).toBe(100);

    // Everything the scheduler's own clock feeds is degenerate under
    // convex-test, which doesn't implement `ctx.meta.getRequestMetadata()`: job
    // rows get no `scheduledFnId`, so no job contributes an interval or a
    // latency sample. Asserted rather than implied, so implementing the syscall
    // fails here loudly instead of quietly changing what these numbers mean.
    expect(run?.results?.concurrency.achieved).toBe(0);
    expect(run?.results?.latency.jobLatency.count).toBe(0);
    expect(run?.results?.latency.jobService.count).toBe(0);
    expect(run?.results?.latency.jobQueue.count).toBe(0);
    expect(run?.results?.jobs.failed).toBe(0);
  });

  test("deals jobs across one lane per unit of fan-out", async () => {
    const started = await t.mutation(api.bench.startRun, {
      config: { ...eagerConfig, fanOut: 3 },
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { lanes, jobs } = await t.run(async (ctx) => ({
      lanes: await ctx.db.query("benchLanes").collect(),
      jobs: await ctx.db.query("benchJobs").collect(),
    }));
    expect(lanes).toHaveLength(3);
    // Lane L owns seqs L, L+3, L+6, … — the lanes partition the work, so no seq
    // runs twice and none is dropped. 10 jobs over 3 lanes is 4/3/3.
    expect(lanes.map((l) => l.jobsSpawned).sort()).toEqual([3, 3, 4]);
    expect(lanes.reduce((n, l) => n + l.jobsSpawned, 0)).toBe(jobs.length);
    expect(new Set(jobs.map((j) => j.seq)).size).toBe(jobs.length);

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    expect(run?.results?.ops.committed).toBe(100);
  });

  test("a run that loses ops reports it instead of reading as done", async () => {
    // A job whose transaction can't commit — an eager job at 1000 ops/txn reads
    // past the 16 MiB limit walking the B-tree — commits no row and no ops. The
    // run used to finish "done" with a fast time and a low op count, and the
    // consistency curve was force-closed at zero, drawing a cliff at the end of
    // a curve that had been sitting at the unlanded total the whole run.
    const started = await t.mutation(api.bench.startRun, {
      config: { ...eagerConfig, fanOut: 2 },
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Drop one job's ops to simulate a job that committed nothing, then
    // re-finalize over the same rows. The samples counted that job as it landed,
    // so they lose it too — a job that never committed never shows up in one.
    // Only the arithmetic is under test here; `finalize` treats an
    // already-finished run no differently.
    await t.run(async (ctx) => {
      const job = await ctx.db.query("benchJobs").first();
      if (!job) throw new Error("expected a job row");
      await ctx.db.patch("benchJobs", job._id, { ops: 0 });
      for (const sample of await ctx.db.query("benchQueueSamples").collect()) {
        if (sample.opsCommitted >= job.ops) {
          await ctx.db.patch("benchQueueSamples", sample._id, {
            opsCommitted: sample.opsCommitted - job.ops,
          });
        }
      }
    });
    await t.mutation(internal.bench.finalize, { runId: started.runId });

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    expect(run?.status).toBe("failed");
    expect(run?.results?.ops.committed).toBe(90);
    expect(run?.results?.ops.failed).toBe(10);
    expect(run?.errors?.[0]).toContain("10 of 100 ops never landed");
    // The curve stops where the run stopped rather than being closed at zero.
    expect(run?.results?.consistency?.at(-1)?.outstanding).toBe(10);
  });

  test("a finished run stores a consistency curve that reaches zero", async () => {
    // Fan-out 1 is the case that exposed the watch loop starving: every job
    // insert lands in the tick's read set, so a tick that read the run's jobs
    // directly never committed until the writes stopped, and the curve came out
    // flat at the total for the whole run.
    const started = await t.mutation(api.bench.startRun, {
      config: { ...eagerConfig, fanOut: 1 },
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    const curve = run?.results?.consistency;
    expect(curve?.length).toBeGreaterThan(0);
    if (!curve) return;
    expect(curve.at(-1)?.outstanding).toBe(0);
    // The final point is appended by `finalize` whenever the run reached
    // consistency, so a curve that sat flat at the total would still end at
    // zero. Some sampled point has to show the decline in progress.
    expect(
      curve
        .slice(0, -1)
        .some((p) => p.outstanding > 0 && p.outstanding < eagerConfig.totalOps),
    ).toBe(true);
    // Committed ops only accumulate and an eager run queues nothing, so the
    // curve is monotonic and time runs forwards.
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].outstanding).toBeLessThanOrEqual(
        curve[i - 1].outstanding,
      );
      expect(curve[i].elapsedMs).toBeGreaterThanOrEqual(curve[i - 1].elapsedMs);
    }
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

    // Job `seq` writes to `shard-${seq % 4}`, so the 10 jobs of 10 ops land
    // 30/30/20/20 — every namespace used, and none of them holding everything.
    const counts = await Promise.all(
      [0, 1, 2, 3].map((i) => aggregateCount(`shard-${i}`)),
    );
    expect(counts).toEqual([30, 30, 20, 20]);

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    expect(run?.results?.ops.committed).toBe(100);
  });

  test("the bursty scenario holds each burst back to its slot", async () => {
    const started = await t.mutation(api.bench.startRun, {
      config: {
        ...eagerConfig,
        scenario: "bursty",
        bursts: 4,
        burstIntervalMs: 5_000,
        fanOut: 5,
      },
    });
    if (!started.ok) throw new Error("expected the run to start");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const { run, jobs } = await t.run(async (ctx) => ({
      run: await ctx.db.get("benchRuns", started.runId),
      jobs: await ctx.db.query("benchJobs").collect(),
    }));
    const t0 = run!.enqueueStartedAtMs!;
    // 10 write jobs over 4 bursts is 3 per burst, and burst b isn't due until
    // b · 5s — including for the lanes that skip a burst entirely, there being
    // fewer jobs in a burst than there are lanes.
    for (const job of jobs) {
      const burst = Math.min(Math.floor(job.seq / 3), 3);
      expect(job.startedAtMs - t0).toBeGreaterThanOrEqual(burst * 5_000);
    }
    // The run really did span the schedule rather than running the whole thing
    // at once — without this the loop above would pass on a frozen clock.
    const spanMs = Math.max(...jobs.map((j) => j.startedAtMs)) - t0;
    expect(spanMs).toBeGreaterThanOrEqual(15_000);
    expect(run!.results?.ops.committed).toBe(100);
    expect(run!.results?.jobs.failed).toBe(0);
  });

  test("refuses a second run while one is in progress", async () => {
    const first = await t.mutation(api.bench.startRun, { config: eagerConfig });
    expect(first.ok).toBe(true);
    const second = await t.mutation(api.bench.startRun, {
      config: eagerConfig,
    });
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
    expect(await aggregateCount()).toBe(0);
  });

  test("resetAll reports partial_reset while rows are left to delete", async () => {
    // `resetAll` deletes at most 1000 rows per table per call and the cron chain
    // re-runs it on "partial_reset", so a table at exactly the batch size has to
    // stop and report rather than claim the deployment is clean.
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("benchRuns", {
        status: "done",
        config: eagerConfig,
        createdAtMs: 0,
        progress: {
          opsCommitted: 0,
          lastQueueRows: 0,
          lastQueueOperations: 0,
          lastQueueChangeAtMs: 0,
        },
      });
      for (let i = 0; i < 1000; i++) {
        await ctx.db.insert("benchQueueSamples", {
          runId,
          atMs: i,
          rows: 0,
          operations: 0,
          opsCommitted: 0,
          bytes: 0,
          truncated: false,
        });
      }
    });

    expect(await t.mutation(internal.bench.resetAll)).toBe("partial_reset");
    // The samples went, and the run it stopped short of is still there.
    const left = await t.run(async (ctx) => ({
      samples: (await ctx.db.query("benchQueueSamples").collect()).length,
      runs: (await ctx.db.query("benchRuns").collect()).length,
    }));
    expect(left).toEqual({ samples: 0, runs: 1 });
    // The next pass has less than a batch to do and finishes the job.
    expect(await t.mutation(internal.bench.resetAll)).toBe("all_reset");
    expect(await t.query(api.bench.listRuns, {})).toHaveLength(0);
  });

  test("resetAll reports partial_reset while ops are still queued", async () => {
    // `clearAll` throws PENDING_OPERATIONS while the queue is non-empty, so the
    // tables are emptied but the aggregate is left for a later pass.
    await t.mutation(components.benchAggregate.public.enqueue, {
      operation: { type: "insert", key: 1, value: "a", namespace: "hot" },
    });

    expect(await t.mutation(internal.bench.resetAll)).toBe("partial_reset");
    expect(await t.query(api.bench.listRuns, {})).toHaveLength(0);

    // Once the worker has drained, the same call gets all the way through.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.mutation(internal.bench.resetAll)).toBe("all_reset");
    expect(await aggregateCount()).toBe(0);
  });

  test("cancelSuite cancels a pending run and finalize keeps it canceled", async () => {
    const started = await t.mutation(api.bench.startSuite, {
      config: eagerConfig,
      repeats: 2,
    });
    if (!started.ok) throw new Error("expected the suite to start");

    // The run hasn't been prepared yet, so it isn't "enqueuing" and the cancel
    // is terminal: status "canceled", with finalize scheduled.
    await t.mutation(api.bench.cancelSuite, { suiteId: started.suiteId });
    const [canceled] = await t.query(api.bench.listRuns, {});
    expect(canceled.status).toBe("canceled");

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [finalized] = await t.query(api.bench.listRuns, {});
    // Still canceled rather than "failed", and finalize suppresses the "ops
    // never landed" complaint: a cancelled run losing its ops isn't a defect.
    expect(finalized.status).toBe("canceled");
    expect(finalized.errors).toBeUndefined();
    expect(finalized.results?.ops.committed).toBe(0);
    expect(finalized.results?.ops.failed).toBe(100);
  });

  test("cancelSuite leaves a draining queued run to finish its tail", async () => {
    const started = await t.mutation(api.bench.startSuite, {
      config: { ...eagerConfig, timeoutMs: 60 * 60 * 1000 },
      repeats: 2,
    });
    if (!started.ok) throw new Error("expected the suite to start");
    // A suite's first run is the queued one. Drive it into "enqueuing" so the
    // cancel hits the branch that can't just stop: enqueued ops can't be
    // un-enqueued, so the run goes to "draining" and finalizes only once the
    // watcher sees the queue empty.
    const [pending] = await t.query(api.bench.listRuns, {});
    expect(pending.config.mode).toBe("async");
    await t.mutation(internal.bench.prepare, { runId: pending._id });

    await t.mutation(api.bench.cancelSuite, { suiteId: started.suiteId });
    const [draining] = await t.query(api.bench.listRuns, {});
    expect(draining.status).toBe("draining");
    // No finalize was scheduled, so nothing has been written yet.
    expect(draining.results).toBeUndefined();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [done] = await t.query(api.bench.listRuns, {});
    expect(done.results).toBeDefined();
    // The suite stays canceled and never starts its remaining runs.
    const suites = await t.query(api.bench.listSuites, {});
    expect(suites[0]).toMatchObject({ status: "canceled" });
    expect(await t.query(api.bench.listRuns, {})).toHaveLength(1);
  });

  describe("suites", () => {
    test("scheduleSlot alternates the two sides across repeats", () => {
      // Q,E,Q,E,Q,E — not Q,Q,Q,E,E,E. Drift over the suite's lifetime then
      // lands on both sides equally.
      expect([0, 1, 2, 3, 4, 5].map(scheduleSlot)).toEqual([
        { mode: "async", repeatIndex: 0 },
        { mode: "eager", repeatIndex: 0 },
        { mode: "async", repeatIndex: 1 },
        { mode: "eager", repeatIndex: 1 },
        { mode: "async", repeatIndex: 2 },
        { mode: "eager", repeatIndex: 2 },
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
      });
      if (!started.ok) throw new Error("expected the suite to start");

      const suites = await t.query(api.bench.listSuites, {});
      expect(suites).toHaveLength(1);
      // Cursor advanced past the run it just started, and no further.
      expect(suites[0]).toMatchObject({
        cursor: 1,
        repeats: 2,
        status: "running",
      });
      const runs = await t.query(api.bench.listRuns, {});
      expect(runs).toHaveLength(1);
      // Queued goes first, so the eager side never measures a backlog the
      // queued side left behind.
      expect(runs[0]).toMatchObject({
        suiteId: started.suiteId,
        repeatIndex: 0,
      });
      expect(runs[0].config.mode).toBe("async");
    });

    test("a suite runs every repeat and then marks itself done", async () => {
      const started = await t.mutation(api.bench.startSuite, {
        // The queued side waits on the batch worker, whose monitor schedules
        // itself minutes out, so give the watchdog room.
        config: { ...eagerConfig, timeoutMs: 60 * 60 * 1000 },
        repeats: 3,
      });
      if (!started.ok) throw new Error("expected the suite to start");
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      // Both sides x 3 repeats.
      const suites = await t.query(api.bench.listSuites, {});
      expect(suites[0]).toMatchObject({ status: "done", cursor: 6 });
      const runs = await t.query(api.bench.listRuns, {});
      expect(runs).toHaveLength(6);
      expect(runs.every((r) => r.suiteId === started.suiteId)).toBe(true);
      expect(
        runs.map((r) => r.repeatIndex).sort((a, b) => (a ?? 0) - (b ?? 0)),
      ).toEqual([0, 0, 1, 1, 2, 2]);
      // Every run produced results, so the dashboard has 3 samples per side.
      expect(runs.every((r) => r.results !== undefined)).toBe(true);
    });

    test("the dashboard's per-suite reads: a count and one suite's runs", async () => {
      const started = await t.mutation(api.bench.startSuite, {
        config: { ...eagerConfig, timeoutMs: 60 * 60 * 1000 },
        repeats: 2,
      });
      if (!started.ok) throw new Error("expected the suite to start");
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      // The picker's done/total comes off this count, so the fat run documents
      // never have to cross the wire for a suite that isn't on screen.
      const [suite] = await t.query(api.bench.listSuites, {});
      expect(suite.doneRuns).toBe(4);

      const runs = await t.query(api.bench.listSuiteRuns, {
        suiteId: started.suiteId,
      });
      expect(runs.map((r) => [r.config.mode, r.repeatIndex])).toEqual([
        ["async", 0],
        ["eager", 0],
        ["async", 1],
        ["eager", 1],
      ]);
      expect(await t.query(api.bench.latestRunId)).toBe(runs[3]._id);
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
      });
      if (!started.ok) throw new Error("expected the suite to start");
      await t.mutation(api.bench.cancelSuite, { suiteId: started.suiteId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const suites = await t.query(api.bench.listSuites, {});
      expect(suites[0]).toMatchObject({ status: "canceled" });
      // The first run was already in flight; repeats 2 and 3 never started.
      expect(await t.query(api.bench.listRuns, {})).toHaveLength(1);
    });

    test("runs both sides, queued batched and eager plain", async () => {
      const started = await t.mutation(api.bench.startSuite, {
        config: { ...eagerConfig, timeoutMs: 60 * 60 * 1000 },
        repeats: 2,
      });
      if (!started.ok) throw new Error("expected the suite to start");
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const suites = await t.query(api.bench.listSuites, {});
      expect(suites[0]).toMatchObject({ status: "done", cursor: 4 });

      const runs = await t.query(api.bench.listRuns, {});
      expect(runs).toHaveLength(4);
      // Alternating, oldest first.
      expect(
        [...runs]
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
          .map((r) => [r.config.mode, r.repeatIndex]),
      ).toEqual([
        ["async", 0],
        ["eager", 0],
        ["async", 1],
        ["eager", 1],
      ]);
      // Queued always batches; eager has no enqueue call to make.
      for (const run of runs) {
        expect(run.config.writeApi).toBe(
          run.config.mode === "async" ? "batch" : undefined,
        );
      }
      expect(runs.every((r) => r.results !== undefined)).toBe(true);
    });

    test("resetAll clears suites along with their runs", async () => {
      const started = await t.mutation(api.bench.startSuite, {
        config: eagerConfig,
        repeats: 2,
      });
      if (!started.ok) throw new Error("expected the suite to start");
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(await t.mutation(internal.bench.resetAll)).toBe("all_reset");
      expect(await t.query(api.bench.listSuites, {})).toHaveLength(0);
      expect(await t.query(api.bench.listRuns, {})).toHaveLength(0);
    });
  });

  test("an async run enqueues, drains, and reaches the same count", async () => {
    const started = await t.mutation(api.bench.startRun, {
      config: {
        ...eagerConfig,
        mode: "async",
        // The queued path waits on the batch worker, whose monitor schedules
        // itself minutes out. `runAllTimers` jumps virtual time to the last
        // timer, so a realistic `timeoutMs` would trip the run's own watchdog
        // before it could finish.
        timeoutMs: 60 * 60 * 1000,
      },
      label: "async-smoke",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    // Drains the run's jobs and the aggregate's batch worker alike.
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.query(api.bench.getRun, { runId: started.runId });
    expect(run?.status).toBe("done");
    expect(run?.results?.ops.committed).toBe(100);
    expect(run?.results?.jobs.failed).toBe(0);

    // The queue is empty once the worker catches up, so an eager read goes
    // through and sees every operation.
    expect(await aggregateCount()).toBe(100);
  });

  test("a batched queued run lands the same ops for less work per op", async () => {
    // `enqueueBatch` hands the component one call per transaction instead of
    // `opsPerMutation` of them, and each of those per-op calls re-reads and
    // rewrites the row it is appending to. So the batched run must do strictly
    // fewer database queries per op — that saving is the reason for the option.
    async function runWork(writeApi: "perOp" | "batch") {
      const started = await t.mutation(api.bench.startRun, {
        config: {
          ...eagerConfig,
          mode: "async",
          writeApi,
          timeoutMs: 60 * 60 * 1000,
        },
        label: `async-${writeApi}`,
      });
      if (!started.ok) throw new Error(`expected the ${writeApi} run to start`);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const run = await t.query(api.bench.getRun, { runId: started.runId });
      expect(run?.status).toBe("done");
      expect(run?.results?.ops.committed).toBe(100);
      expect(run?.results?.jobs.failed).toBe(0);
      // Same data either way, so the aggregate agrees at the end of each run.
      expect(await aggregateCount()).toBe(100);
      await t.mutation(internal.bench.resetAll, {});
      return run!.results!.work;
    }

    const perOp = await runWork("perOp");
    const batch = await runWork("batch");
    expect(batch.databaseQueriesPerOp).toBeLessThan(perOp.databaseQueriesPerOp);
  });
});

/**
 * Benchmark comparing the aggregate's queued ("async") write path against the
 * synchronous ("eager") one.
 *
 * `Date.now()` is frozen for a whole transaction, so no mutation can time
 * itself: the run fans out with the scheduler and reads the platform's own
 * `_scheduled_functions` timings instead. `getTransactionMetrics()` needs no
 * clock at all, which makes documents-and-bytes-per-op the most trustworthy
 * number here.
 *
 * While a queued run is draining, `assertNoPendingOperations` makes every eager
 * write, every non-stale read, and even `clear` throw `PENDING_OPERATIONS` on
 * this component — hence the dedicated aggregate instance and one run at a time.
 */

import { DirectAggregate } from "@convex-dev/aggregate";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { resetStatusValidator } from "./utils/resetStatus";
import {
  allShards,
  burstDelayMs,
  classifyError,
  consistencyCurve,
  downsample,
  histAdd,
  histInit,
  laneCount,
  laneDelayMs,
  laneStartDelayMs,
  MAX_CURVE_POINTS,
  MAX_FAN_OUT,
  maxOverlap,
  planWriteJob,
  summarize,
  summarizeError,
  totalWriteJobs,
  validateConfig,
  type Hist,
} from "./utils/benchMath";
import {
  vBenchConfig,
  vPendingOperationsStats,
  vRunStatus,
  vWriteApi,
  type BenchConfig,
  type BenchMode,
  type BenchResults,
} from "./utils/benchTypes";

const benchAggregate = new DirectAggregate<{
  Key: number;
  Id: string;
  Namespace: string;
}>(components.benchAggregate);

/** The batch worker's default, which `enqueueOperation` doesn't override. */
const WORKER_MONITOR_LAG_MS = 60_000;

const SAMPLE_INTERVAL_MS = 250;
const WATCH_INTERVAL_MS = 250;
/** `clear` schedules async node cleanup, so let it settle before writing. */
const PREPARE_SETTLE_MS = 250;
// Must exceed the worker's monitor lag: a fully idle loop waits for a ping or
// the 60s monitor, so a still queue is not necessarily a stuck one.
const STALL_MS = 2 * WORKER_MONITOR_LAG_MS;
const MAX_TICKS = 20_000;
// Job rows a single pass will read, for `watch` and `finalize` alike. A run with
// more job transactions than this undercounts its committed ops and the watchdog
// ends it on timeoutMs.
const MAX_JOB_ROWS = 8_000;

/** Upper bound on a suite's repeats, so one suite can't schedule unboundedly. */
const MAX_REPEATS = 10;
/** The two sides of every comparison, in the order they interleave. */
const MODES = ["async", "eager"] as const;
/** Run rows one suite can hold, plus slack, as the bound on per-suite reads. */
const SUITE_RUN_ROWS = MAX_REPEATS * MODES.length + 4;
const SUITE_ADVANCE_RETRY_MS = 1_000;
// Long enough to outlast the worker's monitor lag before giving up on the suite.
const SUITE_ADVANCE_MAX_ATTEMPTS = 120;

const ACTIVE_STATUSES = [
  "pending",
  "preparing",
  "enqueuing",
  "draining",
  "finalizing",
] as const;

type ScheduledDoc = {
  scheduledTime: number;
  completedTime?: number;
  state:
    | { kind: "pending" }
    | { kind: "inProgress" }
    | { kind: "success" }
    | { kind: "failed"; error: string }
    | { kind: "canceled" };
};

/**
 * Depth of the queued-write backlog. The client deliberately doesn't expose it —
 * only something measuring the queue needs it — so the benchmark calls
 * `inspect.queueStats` itself.
 */
async function queueStats(
  ctx: QueryCtx,
  opts: { limit?: number; includeWorker: boolean },
) {
  return await ctx.runQuery(components.benchAggregate.inspect.queueStats, {
    limit: opts.limit,
    includeWorker: opts.includeWorker,
  });
}

/**
 * The same read from a mutation, off a stale snapshot. That's the only correct
 * choice for a poller: a live read would take a read dependency on
 * `pendingOperations` and OCC-conflict with the enqueuers it is measuring.
 */
async function staleQueueStats(
  ctx: MutationCtx,
  opts: { limit?: number; includeWorker: boolean },
) {
  return await ctx.runQuery(
    components.benchAggregate.inspect.queueStats,
    { limit: opts.limit, includeWorker: opts.includeWorker },
    { useStaleSnapshot: true },
  );
}

// ---------------------------------------------------------------- queries

export const canStart = query({
  args: {},
  returns: v.object({
    canStart: v.boolean(),
    reason: v.optional(
      v.union(v.literal("run_in_progress"), v.literal("pending_ops")),
    ),
    activeRunId: v.optional(v.id("benchRuns")),
    queue: vPendingOperationsStats,
  }),
  handler: async (ctx) => {
    const queue = await queueStats(ctx, { includeWorker: false });
    const active = await findActiveRun(ctx);
    if (active) {
      return {
        canStart: false,
        reason: "run_in_progress" as const,
        activeRunId: active._id,
        queue,
      };
    }
    if (queue.rows > 0) {
      return { canStart: false, reason: "pending_ops" as const, queue };
    }
    return { canStart: true, queue };
  },
});

export const getRun = query({
  args: { runId: v.id("benchRuns") },
  handler: async (ctx, { runId }) => await ctx.db.get("benchRuns", runId),
});

export const listRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    await ctx.db
      .query("benchRuns")
      .order("desc")
      .take(limit ?? 25),
});

/**
 * The newest run, whichever suite it belongs to — the page's fallback focus when
 * nothing is in flight. Only the id: `getRun` fetches the document.
 */
export const latestRunId = query({
  args: {},
  returns: v.union(v.id("benchRuns"), v.null()),
  handler: async (ctx) => {
    const run = await ctx.db.query("benchRuns").order("desc").first();
    return run?._id ?? null;
  },
});

/** The runs of one comparison, oldest first so repeat order reads naturally. */
export const listSuiteRuns = query({
  args: { suiteId: v.id("benchSuites") },
  handler: async (ctx, { suiteId }) => {
    const runs = await ctx.db
      .query("benchRuns")
      .withIndex("by_suite", (q) => q.eq("suiteId", suiteId))
      .take(SUITE_RUN_ROWS);
    return runs.sort((a, b) => a.createdAtMs - b.createdAtMs);
  },
});

/**
 * Past comparisons, newest first, each with how many of its runs have results.
 *
 * The count is taken here rather than by shipping the runs to the client: a
 * finished run carries a downsampled consistency curve and three histograms with
 * their raw buckets, and `watch` patches the active run four times a second, so a
 * subscription holding those documents would resend all of them every tick. This
 * reads them and returns a number.
 */
export const listSuites = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const suites = await ctx.db
      .query("benchSuites")
      .order("desc")
      .take(limit ?? 10);
    return await Promise.all(
      suites.map(async (suite) => {
        const runs = await ctx.db
          .query("benchRuns")
          .withIndex("by_suite", (q) => q.eq("suiteId", suite._id))
          .take(SUITE_RUN_ROWS);
        return {
          ...suite,
          doneRuns: runs.filter((run) => run.results !== undefined).length,
        };
      }),
    );
  },
});

/**
 * Operations not yet applied to the aggregate, over time — every run of a
 * comparison on one elapsed-time axis. It's the quantity that means the same
 * thing in both modes, so the width of a curve is that run's time to
 * consistency. All repeats are returned: the family of curves per mode *is* the
 * run-to-run spread.
 */
export const getConsistencySeries = query({
  args: { suiteId: v.id("benchSuites") },
  handler: async (ctx, { suiteId }) => {
    const suite = await ctx.db.get("benchSuites", suiteId);
    if (!suite) return [];
    const runs = await ctx.db
      .query("benchRuns")
      .withIndex("by_suite", (q) => q.eq("suiteId", suiteId))
      .take(SUITE_RUN_ROWS);

    const series = [];
    for (const mode of MODES) {
      const mine = runs
        .filter((r) => r.config.mode === mode)
        .sort((a, b) => (a.repeatIndex ?? 0) - (b.repeatIndex ?? 0));
      for (const run of mine) {
        const cell = {
          mode,
          repeatIndex: run.repeatIndex ?? 0,
          totalOps: run.config.totalOps,
        };
        // A finished run carries the curve `finalize` reconstructed from the
        // scheduler's own completion times, which is the accurate one.
        if (run.results?.consistency?.length) {
          series.push({ ...cell, points: run.results.consistency });
          continue;
        }

        // Otherwise build it from the samples as they stand — the in-flight
        // path, and the one old runs fall back to.
        const startedAt = run.enqueueStartedAtMs ?? run.createdAtMs;
        const samples = await ctx.db
          .query("benchQueueSamples")
          .withIndex("by_run_at", (q) => q.eq("runId", run._id))
          .take(4000);
        if (samples.length === 0) continue;
        const done = run.status === "done";
        series.push({
          ...cell,
          points: downsample(
            consistencyCurve({
              totalOps: run.config.totalOps,
              startedAtMs: startedAt,
              endedAtMs: done
                ? (run.drainEndedAtMs ?? run.finishedAtMs)
                : undefined,
              samples,
            }),
            MAX_CURVE_POINTS,
          ),
        });
      }
    }
    return series;
  },
});

// --------------------------------------------------------------- mutations

export const startRun = mutation({
  args: { config: vBenchConfig, label: v.optional(v.string()) },
  returns: v.union(
    v.object({ ok: v.literal(true), runId: v.id("benchRuns") }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal("run_in_progress"),
        v.literal("pending_ops"),
        v.literal("invalid_config"),
      ),
      detail: v.string(),
    }),
  ),
  handler: async (ctx, { config, label }) => {
    const invalid = validateConfig(config);
    if (invalid) {
      return {
        ok: false as const,
        reason: "invalid_config" as const,
        detail: invalid,
      };
    }
    const blocked = await startBlocked(ctx);
    if (blocked) return blocked;

    const runId = await insertRun(ctx, { config, label });
    return { ok: true as const, runId };
  },
});

/**
 * The interleaved schedule a suite walks: queued, eager, queued, eager, so drift
 * in the deployment over the suite's lifetime lands on both sides equally rather
 * than all on whichever side ran last.
 */
export function scheduleSlot(index: number): {
  mode: BenchMode;
  repeatIndex: number;
} {
  return {
    mode: MODES[index % MODES.length],
    repeatIndex: Math.floor(index / MODES.length),
  };
}

/**
 * The config one side of the comparison actually runs. Queued always batches,
 * because batching is how you would use the queued path — the per-op API re-reads
 * and rewrites the row it appends to on every call.
 */
function runConfig(config: BenchConfig, mode: BenchMode): BenchConfig {
  return mode === "async"
    ? { ...config, mode, writeApi: "batch" }
    : { ...config, mode, writeApi: undefined };
}

export const startSuite = mutation({
  args: {
    config: vBenchConfig,
    repeats: v.number(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), suiteId: v.id("benchSuites") }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal("run_in_progress"),
        v.literal("pending_ops"),
        v.literal("invalid_config"),
      ),
      detail: v.string(),
    }),
  ),
  handler: async (ctx, { config, repeats }) => {
    const reject = (detail: string) => ({
      ok: false as const,
      reason: "invalid_config" as const,
      detail,
    });
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_REPEATS) {
      return reject(`repeats must be an integer in 1..${MAX_REPEATS}`);
    }
    // Both sides run the same shape of work, so validating either validates the
    // comparison.
    for (const mode of MODES) {
      const invalid = validateConfig(runConfig(config, mode));
      if (invalid) return reject(invalid);
    }

    const blocked = await startBlocked(ctx);
    if (blocked) return blocked;

    const suiteId = await ctx.db.insert("benchSuites", {
      config,
      repeats,
      cursor: 0,
      status: "running",
      createdAtMs: Date.now(),
    });
    await startNextSuiteRun(ctx, suiteId);
    return { ok: true as const, suiteId };
  },
});

export const cancelSuite = mutation({
  args: { suiteId: v.id("benchSuites") },
  returns: v.null(),
  handler: async (ctx, { suiteId }) => {
    const suite = await ctx.db.get("benchSuites", suiteId);
    if (!suite || suite.status !== "running") return null;
    await ctx.db.patch("benchSuites", suiteId, {
      status: "canceled",
      finishedAtMs: Date.now(),
    });
    // Cancel whichever run of the suite is still in flight; the suite being
    // "canceled" stops `advanceSuite` from starting the next one.
    const runs = await ctx.db
      .query("benchRuns")
      .withIndex("by_suite", (q) => q.eq("suiteId", suiteId))
      .take(SUITE_RUN_ROWS);
    for (const run of runs) {
      if ((ACTIVE_STATUSES as readonly string[]).includes(run.status)) {
        await cancelRunHandler(ctx, run._id);
      }
    }
    return null;
  },
});

/**
 * Starts the next run of a suite, or finishes the suite when the schedule is
 * exhausted. Reschedules itself while the previous run's queue is still
 * draining — `startRun`'s guards apply to suite runs too.
 */
export const advanceSuite = internalMutation({
  args: { suiteId: v.id("benchSuites"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { suiteId, attempt = 0 }) => {
    const suite = await ctx.db.get("benchSuites", suiteId);
    if (!suite || suite.status !== "running") return null;

    if (suite.cursor >= MODES.length * suite.repeats) {
      await ctx.db.patch("benchSuites", suiteId, {
        status: "done",
        finishedAtMs: Date.now(),
      });
      return null;
    }

    const blocked = await startBlocked(ctx);
    if (blocked) {
      if (attempt >= SUITE_ADVANCE_MAX_ATTEMPTS) {
        await ctx.db.patch("benchSuites", suiteId, {
          status: "canceled",
          finishedAtMs: Date.now(),
        });
        return null;
      }
      await ctx.scheduler.runAfter(
        SUITE_ADVANCE_RETRY_MS,
        internal.bench.advanceSuite,
        {
          suiteId,
          attempt: attempt + 1,
        },
      );
      return null;
    }

    await startNextSuiteRun(ctx, suiteId);
    return null;
  },
});

async function startNextSuiteRun(ctx: MutationCtx, suiteId: Id<"benchSuites">) {
  const suite = await ctx.db.get("benchSuites", suiteId);
  if (!suite) return;
  const { mode, repeatIndex } = scheduleSlot(suite.cursor);
  await insertRun(ctx, {
    config: runConfig(suite.config, mode),
    label: `${mode === "async" ? "queued" : "eager"} · rep ${repeatIndex + 1}/${suite.repeats}`,
    suiteId,
    repeatIndex,
  });
  await ctx.db.patch("benchSuites", suiteId, {
    cursor: Math.min(suite.cursor + 1, MODES.length * suite.repeats),
  });
}

/**
 * Shared by `startRun` and the suite driver. Refuses for BOTH modes: an eager run
 * would throw PENDING_OPERATIONS on its first write, and a queued run would be
 * measuring someone else's backlog.
 */
async function startBlocked(ctx: MutationCtx) {
  const active = await findActiveRun(ctx);
  if (active) {
    return {
      ok: false as const,
      reason: "run_in_progress" as const,
      detail: `run ${active._id} is ${active.status}`,
    };
  }
  const queue = await staleQueueStats(ctx, { includeWorker: false });
  if (queue.rows > 0) {
    return {
      ok: false as const,
      reason: "pending_ops" as const,
      detail:
        `${queue.operations} operation(s) across ${queue.rows} transaction(s) are still queued. ` +
        `The worker drains on ping or within ${WORKER_MONITOR_LAG_MS / 1000}s.`,
    };
  }
  return null;
}

async function insertRun(
  ctx: MutationCtx,
  {
    config,
    label,
    suiteId,
    repeatIndex,
  }: {
    config: BenchConfig;
    label?: string;
    suiteId?: Id<"benchSuites">;
    repeatIndex?: number;
  },
): Promise<Id<"benchRuns">> {
  const now = Date.now();
  const runId = await ctx.db.insert("benchRuns", {
    label,
    suiteId,
    repeatIndex,
    status: "pending",
    config,
    createdAtMs: now,
    progress: {
      opsCommitted: 0,
      lastQueueRows: 0,
      lastQueueOperations: 0,
      lastQueueChangeAtMs: now,
    },
  });
  await ctx.scheduler.runAfter(0, internal.bench.prepare, { runId });
  return runId;
}

async function cancelRunHandler(ctx: MutationCtx, runId: Id<"benchRuns">) {
  const run = await ctx.db.get("benchRuns", runId);
  if (!run) throw new Error("no such run");

  // Cancelling the pending job in each lane is enough to stop the run: a lane
  // only ever schedules from inside a job, so killing that job ends the chain.
  let canceledJobs = 0;
  const lanes = await ctx.db
    .query("benchLanes")
    .withIndex("by_run_lane", (q) => q.eq("runId", runId))
    .take(MAX_FAN_OUT);
  for (const lane of lanes) {
    const doc = await getScheduled(ctx, lane.scheduledFnId);
    if (doc?.state.kind === "pending") {
      await ctx.scheduler.cancel(
        lane.scheduledFnId as Id<"_scheduled_functions">,
      );
      canceledJobs++;
    }
  }

  // A queued run's tail can't be cancelled: there's no way to un-enqueue ops
  // or to force a drain. All we can do is stop scheduling new work and wait.
  const status =
    run.config.mode === "async" && run.status === "enqueuing"
      ? ("draining" as const)
      : ("canceled" as const);
  await ctx.db.patch("benchRuns", runId, { status });
  if (status === "canceled") {
    await ctx.scheduler.runAfter(0, internal.bench.finalize, { runId });
  }
  return { canceledJobs, status };
}

// ------------------------------------------------------- internal: lifecycle

export const prepare = internalMutation({
  args: { runId: v.id("benchRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run || run.status !== "pending") return null;
    await ctx.db.patch("benchRuns", runId, { status: "preparing" });

    for (const shard of allShards(run.config)) {
      await benchAggregate.clear(ctx, {
        namespace: shard,
        maxNodeSize: run.config.maxNodeSize,
        rootLazy: run.config.rootLazy,
      });
    }

    await ctx.db.patch("benchRuns", runId, {
      status: "enqueuing",
      enqueueStartedAtMs: Date.now(),
      expectedJobs: totalWriteJobs(run.config),
    });
    await ctx.scheduler.runAfter(PREPARE_SETTLE_MS, internal.bench.seedLanes, {
      runId,
    });
    await ctx.scheduler.runAfter(0, internal.bench.sampleQueue, {
      runId,
      tick: 0,
    });
    await ctx.scheduler.runAfter(WATCH_INTERVAL_MS, internal.bench.watch, {
      runId,
      tick: 0,
    });
    return null;
  },
});

/**
 * Deals the first job into each lane. Everything after this is scheduled by the
 * jobs themselves, one successor per commit, so the number of write transactions
 * in flight never exceeds the configured fan-out.
 */
export const seedLanes = internalMutation({
  args: { runId: v.id("benchRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run || run.status !== "enqueuing") return null;
    const config = run.config;
    // Seeding happens PREPARE_SETTLE_MS after t0, and a seed can belong to a
    // later burst, so the burst schedule applies here too.
    const elapsedMs = Date.now() - (run.enqueueStartedAtMs ?? run.createdAtMs);

    for (let lane = 0; lane < laneCount(config); lane++) {
      const job = planWriteJob(config, lane);
      if (!job) break;
      const scheduledFnId = await ctx.scheduler.runAfter(
        Math.max(
          laneStartDelayMs(config, lane),
          burstDelayMs(config, job.seq, elapsedMs),
        ),
        internal.bench.writeJob,
        {
          runId,
          lane,
          seq: job.seq,
          shard: job.shard,
          keyBase: job.keyBase,
          ops: job.ops,
          async: config.mode === "async",
          writeApi: config.writeApi ?? "perOp",
        },
      );
      await ctx.db.insert("benchLanes", {
        runId,
        lane,
        scheduledFnId,
        jobsSpawned: 1,
      });
    }
    return null;
  },
});

export const writeJob = internalMutation({
  args: {
    runId: v.id("benchRuns"),
    lane: v.number(),
    seq: v.number(),
    shard: v.string(),
    keyBase: v.number(),
    ops: v.number(),
    async: v.boolean(),
    writeApi: vWriteApi,
  },
  returns: v.null(),
  handler: async (
    ctx,
    { runId, lane, seq, shard, keyBase, ops, async, writeApi },
  ) => {
    // Null if a reset deleted the run out from under this job.
    const plan = await staleRunPlan(ctx, runId);
    if (!plan) return null;
    const config = plan.config;

    const startedAtMs = Date.now();
    const fnId = await scheduledFnId(ctx);
    let ok = true;
    let errorCode: string | undefined;
    const item = (i: number) => {
      const key = keyBase + i;
      return {
        namespace: shard,
        key,
        id: `${runId}:${seq}:${i}`,
        sumValue: key,
      };
    };
    try {
      if (async && writeApi === "batch") {
        // One component call for the whole transaction, so the queue is appended
        // to once instead of `ops` times. There is no eager `insertBatch`, so an
        // eager job falls through to the per-op loop whatever `writeApi` says.
        await benchAggregate.enqueueBatch(
          ctx,
          Array.from({ length: ops }, (_, i) => ({
            type: "insert" as const,
            ...item(i),
          })),
        );
      } else {
        for (let i = 0; i < ops; i++) {
          await benchAggregate.insert(
            ctx,
            item(i),
            // Triggers can't be used here: they don't forward opts, so a
            // triggered write is always eager.
            { async },
          );
        }
      }
    } catch (e) {
      if (e instanceof ConvexError) {
        ok = false;
        errorCode = String(e.data?.code ?? "UNKNOWN");
      } else {
        throw e; // unexpected — let it surface as a failed scheduled function
      }
    }

    await ctx.db.insert("benchJobs", {
      runId,
      seq,
      ops: ok ? ops : 0,
      scheduledFnId: fnId,
      startedAtMs,
      metrics: await txnMetrics(ctx),
      errorCode,
    });

    // The lane's next job, scheduled in the transaction that finishes this one.
    // A ConvexError is a result, not a reason to stop — but an unexpected throw
    // rolls this back, leaving the lane's pointer on a failed scheduled function,
    // which is how `watch` sees the break.
    const next = planWriteJob(config, seq + laneCount(config));
    if (next) {
      // Trickle's arrival pacing or the next burst's slot; different scenarios,
      // so at most one is non-zero. `startedAtMs` is this transaction's frozen
      // clock, which is what `runAfter` is relative to, so the successor lands on
      // the grid rather than one service time past it.
      const delayMs = Math.max(
        laneDelayMs(config),
        burstDelayMs(config, next.seq, startedAtMs - plan.enqueueStartedAtMs),
      );
      await advanceLane(ctx, runId, lane, () =>
        ctx.scheduler.runAfter(delayMs, internal.bench.writeJob, {
          runId,
          lane,
          seq: next.seq,
          shard: next.shard,
          keyBase: next.keyBase,
          ops: next.ops,
          async,
          writeApi,
        }),
      );
    }
    return null;
  },
});

export const sampleQueue = internalMutation({
  args: { runId: v.id("benchRuns"), tick: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, tick }) => {
    // One stale-snapshot read for the whole sample: `watch` patches the run
    // document every tick, so a live sampler would OCC-conflict with it and lose
    // whole seconds of samples. See `runSampleState` for why it has to be one.
    const state = await ctx.runQuery(
      internal.bench.runSampleState,
      { runId },
      { useStaleSnapshot: true },
    );
    if (!state) return null;
    const active = state.status === "enqueuing" || state.status === "draining";
    if (!active || tick > MAX_TICKS) return null;

    await ctx.db.insert("benchQueueSamples", {
      runId,
      atMs: Date.now(),
      rows: state.queue.rows,
      operations: state.queue.operations,
      opsCommitted: state.opsCommitted,
      bytes: state.queue.bytes,
      truncated: state.queue.truncated,
    });
    await ctx.scheduler.runAfter(
      SAMPLE_INTERVAL_MS,
      internal.bench.sampleQueue,
      { runId, tick: tick + 1 },
    );
    return null;
  },
});

export const scheduledStates = internalQuery({
  args: { ids: v.array(v.string()) },
  returns: v.array(
    v.object({
      id: v.string(),
      scheduledTime: v.union(v.number(), v.null()),
      completedTime: v.union(v.number(), v.null()),
      kind: v.union(v.string(), v.null()),
      error: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { ids }) => {
    const docs = await Promise.all(
      ids.map((id) =>
        ctx.db.system.get(
          "_scheduled_functions",
          id as Id<"_scheduled_functions">,
        ),
      ),
    );
    return docs.map((doc, i) => ({
      id: ids[i],
      scheduledTime: doc?.scheduledTime ?? null,
      completedTime: doc?.completedTime ?? null,
      kind: doc?.state.kind ?? null,
      error: doc?.state.kind === "failed" ? doc.state.error : null,
    }));
  },
});

/**
 * Everything one queue sample records, read in a single transaction so it all
 * describes the same snapshot. A job's row and the ops it enqueued commit
 * together, so any snapshot holds both or neither; the consistency curve's
 * `totalOps - opsCommitted + operations` is then exact. Read as two queries the
 * committed total could run ahead of the queue by whatever landed in between,
 * and the curve dipped and rose with every sample.
 */
export const runSampleState = internalQuery({
  args: { runId: v.id("benchRuns") },
  returns: v.union(
    v.object({
      status: vRunStatus,
      opsCommitted: v.number(),
      queue: v.object({
        rows: v.number(),
        operations: v.number(),
        bytes: v.number(),
        truncated: v.boolean(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run) return null;
    const jobs = await ctx.db
      .query("benchJobs")
      .withIndex("by_run_seq", (q) => q.eq("runId", runId))
      .take(MAX_JOB_ROWS);
    const queue = await ctx.runQuery(
      components.benchAggregate.inspect.queueStats,
      { limit: 1024, includeWorker: false },
    );
    return {
      status: run.status,
      opsCommitted: jobs.reduce((total, job) => total + job.ops, 0),
      queue: {
        rows: queue.rows,
        operations: queue.operations,
        bytes: queue.bytes,
        truncated: queue.truncated,
      },
    };
  },
});

export const runPlanSnapshot = internalQuery({
  args: { runId: v.id("benchRuns") },
  returns: v.union(
    v.object({ config: vBenchConfig, enqueueStartedAtMs: v.number() }),
    v.null(),
  ),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run) return null;
    return {
      config: run.config,
      // The run's t0: what the burst schedule and the consistency curve are both
      // measured from.
      enqueueStartedAtMs: run.enqueueStartedAtMs ?? run.createdAtMs,
    };
  },
});

/**
 * The run's lane pointers and committed-op total, as a separate query so `watch`
 * can take them off a stale snapshot. Reading the job rows in the watch mutation
 * itself takes a read dependency on an index range the run appends to for its
 * whole enqueue phase, so every tick OCC-conflicts with the jobs it is measuring
 * — at fan-out 1 that froze `progress.opsCommitted` near zero for entire runs.
 */
export const runSnapshot = internalQuery({
  args: { runId: v.id("benchRuns") },
  returns: v.object({
    laneFnIds: v.array(v.string()),
    opsCommitted: v.number(),
  }),
  handler: async (ctx, { runId }) => {
    const lanes = await ctx.db
      .query("benchLanes")
      .withIndex("by_run_lane", (q) => q.eq("runId", runId))
      .take(MAX_FAN_OUT);
    const jobs = await ctx.db
      .query("benchJobs")
      .withIndex("by_run_seq", (q) => q.eq("runId", runId))
      .take(MAX_JOB_ROWS);
    return {
      laneFnIds: lanes.map((lane) => lane.scheduledFnId),
      opsCommitted: jobs.reduce((total, job) => total + job.ops, 0),
    };
  },
});

export const watch = internalMutation({
  args: { runId: v.id("benchRuns"), tick: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, tick }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run) return null;
    if (run.status !== "enqueuing" && run.status !== "draining") return null;
    if (tick > MAX_TICKS) return null;

    const now = Date.now();
    // Everything below comes off a stale snapshot, so the tick's only live read
    // is the run document it owns. See `runSnapshot`.
    const snapshot = await ctx.runQuery(
      internal.bench.runSnapshot,
      { runId },
      { useStaleSnapshot: true },
    );
    // One id per lane, not every id the run has scheduled, so this stays a
    // handful of reads however long the run is.
    const states = await ctx.runQuery(
      internal.bench.scheduledStates,
      { ids: snapshot.laneFnIds },
      { useStaleSnapshot: true },
    );
    // Pending or running means work in flight. Success means that lane scheduled
    // no successor; failed or canceled means its chain is broken. Either way,
    // nothing more is coming from it.
    const lanesRunning = states.filter(
      (s) => s.kind === "pending" || s.kind === "inProgress",
    ).length;

    // `watch` needs the worker's status for the drain-complete check below.
    const queue = await staleQueueStats(ctx, {
      limit: 1024,
      includeWorker: true,
    });
    const queueChanged =
      queue.operations !== run.progress.lastQueueOperations ||
      queue.rows !== run.progress.lastQueueRows;

    const progress = {
      ...run.progress,
      opsCommitted: snapshot.opsCommitted,
      lastQueueRows: queue.rows,
      lastQueueOperations: queue.operations,
      lastQueueChangeAtMs: queueChanged
        ? now
        : run.progress.lastQueueChangeAtMs,
    };

    // Every lane seeded and none still running. Off a stale snapshot, so this can
    // be a snapshot age late but never early: a job moves its lane's pointer onto
    // its successor in the transaction that schedules it.
    const enqueueDone =
      snapshot.laneFnIds.length >= laneCount(run.config) && lanesRunning === 0;

    const startedAt = run.enqueueStartedAtMs ?? run.createdAtMs;
    const timedOut = now - startedAt > run.config.timeoutMs;
    const stalled =
      run.status === "draining" &&
      queue.operations > 0 &&
      now - progress.lastQueueChangeAtMs > STALL_MS;
    if (timedOut || stalled) {
      await ctx.db.patch("benchRuns", runId, {
        status: "finalizing",
        progress,
        drainEndedAtMs: now,
        errors: [
          ...(run.errors ?? []),
          timedOut
            ? `run exceeded timeoutMs (${run.config.timeoutMs}ms)`
            : `drain stalled: ${queue.operations} ops unchanged for ${STALL_MS}ms`,
        ],
      });
      await ctx.scheduler.runAfter(0, internal.bench.finalize, { runId });
      return null;
    }

    if (run.status === "enqueuing" && enqueueDone) {
      await ctx.db.patch("benchRuns", runId, {
        status: "draining",
        enqueueEndedAtMs: now,
        progress,
      });
    } else if (run.status === "draining") {
      // An empty queue *is* consistency: the worker deletes a pendingOperations
      // row in the same transaction that applies its operations. So stamp the
      // moment it empties, whatever the worker's status doc says — the wait for
      // the worker to park afterwards isn't part of time-to-consistency.
      const consistentAt =
        run.drainEndedAtMs ?? (queue.rows === 0 ? now : undefined);
      if (consistentAt !== undefined && queue.worker !== "running") {
        await ctx.db.patch("benchRuns", runId, {
          status: "finalizing",
          drainEndedAtMs: consistentAt,
          workerParkedAtMs: now,
          progress,
        });
        await ctx.scheduler.runAfter(0, internal.bench.finalize, { runId });
        return null;
      }
      await ctx.db.patch("benchRuns", runId, {
        progress,
        drainEndedAtMs: consistentAt,
      });
    } else {
      await ctx.db.patch("benchRuns", runId, { progress });
    }

    await ctx.scheduler.runAfter(WATCH_INTERVAL_MS, internal.bench.watch, {
      runId,
      tick: tick + 1,
    });
    return null;
  },
});

// ------------------------------------------------------- internal: finalize

type Acc = {
  jobLatency: Hist;
  jobService: Hist;
  jobQueue: Hist;
  opsCommitted: number;
  jobsTotal: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsCanceled: number;
  documentsRead: number;
  documentsWritten: number;
  bytesRead: number;
  bytesWritten: number;
  databaseQueries: number;
  errorPendingOperations: number;
  errorOcc: number;
  errorLimit: number;
  errorOther: number;
  errorSamples: string[];
  intervals: Array<{ start: number; end: number }>;
};

export const finalize = internalMutation({
  args: { runId: v.id("benchRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run) return null;

    const jobs = await ctx.db
      .query("benchJobs")
      .withIndex("by_run_seq", (q) => q.eq("runId", runId))
      .take(MAX_JOB_ROWS);

    // A committed job records its own scheduled id. The lane pointers cover what
    // those can't: a job that threw committed no row at all.
    const lanes = await ctx.db
      .query("benchLanes")
      .withIndex("by_run_lane", (q) => q.eq("runId", runId))
      .take(MAX_FAN_OUT);
    const jobIds = jobs.flatMap((job) =>
      job.scheduledFnId ? [job.scheduledFnId] : [],
    );
    const laneIds = lanes
      .map((lane) => lane.scheduledFnId)
      .filter((id) => !jobIds.includes(id));
    const states = await ctx.runQuery(
      internal.bench.scheduledStates,
      { ids: [...jobIds, ...laneIds] },
      { useStaleSnapshot: true },
    );
    const byId = new Map(states.map((s) => [s.id, s]));

    const acc: Acc = {
      jobLatency: histInit(),
      jobService: histInit(),
      jobQueue: histInit(),
      opsCommitted: 0,
      jobsTotal: run.expectedJobs ?? totalWriteJobs(run.config),
      jobsSucceeded: 0,
      jobsFailed: 0,
      jobsCanceled: 0,
      documentsRead: 0,
      documentsWritten: 0,
      bytesRead: 0,
      bytesWritten: 0,
      databaseQueries: 0,
      errorPendingOperations: 0,
      errorOcc: 0,
      errorLimit: 0,
      errorOther: 0,
      errorSamples: [],
      intervals: [],
    };

    for (const s of states) {
      if (s.kind === "success") acc.jobsSucceeded++;
      else if (s.kind === "canceled") acc.jobsCanceled++;
      else if (s.kind === "failed") {
        acc.jobsFailed++;
        const cls = classifyError(s.error ?? "");
        if (cls === "pendingOperations") acc.errorPendingOperations++;
        else if (cls === "occSuspected") acc.errorOcc++;
        else if (cls === "limit") acc.errorLimit++;
        else acc.errorOther++;
        if (acc.errorSamples.length < 5 && s.error) {
          acc.errorSamples.push(summarizeError(s.error));
        }
      }
    }

    // The scheduler's clock puts the end of the enqueue phase at the last job's
    // commit. `watch` stamped it on the tick that noticed, off a stale snapshot,
    // which is a tick or two late; taken instead whenever every job has one.
    let lastCommitMs: number | undefined = jobs.length > 0 ? 0 : undefined;
    for (const job of jobs) {
      const sched = job.scheduledFnId ? byId.get(job.scheduledFnId) : undefined;
      if (sched?.scheduledTime != null && sched.completedTime != null) {
        acc.intervals.push({
          start: sched.scheduledTime,
          end: sched.completedTime,
        });
        histAdd(acc.jobLatency, sched.completedTime - sched.scheduledTime);
        histAdd(acc.jobService, sched.completedTime - job.startedAtMs);
        histAdd(acc.jobQueue, job.startedAtMs - sched.scheduledTime);
      }
      if (lastCommitMs !== undefined) {
        lastCommitMs =
          sched?.completedTime != null
            ? Math.max(lastCommitMs, sched.completedTime)
            : undefined;
      }
      acc.opsCommitted += job.ops;
      acc.documentsRead += job.metrics.documentsRead;
      acc.documentsWritten += job.metrics.documentsWritten;
      acc.bytesRead += job.metrics.bytesRead;
      acc.bytesWritten += job.metrics.bytesWritten;
      acc.databaseQueries += job.metrics.databaseQueries;
      if (job.errorCode === "PENDING_OPERATIONS") acc.errorPendingOperations++;
    }

    const samples = await ctx.db
      .query("benchQueueSamples")
      .withIndex("by_run_at", (q) => q.eq("runId", runId))
      .take(4000);
    let peakRows = 0;
    let peakOperations = 0;
    let peakBytes = 0;
    let peakTruncated = false;
    for (const s of samples) {
      peakRows = Math.max(peakRows, s.rows);
      peakOperations = Math.max(peakOperations, s.operations);
      peakBytes = Math.max(peakBytes, s.bytes);
      if (s.truncated) peakTruncated = true;
    }

    const enqueueStart = run.enqueueStartedAtMs ?? run.createdAtMs;
    const enqueueEnd =
      lastCommitMs ?? run.enqueueEndedAtMs ?? run.drainEndedAtMs ?? Date.now();
    // An eager run queues nothing, so it is consistent the moment its last write
    // commits. `watch` still spends a tick in "draining" before it stamps the
    // end, and that tick drew a flat tail on the curve past the point it had
    // reached zero and padded time-to-consistency by the same amount.
    const drainEnd =
      run.config.mode === "async"
        ? Math.max(run.drainEndedAtMs ?? enqueueEnd, enqueueEnd)
        : enqueueEnd;
    const enqueueSecs = Math.max(enqueueEnd - enqueueStart, 1) / 1000;
    const totalSecs = Math.max(drainEnd - enqueueStart, 1) / 1000;
    const timeToDrainMs = Math.max(drainEnd - enqueueEnd, 0);
    const ops = Math.max(acc.opsCommitted, 1);

    // Ops that never landed, whatever the reason. This is the check that matters:
    // a run can fail without anything in `run.errors`, which only carries the
    // watchdog's own complaints.
    const opsMissing = Math.max(run.config.totalOps - acc.opsCommitted, 0);
    const watchdogErrors = run.errors ?? [];
    // Only close the consistency curve at zero when everything actually landed,
    // or a run that lost most of its ops draws a cliff at the end of a curve
    // that never came down.
    const reachedConsistency =
      watchdogErrors.length === 0 &&
      run.status !== "canceled" &&
      opsMissing === 0;
    const jobErrors =
      acc.jobsFailed > 0
        ? [
            `${acc.jobsFailed} of ${acc.jobsTotal} jobs failed, ${opsMissing} of ${run.config.totalOps} ops never landed` +
              (acc.errorSamples[0] ? `: ${acc.errorSamples[0]}` : ""),
          ]
        : opsMissing > 0 && run.status !== "canceled"
          ? [`${opsMissing} of ${run.config.totalOps} ops never landed`]
          : [];
    const errors = [...watchdogErrors, ...jobErrors];
    const failed = errors.length > 0;

    const results: BenchResults = {
      ops: {
        attempted: run.config.totalOps,
        committed: acc.opsCommitted,
        failed: opsMissing,
      },
      jobs: {
        total: acc.jobsTotal,
        succeeded: acc.jobsSucceeded,
        failed: acc.jobsFailed,
        canceled: acc.jobsCanceled,
      },
      latency: {
        jobLatency: summarize(acc.jobLatency),
        jobService: summarize(acc.jobService),
        jobQueue: summarize(acc.jobQueue),
        perOpServiceMs: acc.jobService.sum / ops,
      },
      work: {
        documentsReadPerOp: acc.documentsRead / ops,
        documentsWrittenPerOp: acc.documentsWritten / ops,
        bytesReadPerOp: acc.bytesRead / ops,
        bytesWrittenPerOp: acc.bytesWritten / ops,
        databaseQueriesPerOp: acc.databaseQueries / ops,
      },
      throughput: {
        enqueueOpsPerSec: acc.opsCommitted / enqueueSecs,
        applyOpsPerSec:
          run.config.mode === "async"
            ? acc.opsCommitted / totalSecs
            : undefined,
      },
      drain: {
        timeToDrainMs,
        resolutionMs: run.config.mode === "async" ? WATCH_INTERVAL_MS : 0,
        exceededMonitorLag: timeToDrainMs > WORKER_MONITOR_LAG_MS,
        workerParkMs:
          run.workerParkedAtMs !== undefined
            ? Math.max(run.workerParkedAtMs - drainEnd, 0)
            : undefined,
      },
      queue: {
        peakRows,
        peakOperations,
        peakBytes,
        peakTruncated,
        samples: samples.length,
      },
      concurrency: {
        achieved: maxOverlap(acc.intervals),
        offered: run.config.fanOut,
      },
      consistency: downsample(
        consistencyCurve({
          totalOps: run.config.totalOps,
          startedAtMs: enqueueStart,
          endedAtMs: reachedConsistency ? drainEnd : undefined,
          samples,
        }),
        MAX_CURVE_POINTS,
      ),
      errors: {
        occSuspected: acc.errorOcc,
        pendingOperations: acc.errorPendingOperations,
        limit: acc.errorLimit,
        other: acc.errorOther,
        samples: acc.errorSamples,
      },
    };

    await ctx.db.patch("benchRuns", runId, {
      status:
        run.status === "canceled" ? "canceled" : failed ? "failed" : "done",
      // Refined above; the client's time-to-consistency reads these.
      enqueueEndedAtMs: enqueueEnd,
      drainEndedAtMs: drainEnd,
      finishedAtMs: Date.now(),
      errors: errors.length > 0 ? errors : undefined,
      results,
    });
    // A suite's runs are strictly sequential: the next one starts only once this
    // one's results are written, so they never contend for the aggregate.
    if (run.suiteId) {
      await ctx.scheduler.runAfter(0, internal.bench.advanceSuite, {
        suiteId: run.suiteId,
      });
    }
    return null;
  },
});

// ------------------------------------------------------------------ helpers

async function findActiveRun(ctx: { db: QueryCtx["db"] }) {
  for (const status of ACTIVE_STATUSES) {
    const found = await ctx.db
      .query("benchRuns")
      .withIndex("by_status", (q) => q.eq("status", status))
      .first();
    if (found) return found;
  }
  return null;
}

const ZERO_METRICS = {
  documentsRead: 0,
  documentsWritten: 0,
  bytesRead: 0,
  bytesWritten: 0,
  databaseQueries: 0,
};

/**
 * `ctx.meta` is backed by syscalls convex-test doesn't implement, so under test
 * these degrade to zeros rather than failing the run.
 */
async function txnMetrics(ctx: MutationCtx): Promise<typeof ZERO_METRICS> {
  try {
    const m = await ctx.meta.getTransactionMetrics();
    return {
      documentsRead: m.documentsRead.used,
      documentsWritten: m.documentsWritten.used,
      bytesRead: m.bytesRead.used,
      bytesWritten: m.bytesWritten.used,
      databaseQueries: m.databaseQueries.used,
    };
  } catch {
    return ZERO_METRICS;
  }
}

/**
 * Moves a lane's pointer onto the job it just scheduled, in the same transaction
 * that scheduled it. `watch` reads the pointer as the lane's liveness, so it must
 * never name an unscheduled job or miss a scheduled one.
 */
async function advanceLane(
  ctx: MutationCtx,
  runId: Id<"benchRuns">,
  lane: number,
  schedule: () => Promise<Id<"_scheduled_functions">>,
): Promise<void> {
  const row = await ctx.db
    .query("benchLanes")
    .withIndex("by_run_lane", (q) => q.eq("runId", runId).eq("lane", lane))
    .unique();
  // No row means a reset took the lane out from under this job. Stop rather than
  // schedule work nothing is tracking, which would leave the run waiting on a
  // lane it can't see.
  if (!row) return;
  await ctx.db.patch("benchLanes", row._id, {
    scheduledFnId: await schedule(),
    jobsSpawned: row.jobsSpawned + 1,
  });
}

/**
 * The run's config and t0, or null if the run is gone. Jobs need both to schedule
 * their successor; off a stale snapshot because reading the run document live
 * would put every job in the run on a collision course with `watch`'s patches.
 */
async function staleRunPlan(
  ctx: MutationCtx,
  runId: Id<"benchRuns">,
): Promise<{ config: BenchConfig; enqueueStartedAtMs: number } | null> {
  return await ctx.runQuery(
    internal.bench.runPlanSnapshot,
    { runId },
    { useStaleSnapshot: true },
  );
}

async function scheduledFnId(ctx: MutationCtx): Promise<string | undefined> {
  try {
    return (
      (await ctx.meta.getRequestMetadata()).scheduledFunctionId ?? undefined
    );
  } catch {
    return undefined;
  }
}

async function getScheduled(
  ctx: MutationCtx,
  id: string,
): Promise<ScheduledDoc | null> {
  return (await ctx.db.system.get(
    "_scheduled_functions",
    id as Id<"_scheduled_functions">,
  )) as ScheduledDoc | null;
}

// -------------------------------------------------------------------- reset

export const resetAll = internalMutation({
  args: {},
  returns: resetStatusValidator,
  handler: async (ctx): Promise<"all_reset" | "partial_reset"> => {
    const batchSize = 1000;

    // Cancel still-pending jobs first, so a reset doesn't leave orphans writing
    // into deleted runs.
    const lanes = await ctx.db.query("benchLanes").take(batchSize);
    for (const lane of lanes) {
      const doc = await getScheduled(ctx, lane.scheduledFnId);
      if (doc?.state.kind === "pending") {
        await ctx.scheduler.cancel(
          lane.scheduledFnId as Id<"_scheduled_functions">,
        );
      }
    }

    for (const table of [
      "benchQueueSamples",
      "benchJobs",
      "benchLanes",
      "benchRuns",
      "benchSuites",
    ] as const) {
      const docs = await ctx.db.query(table).take(batchSize);
      for (const doc of docs) await ctx.db.delete(table, doc._id);
      if (docs.length === batchSize) return "partial_reset";
    }

    // `clear` throws while ops are queued, so wait for the worker to drain.
    // The cron chain re-runs us on "partial_reset".
    const queue = await staleQueueStats(ctx, { includeWorker: false });
    if (queue.rows > 0) return "partial_reset";

    await benchAggregate.clearAll(ctx);
    return "all_reset";
  },
});

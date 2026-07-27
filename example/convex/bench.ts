/**
 * Benchmark comparing the aggregate's queued ("async") write path against the
 * synchronous ("eager") one.
 *
 * Two things make the measurement design what it is:
 *
 * 1. `Date.now()` is frozen for a whole transaction, so no mutation can time
 *    itself. Instead we fan out with the scheduler and read the platform's own
 *    `_scheduled_functions` timings (`scheduledTime` / `completedTime`).
 * 2. `ctx.meta.getTransactionMetrics()` gives a *clock-free* count of documents
 *    and bytes touched. An eager insert walks O(log n) btree nodes; a queued
 *    write appends one row. That comparison needs no timing at all, so it's the
 *    most trustworthy number here.
 *
 * While a queued run is draining, `assertNoPendingCommits` makes every eager write,
 * every non-stale read, and even `clear` throw `PENDING_COMMITS` on this component.
 * That's why the benchmark owns a dedicated aggregate instance and allows only
 * one run at a time.
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
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { resetStatusValidator } from "./utils/resetStatus";
import {
  allShards,
  classifyError,
  downsample,
  histAdd,
  histInit,
  maxOverlap,
  planWave,
  summarize,
  totalWaves,
  validateConfig,
  type Hist,
} from "./utils/benchMath";
import {
  vBenchConfig,
  vBenchMode,
  vPendingCommitsStats,
  vRunStatus,
  type BenchConfig,
  type BenchMode,
  type BenchResults,
} from "./utils/benchTypes";

const benchAggregate = new DirectAggregate<{
  Key: number;
  Id: string;
  Namespace: string;
}>(components.benchAggregate);

// The batch worker's defaults, which `enqueueOperation` doesn't override.
// Recorded as run provenance so results stay comparable if they ever change.
const WORKER_DEBOUNCE_MS = 0;
const WORKER_MONITOR_LAG_MS = 60_000;

const SAMPLE_INTERVAL_MS = 250;
const WATCH_INTERVAL_MS = 250;
// `clear` schedules async node cleanup, so let it settle before writing.
const PREPARE_SETTLE_MS = 250;
// Must exceed the worker's monitor lag: with debounceMs 0 and getBatch
// returning a bare `idle`, the loop goes fully idle and only a ping or the 60s
// monitor wakes it. A still queue is not necessarily a stuck one.
const STALL_MS = 2 * WORKER_MONITOR_LAG_MS;
const MAX_TICKS = 20_000;
const FINALIZE_PAGE_SIZE = 400;

/** Upper bound on a suite's repeats, so one suite can't schedule unboundedly. */
const MAX_REPEATS = 10;
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

// ---------------------------------------------------------------- queries

export const liveQueue = query({
  args: {},
  returns: vPendingCommitsStats,
  handler: async (ctx) => await benchAggregate.pendingCommits(ctx),
});

export const canStart = query({
  args: {},
  returns: v.object({
    canStart: v.boolean(),
    reason: v.optional(
      v.union(v.literal("run_in_progress"), v.literal("pending_ops")),
    ),
    activeRunId: v.optional(v.id("benchRuns")),
    queue: vPendingCommitsStats,
  }),
  handler: async (ctx) => {
    const queue = await benchAggregate.pendingCommits(ctx);
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
    await ctx.db.query("benchRuns").order("desc").take(limit ?? 25),
});

export const listSuites = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    await ctx.db.query("benchSuites").order("desc").take(limit ?? 10),
});

export const getQueueSeries = query({
  args: { runId: v.id("benchRuns"), maxPoints: v.optional(v.number()) },
  handler: async (ctx, { runId, maxPoints }) => {
    const rows = await ctx.db
      .query("benchQueueSamples")
      .withIndex("by_run_at", (q) => q.eq("runId", runId))
      .take(4000);
    return downsample(
      rows.map((r) => ({
        atMs: r.atMs,
        phase: r.phase,
        rows: r.rows,
        operations: r.operations,
        bytes: r.bytes,
        truncated: r.truncated,
        worker: r.worker,
      })),
      maxPoints ?? 300,
    );
  },
});

export const getJobSeries = query({
  args: {
    runId: v.id("benchRuns"),
    kind: v.optional(v.union(v.literal("write"), v.literal("read"))),
    maxPoints: v.optional(v.number()),
  },
  handler: async (ctx, { runId, kind, maxPoints }) => {
    const rows = kind
      ? await ctx.db
          .query("benchJobs")
          .withIndex("by_run_kind_seq", (q) =>
            q.eq("runId", runId).eq("kind", kind),
          )
          .take(4000)
      : await ctx.db
          .query("benchJobs")
          .withIndex("by_run_seq", (q) => q.eq("runId", runId))
          .take(4000);
    return downsample(
      rows.map((r) => ({
        seq: r.seq,
        startedAtMs: r.startedAtMs,
        ops: r.ops,
        ok: r.ok,
        documentsWritten: r.metrics.documentsWritten,
        bytesWritten: r.metrics.bytesWritten,
      })),
      maxPoints ?? 500,
    );
  },
});

export const compareRuns = query({
  args: { runIds: v.array(v.id("benchRuns")) },
  handler: async (ctx, { runIds }) => {
    const runs = await Promise.all(
      runIds.slice(0, 6).map((id) => ctx.db.get("benchRuns", id)),
    );
    return runs.filter((r) => r !== null);
  },
});

/**
 * What an eager reader experiences right now. Returns the error instead of
 * throwing so the dashboard can show the `PENDING_COMMITS` guard in action.
 */
export const probeEagerRead = query({
  args: {},
  returns: v.union(
    v.object({ ok: v.literal(true), count: v.number() }),
    v.object({
      ok: v.literal(false),
      errorCode: v.string(),
      message: v.string(),
    }),
  ),
  handler: async (ctx) => {
    try {
      const count = await benchAggregate.count(ctx, { namespace: "hot" });
      return { ok: true as const, count };
    } catch (e) {
      if (e instanceof ConvexError) {
        return {
          ok: false as const,
          errorCode: String(e.data?.code ?? "UNKNOWN"),
          message: String(e.data?.message ?? e.message),
        };
      }
      throw e;
    }
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
      return { ok: false as const, reason: "invalid_config" as const, detail: invalid };
    }
    const blocked = await startBlocked(ctx);
    if (blocked) return blocked;

    const runId = await insertRun(ctx, { config, label });
    return { ok: true as const, runId };
  },
});

/**
 * The interleaved schedule a suite walks: mode-major within a repeat, so
 * `["async","eager"]` x 3 runs A,E,A,E,A,E rather than A,A,A,E,E,E. Any drift in
 * the deployment over the suite's lifetime then lands on both modes equally
 * instead of loading it all onto whichever mode ran last.
 */
export function scheduleSlot(
  modes: readonly BenchMode[],
  index: number,
): { mode: BenchMode; repeatIndex: number } {
  return {
    mode: modes[index % modes.length],
    repeatIndex: Math.floor(index / modes.length),
  };
}

export const startSuite = mutation({
  args: {
    config: vBenchConfig,
    repeats: v.number(),
    modes: v.optional(v.array(vBenchMode)),
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
  handler: async (ctx, { config, repeats, modes }) => {
    const invalid = validateConfig(config);
    if (invalid) {
      return { ok: false as const, reason: "invalid_config" as const, detail: invalid };
    }
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_REPEATS) {
      return {
        ok: false as const,
        reason: "invalid_config" as const,
        detail: `repeats must be an integer in 1..${MAX_REPEATS}`,
      };
    }
    const suiteModes = modes?.length ? modes : (["async", "eager"] as const);
    const blocked = await startBlocked(ctx);
    if (blocked) return blocked;

    const now = Date.now();
    const suiteId = await ctx.db.insert("benchSuites", {
      config,
      modes: [...suiteModes],
      repeats,
      cursor: 0,
      status: "running",
      createdAtMs: now,
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
      .take(MAX_REPEATS * 4);
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

    if (suite.cursor >= suite.modes.length * suite.repeats) {
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
      await ctx.scheduler.runAfter(SUITE_ADVANCE_RETRY_MS, internal.bench.advanceSuite, {
        suiteId,
        attempt: attempt + 1,
      });
      return null;
    }

    await startNextSuiteRun(ctx, suiteId);
    return null;
  },
});

async function startNextSuiteRun(ctx: MutationCtx, suiteId: Id<"benchSuites">) {
  const suite = await ctx.db.get("benchSuites", suiteId);
  if (!suite) return;
  const { mode, repeatIndex } = scheduleSlot(suite.modes, suite.cursor);
  const total = suite.modes.length * suite.repeats;
  await insertRun(ctx, {
    config: { ...suite.config, mode },
    label: `${mode === "async" ? "queued" : "eager"} · rep ${repeatIndex + 1}/${suite.repeats}`,
    suiteId,
    repeatIndex,
  });
  await ctx.db.patch("benchSuites", suiteId, {
    cursor: Math.min(suite.cursor + 1, total),
  });
}

/**
 * Shared by `startRun` and the suite driver. Refuses for BOTH modes: an eager run
 * would throw PENDING_COMMITS on its first write, and a queued run would be
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
  const queue = await benchAggregate.pendingCommits(ctx, { stale: true });
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
    provenance: {
      debounceMs: WORKER_DEBOUNCE_MS,
      monitorLagMs: WORKER_MONITOR_LAG_MS,
      watchIntervalMs: WATCH_INTERVAL_MS,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
    },
    createdAtMs: now,
    progress: {
      jobsScheduled: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      opsCommitted: 0,
      lastQueueRows: 0,
      lastQueueOperations: 0,
      lastQueueChangeAtMs: now,
    },
  });
  await ctx.scheduler.runAfter(0, internal.bench.prepare, { runId });
  return runId;
}

export const cancelRun = mutation({
  args: { runId: v.id("benchRuns") },
  returns: v.object({ canceledJobs: v.number(), status: vRunStatus }),
  handler: async (ctx, { runId }) => await cancelRunHandler(ctx, runId),
});

async function cancelRunHandler(ctx: MutationCtx, runId: Id<"benchRuns">) {
  const run = await ctx.db.get("benchRuns", runId);
  if (!run) throw new Error("no such run");

  let canceledJobs = 0;
  const waves = await ctx.db
    .query("benchWaves")
    .withIndex("by_run_wave", (q) => q.eq("runId", runId))
    .take(1000);
  for (const wave of waves) {
    for (const id of wave.scheduledFnIds) {
      const doc = await getScheduled(ctx, id);
      if (doc?.state.kind === "pending") {
        await ctx.scheduler.cancel(id as Id<"_scheduled_functions">);
        canceledJobs++;
      }
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
      totalWaves: totalWaves(run.config),
    });
    await ctx.scheduler.runAfter(PREPARE_SETTLE_MS, internal.bench.spawnWave, {
      runId,
      wave: 0,
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

export const spawnWave = internalMutation({
  args: { runId: v.id("benchRuns"), wave: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, wave }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run || run.status !== "enqueuing") return null;
    const plan = planWave(run.config, wave);

    const writeIds: string[] = [];
    for (const job of plan.writes) {
      const id = await ctx.scheduler.runAfter(
        job.delayMs,
        internal.bench.writeJob,
        {
          runId,
          wave,
          seq: job.seq,
          shard: job.shard,
          keyBase: job.keyBase,
          ops: job.ops,
          async: run.config.mode === "async",
        },
      );
      writeIds.push(id);
    }
    await ctx.db.insert("benchWaves", {
      runId,
      wave,
      kind: "write",
      scheduledFnIds: writeIds,
      spawnedAtMs: Date.now(),
    });

    if (plan.reads.length > 0) {
      const readIds: string[] = [];
      for (const job of plan.reads) {
        const id = await ctx.scheduler.runAfter(
          job.delayMs,
          internal.bench.readJob,
          {
            runId,
            wave,
            seq: job.seq,
            shard: job.shard,
            reads: job.ops,
            stale: run.config.readerStale ?? run.config.mode === "async",
          },
        );
        readIds.push(id);
      }
      await ctx.db.insert("benchWaves", {
        runId,
        wave,
        kind: "read",
        scheduledFnIds: readIds,
        spawnedAtMs: Date.now(),
      });
    }

    if (!plan.isLastWave) {
      await ctx.scheduler.runAfter(
        plan.nextWaveDelayMs,
        internal.bench.spawnWave,
        { runId, wave: wave + 1 },
      );
    }
    return null;
  },
});

export const writeJob = internalMutation({
  args: {
    runId: v.id("benchRuns"),
    wave: v.number(),
    seq: v.number(),
    shard: v.string(),
    keyBase: v.number(),
    ops: v.number(),
    async: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, wave, seq, shard, keyBase, ops, async }) => {
    // A reset may have deleted the run out from under an in-flight job.
    if (!(await ctx.db.get("benchRuns", runId))) return null;

    const startedAtMs = Date.now();
    const fnId = await scheduledFnId(ctx);
    let ok = true;
    let errorCode: string | undefined;
    try {
      for (let i = 0; i < ops; i++) {
        const key = keyBase + i;
        await benchAggregate.insert(
          ctx,
          {
            namespace: shard,
            key,
            id: `${runId}:${seq}:${i}`,
            sumValue: key,
          },
          // The per-call option is the whole point of the comparison. Note
          // triggers can't be used here: they don't forward opts, so they're
          // always eager.
          { async },
        );
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
      kind: "write",
      wave,
      seq,
      shard,
      ops: ok ? ops : 0,
      scheduledFnId: fnId,
      startedAtMs,
      metrics: await txnMetrics(ctx),
      ok,
      errorCode,
    });
    return null;
  },
});

export const readJob = internalMutation({
  args: {
    runId: v.id("benchRuns"),
    wave: v.number(),
    seq: v.number(),
    shard: v.string(),
    reads: v.number(),
    stale: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, wave, seq, shard, reads, stale }) => {
    if (!(await ctx.db.get("benchRuns", runId))) return null;

    const startedAtMs = Date.now();
    const fnId = await scheduledFnId(ctx);
    let ok = true;
    let errorCode: string | undefined;
    let count = 0;
    let sum = 0;
    try {
      for (let i = 0; i < reads; i++) {
        count = await benchAggregate.count(ctx, { namespace: shard, stale });
        sum = await benchAggregate.sum(ctx, { namespace: shard, stale });
      }
    } catch (e) {
      // An eager read during a queued run throws PENDING_COMMITS. That's a result,
      // not a run failure — record it and move on.
      if (e instanceof ConvexError) {
        ok = false;
        errorCode = String(e.data?.code ?? "UNKNOWN");
      } else {
        throw e;
      }
    }

    await ctx.db.insert("benchJobs", {
      runId,
      kind: "read",
      wave,
      seq,
      shard,
      ops: reads,
      scheduledFnId: fnId,
      startedAtMs,
      metrics: await txnMetrics(ctx),
      read: { stale, count, sum, reads },
      ok,
      errorCode,
    });
    return null;
  },
});

export const sampleQueue = internalMutation({
  args: { runId: v.id("benchRuns"), tick: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, tick }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run) return null;
    const active = run.status === "enqueuing" || run.status === "draining";
    if (!active || tick > MAX_TICKS) return null;

    // `stale: true` reads the queue from a stale snapshot, so the sampler takes
    // no read dependency on pendingCommits and never conflicts with the enqueuers
    // it's measuring.
    const stats = await benchAggregate.pendingCommits(ctx, {
      limit: 1024,
      stale: true,
    });
    await ctx.db.insert("benchQueueSamples", {
      runId,
      atMs: Date.now(),
      phase: run.status === "enqueuing" ? "enqueuing" : "draining",
      rows: stats.rows,
      operations: stats.operations,
      bytes: stats.bytes,
      truncated: stats.truncated,
      worker: stats.worker,
    });
    await ctx.scheduler.runAfter(
      SAMPLE_INTERVAL_MS,
      internal.bench.sampleQueue,
      { runId, tick: tick + 1 },
    );
    return null;
  },
});

/**
 * Reads scheduled-function state without the caller taking a read dependency on
 * it (see the `useStaleSnapshot` call in `watch`).
 */
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
        ctx.db.system.get("_scheduled_functions", id as Id<"_scheduled_functions">),
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

export const watch = internalMutation({
  args: { runId: v.id("benchRuns"), tick: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, tick }) => {
    const run = await ctx.db.get("benchRuns", runId);
    if (!run) return null;
    if (run.status !== "enqueuing" && run.status !== "draining") return null;
    if (tick > MAX_TICKS) return null;

    const now = Date.now();
    const waves = await ctx.db
      .query("benchWaves")
      .withIndex("by_run_wave", (q) => q.eq("runId", runId))
      .take(1000);

    const allIds = waves.flatMap((w) => w.scheduledFnIds);
    const states = await ctx.runQuery(
      internal.bench.scheduledStates,
      { ids: allIds },
      { useStaleSnapshot: true },
    );
    let failed = 0;
    for (const s of states) {
      if (s.kind === "failed" || s.kind === "canceled") failed++;
    }
    // Committed jobs are the primary completion signal: a job that finished
    // wrote a row, whatever the scheduler's bookkeeping says. Scheduled state
    // only tells us about the ones that threw and so committed nothing.
    const committed = await ctx.db
      .query("benchJobs")
      .withIndex("by_run_seq", (q) => q.eq("runId", runId))
      .take(allIds.length + 1);
    const succeeded = committed.length;
    const terminal = committed.length + failed;
    const opsCommitted = committed.reduce((total, job) => total + job.ops, 0);

    const queue = await benchAggregate.pendingCommits(ctx, {
      limit: 1024,
      stale: true,
    });
    const queueChanged =
      queue.operations !== run.progress.lastQueueOperations ||
      queue.rows !== run.progress.lastQueueRows;

    const progress = {
      ...run.progress,
      jobsScheduled: allIds.length,
      jobsSucceeded: succeeded,
      jobsFailed: failed,
      opsCommitted,
      lastQueueRows: queue.rows,
      lastQueueOperations: queue.operations,
      lastQueueChangeAtMs: queueChanged
        ? now
        : run.progress.lastQueueChangeAtMs,
    };

    const expectedWaves = run.totalWaves ?? totalWaves(run.config);
    const spawnedAllWaves =
      new Set(waves.map((w) => w.wave)).size >= expectedWaves;
    const enqueueDone =
      spawnedAllWaves && allIds.length > 0 && terminal >= allIds.length;

    // Watchdog. STALL_MS deliberately exceeds the worker's monitor lag: a queue
    // can legitimately sit still for a minute before the monitor restarts the
    // loop.
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
      // Done only when the queue is empty AND the worker isn't mid-cycle.
      if (queue.rows === 0 && queue.worker !== "running") {
        await ctx.db.patch("benchRuns", runId, {
          status: "finalizing",
          drainEndedAtMs: now,
          progress,
        });
        await ctx.scheduler.runAfter(0, internal.bench.finalize, { runId });
        return null;
      }
      await ctx.db.patch("benchRuns", runId, { progress });
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
  readLatency: Hist;
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
  errorPendingCommits: number;
  errorOcc: number;
  errorOther: number;
  errorSamples: string[];
  intervals: Array<{ start: number; end: number }>;
  readCount: number;
  readFailedPendingCommits: number;
  stalenessSamples: number[];
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
      .take(FINALIZE_PAGE_SIZE * 25);

    const waves = await ctx.db
      .query("benchWaves")
      .withIndex("by_run_wave", (q) => q.eq("runId", runId))
      .take(1000);
    const allIds = waves.flatMap((w) => w.scheduledFnIds);
    const states = await ctx.runQuery(
      internal.bench.scheduledStates,
      { ids: allIds },
      { useStaleSnapshot: true },
    );
    const byId = new Map(states.map((s) => [s.id, s]));

    const acc: Acc = {
      jobLatency: histInit(),
      jobService: histInit(),
      jobQueue: histInit(),
      readLatency: histInit(),
      opsCommitted: 0,
      jobsTotal: allIds.length,
      jobsSucceeded: 0,
      jobsFailed: 0,
      jobsCanceled: 0,
      documentsRead: 0,
      documentsWritten: 0,
      bytesRead: 0,
      bytesWritten: 0,
      databaseQueries: 0,
      errorPendingCommits: 0,
      errorOcc: 0,
      errorOther: 0,
      errorSamples: [],
      intervals: [],
      readCount: 0,
      readFailedPendingCommits: 0,
      stalenessSamples: [],
    };

    for (const s of states) {
      if (s.kind === "success") acc.jobsSucceeded++;
      else if (s.kind === "canceled") acc.jobsCanceled++;
      else if (s.kind === "failed") {
        acc.jobsFailed++;
        const cls = classifyError(s.error ?? "");
        if (cls === "pendingCommits") acc.errorPendingCommits++;
        else if (cls === "occSuspected") acc.errorOcc++;
        else acc.errorOther++;
        if (acc.errorSamples.length < 5 && s.error) {
          acc.errorSamples.push(s.error);
        }
      }
      if (s.scheduledTime !== null && s.completedTime !== null) {
        acc.intervals.push({ start: s.scheduledTime, end: s.completedTime });
      }
    }

    // Write jobs sorted by completion, so staleness can be computed against
    // "how many ops had committed by the time this read ran".
    const writeCompletions: Array<{ at: number; ops: number }> = [];
    for (const job of jobs) {
      const sched = job.scheduledFnId ? byId.get(job.scheduledFnId) : undefined;
      if (job.kind === "write") {
        acc.opsCommitted += job.ops;
        acc.documentsRead += job.metrics.documentsRead;
        acc.documentsWritten += job.metrics.documentsWritten;
        acc.bytesRead += job.metrics.bytesRead;
        acc.bytesWritten += job.metrics.bytesWritten;
        acc.databaseQueries += job.metrics.databaseQueries;
        if (sched?.completedTime != null) {
          writeCompletions.push({ at: sched.completedTime, ops: job.ops });
        }
      } else {
        acc.readCount++;
        if (job.errorCode === "PENDING_COMMITS") acc.readFailedPendingCommits++;
      }
      if (job.errorCode === "PENDING_COMMITS" && job.kind === "write") {
        acc.errorPendingCommits++;
      }

      if (sched?.scheduledTime != null && sched.completedTime != null) {
        const target = job.kind === "write" ? acc.jobLatency : acc.readLatency;
        histAdd(target, sched.completedTime - sched.scheduledTime);
        histAdd(acc.jobService, sched.completedTime - job.startedAtMs);
        histAdd(acc.jobQueue, job.startedAtMs - sched.scheduledTime);
      }
    }

    writeCompletions.sort((a, b) => a.at - b.at);
    for (const job of jobs) {
      if (job.kind !== "read" || !job.read || !job.ok) continue;
      let committedBefore = 0;
      for (const w of writeCompletions) {
        if (w.at >= job.startedAtMs) break;
        committedBefore += w.ops;
      }
      // Reads are per-shard; only meaningful when everything is in one shard.
      if (run.config.shards <= 1) {
        acc.stalenessSamples.push(Math.max(committedBefore - job.read.count, 0));
      }
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
    const enqueueEnd = run.enqueueEndedAtMs ?? run.drainEndedAtMs ?? Date.now();
    const drainEnd = run.drainEndedAtMs ?? enqueueEnd;
    const enqueueSecs = Math.max(enqueueEnd - enqueueStart, 1) / 1000;
    const totalSecs = Math.max(drainEnd - enqueueStart, 1) / 1000;
    const timeToDrainMs = Math.max(drainEnd - enqueueEnd, 0);
    const ops = Math.max(acc.opsCommitted, 1);

    const sortedStaleness = [...acc.stalenessSamples].sort((a, b) => a - b);
    const pick = (q: number) =>
      sortedStaleness.length === 0
        ? 0
        : sortedStaleness[
            Math.min(
              sortedStaleness.length - 1,
              Math.floor(q * sortedStaleness.length),
            )
          ];

    const results: BenchResults = {
      ops: {
        attempted: run.config.totalOps,
        committed: acc.opsCommitted,
        failed: run.config.totalOps - acc.opsCommitted,
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
          run.config.mode === "async" ? acc.opsCommitted / totalSecs : undefined,
      },
      drain: {
        timeToDrainMs,
        resolutionMs: WATCH_INTERVAL_MS,
        exceededMonitorLag: timeToDrainMs > WORKER_MONITOR_LAG_MS,
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
        offered: run.config.jobsPerWave,
      },
      errors: {
        occSuspected: acc.errorOcc,
        pendingCommits: acc.errorPendingCommits,
        other: acc.errorOther,
        samples: acc.errorSamples,
      },
      reads:
        acc.readCount > 0
          ? {
              latency: summarize(acc.readLatency),
              stale: run.config.readerStale ?? run.config.mode === "async",
              count: acc.readCount,
              failedPendingCommits: acc.readFailedPendingCommits,
              staleness: {
                p50Ops: pick(0.5),
                p95Ops: pick(0.95),
                maxOps: sortedStaleness[sortedStaleness.length - 1] ?? 0,
              },
            }
          : undefined,
    };

    const failed = (run.errors?.length ?? 0) > 0;
    await ctx.db.patch("benchRuns", runId, {
      status: run.status === "canceled" ? "canceled" : failed ? "failed" : "done",
      finishedAtMs: Date.now(),
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

async function findActiveRun(ctx: { db: MutationCtx["db"] } | any) {
  for (const status of ACTIVE_STATUSES) {
    const found = await ctx.db
      .query("benchRuns")
      .withIndex("by_status", (q: any) => q.eq("status", status))
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
 * `ctx.meta` is backed by syscalls that convex-test doesn't implement. On a real
 * deployment these carry the run's most valuable numbers; under convex-test they
 * degrade to zeros/undefined so the rest of the harness still runs.
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

async function scheduledFnId(ctx: MutationCtx): Promise<string | undefined> {
  try {
    return (await ctx.meta.getRequestMetadata()).scheduledFunctionId ?? undefined;
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
    const waves = await ctx.db.query("benchWaves").take(batchSize);
    for (const wave of waves) {
      for (const id of wave.scheduledFnIds) {
        const doc = await getScheduled(ctx, id);
        if (doc?.state.kind === "pending") {
          await ctx.scheduler.cancel(id as Id<"_scheduled_functions">);
        }
      }
    }

    for (const table of [
      "benchQueueSamples",
      "benchJobs",
      "benchWaves",
      "benchRuns",
      "benchSuites",
    ] as const) {
      const docs = await ctx.db.query(table).take(batchSize);
      for (const doc of docs) await ctx.db.delete(table, doc._id);
      if (docs.length === batchSize) return "partial_reset";
    }

    // `clear` throws while ops are queued, so wait for the worker to drain.
    // The cron chain re-runs us on "partial_reset".
    const queue = await benchAggregate.pendingCommits(ctx, { stale: true });
    if (queue.rows > 0) return "partial_reset";

    await benchAggregate.clearAll(ctx);
    return "all_reset";
  },
});

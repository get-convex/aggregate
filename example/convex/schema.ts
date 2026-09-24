import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vBenchConfig, vBenchResults, vRunStatus } from "./utils/benchTypes";

export default defineSchema({
  leaderboard: defineTable({
    name: v.string(),
    score: v.number(),
  }),
  music: defineTable({
    title: v.string(),
  }),
  photos: defineTable({
    album: v.string(),
    url: v.string(),
  }).index("by_album_creation_time", ["album"]),

  // ---- benchmark (see bench.ts) ----

  // A suite is one comparison: the same config run queued and eager, `repeats`
  // times each. Repeats exist so the dashboard can show a median and a spread
  // instead of a single sample — one run of a scheduler-driven benchmark is noise.
  //
  // The two sides aren't stored, because they're never anything else: the queued
  // run is this config with `mode: "async"` and batched enqueues, the eager run is
  // the same config with `mode: "eager"`. `runConfig` in bench.ts derives both.
  benchSuites: defineTable({
    config: vBenchConfig,
    repeats: v.number(),
    // Next index into the interleaved schedule. See `scheduleSlot` in bench.ts.
    cursor: v.number(),
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("canceled"),
    ),
    createdAtMs: v.number(),
    finishedAtMs: v.optional(v.number()),
  }),

  // One row per run. Per-job progress is aggregated into `progress` by the
  // single-threaded `watch` loop rather than patched by each job, so the
  // dashboard can subscribe to this row without it churning per write.
  benchRuns: defineTable({
    label: v.optional(v.string()),
    // Set when the run is one cell of a suite. Which side of the comparison it
    // is comes from `config.mode`, so it isn't stored separately.
    suiteId: v.optional(v.id("benchSuites")),
    repeatIndex: v.optional(v.number()),
    status: vRunStatus,
    config: vBenchConfig,
    createdAtMs: v.number(),
    enqueueStartedAtMs: v.optional(v.number()),
    /**
     * When the last write committed. Stamped by `watch` as it notices, then
     * replaced by `finalize` with the scheduler's own completion time.
     */
    enqueueEndedAtMs: v.optional(v.number()),
    /**
     * When the queue emptied, which is when the aggregate became consistent —
     * the worker applies a batch and deletes its rows in one transaction. For an
     * eager run, which queues nothing, `finalize` sets it to `enqueueEndedAtMs`.
     */
    drainEndedAtMs: v.optional(v.number()),
    /**
     * When the component's worker stopped reporting itself as running. Strictly
     * after consistency: it's the worker's own wind-down, kept out of the drain
     * measurement but recorded so the wait it imposes is visible.
     */
    workerParkedAtMs: v.optional(v.number()),
    finishedAtMs: v.optional(v.number()),
    /** Jobs the run will schedule if nothing fails. See `totalWriteJobs`. */
    expectedJobs: v.optional(v.number()),
    progress: v.object({
      opsCommitted: v.number(),
      lastQueueRows: v.number(),
      lastQueueOperations: v.number(),
      lastQueueChangeAtMs: v.number(),
    }),
    results: v.optional(vBenchResults),
    errors: v.optional(v.array(v.string())),
  })
    .index("by_status", ["status"])
    .index("by_suite", ["suiteId"]),

  // One append-only row per committed job transaction. Deliberately per-job,
  // not per-op: `Date.now()` is frozen per transaction and getTransactionMetrics
  // is per-transaction, so a per-op row would carry no extra information at 10x
  // the write cost — and those writes would become the thing being measured.
  benchJobs: defineTable({
    runId: v.id("benchRuns"),
    seq: v.number(),
    ops: v.number(),
    // Id of this execution's `_scheduled_functions` row. Stored as a string:
    // user schemas can't reference system tables. Cast when reading.
    scheduledFnId: v.optional(v.string()),
    startedAtMs: v.number(),
    metrics: v.object({
      documentsRead: v.number(),
      documentsWritten: v.number(),
      bytesRead: v.number(),
      bytesWritten: v.number(),
      databaseQueries: v.number(),
    }),
    errorCode: v.optional(v.string()),
  }).index("by_run_seq", ["runId", "seq"]),

  // One row per lane, pointing at the job most recently scheduled in it.
  //
  // A lane is a serial chain: each job schedules its successor as it commits and
  // moves this pointer in the same transaction, so the pointer always names the
  // only job that lane can have in flight. Its scheduled state is therefore the
  // lane's state — pending or inProgress means running, success means that job
  // scheduled no successor and the lane is done, failed or canceled means the
  // chain is broken. That's what makes a thrown job observable at all: it
  // commits nothing, writes no benchJobs row, and the id of its
  // `_scheduled_functions` row is known only to whoever scheduled it.
  //
  // One row per lane rather than a growing manifest, and only that lane's own
  // jobs ever write it, so the bookkeeping costs a patch per job and contends
  // with nothing.
  benchLanes: defineTable({
    runId: v.id("benchRuns"),
    lane: v.number(),
    scheduledFnId: v.string(),
    jobsSpawned: v.number(),
  }).index("by_run_lane", ["runId", "lane"]),

  // Queue-depth timeseries, sampled on a fixed cadence during a run.
  benchQueueSamples: defineTable({
    runId: v.id("benchRuns"),
    atMs: v.number(),
    rows: v.number(),
    operations: v.number(),
    // Ops committed by the run's jobs, read from the same snapshot as the queue
    // figures so the two agree on which enqueues have happened. (Samples from
    // before that came from `watch`'s lagging counter instead.)
    opsCommitted: v.number(),
    bytes: v.number(),
    truncated: v.boolean(),
  }).index("by_run_at", ["runId", "atMs"]),
});

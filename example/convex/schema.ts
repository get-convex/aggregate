import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vBenchConfig,
  vBenchMode,
  vBenchProvenance,
  vBenchResults,
  vRunStatus,
} from "./utils/benchTypes";

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

  // A suite is one comparison: every mode in `modes`, repeated `repeats` times.
  // Repeats exist so the dashboard can show a median and a spread instead of a
  // single sample — one run of a scheduler-driven benchmark is noise.
  benchSuites: defineTable({
    // `config.mode` is ignored; `modes` drives what actually runs.
    config: vBenchConfig,
    modes: v.array(vBenchMode),
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
  }).index("by_status", ["status"]),

  // One row per run. Mutable fields are written only by the single-threaded
  // `watch` loop, so the dashboard can subscribe to it without the query
  // re-running on every job insert.
  benchRuns: defineTable({
    label: v.optional(v.string()),
    // Set when the run is one cell of a suite.
    suiteId: v.optional(v.id("benchSuites")),
    repeatIndex: v.optional(v.number()),
    status: vRunStatus,
    config: vBenchConfig,
    provenance: vBenchProvenance,
    createdAtMs: v.number(),
    enqueueStartedAtMs: v.optional(v.number()),
    enqueueEndedAtMs: v.optional(v.number()),
    drainEndedAtMs: v.optional(v.number()),
    finishedAtMs: v.optional(v.number()),
    totalWaves: v.optional(v.number()),
    progress: v.object({
      jobsScheduled: v.number(),
      jobsSucceeded: v.number(),
      jobsFailed: v.number(),
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
    kind: v.union(v.literal("write"), v.literal("read")),
    wave: v.number(),
    seq: v.number(),
    shard: v.string(),
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
    read: v.optional(
      v.object({
        stale: v.boolean(),
        count: v.number(),
        sum: v.number(),
        reads: v.number(),
      }),
    ),
    ok: v.boolean(),
    errorCode: v.optional(v.string()),
  })
    .index("by_run_seq", ["runId", "seq"])
    .index("by_run_kind_seq", ["runId", "kind", "seq"]),

  // The scheduled-id manifest. A job that throws commits nothing and so writes
  // no benchJobs row — the only record of it is `_scheduled_functions`, keyed by
  // an id that only the spawner knows.
  benchWaves: defineTable({
    runId: v.id("benchRuns"),
    wave: v.number(),
    kind: v.union(v.literal("write"), v.literal("read")),
    scheduledFnIds: v.array(v.string()),
    spawnedAtMs: v.number(),
  }).index("by_run_wave", ["runId", "wave"]),

  // Queue-depth timeseries, sampled on a fixed cadence during a run.
  benchQueueSamples: defineTable({
    runId: v.id("benchRuns"),
    atMs: v.number(),
    phase: v.union(v.literal("enqueuing"), v.literal("draining")),
    rows: v.number(),
    operations: v.number(),
    bytes: v.number(),
    truncated: v.boolean(),
    worker: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("stopped"),
      v.null(),
    ),
  }).index("by_run_at", ["runId", "atMs"]),
});

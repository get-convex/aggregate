import { type Infer, v } from "convex/values";

export const vBenchMode = v.union(v.literal("eager"), v.literal("async"));
export type BenchMode = Infer<typeof vBenchMode>;

export const vBenchScenario = v.union(
  v.literal("hot"),
  v.literal("sharded"),
  v.literal("mixed"),
  v.literal("trickle"),
);
export type BenchScenario = Infer<typeof vBenchScenario>;

export const vRunStatus = v.union(
  v.literal("pending"),
  v.literal("preparing"),
  v.literal("enqueuing"),
  v.literal("draining"),
  v.literal("finalizing"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("canceled"),
);
export type RunStatus = Infer<typeof vRunStatus>;

export const vBenchConfig = v.object({
  mode: vBenchMode,
  scenario: vBenchScenario,
  /** Total aggregate operations the run will attempt. */
  totalOps: v.number(),
  /** Aggregate writes per job transaction. */
  opsPerMutation: v.number(),
  /** Fan-out width per wave. */
  jobsPerWave: v.number(),
  /** Namespaces to spread writes across. 1 for the "hot" scenario. */
  shards: v.number(),
  /** mixed: concurrent readers per wave. */
  readers: v.optional(v.number()),
  readsPerReader: v.optional(v.number()),
  /** mixed: whether readers use stale-snapshot reads. */
  readerStale: v.optional(v.boolean()),
  /** trickle: arrival rate and total duration. */
  arrivalRatePerSec: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  maxNodeSize: v.optional(v.number()),
  rootLazy: v.optional(v.boolean()),
  seed: v.number(),
  /** Watchdog: fail the run if it exceeds this. */
  timeoutMs: v.number(),
});
export type BenchConfig = Infer<typeof vBenchConfig>;

/**
 * Settings that were in effect when the run executed. Recorded so old runs stay
 * interpretable if the component's defaults change — drain times in particular
 * are meaningless without knowing the worker's debounce and monitor lag.
 */
export const vBenchProvenance = v.object({
  debounceMs: v.number(),
  monitorLagMs: v.number(),
  watchIntervalMs: v.number(),
  sampleIntervalMs: v.number(),
});

const vHistSummary = v.object({
  count: v.number(),
  mean: v.number(),
  p50: v.number(),
  p75: v.number(),
  p90: v.number(),
  p95: v.number(),
  p99: v.number(),
  min: v.number(),
  max: v.number(),
  /** Log-scale bucket counts, for the histogram chart. */
  buckets: v.array(v.number()),
});
export type HistSummary = Infer<typeof vHistSummary>;

export const vBenchResults = v.object({
  ops: v.object({
    attempted: v.number(),
    committed: v.number(),
    failed: v.number(),
  }),
  jobs: v.object({
    total: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    canceled: v.number(),
  }),
  latency: v.object({
    /** completedTime - scheduledTime: queue wait + retries + execution. */
    jobLatency: vHistSummary,
    /** completedTime - startedAtMs: the final attempt's execution only. */
    jobService: vHistSummary,
    /** startedAtMs - scheduledTime: wait + retry time. OCC-pressure proxy. */
    jobQueue: vHistSummary,
    perOpServiceMs: v.number(),
  }),
  /** Clock-free work per op, from getTransactionMetrics(). */
  work: v.object({
    documentsReadPerOp: v.number(),
    documentsWrittenPerOp: v.number(),
    bytesReadPerOp: v.number(),
    bytesWrittenPerOp: v.number(),
    databaseQueriesPerOp: v.number(),
  }),
  throughput: v.object({
    enqueueOpsPerSec: v.number(),
    /** Async only: includes the drain. The number that makes async honest. */
    applyOpsPerSec: v.optional(v.number()),
  }),
  drain: v.object({
    timeToDrainMs: v.optional(v.number()),
    /** Sampling resolution of timeToDrainMs. */
    resolutionMs: v.number(),
    /** True if the drain took longer than the worker's monitor lag. */
    exceededMonitorLag: v.boolean(),
  }),
  queue: v.object({
    peakRows: v.number(),
    peakOperations: v.number(),
    peakBytes: v.number(),
    /** Peaks are lower bounds when true. */
    peakTruncated: v.boolean(),
    samples: v.number(),
  }),
  concurrency: v.object({
    /** Max overlap of [scheduledTime, completedTime] across jobs. */
    achieved: v.number(),
    offered: v.number(),
  }),
  errors: v.object({
    occSuspected: v.number(),
    pendingCommits: v.number(),
    other: v.number(),
    samples: v.array(v.string()),
  }),
  reads: v.optional(
    v.object({
      latency: vHistSummary,
      stale: v.boolean(),
      count: v.number(),
      failedPendingCommits: v.number(),
      staleness: v.object({
        p50Ops: v.number(),
        p95Ops: v.number(),
        maxOps: v.number(),
      }),
    }),
  ),
});
export type BenchResults = Infer<typeof vBenchResults>;

export const vPendingCommitsStats = v.object({
  rows: v.number(),
  operations: v.number(),
  bytes: v.number(),
  truncated: v.boolean(),
  oldestCommitTs: v.union(v.int64(), v.null()),
  newestObservedCommitTs: v.union(v.int64(), v.null()),
  lastDrainedCommitTs: v.union(v.int64(), v.null()),
  worker: v.union(
    v.literal("idle"),
    v.literal("running"),
    v.literal("stopped"),
    v.null(),
  ),
});

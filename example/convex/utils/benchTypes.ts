import { type Infer, v } from "convex/values";

const vBenchMode = v.union(v.literal("eager"), v.literal("async"));
export type BenchMode = Infer<typeof vBenchMode>;

/**
 * How a queued job hands its operations to the component: one `enqueue` call per
 * operation, or a single `enqueueBatch` call carrying all of them.
 */
export const vWriteApi = v.union(v.literal("perOp"), v.literal("batch"));

const vBenchScenario = v.union(
  v.literal("hot"),
  v.literal("sharded"),
  v.literal("trickle"),
  v.literal("bursty"),
);

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

export const vBenchConfig = v.object({
  mode: vBenchMode,
  scenario: vBenchScenario,
  /** Total aggregate operations the run will attempt. */
  totalOps: v.number(),
  /** Aggregate writes per job transaction. */
  opsPerMutation: v.number(),
  /**
   * Which enqueue API a job uses. Queued runs only — there is no eager batch
   * API, so an eager job ignores this and always writes per operation. Absent
   * means "perOp", so runs recorded before the option existed still read back.
   */
  writeApi: v.optional(vWriteApi),
  /**
   * Concurrent write transactions. The jobs are dealt across this many serial
   * lanes, so it's a hard bound on in-flight work: 1 runs them strictly one
   * after another. See `laneCount`.
   */
  fanOut: v.number(),
  /** Namespaces to spread writes across. 1 for the "hot" scenario. */
  shards: v.number(),
  /** trickle: arrival rate. */
  arrivalRatePerSec: v.optional(v.number()),
  /**
   * bursty: how many bursts the writes are dealt into, and how far apart the
   * bursts start. See `burstStartMs` for what the interval means.
   */
  bursts: v.optional(v.number()),
  burstIntervalMs: v.optional(v.number()),
  maxNodeSize: v.optional(v.number()),
  rootLazy: v.optional(v.boolean()),
  /** Watchdog: fail the run if it exceeds this. */
  timeoutMs: v.number(),
});
export type BenchConfig = Infer<typeof vBenchConfig>;

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
    /**
     * Time from the last write being accepted to the queue being empty. For a
     * queued run this is a tail, not a phase: the worker applies throughout the
     * enqueue, so this is only what was left over at the end.
     */
    timeToDrainMs: v.optional(v.number()),
    /**
     * Sampling resolution of timeToDrainMs. Zero for an eager run, whose end is
     * the scheduler's clock rather than a watch tick.
     */
    resolutionMs: v.number(),
    /** True if the drain took longer than the worker's monitor lag. */
    exceededMonitorLag: v.boolean(),
    /**
     * Time the component's worker went on reporting itself as running after the
     * queue was empty. Not part of time-to-consistency — the data had already
     * landed — but the run does wait for it before releasing the aggregate.
     */
    workerParkMs: v.optional(v.number()),
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
    pendingOperations: v.number(),
    /**
     * Jobs that couldn't commit at all because the transaction hit a platform
     * limit — the eager path's ceiling on ops per transaction. Absent on runs
     * recorded before the class existed, which counted these as `other`.
     */
    limit: v.optional(v.number()),
    other: v.number(),
    /** One line each: message plus the frame that located it. */
    samples: v.array(v.string()),
  }),
  /**
   * Operations not yet applied to the aggregate, over the run, built at finalize
   * time from the queue samples — see `consistencyCurve`. Absent on runs
   * recorded before it was stored, which the chart query builds from the
   * samples on the fly.
   */
  consistency: v.optional(
    v.array(
      v.object({
        elapsedMs: v.number(),
        outstanding: v.number(),
        /**
         * The part of `outstanding` sitting in the queue. Always written; zero
         * for an eager run, which queues nothing.
         */
        queued: v.number(),
      }),
    ),
  ),
});
export type BenchResults = Infer<typeof vBenchResults>;

export const vPendingOperationsStats = v.object({
  rows: v.number(),
  operations: v.number(),
  bytes: v.number(),
  truncated: v.boolean(),
  oldestCommitTs: v.union(v.int64(), v.null()),
  newestObservedCommitTs: v.union(v.int64(), v.null()),
  worker: v.union(
    v.literal("idle"),
    v.literal("running"),
    v.literal("stopped"),
    v.null(),
  ),
});

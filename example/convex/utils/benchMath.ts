/**
 * Pure helpers for the benchmark: histograms, lane and burst planning, config
 * validation, error classification, downsampling. No Convex imports, so they're
 * unit-testable on their own.
 */

import type { BenchConfig, HistSummary } from "./benchTypes";

// ---- histogram ----

// Log-scale buckets from 0.5ms. Bucket 63's lower edge is ~27.5s (the notional
// top edge is 0.5·2^16 = 32.8s) and it is a catch-all for anything slower.
export const HIST_BUCKETS = 64;
const HIST_MIN_MS = 0.5;
const HIST_GROWTH = Math.pow(2, 0.25); // ~19% per bucket

export type Hist = {
  buckets: number[];
  count: number;
  sum: number;
  min: number;
  max: number;
};

export function histInit(): Hist {
  return {
    buckets: new Array<number>(HIST_BUCKETS).fill(0),
    count: 0,
    sum: 0,
    min: Infinity,
    max: -Infinity,
  };
}

/** Bucket a value falls in, clamped to the histogram's range. */
export function bucketIndex(valueMs: number): number {
  if (valueMs <= HIST_MIN_MS) return 0;
  const i = Math.floor(Math.log(valueMs / HIST_MIN_MS) / Math.log(HIST_GROWTH));
  return Math.min(Math.max(i, 0), HIST_BUCKETS - 1);
}

/** Lower edge of a bucket, in ms. Exported for the chart's axis labels. */
export function bucketLowerBound(i: number): number {
  return i <= 0 ? 0 : HIST_MIN_MS * Math.pow(HIST_GROWTH, i);
}

export function histAdd(h: Hist, valueMs: number): void {
  if (!Number.isFinite(valueMs)) return;
  // Negative inputs are clock skew between two scheduled functions, not data;
  // they fold into bucket 0, which does drag `min` to 0.
  const v = Math.max(valueMs, 0);
  h.buckets[bucketIndex(v)]++;
  h.count++;
  h.sum += v;
  if (v < h.min) h.min = v;
  if (v > h.max) h.max = v;
}

/**
 * Quantile by linear interpolation within the containing bucket. Carries
 * bucket-width error (~19%); count, sum, min and max stay exact.
 */
export function histQuantile(h: Hist, q: number): number {
  if (h.count === 0) return 0;
  const target = q * h.count;
  let cumulative = 0;
  for (let i = 0; i < h.buckets.length; i++) {
    const n = h.buckets[i];
    if (n === 0) continue;
    if (cumulative + n >= target) {
      const lo = bucketLowerBound(i);
      const hi = bucketLowerBound(i + 1);
      const within = (target - cumulative) / n;
      return Math.min(Math.max(lo + (hi - lo) * within, h.min), h.max);
    }
    cumulative += n;
  }
  return h.max;
}

export function summarize(h: Hist): HistSummary {
  if (h.count === 0) {
    return {
      count: 0,
      mean: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      buckets: h.buckets,
    };
  }
  return {
    count: h.count,
    mean: h.sum / h.count,
    p50: histQuantile(h, 0.5),
    p75: histQuantile(h, 0.75),
    p90: histQuantile(h, 0.9),
    p95: histQuantile(h, 0.95),
    p99: histQuantile(h, 0.99),
    min: h.min,
    max: h.max,
    buckets: h.buckets,
  };
}

// ---- lane planning ----

export const MAX_FAN_OUT = 200;
export const MAX_TOTAL_OPS = 200_000;
export const MAX_SHARDS = 64;

export type PlannedJob = {
  seq: number;
  shard: string;
  /** First aggregate key this job writes; keys are keyBase..keyBase+ops-1. */
  keyBase: number;
  ops: number;
};

export function totalWriteJobs(config: BenchConfig): number {
  return Math.ceil(config.totalOps / config.opsPerMutation);
}

/**
 * Concurrent serial chains the write jobs are dealt across. Lane L runs seqs
 * L, L + lanes, L + 2·lanes, … and each job schedules its own successor when it
 * commits, so exactly this many write transactions are ever in flight. Without
 * that bound, scheduling jobs without waiting for them put ~114 eager inserts on
 * one btree root at fanOut 1 — `concurrency.achieved` reported 114 against 1.
 */
export function laneCount(config: BenchConfig): number {
  return Math.max(1, Math.min(config.fanOut, totalWriteJobs(config)));
}

/**
 * Gap between one job in a lane and its successor. Trickle paces via scheduler
 * delays because an in-mutation sleep is impossible and Date.now() is frozen;
 * `lanes` lanes each firing every `lanes · slot` is the configured arrival rate,
 * with service time a floor on it.
 */
export function laneDelayMs(config: BenchConfig): number {
  return slotMs(config) * laneCount(config);
}

/** Stagger applied to lane L when the lanes are seeded. */
export function laneStartDelayMs(config: BenchConfig, lane: number): number {
  return slotMs(config) * lane;
}

function slotMs(config: BenchConfig): number {
  return config.scenario === "trickle" && config.arrivalRatePerSec
    ? 1000 / config.arrivalRatePerSec
    : 0;
}

// ---- burst planning ----

export const MAX_BURSTS = 32;
// A gap shorter than the queue sampler's cadence wouldn't be visible in the
// samples, so it would read as jitter rather than as a burst.
export const MIN_BURST_INTERVAL_MS = 250;

/** Bursts the write jobs are dealt into. 1 outside the bursty scenario. */
export function burstCount(config: BenchConfig): number {
  return config.scenario === "bursty" ? Math.max(config.bursts ?? 1, 1) : 1;
}

/**
 * Write jobs in each burst. It's a ceiling, so trailing bursts can come out
 * empty: 5 jobs over 4 bursts is 2/2/1/0, a run that performs three bursts while
 * reporting `bursts: 4`.
 */
export function jobsPerBurst(config: BenchConfig): number {
  return Math.ceil(totalWriteJobs(config) / burstCount(config));
}

/**
 * The burst write job `seq` belongs to. Bursts are contiguous ranges of seqs, so
 * a lane's jobs may straddle a boundary — or skip a burst entirely, when there
 * are fewer jobs per burst than lanes.
 */
export function burstOfSeq(config: BenchConfig, seq: number): number {
  return Math.min(
    Math.floor(seq / jobsPerBurst(config)),
    burstCount(config) - 1,
  );
}

/**
 * Ms after the run's t0 at which burst `b` is due to start. A grid anchored to
 * the run, not a gap from when the previous burst finished, so both arms of a
 * comparison see the identical arrival pattern and drifting lanes realign at the
 * next burst. A burst that overruns therefore doesn't push its successor back;
 * the consistency chart marks the grid, so an overrun reads as a curve that
 * never comes back down between marks.
 */
export function burstStartMs(config: BenchConfig, burst: number): number {
  return burst * (config.burstIntervalMs ?? 0);
}

/** Every burst's due time, for marking the schedule on a chart. */
export function burstStartsMs(config: BenchConfig): number[] {
  return Array.from({ length: burstCount(config) }, (_, b) =>
    burstStartMs(config, b),
  );
}

/**
 * How long a lane must hold write job `seq` back to put it in its burst's slot,
 * given the ms elapsed since the run's t0. Zero once the slot has arrived, so an
 * overrunning burst is never delayed further.
 */
export function burstDelayMs(
  config: BenchConfig,
  seq: number,
  elapsedMs: number,
): number {
  if (config.scenario !== "bursty") return 0;
  return Math.max(burstStartMs(config, burstOfSeq(config, seq)) - elapsedMs, 0);
}

/**
 * Plan write job `seq`, or null once the run has no more. Deterministic in
 * (config, seq), so a lane carries no state beyond the seq it is on. The key
 * ranges are contiguous and disjoint, so a finished run holds exactly totalOps
 * distinct keys.
 */
export function planWriteJob(
  config: BenchConfig,
  seq: number,
): PlannedJob | null {
  if (seq < 0 || seq >= totalWriteJobs(config)) return null;
  const opsRemaining = config.totalOps - seq * config.opsPerMutation;
  return {
    seq,
    shard: shardName(config, seq),
    keyBase: seq * config.opsPerMutation,
    ops: Math.min(config.opsPerMutation, opsRemaining),
  };
}

export function shardName(config: BenchConfig, i: number): string {
  return config.shards <= 1 ? "hot" : `shard-${i % config.shards}`;
}

export function allShards(config: BenchConfig): string[] {
  if (config.shards <= 1) return ["hot"];
  return Array.from({ length: config.shards }, (_, i) => `shard-${i}`);
}

// ---- config validation ----

/**
 * The trust boundary for `startRun`, a public mutation. Counts must be whole as
 * well as in range: a fractional `fanOut` or `shards` reaches arithmetic that
 * assumes integers (lane striding, shard naming, key ranges) and silently yields
 * overlapping jobs and negative failure counts instead of an error.
 */
export function validateConfig(config: BenchConfig): string | null {
  if (
    !Number.isInteger(config.totalOps) ||
    config.totalOps < 1 ||
    config.totalOps > MAX_TOTAL_OPS
  ) {
    return `totalOps must be a whole number between 1 and ${MAX_TOTAL_OPS}`;
  }
  // Unbounded above on purpose: where eager stops working is a property of bytes
  // and tree depth, not of a count worth freezing here, and an over-large job
  // fails visibly. The floor is structural — `totalWriteJobs` divides by this.
  if (!Number.isInteger(config.opsPerMutation) || config.opsPerMutation < 1) {
    return "opsPerMutation must be a whole number of at least 1";
  }
  if (
    !Number.isInteger(config.fanOut) ||
    config.fanOut < 1 ||
    config.fanOut > MAX_FAN_OUT
  ) {
    // Lanes are seeded in one transaction, which can schedule at most 1000
    // functions; stay well under.
    return `fanOut must be a whole number between 1 and ${MAX_FAN_OUT}`;
  }
  if (
    !Number.isInteger(config.shards) ||
    config.shards < 1 ||
    config.shards > MAX_SHARDS
  ) {
    return `shards must be a whole number between 1 and ${MAX_SHARDS}`;
  }
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1) {
    return "timeoutMs must be a positive number";
  }
  if (config.scenario === "hot" && config.shards !== 1) {
    return "the hot scenario requires shards === 1";
  }
  if (config.scenario === "sharded" && config.shards < 2) {
    return "the sharded scenario requires shards >= 2";
  }
  if (config.scenario === "trickle") {
    if (
      !config.arrivalRatePerSec ||
      !Number.isFinite(config.arrivalRatePerSec) ||
      config.arrivalRatePerSec <= 0
    ) {
      return "the trickle scenario requires a positive arrivalRatePerSec";
    }
  }
  if (config.scenario === "bursty") {
    if (
      !config.bursts ||
      !Number.isInteger(config.bursts) ||
      config.bursts < 2 ||
      config.bursts > MAX_BURSTS
    ) {
      return `the bursty scenario requires a whole number of bursts between 2 and ${MAX_BURSTS}`;
    }
    if (
      !config.burstIntervalMs ||
      !Number.isFinite(config.burstIntervalMs) ||
      config.burstIntervalMs < MIN_BURST_INTERVAL_MS
    ) {
      return `the bursty scenario requires burstIntervalMs of at least ${MIN_BURST_INTERVAL_MS}`;
    }
    // The watchdog measures from t0, so a schedule that outlasts the timeout
    // would be cut off partway through: the last bursts would never run and the
    // run would report ops that never landed.
    if (burstStartMs(config, config.bursts - 1) >= config.timeoutMs) {
      return `the burst schedule (${burstStartMs(config, config.bursts - 1)}ms to the last burst) must fit inside timeoutMs`;
    }
  }
  return null;
}

// ---- error classification ----

export type ErrorClass =
  "pendingOperations" | "occSuspected" | "limit" | "other";

// Bare "occ" needs word boundaries: "an internal error occurred" contains it,
// and matching that would file most unrelated failures as OCC conflicts.
const OCC_PATTERN = /write conflict|optimistic concurrency|\bocc\b/;

/**
 * Best-effort bucketing of a scheduled function's error string. OCC conflicts the
 * platform retries *successfully* are invisible to the app, so this undercounts;
 * `jobQueueMs` is the proxy for retry pressure.
 *
 * `limit` isn't noise, it's the result: an eager job walks the btree once per op,
 * so past some transaction size it reads past the 16 MiB limit and can't commit,
 * while the queued path just appends a row.
 */
export function classifyError(error: string): ErrorClass {
  // The component's guard throws ConvexError({ code: "PENDING_OPERATIONS" }).
  if (error.includes("PENDING_OPERATIONS")) return "pendingOperations";
  const lowered = error.toLowerCase();
  if (OCC_PATTERN.test(lowered)) return "occSuspected";
  if (
    lowered.includes("too many bytes") ||
    lowered.includes("too many documents") ||
    lowered.includes("too many reads") ||
    lowered.includes("too many writes") ||
    lowered.includes("(limit:") ||
    lowered.includes("exceeded the maximum")
  ) {
    return "limit";
  }
  return "other";
}

/**
 * The readable part of a scheduled function's error: its message and the first
 * frame that located it, the raw string being a full stack trace through the
 * client and the component. The frame gets its own budget rather than whatever
 * the message leaves over, because platform limit errors carry a paragraph of
 * advice that would otherwise push the part saying *where* off the end.
 */
export function summarizeError(error: string, maxLength = 240): string {
  const lines = error.split("\n").map((line) => line.trim());
  // Errors that crossed a component boundary arrive with the prefix repeated.
  const message = (lines.find((line) => line.length > 0) ?? "").replace(
    /^(uncaught error:\s*)+/i,
    "",
  );
  const frame = lines.find((line) => line.startsWith("at "));
  if (!frame) return clamp(message, maxLength);
  const located = `(${clamp(frame, Math.min(96, maxLength - 8))})`;
  return `${clamp(message, maxLength - located.length - 1)} ${located}`;
}

function clamp(text: string, maxLength: number): string {
  if (maxLength <= 1) return text.slice(0, Math.max(maxLength, 0));
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

// ---- misc ----

/**
 * Max number of jobs whose [scheduledTime, completedTime] intervals overlap.
 * If this comes back ~1 the scheduler ran the fan-out serially and any
 * contention conclusion from the run is void.
 */
export function maxOverlap(
  intervals: Array<{ start: number; end: number }>,
): number {
  const events: Array<[number, number]> = [];
  for (const { start, end } of intervals) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    events.push([start, 1], [Math.max(end, start), -1]);
  }
  // Ends before starts at equal timestamps, so touching intervals don't count
  // as overlapping.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > peak) peak = current;
  }
  return peak;
}

// ---- consistency curve ----

export type ConsistencyPoint = {
  elapsedMs: number;
  outstanding: number;
  /**
   * Of the outstanding operations, the ones sitting in the queue. Zero for an
   * eager run; for a queued run the gap to `outstanding` separates "not yet
   * asked for" from "asked for, not yet applied".
   */
  queued: number;
};

/** Points the stored curve is downsampled to; roughly the chart's pixel width. */
export const MAX_CURVE_POINTS = 300;

/**
 * Operations accepted but not yet applied to the aggregate, at each queue sample.
 *
 * Each sample's `opsCommitted` and `operations` must come from one snapshot: the
 * ops a job enqueued and the row recording that job commit together, so a
 * snapshot sees both or neither, and `totalOps - opsCommitted + operations` is
 * then exactly "not yet asked for" plus "asked for, not yet applied". Read from
 * two snapshots the terms disagree by whatever committed in between and the
 * curve wobbles back up after every dip.
 *
 * `samples` must be sorted by `atMs`. `endedAtMs` is when the run reached
 * consistency — it closes the curve and cuts it off there, since the sampler
 * goes on ticking while the component's worker parks. Pass it only for a run
 * that got there.
 */
export function consistencyCurve({
  totalOps,
  startedAtMs,
  endedAtMs,
  samples,
}: {
  totalOps: number;
  startedAtMs: number;
  endedAtMs?: number;
  samples: Array<{ atMs: number; operations: number; opsCommitted: number }>;
}): ConsistencyPoint[] {
  const points: ConsistencyPoint[] = [];
  for (const sample of samples) {
    // Samples after the run reached consistency describe the worker winding
    // down, not the run; they'd stretch the curve past the moment it finished,
    // which is the one thing its width is supposed to say.
    if (endedAtMs !== undefined && sample.atMs > endedAtMs) break;
    // A committed op is applied in an eager run and merely accepted in a queued
    // one, so the ops sitting in the queue are added back. Clamped to
    // [0, totalOps]: a truncated queue read or a job retried after committing
    // can put the raw figure outside it.
    const outstanding = Math.min(
      totalOps,
      Math.max(totalOps - sample.opsCommitted + sample.operations, 0),
    );
    points.push({
      elapsedMs: Math.max(sample.atMs - startedAtMs, 0),
      outstanding,
      // Can't exceed the outstanding total it's a part of.
      queued: Math.min(sample.operations, outstanding),
    });
  }
  if (endedAtMs !== undefined) {
    const last = points[points.length - 1]?.elapsedMs ?? 0;
    points.push({
      elapsedMs: Math.max(endedAtMs - startedAtMs, last),
      outstanding: 0,
      queued: 0,
    });
  }
  return points;
}

/** Evenly strided downsample that always keeps the first and last point. */
export function downsample<T>(items: T[], maxPoints: number): T[] {
  if (items.length <= maxPoints || maxPoints < 2) return items;
  const stride = (items.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(items[Math.round(i * stride)]);
  }
  return out;
}

/**
 * Pure helpers for the benchmark: histograms, wave planning, error
 * classification, downsampling. No Convex imports, so they're unit-testable on
 * their own.
 */

import type { BenchConfig, HistSummary } from "./benchTypes";

// ---- histogram ----

// Log-scale buckets covering 0.5ms .. ~2 minutes. Bounded memory, mergeable
// across paged finalize calls, and cheap to store (64 numbers per histogram).
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

function bucketIndex(valueMs: number): number {
  if (valueMs <= HIST_MIN_MS) return 0;
  const i = Math.floor(Math.log(valueMs / HIST_MIN_MS) / Math.log(HIST_GROWTH));
  return Math.min(Math.max(i, 0), HIST_BUCKETS - 1);
}

/** Lower edge of a bucket, in ms. Exported for axis labels. */
export function bucketLowerBound(i: number): number {
  return i <= 0 ? 0 : HIST_MIN_MS * Math.pow(HIST_GROWTH, i);
}

export function histAdd(h: Hist, valueMs: number): void {
  if (!Number.isFinite(valueMs)) return;
  const v = Math.max(valueMs, 0);
  h.buckets[bucketIndex(v)]++;
  h.count++;
  h.sum += v;
  if (v < h.min) h.min = v;
  if (v > h.max) h.max = v;
}

export function histMerge(a: Hist, b: Hist): Hist {
  const buckets = a.buckets.map((n, i) => n + b.buckets[i]);
  return {
    buckets,
    count: a.count + b.count,
    sum: a.sum + b.sum,
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
  };
}

/**
 * Quantile by linear interpolation within the containing bucket. Carries
 * bucket-width error (~19%); min/max/mean stay exact.
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

// ---- wave planning ----

export const MAX_JOBS_PER_WAVE = 200;
export const MAX_TOTAL_OPS = 200_000;
export const MAX_SHARDS = 64;

export type PlannedJob = {
  seq: number;
  shard: string;
  /** First aggregate key this job writes; keys are keyBase..keyBase+ops-1. */
  keyBase: number;
  ops: number;
  delayMs: number;
};

export type WavePlan = {
  writes: PlannedJob[];
  reads: PlannedJob[];
  isLastWave: boolean;
  /** Delay before scheduling the next wave. */
  nextWaveDelayMs: number;
};

export function totalWriteJobs(config: BenchConfig): number {
  return Math.ceil(config.totalOps / config.opsPerMutation);
}

export function totalWaves(config: BenchConfig): number {
  return Math.max(1, Math.ceil(totalWriteJobs(config) / config.jobsPerWave));
}

/**
 * Plan one wave. Deterministic in (config, wave), so a wave needs no state
 * beyond its index. Keys are unique across the whole run — a duplicate-key
 * insert would make the worker's processBatch throw, and since it doesn't catch
 * errors, that row would retry on the monitor cadence forever and wedge the
 * queue permanently.
 */
export function planWave(config: BenchConfig, wave: number): WavePlan {
  const jobCount = totalWriteJobs(config);
  const waves = totalWaves(config);
  const first = wave * config.jobsPerWave;
  const last = Math.min(first + config.jobsPerWave, jobCount);
  const slotMs =
    config.scenario === "trickle" && config.arrivalRatePerSec
      ? 1000 / config.arrivalRatePerSec
      : 0;

  const writes: PlannedJob[] = [];
  for (let seq = first; seq < last; seq++) {
    const opsRemaining = config.totalOps - seq * config.opsPerMutation;
    writes.push({
      seq,
      shard: shardName(config, seq),
      keyBase: seq * config.opsPerMutation,
      ops: Math.min(config.opsPerMutation, opsRemaining),
      // Trickle paces via scheduler delays: an in-mutation sleep is impossible,
      // and Date.now() is frozen, so the platform's clock has to do it.
      delayMs: slotMs === 0 ? 0 : (seq - first) * slotMs,
    });
  }

  const reads: PlannedJob[] = [];
  if (config.scenario === "mixed" && config.readers) {
    for (let r = 0; r < config.readers; r++) {
      reads.push({
        seq: wave * config.readers + r,
        shard: shardName(config, r),
        keyBase: 0,
        ops: config.readsPerReader ?? 5,
        delayMs: slotMs === 0 ? 0 : r * slotMs,
      });
    }
  }

  return {
    writes,
    reads,
    isLastWave: wave >= waves - 1,
    nextWaveDelayMs: slotMs === 0 ? 0 : writes.length * slotMs,
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

export function validateConfig(config: BenchConfig): string | null {
  if (config.totalOps < 1 || config.totalOps > MAX_TOTAL_OPS) {
    return `totalOps must be between 1 and ${MAX_TOTAL_OPS}`;
  }
  if (config.opsPerMutation < 1 || config.opsPerMutation > 100) {
    return "opsPerMutation must be between 1 and 100";
  }
  if (config.jobsPerWave < 1 || config.jobsPerWave > MAX_JOBS_PER_WAVE) {
    // A transaction can schedule at most 1000 functions; stay well under.
    return `jobsPerWave must be between 1 and ${MAX_JOBS_PER_WAVE}`;
  }
  if (config.shards < 1 || config.shards > MAX_SHARDS) {
    return `shards must be between 1 and ${MAX_SHARDS}`;
  }
  if (config.scenario === "hot" && config.shards !== 1) {
    return "the hot scenario requires shards === 1";
  }
  if (config.scenario === "sharded" && config.shards < 2) {
    return "the sharded scenario requires shards >= 2";
  }
  if (config.scenario === "mixed" && !config.readers) {
    return "the mixed scenario requires readers";
  }
  if (config.scenario === "trickle" && !config.arrivalRatePerSec) {
    return "the trickle scenario requires arrivalRatePerSec";
  }
  return null;
}

// ---- error classification ----

export type ErrorClass = "pendingCommits" | "occSuspected" | "other";

/**
 * Best-effort bucketing of a scheduled function's error string. Note that OCC
 * conflicts the platform retries *successfully* are invisible to the app —
 * there's no attempt counter anywhere in the server API — so this undercounts.
 * `jobQueueMs` is the proxy for retry pressure.
 */
export function classifyError(error: string): ErrorClass {
  if (error.includes("PENDING_COMMITS")) return "pendingCommits";
  const lowered = error.toLowerCase();
  if (
    lowered.includes("write conflict") ||
    lowered.includes("optimistic concurrency") ||
    lowered.includes("occ")
  ) {
    return "occSuspected";
  }
  return "other";
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

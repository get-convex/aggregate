/**
 * Aggregation across a suite's repeats.
 *
 * A single run of a scheduler-driven benchmark is one sample of a noisy process:
 * OCC retries, scheduler queueing, and whatever else shares the deployment all
 * move the numbers run to run. So every metric is reported as a median over the
 * repeats with the observed min–max range, and the number of samples is always
 * shown — `n=1` has no spread and should not be read as if it did.
 *
 * Median rather than mean, and min–max rather than a standard deviation: with
 * the handful of repeats a live demo can afford, one slow run drags a mean
 * around and a stddev computed from 3 points is not meaningful. The range says
 * exactly what was observed and nothing more.
 */

import { runPhases, type BenchMode, type BenchRun } from "./benchTypes";

export type Spread = {
  /** Median across repeats — the headline number. */
  median: number;
  min: number;
  max: number;
  /** Number of repeats that contributed. */
  n: number;
  values: number[];
};

export type SuiteCell = {
  mode: BenchMode;
  /** Completed runs for this mode, in run order. */
  runs: BenchRun[];
};

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function spreadOf(
  runs: BenchRun[],
  value: (run: BenchRun) => number | undefined,
): Spread | null {
  const values = runs
    .map(value)
    .filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (values.length === 0) return null;
  return {
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    n: values.length,
    values,
  };
}

/** Every metric the comparison views read, computed once per cell. */
export type CellStats = {
  mode: BenchMode;
  n: number;
  p50: Spread | null;
  p95: Spread | null;
  p99: Spread | null;
  enqueueOpsPerSec: Spread | null;
  applyOpsPerSec: Spread | null;
  enqueueMs: Spread | null;
  drainMs: Spread | null;
  totalMs: Spread | null;
  documentsWrittenPerOp: Spread | null;
  documentsReadPerOp: Spread | null;
  peakQueueOperations: Spread | null;
  /** Union of the per-run latency histograms, for the distribution chart. */
  buckets: number[];
  /** Total jobs across repeats, so the histogram's count label is honest. */
  jobCount: number;
};

export function cellStats(mode: BenchMode, runs: BenchRun[]): CellStats {
  const done = runs.filter((r) => r.results);
  const buckets: number[] = [];
  let jobCount = 0;
  for (const run of done) {
    const hist = run.results!.latency.jobLatency;
    jobCount += hist.count;
    hist.buckets.forEach((count, i) => {
      buckets[i] = (buckets[i] ?? 0) + count;
    });
  }
  return {
    mode,
    n: done.length,
    p50: spreadOf(done, (r) => r.results?.latency.jobLatency.p50),
    p95: spreadOf(done, (r) => r.results?.latency.jobLatency.p95),
    p99: spreadOf(done, (r) => r.results?.latency.jobLatency.p99),
    enqueueOpsPerSec: spreadOf(done, (r) => r.results?.throughput.enqueueOpsPerSec),
    applyOpsPerSec: spreadOf(
      done,
      (r) =>
        r.results?.throughput.applyOpsPerSec ??
        r.results?.throughput.enqueueOpsPerSec,
    ),
    enqueueMs: spreadOf(done, (r) => runPhases(r).enqueueMs),
    drainMs: spreadOf(done, (r) => runPhases(r).drainMs),
    totalMs: spreadOf(done, (r) => runPhases(r).totalMs),
    documentsWrittenPerOp: spreadOf(
      done,
      (r) => r.results?.work.documentsWrittenPerOp,
    ),
    documentsReadPerOp: spreadOf(done, (r) => r.results?.work.documentsReadPerOp),
    peakQueueOperations: spreadOf(done, (r) => r.results?.queue.peakOperations),
    buckets,
    jobCount,
  };
}

/**
 * True when the two cells' observed ranges overlap. A ratio between medians whose
 * ranges overlap is not a result — the views mark it rather than quoting it as
 * one.
 */
export function rangesOverlap(a: Spread, b: Spread): boolean {
  return a.min <= b.max && b.min <= a.max;
}

/**
 * The multiple between two medians, oriented so `queued` winning is > 1. Null
 * when either side is missing or non-positive, so callers show a dash instead of
 * a meaningless number.
 */
export function ratio(
  queued: Spread | null,
  eager: Spread | null,
  better: "lower" | "higher",
): number | null {
  if (!queued || !eager) return null;
  const q = queued.median;
  const e = eager.median;
  if (!(q > 0) || !(e > 0)) return null;
  return better === "lower" ? e / q : q / e;
}

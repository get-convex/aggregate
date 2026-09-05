/**
 * Aggregation across a suite's repeats.
 *
 * Median rather than mean, and min–max rather than a standard deviation: with the
 * handful of repeats a live demo can afford, one slow run drags a mean around and
 * a stddev from 3 points is not meaningful. `n` is always shown, since `n=1` has
 * no spread and must not be read as if it did.
 */

import { MODE_COLOR } from "./charts/chartTheme";
import {
  isComplete,
  modeLabel,
  timeToConsistencyMs,
  type BenchMode,
  type BenchRun,
} from "./benchTypes";

export type Spread = {
  /** Median across repeats — the headline number. */
  median: number;
  min: number;
  max: number;
  /** Number of repeats that contributed. */
  n: number;
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
  };
}

/** Every metric the comparison views read, computed once per cell. */
export type CellStats = {
  mode: BenchMode;
  label: string;
  /** Queued is always blue, eager always orange, in every view. */
  color: string;
  n: number;
  p50: Spread | null;
  p95: Spread | null;
  p99: Spread | null;
  enqueueOpsPerSec: Spread | null;
  applyOpsPerSec: Spread | null;
  /** First write accepted to consistent. The run's one time measurement. */
  totalMs: Spread | null;
  /** Union of the per-run latency histograms, for the distribution chart. */
  buckets: number[];
  /** Total jobs across repeats, so the histogram's count label is honest. */
  jobCount: number;
  /** Runs left out because they didn't land all their ops. See `isComplete`. */
  excluded: number;
};

/**
 * Only complete runs contribute: a run that lost work would pull the medians
 * toward a workload nobody asked for. It is counted in `excluded` and reported by
 * `FailureNotice` instead.
 */
export function cellStats(mode: BenchMode, runs: BenchRun[]): CellStats {
  const done = runs.filter(isComplete);
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
    label: modeLabel(mode),
    color: MODE_COLOR[mode],
    n: done.length,
    p50: spreadOf(done, (r) => r.results?.latency.jobLatency.p50),
    p95: spreadOf(done, (r) => r.results?.latency.jobLatency.p95),
    p99: spreadOf(done, (r) => r.results?.latency.jobLatency.p99),
    enqueueOpsPerSec: spreadOf(
      done,
      (r) => r.results?.throughput.enqueueOpsPerSec,
    ),
    applyOpsPerSec: spreadOf(
      done,
      (r) =>
        r.results?.throughput.applyOpsPerSec ??
        r.results?.throughput.enqueueOpsPerSec,
    ),
    totalMs: spreadOf(done, timeToConsistencyMs),
    buckets,
    jobCount,
    excluded: runs.filter((r) => r.results && !isComplete(r)).length,
  };
}

/**
 * A ratio between medians whose ranges overlap is not a result — the views mark it
 * rather than quoting it as one.
 */
export function rangesOverlap(a: Spread, b: Spread): boolean {
  return a.min <= b.max && b.min <= a.max;
}

/**
 * The multiple between a mode's median and the baseline's, oriented so the mode
 * beating the baseline is > 1. Null when either side is missing or non-positive,
 * so callers show a dash instead of a meaningless number.
 */
export function ratio(
  arm: Spread | null,
  baseline: Spread | null,
  better: "lower" | "higher",
): number | null {
  if (!arm || !baseline) return null;
  const a = arm.median;
  const b = baseline.median;
  if (!(a > 0) || !(b > 0)) return null;
  return better === "lower" ? b / a : a / b;
}

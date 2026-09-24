import { describe, expect, test } from "vitest";
import {
  cellStats,
  median,
  rangesOverlap,
  ratio,
  spreadOf,
  type Spread,
} from "./suiteStats";
import type { BenchRun } from "./benchTypes";

/**
 * Minimal stand-in for a finished run. Only the fields the aggregation reads are
 * populated; the cast keeps the fixture from having to mirror the whole
 * generated document type.
 */
function run(opts: {
  mode?: "async" | "eager";
  p50?: number;
  p95?: number;
  p99?: number;
  enqueueOpsPerSec?: number;
  buckets?: number[];
  count?: number;
  enqueueStartedAtMs?: number;
  enqueueEndedAtMs?: number;
  drainEndedAtMs?: number;
  /** Ops that never landed, for the incomplete-run cases. */
  opsMissing?: number;
  jobsFailed?: number;
  workerParkMs?: number;
}): BenchRun {
  const {
    mode = "async",
    p50 = 100,
    p95 = 200,
    p99 = 300,
    enqueueOpsPerSec = 500,
    buckets = [],
    count = 10,
    enqueueStartedAtMs = 1_000,
    enqueueEndedAtMs = 2_000,
    drainEndedAtMs = 3_000,
    opsMissing = 0,
    jobsFailed = 0,
    workerParkMs = 0,
  } = opts;
  return {
    status: "done",
    config: { mode },
    createdAtMs: enqueueStartedAtMs,
    enqueueStartedAtMs,
    enqueueEndedAtMs,
    drainEndedAtMs,
    results: {
      ops: { attempted: 100, committed: 100 - opsMissing, failed: opsMissing },
      jobs: { total: 10, succeeded: 10 - jobsFailed, failed: jobsFailed },
      latency: { jobLatency: { p50, p95, p99, count, buckets } },
      drain: { workerParkMs },
      throughput: { enqueueOpsPerSec },
      queue: { peakOperations: 42 },
    },
  } as unknown as BenchRun;
}

describe("median", () => {
  test("picks the middle of an odd-length sample", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  test("averages the two middles of an even-length sample", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  test("is NaN with no samples, so callers can't mistake it for zero", () => {
    expect(median([])).toBeNaN();
  });
});

describe("spreadOf", () => {
  test("reports the median with the observed range", () => {
    const spread = spreadOf(
      [run({ p50: 100 }), run({ p50: 300 }), run({ p50: 200 })],
      (r) => r.results?.latency.jobLatency.p50,
    );
    expect(spread).toMatchObject({ median: 200, min: 100, max: 300, n: 3 });
  });

  test("skips runs missing the metric rather than counting them as zero", () => {
    const spread = spreadOf(
      [run({ p50: 100 }), { results: undefined } as unknown as BenchRun],
      (r) => r.results?.latency.jobLatency.p50,
    );
    expect(spread).toMatchObject({ median: 100, min: 100, max: 100, n: 1 });
  });

  test("is null when nothing contributed", () => {
    expect(spreadOf([], (r) => r.results?.latency.jobLatency.p50)).toBeNull();
  });
});

describe("cellStats", () => {
  test("pools every repeat's histogram and job count", () => {
    const stats = cellStats("async", [
      run({ buckets: [1, 2, 0], count: 3 }),
      run({ buckets: [0, 1, 5], count: 6 }),
    ]);
    expect(stats.buckets).toEqual([1, 3, 5]);
    expect(stats.label).toBe("Queued");
    expect(stats.mode).toBe("async");
    expect(stats.color).toBe("#3987e5");
    expect(stats.jobCount).toBe(9);
    expect(stats.n).toBe(2);
  });

  test("ignores runs without results, so an in-flight run doesn't skew n", () => {
    const stats = cellStats("async", [
      run({ p50: 100 }),
      { config: { mode: "async" }, results: undefined } as unknown as BenchRun,
    ]);
    expect(stats.n).toBe(1);
    expect(stats.p50?.median).toBe(100);
  });

  test("leaves out a run that lost ops, and says how many it left out", () => {
    // The incomplete run measured a smaller workload, not a noisier sample of
    // the same one — a median across both would describe neither.
    const stats = cellStats("async", [
      run({ p50: 100 }),
      run({ p50: 900, opsMissing: 90, jobsFailed: 9 }),
    ]);
    expect(stats.n).toBe(1);
    expect(stats.p50?.median).toBe(100);
    expect(stats.p50?.max).toBe(100);
    expect(stats.excluded).toBe(1);
  });

  test("leaves out a run whose jobs failed even if every op landed", () => {
    const stats = cellStats("async", [run({ jobsFailed: 2 })]);
    expect(stats.n).toBe(0);
    expect(stats.p50).toBeNull();
    expect(stats.excluded).toBe(1);
    // Nothing pooled either, so the histogram doesn't claim jobs it excluded.
    expect(stats.jobCount).toBe(0);
  });

  test("doesn't count an in-flight run as excluded", () => {
    // It hasn't lost anything — it just hasn't finished, so there is nothing to
    // report about it.
    const stats = cellStats("async", [
      run({}),
      { config: { mode: "async" }, results: undefined } as unknown as BenchRun,
    ]);
    expect(stats.n).toBe(1);
    expect(stats.excluded).toBe(0);
  });

  test("keeps the worker's parking time out of the run's total", () => {
    // The aggregate was already consistent — the run only waits so the next one
    // starts against an idle worker. Charging it to the total added six seconds
    // to a twenty-five second drain.
    const stats = cellStats("async", [
      run({
        enqueueStartedAtMs: 1_000,
        enqueueEndedAtMs: 1_400,
        drainEndedAtMs: 3_000,
        workerParkMs: 6_000,
      }),
    ]);
    expect(stats.totalMs?.median).toBe(2_000);
  });

  test("measures from the first write to consistency", () => {
    const stats = cellStats("async", [
      run({
        enqueueStartedAtMs: 1_000,
        enqueueEndedAtMs: 1_400,
        drainEndedAtMs: 3_000,
      }),
    ]);
    expect(stats.totalMs?.median).toBe(2_000);
  });
});

const spread = (median: number, min: number, max: number): Spread => ({
  median,
  min,
  max,
  n: 3,
});

describe("rangesOverlap", () => {
  test("separated ranges do not overlap", () => {
    expect(rangesOverlap(spread(100, 90, 110), spread(500, 480, 520))).toBe(
      false,
    );
  });

  test("touching ranges count as overlapping", () => {
    expect(rangesOverlap(spread(100, 90, 110), spread(200, 110, 300))).toBe(
      true,
    );
  });

  test("a range contained in another overlaps", () => {
    expect(rangesOverlap(spread(150, 140, 160), spread(200, 100, 300))).toBe(
      true,
    );
  });
});

describe("ratio", () => {
  test("is greater than 1 when the arm beats the baseline on lower-is-better", () => {
    expect(
      ratio(spread(100, 90, 110), spread(500, 480, 520), "lower"),
    ).toBeCloseTo(5);
  });

  test("is greater than 1 when the arm beats the baseline on higher-is-better", () => {
    expect(
      ratio(spread(500, 480, 520), spread(100, 90, 110), "higher"),
    ).toBeCloseTo(5);
  });

  test("is less than 1 when the baseline wins", () => {
    expect(
      ratio(spread(500, 480, 520), spread(100, 90, 110), "lower"),
    ).toBeCloseTo(0.2);
  });

  test("is null rather than Infinity when a median is zero", () => {
    expect(ratio(spread(0, 0, 0), spread(100, 90, 110), "lower")).toBeNull();
  });

  test("is null when either side has no samples", () => {
    expect(ratio(null, spread(100, 90, 110), "lower")).toBeNull();
    expect(ratio(spread(100, 90, 110), null, "lower")).toBeNull();
  });
});

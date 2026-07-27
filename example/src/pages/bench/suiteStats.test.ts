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
  documentsWrittenPerOp?: number;
  buckets?: number[];
  count?: number;
  enqueueStartedAtMs?: number;
  enqueueEndedAtMs?: number;
  drainEndedAtMs?: number;
}): BenchRun {
  const {
    mode = "async",
    p50 = 100,
    p95 = 200,
    p99 = 300,
    enqueueOpsPerSec = 500,
    documentsWrittenPerOp = 1,
    buckets = [],
    count = 10,
    enqueueStartedAtMs = 1_000,
    enqueueEndedAtMs = 2_000,
    drainEndedAtMs = 3_000,
  } = opts;
  return {
    status: "done",
    config: { mode },
    createdAtMs: enqueueStartedAtMs,
    enqueueStartedAtMs,
    enqueueEndedAtMs,
    drainEndedAtMs,
    results: {
      latency: { jobLatency: { p50, p95, p99, count, buckets } },
      throughput: { enqueueOpsPerSec },
      work: { documentsWrittenPerOp, documentsReadPerOp: 3 },
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

  test("derives phase timings from the run's timestamps", () => {
    const stats = cellStats("async", [
      run({
        enqueueStartedAtMs: 1_000,
        enqueueEndedAtMs: 1_400,
        drainEndedAtMs: 3_000,
      }),
    ]);
    expect(stats.enqueueMs?.median).toBe(400);
    expect(stats.drainMs?.median).toBe(1_600);
    expect(stats.totalMs?.median).toBe(2_000);
  });
});

const spread = (median: number, min: number, max: number): Spread => ({
  median,
  min,
  max,
  n: 3,
  values: [min, median, max],
});

describe("rangesOverlap", () => {
  test("separated ranges do not overlap", () => {
    expect(rangesOverlap(spread(100, 90, 110), spread(500, 480, 520))).toBe(false);
  });

  test("touching ranges count as overlapping", () => {
    expect(rangesOverlap(spread(100, 90, 110), spread(200, 110, 300))).toBe(true);
  });

  test("a range contained in another overlaps", () => {
    expect(rangesOverlap(spread(150, 140, 160), spread(200, 100, 300))).toBe(true);
  });
});

describe("ratio", () => {
  test("is greater than 1 when queued wins a lower-is-better metric", () => {
    expect(ratio(spread(100, 90, 110), spread(500, 480, 520), "lower")).toBeCloseTo(5);
  });

  test("is greater than 1 when queued wins a higher-is-better metric", () => {
    expect(ratio(spread(500, 480, 520), spread(100, 90, 110), "higher")).toBeCloseTo(5);
  });

  test("is less than 1 when eager wins", () => {
    expect(ratio(spread(500, 480, 520), spread(100, 90, 110), "lower")).toBeCloseTo(0.2);
  });

  test("is null rather than Infinity when a median is zero", () => {
    expect(ratio(spread(0, 0, 0), spread(100, 90, 110), "lower")).toBeNull();
  });

  test("is null when either side has no samples", () => {
    expect(ratio(null, spread(100, 90, 110), "lower")).toBeNull();
    expect(ratio(spread(100, 90, 110), null, "lower")).toBeNull();
  });
});

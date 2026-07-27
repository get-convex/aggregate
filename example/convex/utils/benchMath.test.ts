import { describe, expect, test } from "vitest";
import {
  classifyError,
  downsample,
  histAdd,
  histInit,
  histMerge,
  histQuantile,
  maxOverlap,
  planWave,
  summarize,
  totalWaves,
  totalWriteJobs,
  validateConfig,
} from "./benchMath";
import type { BenchConfig } from "./benchTypes";

const baseConfig: BenchConfig = {
  mode: "async",
  scenario: "hot",
  totalOps: 100,
  opsPerMutation: 10,
  jobsPerWave: 4,
  shards: 1,
  seed: 1,
  timeoutMs: 60_000,
};

/** Exact quantile over a sorted copy, to check the histogram against. */
function exactQuantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

describe("histogram", () => {
  test("keeps count, sum, min and max exact", () => {
    const h = histInit();
    for (const v of [1, 5, 20, 100]) histAdd(h, v);
    expect(h.count).toBe(4);
    expect(h.sum).toBe(126);
    expect(h.min).toBe(1);
    expect(h.max).toBe(100);
  });

  test("quantiles land within a bucket width of the exact value", () => {
    const values: number[] = [];
    for (let i = 0; i < 1000; i++) values.push(1 + (i % 250));
    const h = histInit();
    for (const v of values) histAdd(h, v);
    for (const q of [0.5, 0.9, 0.99]) {
      const exact = exactQuantile(values, q);
      const approx = histQuantile(h, q);
      // Buckets grow ~19%, so allow 25% relative error.
      expect(Math.abs(approx - exact) / exact).toBeLessThan(0.25);
    }
  });

  test("merge is equivalent to adding everything to one histogram", () => {
    const a = histInit();
    const b = histInit();
    const all = histInit();
    for (let i = 1; i <= 50; i++) {
      histAdd(i % 2 ? a : b, i);
      histAdd(all, i);
    }
    const merged = histMerge(a, b);
    expect(merged.buckets).toEqual(all.buckets);
    expect(merged.count).toBe(all.count);
    expect(merged.sum).toBe(all.sum);
    expect(merged.min).toBe(all.min);
    expect(merged.max).toBe(all.max);
  });

  test("summarizes an empty histogram without dividing by zero", () => {
    expect(summarize(histInit())).toMatchObject({ count: 0, mean: 0, p95: 0 });
  });
});

describe("wave planning", () => {
  test("covers every op exactly once with unique keys", () => {
    const seen = new Set<number>();
    let ops = 0;
    for (let w = 0; w < totalWaves(baseConfig); w++) {
      for (const job of planWave(baseConfig, w).writes) {
        for (let i = 0; i < job.ops; i++) {
          const key = job.keyBase + i;
          // Duplicate keys would make the worker's processBatch throw and wedge
          // the queue permanently, so this is the important invariant.
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
        ops += job.ops;
      }
    }
    expect(ops).toBe(baseConfig.totalOps);
    expect(seen.size).toBe(baseConfig.totalOps);
  });

  test("job and wave counts line up", () => {
    expect(totalWriteJobs(baseConfig)).toBe(10);
    expect(totalWaves(baseConfig)).toBe(3);
    expect(planWave(baseConfig, 2).isLastWave).toBe(true);
  });

  test("spreads across shards when sharded", () => {
    const config = { ...baseConfig, scenario: "sharded" as const, shards: 4 };
    const shards = new Set(
      planWave(config, 0).writes.map((j) => j.shard),
    );
    expect(shards.size).toBe(4);
  });

  test("trickle spaces jobs by the arrival rate", () => {
    const config: BenchConfig = {
      ...baseConfig,
      scenario: "trickle",
      arrivalRatePerSec: 20, // one job every 50ms
      jobsPerWave: 4,
    };
    const plan = planWave(config, 0);
    expect(plan.writes.map((j) => j.delayMs)).toEqual([0, 50, 100, 150]);
    expect(plan.nextWaveDelayMs).toBe(200);
  });

  test("does not overshoot totalOps on the final job", () => {
    const config = { ...baseConfig, totalOps: 25, opsPerMutation: 10 };
    const last = planWave(config, totalWaves(config) - 1).writes.at(-1)!;
    expect(last.ops).toBe(5);
  });
});

describe("validateConfig", () => {
  test("accepts a sane config", () => {
    expect(validateConfig(baseConfig)).toBeNull();
  });

  test("rejects a hot scenario with multiple shards", () => {
    expect(validateConfig({ ...baseConfig, shards: 4 })).toMatch(/hot/);
  });

  test("rejects a fan-out wider than the scheduling limit allows", () => {
    expect(validateConfig({ ...baseConfig, jobsPerWave: 500 })).toMatch(
      /jobsPerWave/,
    );
  });

  test("requires an arrival rate for trickle", () => {
    expect(
      validateConfig({ ...baseConfig, scenario: "trickle" }),
    ).toMatch(/arrivalRatePerSec/);
  });
});

describe("classifyError", () => {
  test("recognizes the pending-ops guard", () => {
    expect(classifyError('ConvexError: {"code":"PENDING_COMMITS"}')).toBe(
      "pendingCommits",
    );
  });
  test("recognizes a write conflict", () => {
    expect(classifyError("Documents read from or written to...write conflict")).toBe(
      "occSuspected",
    );
  });
  test("falls back to other", () => {
    expect(classifyError("boom")).toBe("other");
  });
});

describe("maxOverlap", () => {
  test("returns 1 when execution was serial", () => {
    expect(
      maxOverlap([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 },
      ]),
    ).toBe(1);
  });

  test("counts fully concurrent jobs", () => {
    expect(
      maxOverlap([
        { start: 0, end: 10 },
        { start: 1, end: 9 },
        { start: 2, end: 8 },
      ]),
    ).toBe(3);
  });

  test("ignores incomplete intervals", () => {
    expect(maxOverlap([{ start: 0, end: NaN }])).toBe(0);
  });
});

describe("downsample", () => {
  test("keeps short series untouched", () => {
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  test("keeps the first and last point", () => {
    const out = downsample(Array.from({ length: 1000 }, (_, i) => i), 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(999);
  });
});

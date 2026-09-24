import { describe, expect, test } from "vitest";
import {
  allShards,
  bucketIndex,
  bucketLowerBound,
  burstDelayMs,
  burstOfSeq,
  burstStartsMs,
  classifyError,
  consistencyCurve,
  downsample,
  HIST_BUCKETS,
  histAdd,
  histInit,
  histQuantile,
  laneCount,
  laneDelayMs,
  laneStartDelayMs,
  MAX_SHARDS,
  MAX_TOTAL_OPS,
  maxOverlap,
  planWriteJob,
  shardName,
  summarize,
  summarizeError,
  totalWriteJobs,
  validateConfig,
} from "./benchMath";
import type { BenchConfig } from "./benchTypes";

const baseConfig: BenchConfig = {
  mode: "async",
  scenario: "hot",
  totalOps: 100,
  opsPerMutation: 10,
  fanOut: 4,
  shards: 1,
  timeoutMs: 60_000,
};

/**
 * Interpolating quantile over a sorted copy, to check the histogram against.
 * `histQuantile` interpolates too, so any gap between the two is bucket error
 * rather than a difference of definition.
 */
function exactQuantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = q * sorted.length - 0.5;
  if (pos <= 0) return sorted[0];
  if (pos >= sorted.length - 1) return sorted[sorted.length - 1];
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[lo + 1] - sorted[lo]) * (pos - lo);
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

  test("drops non-finite samples and folds negative ones to zero", () => {
    const h = histInit();
    for (const v of [NaN, Infinity, -Infinity]) histAdd(h, v);
    expect(h.count).toBe(0);
    // `jobQueue` is fed startedAtMs - scheduledTime, which goes negative when the
    // two clocks disagree; it counts as a zero-wait sample rather than vanishing.
    histAdd(h, -5);
    expect(h.count).toBe(1);
    expect(h.sum).toBe(0);
    expect(h.min).toBe(0);
    expect(h.buckets[0]).toBe(1);
  });

  test("puts a value in the bucket its own lower edge names", () => {
    // An off-by-one here shifts every quantile by a bucket width (~19%).
    expect(bucketLowerBound(0)).toBe(0);
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(0.5)).toBe(0);
    for (const i of [1, 2, 17, 63]) {
      expect(bucketIndex(bucketLowerBound(i))).toBe(i);
      expect(bucketIndex(bucketLowerBound(i) * (1 - 1e-9))).toBe(i - 1);
    }
    // The top bucket is a catch-all: its lower edge is ~27.5s, and anything
    // slower lands in it rather than off the end of the array.
    expect(Math.round(bucketLowerBound(HIST_BUCKETS - 1))).toBe(27_554);
    expect(bucketIndex(10 * 60_000)).toBe(HIST_BUCKETS - 1);
  });

  test("quantiles land well inside a bucket width of the exact value", () => {
    const values: number[] = [];
    for (let i = 0; i < 1000; i++) values.push(1 + (i % 250));
    const h = histInit();
    for (const v of values) histAdd(h, v);
    for (const q of [0.5, 0.75, 0.9]) {
      const exact = exactQuantile(values, q);
      const approx = histQuantile(h, q);
      // Measured error is under 1%; a bucket off-by-one would be 11-19%, so this
      // budget fails on one rather than absorbing it.
      expect(Math.abs(approx - exact) / exact).toBeLessThan(0.05);
    }
  });

  test("summarizes an empty histogram without dividing by zero", () => {
    expect(summarize(histInit())).toMatchObject({ count: 0, mean: 0, p95: 0 });
  });
});

describe("lane planning", () => {
  /** Every write job in seq order, as the lanes would produce them. */
  function allWriteJobs(config: BenchConfig) {
    const jobs = [];
    for (let seq = 0; ; seq++) {
      const job = planWriteJob(config, seq);
      if (!job) return jobs;
      jobs.push(job);
    }
  }

  test("covers every op exactly once with unique keys", () => {
    const seen = new Set<number>();
    let ops = 0;
    for (const job of allWriteJobs(baseConfig)) {
      for (let i = 0; i < job.ops; i++) {
        const key = job.keyBase + i;
        // The jobs' key ranges partition 0..totalOps-1, so a finished run holds
        // exactly totalOps distinct keys and its aggregate count is checkable.
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      ops += job.ops;
    }
    expect(ops).toBe(baseConfig.totalOps);
    expect(seen.size).toBe(baseConfig.totalOps);
  });

  test("deals the jobs across the lanes without gaps or overlap", () => {
    // Lane L runs L, L + lanes, L + 2·lanes, … so the lanes partition the seqs.
    const lanes = laneCount(baseConfig);
    expect(lanes).toBe(4);
    const byLane = Array.from({ length: lanes }, (_, lane) => {
      const seqs = [];
      for (let seq = lane; planWriteJob(baseConfig, seq); seq += lanes) {
        seqs.push(seq);
      }
      return seqs;
    });
    expect(byLane).toEqual([
      [0, 4, 8],
      [1, 5, 9],
      [2, 6],
      [3, 7],
    ]);
    expect(byLane.flat().sort((a, b) => a - b)).toEqual(
      Array.from({ length: totalWriteJobs(baseConfig) }, (_, i) => i),
    );
  });

  test("never opens more lanes than there are jobs", () => {
    // Otherwise a lane would be seeded with nothing to run, and the run would
    // wait for a job that was never scheduled.
    expect(laneCount({ ...baseConfig, totalOps: 20, fanOut: 8 })).toBe(2);
    expect(planWriteJob({ ...baseConfig, totalOps: 20 }, 2)).toBeNull();
  });

  test("runs strictly serially at fan-out 1", () => {
    expect(laneCount({ ...baseConfig, fanOut: 1 })).toBe(1);
  });

  test("spreads across shards when sharded", () => {
    const config = { ...baseConfig, scenario: "sharded" as const, shards: 4 };
    const shards = new Set(allWriteJobs(config).map((j) => j.shard));
    expect(shards.size).toBe(4);
    expect(allShards(config)).toEqual([
      "shard-0",
      "shard-1",
      "shard-2",
      "shard-3",
    ]);
    expect(shardName(config, 5)).toBe("shard-1");
  });

  test("names the single namespace consistently when unsharded", () => {
    // The namespace name is what the run reads back to check its own totals, so
    // planning and reporting have to agree on it.
    expect(allShards(baseConfig)).toEqual(["hot"]);
    expect(shardName(baseConfig, 3)).toBe("hot");
  });

  test("trickle spaces a lane's jobs by the arrival rate", () => {
    const config: BenchConfig = {
      ...baseConfig,
      scenario: "trickle",
      arrivalRatePerSec: 20, // one job every 50ms
      fanOut: 4,
    };
    // Four lanes staggered a slot apart, each firing every four slots, is one
    // job every 50ms overall.
    expect([0, 1, 2, 3].map((l) => laneStartDelayMs(config, l))).toEqual([
      0, 50, 100, 150,
    ]);
    expect(laneDelayMs(config)).toBe(200);
  });

  test("does not pace the other scenarios", () => {
    expect(laneDelayMs(baseConfig)).toBe(0);
    expect(laneStartDelayMs(baseConfig, 3)).toBe(0);
  });

  test("bursty deals the write jobs into contiguous bursts", () => {
    const config: BenchConfig = {
      ...baseConfig,
      scenario: "bursty",
      bursts: 4,
      burstIntervalMs: 5_000,
    };
    // 10 write jobs over 4 bursts: 3, 3, 3, then the remaining 1.
    const seqs = allWriteJobs(config).map((j) => burstOfSeq(config, j.seq));
    expect(seqs).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3]);
    expect(burstStartsMs(config)).toEqual([0, 5_000, 10_000, 15_000]);
  });

  test("can leave a trailing burst empty", () => {
    // jobsPerBurst is a ceiling, so 5 jobs over 4 bursts is 2/2/1/0: the run
    // performs three bursts while still reporting `bursts: 4`.
    const config: BenchConfig = {
      ...baseConfig,
      scenario: "bursty",
      totalOps: 50,
      opsPerMutation: 10,
      bursts: 4,
      burstIntervalMs: 5_000,
    };
    const seqs = allWriteJobs(config).map((j) => burstOfSeq(config, j.seq));
    expect(seqs).toEqual([0, 0, 1, 1, 2]);
    expect(new Set(seqs).has(3)).toBe(false);
  });

  test("bursty holds a job back to its slot but never past it", () => {
    const config: BenchConfig = {
      ...baseConfig,
      scenario: "bursty",
      bursts: 4,
      burstIntervalMs: 5_000,
    };
    // Burst 1 starts seq 3. A lane arriving there early waits out the rest of
    // the interval; one arriving late doesn't wait at all — the burst is already
    // due, so an overrun spills into the next slot rather than pushing it back.
    expect(burstDelayMs(config, 3, 1_200)).toBe(3_800);
    expect(burstDelayMs(config, 3, 5_000)).toBe(0);
    expect(burstDelayMs(config, 3, 9_000)).toBe(0);
    // Still inside burst 0, so nothing is held back.
    expect(burstDelayMs(config, 2, 1_200)).toBe(0);
    // The last burst's jobs are due at its own slot, not the run's start.
    expect(burstDelayMs(config, 9, 0)).toBe(15_000);
  });

  test("does not burst the other scenarios", () => {
    expect(burstOfSeq({ ...baseConfig, bursts: 4 }, 9)).toBe(0);
    expect(
      burstDelayMs({ ...baseConfig, bursts: 4, burstIntervalMs: 5_000 }, 9, 0),
    ).toBe(0);
  });

  test("does not overshoot totalOps on the final job", () => {
    const config = { ...baseConfig, totalOps: 25, opsPerMutation: 10 };
    const last = allWriteJobs(config).at(-1)!;
    expect(last.ops).toBe(5);
  });
});

describe("validateConfig", () => {
  test("accepts a sane config", () => {
    expect(validateConfig(baseConfig)).toBeNull();
  });

  test("bounds totalOps", () => {
    expect(validateConfig({ ...baseConfig, totalOps: 0 })).toMatch(/totalOps/);
    expect(
      validateConfig({ ...baseConfig, totalOps: MAX_TOTAL_OPS + 1 }),
    ).toMatch(/totalOps/);
  });

  test("bounds opsPerMutation below but not above", () => {
    expect(validateConfig({ ...baseConfig, opsPerMutation: 0 })).toMatch(
      /opsPerMutation/,
    );
    expect(validateConfig({ ...baseConfig, opsPerMutation: 2.5 })).toMatch(
      /opsPerMutation/,
    );
    // Deliberately unbounded above; an over-large job fails as a failed job.
    expect(
      validateConfig({ ...baseConfig, totalOps: 5_000, opsPerMutation: 5_000 }),
    ).toBeNull();
  });

  test("rejects fractional and non-finite counts", () => {
    // A fractional fanOut is the dangerous one: laneCount would be 4.5, so the
    // lanes would stride by 4.5, seed one lane too many, overlap key ranges, and
    // drive ops.failed negative.
    expect(validateConfig({ ...baseConfig, fanOut: 4.5 })).toMatch(/fanOut/);
    expect(validateConfig({ ...baseConfig, totalOps: 100.5 })).toMatch(
      /totalOps/,
    );
    expect(
      validateConfig({ ...baseConfig, scenario: "sharded", shards: 2.5 }),
    ).toMatch(/shards/);
    expect(validateConfig({ ...baseConfig, totalOps: NaN })).toMatch(
      /totalOps/,
    );
    expect(validateConfig({ ...baseConfig, fanOut: Infinity })).toMatch(
      /fanOut/,
    );
    expect(validateConfig({ ...baseConfig, timeoutMs: NaN })).toMatch(
      /timeoutMs/,
    );
  });

  test("rejects a hot scenario with multiple shards", () => {
    expect(validateConfig({ ...baseConfig, shards: 4 })).toMatch(/hot/);
  });

  test("bounds the shard count", () => {
    expect(validateConfig({ ...baseConfig, shards: 0 })).toMatch(/shards/);
    expect(
      validateConfig({
        ...baseConfig,
        scenario: "sharded",
        shards: MAX_SHARDS + 1,
      }),
    ).toMatch(/shards/);
  });

  test("requires more than one shard for the sharded scenario", () => {
    expect(
      validateConfig({ ...baseConfig, scenario: "sharded", shards: 1 }),
    ).toMatch(/sharded/);
  });

  test("rejects a fan-out wider than the scheduling limit allows", () => {
    expect(validateConfig({ ...baseConfig, fanOut: 500 })).toMatch(/fanOut/);
  });

  test("requires an arrival rate for trickle", () => {
    expect(validateConfig({ ...baseConfig, scenario: "trickle" })).toMatch(
      /arrivalRatePerSec/,
    );
    expect(
      validateConfig({
        ...baseConfig,
        scenario: "trickle",
        arrivalRatePerSec: Infinity,
      }),
    ).toMatch(/arrivalRatePerSec/);
  });

  test("requires a burst count and interval for bursty", () => {
    const bursty = { ...baseConfig, scenario: "bursty" as const };
    expect(validateConfig(bursty)).toMatch(/bursts/);
    expect(validateConfig({ ...bursty, bursts: 1 })).toMatch(/bursts/);
    expect(validateConfig({ ...bursty, bursts: 2.5 })).toMatch(/bursts/);
    expect(validateConfig({ ...bursty, bursts: 4 })).toMatch(/burstIntervalMs/);
    expect(
      validateConfig({ ...bursty, bursts: 4, burstIntervalMs: 10 }),
    ).toMatch(/burstIntervalMs/);
    expect(
      validateConfig({ ...bursty, bursts: 4, burstIntervalMs: 5_000 }),
    ).toBeNull();
  });

  test("rejects a burst schedule the watchdog would cut short", () => {
    // Three bursts 30s apart put the last one at 60s, exactly the timeout.
    expect(
      validateConfig({
        ...baseConfig,
        scenario: "bursty",
        bursts: 3,
        burstIntervalMs: 30_000,
      }),
    ).toMatch(/timeoutMs/);
  });
});

describe("classifyError", () => {
  test("buckets a transaction limit on its own", () => {
    // The eager path's ceiling on ops per transaction, not noise: 1000 eager
    // inserts read past 16 MiB walking the btree and the job can't commit.
    expect(
      classifyError(
        "Too many bytes read in a single function execution (limit: 16777216 bytes)",
      ),
    ).toBe("limit");
    expect(classifyError("Too many documents read")).toBe("limit");
    expect(
      classifyError("Too many writes in a single function execution"),
    ).toBe("limit");
    expect(
      classifyError("Function execution exceeded the maximum size of 8MB"),
    ).toBe("limit");
    expect(classifyError("Too many reads (limit: 4096)")).toBe("limit");
  });

  test("recognizes the pending-ops guard the component actually throws", () => {
    // The component throws code PENDING_OPERATIONS; there is no PENDING_COMMITS
    // anywhere in it, so matching that name counted every guard failure as
    // `other` and reported zero.
    expect(
      classifyError(
        'Uncaught ConvexError: {"code":"PENDING_OPERATIONS","message":"Cannot synchronously read or write to the aggregate while there are async updates enqueued."}',
      ),
    ).toBe("pendingOperations");
  });

  test("recognizes a write conflict", () => {
    expect(
      classifyError("Documents read from or written to...write conflict"),
    ).toBe("occSuspected");
    expect(
      classifyError("Optimistic concurrency control failed on this mutation"),
    ).toBe("occSuspected");
    expect(classifyError("Failed with OCC after 4 attempts")).toBe(
      "occSuspected",
    );
  });

  test("does not read an OCC conflict into the word 'occurred'", () => {
    expect(classifyError("Uncaught Error: an internal error occurred")).toBe(
      "other",
    );
    // And a limit error phrased that way still reaches the limit test, which
    // runs after the OCC one.
    expect(
      classifyError("An error occurred: Too many documents read (limit: 4096)"),
    ).toBe("limit");
  });

  test("falls back to other", () => {
    expect(classifyError("boom")).toBe("other");
  });
});

describe("summarizeError", () => {
  const raw = `Uncaught Error: Uncaught Error: Too many bytes read in a single function execution (limit: 16777216 bytes). Consider using smaller limits in your queries.
    at async insertIntoNode (../../src/component/btree.ts:955:6)
    at async insertHandler (../../src/component/btree.ts:67:12)
`;

  const advisory = `Uncaught Error: Uncaught Error: Too many bytes read in a single function execution (limit: 16777216 bytes). Consider using smaller limits in your queries, paginating your queries, or using indexed queries with a selective index range expression. See https://docs.convex.dev/production/state/limits for more details.
    at async insertIntoNode (../../src/component/btree.ts:955:6)
    at async insertHandler (../../src/component/btree.ts:67:12)
`;

  test("keeps the message and the frame that located it", () => {
    const summary = summarizeError(raw, 200);
    expect(summary).toContain("Too many bytes read");
    expect(summary).toContain("btree.ts:955");
    expect(summary).not.toContain("\n");
    expect(summary.length).toBeLessThanOrEqual(200);
  });

  test("truncates a long message rather than the frame", () => {
    // The case the frame's separate budget exists for: a limit error whose advice
    // paragraph would otherwise push the part that says *where* off the end.
    const summary = summarizeError(advisory, 140);
    expect(summary.length).toBeLessThanOrEqual(140);
    expect(summary).toContain("Too many bytes read");
    expect(summary).toContain("…");
    expect(summary).not.toContain("paginating");
    // The whole frame survived; only the message paid for the budget.
    expect(summary).toMatch(
      /\(at async insertIntoNode \(\.\.\/\.\.\/src\/component\/btree\.ts:955:6\)\)$/,
    );
  });

  test("survives a budget too small for either part", () => {
    // maxLength - 8 drives the frame's budget below the ellipsis, which the
    // clamp has to handle by slicing rather than by producing a longer string.
    const summary = summarizeError(advisory, 9);
    expect(summary.length).toBeLessThanOrEqual(9);
    expect(summarizeError(advisory, 0).length).toBeLessThanOrEqual(3);
  });

  test("survives an error with no stack", () => {
    expect(summarizeError("plain failure")).toBe("plain failure");
    expect(summarizeError("")).toBe("");
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
    const out = downsample(
      Array.from({ length: 1000 }, (_, i) => i),
      10,
    );
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(999);
  });

  test("passes the series through when asked for fewer than two points", () => {
    // Fewer than two can't keep both ends, and the stride would divide by zero.
    const items = [1, 2, 3, 4];
    expect(downsample(items, 1)).toEqual(items);
    expect(downsample(items, 0)).toEqual(items);
  });
});

describe("consistencyCurve", () => {
  // A queued run: 40 ops accepted over four samples, then a drain. Each sample
  // pairs the queue depth with the committed total from the same snapshot.
  const queued = {
    totalOps: 40,
    startedAtMs: 1_000,
    samples: [
      { atMs: 1_000, operations: 0, opsCommitted: 0 },
      { atMs: 1_250, operations: 10, opsCommitted: 10 },
      { atMs: 1_500, operations: 20, opsCommitted: 20 },
      { atMs: 1_750, operations: 30, opsCommitted: 30 },
      { atMs: 2_000, operations: 20, opsCommitted: 40 },
      { atMs: 2_250, operations: 0, opsCommitted: 40 },
    ],
  };

  test("reports the queue depth alongside the outstanding total", () => {
    // The gap between the two is the work no writer has handed over yet, which
    // is what separates "waiting on the writers" from "waiting on the worker".
    const points = consistencyCurve(queued);
    expect(points.map((p) => p.queued)).toEqual([0, 10, 20, 30, 20, 0]);
  });

  test("holds at the total while the queue absorbs the writes", () => {
    const points = consistencyCurve(queued);
    // Accepted but unapplied still counts as outstanding, so the curve holds at
    // 40 through the enqueue phase and only falls as the worker drains.
    expect(points.map((p) => p.outstanding)).toEqual([40, 40, 40, 40, 20, 0]);
    expect(points.map((p) => p.elapsedMs)).toEqual([
      0, 250, 500, 750, 1000, 1250,
    ]);
  });

  test("declines through the enqueue phase when nothing queues", () => {
    // The same commits with an empty queue: an eager run, which lands each op
    // as its transaction commits.
    const points = consistencyCurve({
      ...queued,
      samples: queued.samples.map((s) => ({ ...s, operations: 0 })),
    });
    expect(points.map((p) => p.outstanding)).toEqual([40, 30, 20, 10, 0, 0]);
  });

  test("never rises while the enqueue and the queue are read together", () => {
    // Writers and the worker interleaving arbitrarily: every op that leaves
    // "not yet asked for" enters the queue in the same snapshot, so the sum
    // can only fall.
    const samples = [
      { atMs: 0, operations: 0, opsCommitted: 0 },
      { atMs: 1, operations: 7, opsCommitted: 7 },
      { atMs: 2, operations: 3, opsCommitted: 12 },
      { atMs: 3, operations: 15, opsCommitted: 30 },
      { atMs: 4, operations: 2, opsCommitted: 33 },
      { atMs: 5, operations: 9, opsCommitted: 40 },
      { atMs: 6, operations: 0, opsCommitted: 40 },
    ];
    const points = consistencyCurve({ totalOps: 40, startedAtMs: 0, samples });
    const outstanding = points.map((p) => p.outstanding);
    expect(outstanding).toEqual([40, 40, 31, 25, 9, 9, 0]);
    for (let i = 1; i < outstanding.length; i++) {
      expect(outstanding[i]).toBeLessThanOrEqual(outstanding[i - 1]);
    }
  });

  test("clamps a sample whose terms fall outside the run", () => {
    // A truncated queue read caps `operations` below the real depth, and a job
    // retried after committing counts its ops twice: neither may push the curve
    // outside [0, totalOps], and the queued line never draws above the curve.
    const deep = consistencyCurve({
      totalOps: 40,
      startedAtMs: 0,
      samples: [{ atMs: 200, operations: 50, opsCommitted: 20 }],
    });
    expect(deep[0]).toEqual({ elapsedMs: 200, outstanding: 40, queued: 40 });

    const over = consistencyCurve({
      totalOps: 40,
      startedAtMs: 0,
      samples: [{ atMs: 200, operations: 5, opsCommitted: 50 }],
    });
    expect(over[0]).toEqual({ elapsedMs: 200, outstanding: 0, queued: 0 });
  });

  test("closes the curve at the end of the drain", () => {
    const points = consistencyCurve({ ...queued, endedAtMs: 2_400 });
    expect(points.at(-1)).toEqual({
      elapsedMs: 1_400,
      outstanding: 0,
      queued: 0,
    });
  });

  test("ends where the run reached consistency, not where sampling stopped", () => {
    // The sampler keeps ticking while the component's worker parks, and those
    // samples aren't part of the run's span. Time also has to run forwards: the
    // two timestamps come from different scheduled functions, so a sample can
    // land after the end was stamped, and a curve doubling back draws a segment
    // straight across the chart.
    const points = consistencyCurve({ ...queued, endedAtMs: 1_900 });
    expect(points.at(-1)).toEqual({
      elapsedMs: 900,
      outstanding: 0,
      queued: 0,
    });
    const elapsed = points.map((p) => p.elapsedMs);
    expect([...elapsed].sort((a, b) => a - b)).toEqual(elapsed);
  });

  test("leaves an unfinished run short of zero", () => {
    const points = consistencyCurve({
      totalOps: 40,
      startedAtMs: 0,
      samples: [{ atMs: 200, operations: 0, opsCommitted: 10 }],
    });
    expect(points.at(-1)?.outstanding).toBe(30);
  });
});

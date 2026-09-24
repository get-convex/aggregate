import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type BenchRun = NonNullable<FunctionReturnType<typeof api.bench.getRun>>;
export type BenchScenario = BenchRun["config"]["scenario"];
export type BenchMode = BenchRun["config"]["mode"];
export type RunStatus = BenchRun["status"];
export type BenchSuite = FunctionReturnType<
  typeof api.bench.listSuites
>[number];

/** Config fields that only apply to some scenarios. */
export type ScenarioField =
  "shards" | "arrivalRatePerSec" | "bursts" | "burstIntervalMs";

export type ScenarioMeta = {
  id: BenchScenario;
  label: string;
  description: string;
  fields: readonly ScenarioField[];
  /** Applied on top of the base config when the scenario is selected. */
  defaults: Partial<BenchRun["config"]>;
};

export const SCENARIOS: readonly ScenarioMeta[] = [
  {
    id: "hot",
    label: "Hot single namespace",
    description:
      "Every writer hits one namespace — maximum B-tree contention, the case queued writes exist to fix.",
    fields: [],
    defaults: { shards: 1 },
  },
  {
    id: "sharded",
    label: "Sharded namespaces",
    description:
      "Writers spread over N namespaces, to see how much namespacing alone relieves contention.",
    fields: ["shards"],
    defaults: { shards: 8 },
  },
  {
    id: "trickle",
    label: "Sustained trickle",
    description:
      "A steady arrival rate rather than one burst, to see whether the worker keeps up and how queue depth behaves.",
    fields: ["arrivalRatePerSec"],
    defaults: { shards: 1, arrivalRatePerSec: 50 },
  },
  {
    id: "bursty",
    label: "Bursts over time",
    description:
      "Writes arrive in bursts a fixed interval apart, so the queue fills, drains, and has to wake the worker from idle each time. The marks on the consistency chart are when each burst was due — a curve still up at the next mark is a burst that mode couldn't absorb in time.",
    fields: ["bursts", "burstIntervalMs"],
    defaults: { shards: 1, bursts: 4, burstIntervalMs: 4_000 },
  },
] as const;

export function scenarioMeta(id: BenchScenario): ScenarioMeta {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

export const DEFAULT_CONFIG: BenchRun["config"] = {
  mode: "async",
  scenario: "hot",
  totalOps: 500,
  opsPerMutation: 10,
  writeApi: "perOp",
  fanOut: 20,
  shards: 1,
  timeoutMs: 300_000,
};

/**
 * One run is a single sample of a noisy process, so every number is a median over
 * the repeats with its observed range. Three is the smallest count with a spread
 * at all, and it keeps a comparison inside a demo's patience.
 */
export const DEFAULT_REPEATS = 3;
export const MAX_REPEATS = 10;

/** The two sides, in the order they appear everywhere on the page. */
export const MODES = ["async", "eager"] as const;

export function modeLabel(mode: BenchMode): string {
  return mode === "async" ? "Queued" : "Eager";
}

/**
 * A run whose numbers describe the workload that was configured. Anything less is
 * a different, smaller workload rather than a noisier sample of the same one — an
 * eager run that loses nine jobs of ten to the 16 MiB read limit reports the
 * latency of the one that committed. The results are checked rather than the
 * status alone, so runs recorded before `finalize` learned to fail over lost ops
 * are judged the same way.
 */
export function isComplete(run: BenchRun): boolean {
  const results = run.results;
  if (!results) return false;
  return (
    run.status === "done" &&
    results.jobs.failed === 0 &&
    results.ops.committed >= results.ops.attempted
  );
}

/** One side of a comparison, out of a single suite's runs. */
export function modeRuns(runs: BenchRun[], mode: BenchMode): BenchRun[] {
  return runs.filter((r) => r.config.mode === mode);
}

/**
 * How far along a suite is. The done count comes from `listSuites`, so this is
 * right for every suite the picker offers rather than only the loaded one.
 */
export function suiteProgress(suite: BenchSuite): {
  done: number;
  total: number;
} {
  return { done: suite.doneRuns, total: MODES.length * suite.repeats };
}

/** A past run is identified by what was varied to produce it, not by a name. */
export function paramsLabel(config: BenchRun["config"]): string {
  const parts = [
    scenarioMeta(config.scenario).label,
    `${config.totalOps} ops`,
    `${config.fanOut}× fan-out`,
    `${config.opsPerMutation}/txn`,
  ];
  if (config.scenario === "sharded") parts.push(`${config.shards} namespaces`);
  if (config.scenario === "trickle") {
    parts.push(`${config.arrivalRatePerSec}/s`);
  }
  if (config.scenario === "bursty") {
    parts.push(
      `${config.bursts} bursts`,
      `${Number(((config.burstIntervalMs ?? 0) / 1000).toFixed(1))}s apart`,
    );
  }
  return parts.join(" · ");
}

export function suiteLabel(suite: BenchSuite): string {
  return `${paramsLabel(suite.config)} · ${suite.repeats}×`;
}

export function isInFlight(status: RunStatus): boolean {
  return (
    status === "pending" ||
    status === "preparing" ||
    status === "enqueuing" ||
    status === "draining" ||
    status === "finalizing"
  );
}

export function phaseLabel(status: RunStatus): string {
  switch (status) {
    case "pending":
    case "preparing":
      return "Preparing";
    case "enqueuing":
      return "Enqueuing";
    case "draining":
      return "Draining";
    case "finalizing":
      return "Finalizing";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
  }
}

/**
 * The run's one time measurement, in ms: first write accepted to the aggregate
 * being consistent.
 *
 * Deliberately not broken into phases — a queued run's worker applies operations
 * the whole time its writers are handing them over, so "enqueue" and "drain"
 * aren't stages it passes through. The worker goes on reporting itself as running
 * after the queue empties; that wait is outside this span and is kept in
 * `results.drain.workerParkMs` for anyone diagnosing it.
 */
export function timeToConsistencyMs(run: BenchRun): number {
  const start = run.enqueueStartedAtMs ?? run.createdAtMs;
  const now = Date.now();
  const enqueueEnd =
    run.enqueueEndedAtMs ?? (isInFlight(run.status) ? now : start);
  const consistentAt =
    run.drainEndedAtMs ?? (isInFlight(run.status) ? now : enqueueEnd);
  return Math.max(consistentAt - start, 0);
}

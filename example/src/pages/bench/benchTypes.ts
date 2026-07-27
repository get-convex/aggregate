import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type BenchRun = NonNullable<
  FunctionReturnType<typeof api.bench.getRun>
>;
export type BenchScenario = BenchRun["config"]["scenario"];
export type BenchMode = BenchRun["config"]["mode"];
export type RunStatus = BenchRun["status"];
export type QueueSample = FunctionReturnType<
  typeof api.bench.getQueueSeries
>[number];
export type BenchSuite = FunctionReturnType<
  typeof api.bench.listSuites
>[number];

/** Config fields that only apply to some scenarios. */
export type ScenarioField = "shards" | "arrivalRatePerSec" | "readers";

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
    id: "mixed",
    label: "Mixed read + write",
    description:
      "Readers run alongside writers. During a queued run an eager reader throws PENDING_COMMITS; a stale-snapshot reader doesn't.",
    fields: ["readers"],
    defaults: { shards: 1, readers: 10, readsPerReader: 5 },
  },
  {
    id: "trickle",
    label: "Sustained trickle",
    description:
      "A steady arrival rate rather than one burst, to see whether the worker keeps up and how queue depth behaves.",
    fields: ["arrivalRatePerSec"],
    defaults: { shards: 1, arrivalRatePerSec: 50 },
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
  jobsPerWave: 20,
  shards: 1,
  seed: 1,
  timeoutMs: 300_000,
};

/** Runs belonging to `suite`, oldest first so repeat order reads naturally. */
export function suiteRuns(suite: BenchSuite, runs: BenchRun[]): BenchRun[] {
  return runs
    .filter((r) => r.suiteId === suite._id)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

/** How far along a suite is, counting only runs that produced results. */
export function suiteProgress(
  suite: BenchSuite,
  runs: BenchRun[],
): { done: number; total: number } {
  return {
    done: suiteRuns(suite, runs).filter((r) => r.results).length,
    total: suite.modes.length * suite.repeats,
  };
}

export function suiteLabel(suite: BenchSuite): string {
  return `${scenarioMeta(suite.config.scenario).label} · ${configSummary(
    suite.config,
  )} · ${suite.repeats}x`;
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

/** Enqueue and drain durations in ms, for the phase timeline. */
export function runPhases(run: BenchRun): {
  enqueueMs: number;
  drainMs: number;
  totalMs: number;
} {
  const start = run.enqueueStartedAtMs ?? run.createdAtMs;
  const now = Date.now();
  const enqueueEnd = run.enqueueEndedAtMs ?? (isInFlight(run.status) ? now : start);
  const drainEnd =
    run.drainEndedAtMs ?? (isInFlight(run.status) ? now : enqueueEnd);
  const enqueueMs = Math.max(enqueueEnd - start, 0);
  const drainMs = Math.max(drainEnd - enqueueEnd, 0);
  return { enqueueMs, drainMs, totalMs: enqueueMs + drainMs };
}

export function configSummary(config: BenchRun["config"]): string {
  const parts = [
    `${config.totalOps} ops`,
    `${config.jobsPerWave}x fan-out`,
    `${config.opsPerMutation}/txn`,
  ];
  if (config.scenario === "sharded") parts.push(`${config.shards} shards`);
  if (config.scenario === "trickle") {
    parts.push(`${config.arrivalRatePerSec}/s`);
  }
  if (config.scenario === "mixed") parts.push(`${config.readers} readers`);
  return parts.join(" · ");
}

/** True when two runs differ in a way that makes comparing them misleading. */
export function configsComparable(
  a: BenchRun["config"],
  b: BenchRun["config"],
): boolean {
  return (
    a.scenario === b.scenario &&
    a.totalOps === b.totalOps &&
    a.jobsPerWave === b.jobsPerWave &&
    a.opsPerMutation === b.opsPerMutation &&
    a.shards === b.shards
  );
}

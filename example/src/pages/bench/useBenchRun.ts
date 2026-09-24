import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useStableQuery } from "../../utils/useStableQuery";
import { useApiErrorHandler } from "../../utils/errors";
import type { BenchRun, BenchSuite } from "./benchTypes";

// Each suite in this window costs `listSuites` a pass over its run documents to
// count them, so it stays small even though the wire payload no longer scales
// with it.
const SUITE_WINDOW = 3;

/**
 * All Convex wiring for the benchmark page.
 *
 * The fat run documents — a consistency curve and three histograms each — are
 * subscribed to one suite at a time, and never the whole table: `watch` patches
 * the active run four times a second, so every document in a live query's read
 * set is resent on that cadence. What crosses suites is a count from
 * `listSuites` instead.
 *
 * Note what is *not* subscribed to: nothing counts `benchJobs` rows live. A
 * subscription like that would re-run on every job insert, which would both
 * scale badly and add load to the very thing being measured. Live progress
 * comes off the single-writer `progress` field on the run row.
 */
export function useBenchRun(suiteId: Id<"benchSuites"> | null) {
  const onApiError = useApiErrorHandler();
  const [isStarting, setIsStarting] = useState(false);

  const canStart = useQuery(api.bench.canStart);
  const latestRunId = useQuery(api.bench.latestRunId);
  const suites = useStableQuery(api.bench.listSuites, { limit: SUITE_WINDOW });

  // Derived, not synced in an effect: follow whatever run is active, else fall
  // back to the most recent one.
  const effectiveRunId = canStart?.activeRunId ?? latestRunId ?? null;

  const run = useStableQuery(
    api.bench.getRun,
    effectiveRunId ? { runId: effectiveRunId } : "skip",
  );
  // Derived here rather than in the page, so the per-suite queries can follow the
  // suite actually on screen: with nothing explicitly picked that's the newest
  // one with a finished run. The `doneRuns` count is what makes this answerable
  // without any run documents — the runs query is keyed by the answer.
  const selectedSuite: BenchSuite | null = suiteId
    ? ((suites ?? []).find((s) => s._id === suiteId) ?? null)
    : ((suites ?? []).find((s) => s.doneRuns > 0) ?? (suites ?? [])[0] ?? null);

  const runs = useStableQuery(
    api.bench.listSuiteRuns,
    selectedSuite ? { suiteId: selectedSuite._id } : "skip",
  );

  const consistencySeries = useStableQuery(
    api.bench.getConsistencySeries,
    selectedSuite ? { suiteId: selectedSuite._id } : "skip",
  );

  const startSuiteMutation = useMutation(api.bench.startSuite);
  const cancelSuiteMutation = useMutation(api.bench.cancelSuite);

  const startSuite = useCallback(
    async (config: BenchRun["config"], repeats: number) => {
      // Latch before awaiting: the suite row doesn't exist until this returns,
      // so without it a double-click fires two comparisons.
      setIsStarting(true);
      try {
        return await startSuiteMutation({ config, repeats });
      } catch (error) {
        onApiError(error, "startSuite");
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [startSuiteMutation, onApiError],
  );

  const cancelSuite = useCallback(
    async (suiteId: Id<"benchSuites">) => {
      try {
        return await cancelSuiteMutation({ suiteId });
      } catch (error) {
        onApiError(error, "cancelSuite");
        return null;
      }
    },
    [cancelSuiteMutation, onApiError],
  );

  return {
    canStart,
    runs: runs ?? [],
    suites: suites ?? [],
    run: run ?? null,
    consistencySeries: consistencySeries ?? [],
    selectedSuite,
    startSuite,
    cancelSuite,
    isStarting,
  };
}

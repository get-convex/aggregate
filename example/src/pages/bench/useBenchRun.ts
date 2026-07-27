import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useStableQuery } from "../../utils/useStableQuery";
import { useApiErrorHandler } from "../../utils/errors";
import type { BenchRun } from "./benchTypes";

/**
 * All Convex wiring for the benchmark page.
 *
 * Note what is *not* subscribed to: nothing counts `benchJobs` rows live. A
 * subscription like that would re-run on every job insert, which would both
 * scale badly and add load to the very thing being measured. Live progress
 * comes off the single-writer `progress` field on the run row.
 */
export function useBenchRun(selectedRunId: Id<"benchRuns"> | null) {
  const onApiError = useApiErrorHandler();
  const [isStarting, setIsStarting] = useState(false);

  const canStart = useQuery(api.bench.canStart);
  // 25 runs covers 2 modes x 10 repeats plus a few loose runs.
  const runs = useStableQuery(api.bench.listRuns, { limit: 25 });
  const suites = useStableQuery(api.bench.listSuites, { limit: 10 });

  // Derived, not synced in an effect: with nothing explicitly selected, follow
  // whatever run is active, else fall back to the most recent one.
  const effectiveRunId =
    selectedRunId ?? canStart?.activeRunId ?? runs?.[0]?._id ?? null;

  const run = useStableQuery(
    api.bench.getRun,
    effectiveRunId ? { runId: effectiveRunId } : "skip",
  );
  const queueSeries = useStableQuery(
    api.bench.getQueueSeries,
    effectiveRunId ? { runId: effectiveRunId, maxPoints: 240 } : "skip",
  );

  const startRunMutation = useMutation(api.bench.startRun);
  const startSuiteMutation = useMutation(api.bench.startSuite);
  const cancelRunMutation = useMutation(api.bench.cancelRun);
  const cancelSuiteMutation = useMutation(api.bench.cancelSuite);

  const startRun = useCallback(
    async (config: BenchRun["config"], label?: string) => {
      // Latch before awaiting: the run row doesn't exist until this returns, so
      // without it a double-click fires two runs.
      setIsStarting(true);
      try {
        const result = await startRunMutation({ config, label });
        return result;
      } catch (error) {
        onApiError(error, "startRun");
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [startRunMutation, onApiError],
  );

  const startSuite = useCallback(
    async (config: BenchRun["config"], repeats: number) => {
      // Same latch as startRun: the suite row doesn't exist until this returns.
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

  const cancelRun = useCallback(
    async (runId: Id<"benchRuns">) => {
      try {
        return await cancelRunMutation({ runId });
      } catch (error) {
        onApiError(error, "cancelRun");
        return null;
      }
    },
    [cancelRunMutation, onApiError],
  );

  return {
    canStart,
    runs: runs ?? [],
    suites: suites ?? [],
    run: run ?? null,
    queueSeries: queueSeries ?? [],
    startRun,
    startSuite,
    cancelRun,
    cancelSuite,
    isStarting,
    effectiveRunId,
  };
}

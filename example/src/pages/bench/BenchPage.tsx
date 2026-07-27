import { Container, Stack } from "@mantine/core";
import { IconGauge } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { CommonAppShell } from "@/common/CommonAppShell";
import { PageHeader } from "../../common/PageHeader";
import type { Id } from "../../../convex/_generated/dataModel";
import { BenchControls } from "./BenchControls";
import { ComparisonSection } from "./ComparisonSection";
import { LatencySection } from "./LatencySection";
import { ConsistencySection } from "./ConsistencySection";
import { FailureNotice } from "./FailureNotice";
import { useBenchRun } from "./useBenchRun";
import { cellStats } from "./suiteStats";
import { burstStartsMs } from "../../../convex/utils/benchMath";
import {
  DEFAULT_CONFIG,
  DEFAULT_REPEATS,
  MODES,
  modeLabel,
  modeRuns,
  type BenchRun,
} from "./benchTypes";

export function BenchPage() {
  const [config, setConfig] = useState<BenchRun["config"]>(DEFAULT_CONFIG);
  const [repeats, setRepeats] = useState(DEFAULT_REPEATS);
  const [selectedSuiteId, setSelectedSuiteId] =
    useState<Id<"benchSuites"> | null>(null);

  const {
    canStart,
    runs,
    suites,
    run,
    consistencySeries,
    selectedSuite,
    startSuite,
    cancelSuite,
    isStarting,
  } = useBenchRun(selectedSuiteId);

  // Queued first, eager second, everywhere on the page.
  const cells = useMemo(() => {
    if (!selectedSuite) return [];
    return MODES.map((mode) => cellStats(mode, modeRuns(runs, mode)));
  }, [selectedSuite, runs]);

  const activeSuite = suites.find((s) => s.status === "running") ?? null;

  return (
    <CommonAppShell fullScreen={true}>
      <Container size="xl" p="lg">
        <Stack gap="xl">
          <PageHeader
            title="Queued vs Eager Writes"
            icon={<IconGauge size={32} color="cyan" />}
            filename="bench.ts"
          />

          <BenchControls
            config={config}
            onChange={setConfig}
            repeats={repeats}
            onRepeatsChange={setRepeats}
            onRun={() => {
              void startSuite(config, repeats).then((result) => {
                if (result?.ok) setSelectedSuiteId(result.suiteId);
              });
            }}
            onStop={() => {
              if (activeSuite) void cancelSuite(activeSuite._id);
            }}
            isStarting={isStarting}
            activeRun={run}
            activeSuite={activeSuite}
            suites={suites}
            selectedSuiteId={selectedSuite?._id ?? null}
            onSelectSuite={setSelectedSuiteId}
            pendingOps={canStart?.queue.operations ?? 0}
          />

          {/* Above the charts: a run that lost work invalidates the numbers
              below it. */}
          <FailureNotice runs={runs} />

          <ConsistencySection
            series={consistencySeries.map((s) => ({
              ...s,
              label: modeLabel(s.mode),
            }))}
            cells={cells}
            burstMarksMs={
              selectedSuite ? burstStartsMs(selectedSuite.config) : []
            }
          />

          <ComparisonSection cells={cells} />

          <LatencySection cells={cells} />
        </Stack>
      </Container>
    </CommonAppShell>
  );
}

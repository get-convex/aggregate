import { AppShell, Badge, Container, Stack, Tabs } from "@mantine/core";
import { IconGauge } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { CommonAppShell } from "@/common/CommonAppShell";
import { PageHeader } from "../../common/PageHeader";
import type { Id } from "../../../convex/_generated/dataModel";
import { BenchAside } from "./BenchAside";
import { ComparisonSection } from "./ComparisonSection";
import { HistorySection } from "./HistorySection";
import { LatencySection } from "./LatencySection";
import { LiveRunSection } from "./LiveRunSection";
import { QueueDepthSection } from "./QueueDepthSection";
import { ScoreboardSection } from "./ScoreboardSection";
import { useBenchRun } from "./useBenchRun";
import { cellStats } from "./suiteStats";
import {
  DEFAULT_CONFIG,
  isInFlight,
  suiteRuns,
  type BenchRun,
  type BenchSuite,
} from "./benchTypes";

export function BenchPage() {
  const [config, setConfig] = useState<BenchRun["config"]>(DEFAULT_CONFIG);
  const [repeats, setRepeats] = useState(3);
  const [selectedRunId, setSelectedRunId] = useState<Id<"benchRuns"> | null>(
    null,
  );
  const [selectedSuiteId, setSelectedSuiteId] = useState<
    Id<"benchSuites"> | null
  >(null);
  const [tab, setTab] = useState<"compare" | "monitor">("compare");

  const {
    canStart,
    runs,
    suites,
    run,
    queueSeries,
    startRun,
    startSuite,
    cancelRun,
    cancelSuite,
    isStarting,
    effectiveRunId,
  } = useBenchRun(selectedRunId);

  // Derived, not synced in an effect: with nothing chosen, show the newest suite
  // that has at least one finished run.
  const selectedSuite: BenchSuite | null = useMemo(() => {
    if (selectedSuiteId) {
      return suites.find((s) => s._id === selectedSuiteId) ?? null;
    }
    return (
      suites.find((s) => suiteRuns(s, runs).some((r) => r.results)) ??
      suites[0] ??
      null
    );
  }, [selectedSuiteId, suites, runs]);

  const cells = useMemo(() => {
    const scoped = selectedSuite ? suiteRuns(selectedSuite, runs) : [];
    return {
      queued: cellStats(
        "async",
        scoped.filter((r) => r.config.mode === "async"),
      ),
      eager: cellStats(
        "eager",
        scoped.filter((r) => r.config.mode === "eager"),
      ),
    };
  }, [selectedSuite, runs]);

  const activeRun = run;
  const inFlight = activeRun ? isInFlight(activeRun.status) : false;
  // A suite keeps going between runs, so "busy" is broader than one run.
  const activeSuite = suites.find((s) => s.status === "running") ?? null;
  const busy = inFlight || activeSuite !== null;

  return (
    <CommonAppShell
      fullScreen={true}
      appShellChildren={
        <AppShell.Aside bg="dark.6" p="md">
          <BenchAside
            config={config}
            onChange={setConfig}
            repeats={repeats}
            onRepeatsChange={setRepeats}
            onStartSuite={() => {
              void startSuite(config, repeats).then((result) => {
                if (result?.ok) {
                  setSelectedSuiteId(result.suiteId);
                  setSelectedRunId(null);
                  setTab("monitor");
                }
              });
            }}
            onStartSingle={() => {
              void startRun(config).then((result) => {
                if (result?.ok) {
                  setSelectedRunId(result.runId);
                  setTab("monitor");
                }
              });
            }}
            onCancel={() => {
              if (activeSuite) void cancelSuite(activeSuite._id);
              else if (activeRun) void cancelRun(activeRun._id);
            }}
            isStarting={isStarting}
            isInFlight={busy}
            pendingOps={canStart?.queue.operations ?? 0}
          />
        </AppShell.Aside>
      }
      appShellProps={{
        aside: {
          width: 320,
          breakpoint: "md",
          collapsed: { desktop: false, mobile: true },
        },
      }}
    >
      <Container size="xl" p="lg" style={{ position: "relative" }}>
        <Stack gap="xl">
          <PageHeader
            title="Queued vs Eager Benchmark"
            icon={<IconGauge size={32} color="cyan" />}
            filename="bench.ts"
          />

          <Tabs
            value={tab}
            onChange={(value) =>
              setTab(value === "monitor" ? "monitor" : "compare")
            }
            variant="outline"
            keepMounted={false}
          >
            <Tabs.List mb="xl">
              <Tabs.Tab value="compare">Compare</Tabs.Tab>
              <Tabs.Tab
                value="monitor"
                rightSection={
                  busy ? (
                    <Badge size="xs" variant="light" color="blue" circle>
                      ●
                    </Badge>
                  ) : undefined
                }
              >
                Monitor
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="compare">
              <Stack gap="xl">
                <ScoreboardSection
                  cells={cells}
                  suite={selectedSuite}
                  suites={suites}
                  runs={runs}
                  onSelectSuite={setSelectedSuiteId}
                />

                <ComparisonSection cells={cells} />

                <LatencySection cells={cells} />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="monitor">
              <Stack gap="xl">
                <LiveRunSection run={activeRun} />

                <QueueDepthSection run={activeRun} samples={queueSeries} />

                <HistorySection
                  runs={runs}
                  suites={suites}
                  selectedRunId={effectiveRunId}
                  selectedSuiteId={selectedSuite?._id ?? null}
                  onSelectRun={setSelectedRunId}
                  onSelectSuite={(suiteId) => {
                    setSelectedSuiteId(suiteId);
                    setTab("compare");
                  }}
                />
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Container>
    </CommonAppShell>
  );
}

import { Badge, Card, Group, Stack, Table, Text } from "@mantine/core";
import { Fragment, useMemo } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { RunPhaseTimeline } from "./RunPhaseTimeline";
import { SectionHeading } from "./SectionHeading";
import { MODE_COLOR } from "./charts/chartTheme";
import { formatMs, formatRate, formatSeconds } from "./charts/scale";
import {
  configSummary,
  phaseLabel,
  runPhases,
  scenarioMeta,
  suiteProgress,
  type BenchRun,
  type BenchSuite,
} from "./benchTypes";

export type HistorySectionProps = {
  runs: BenchRun[];
  suites: BenchSuite[];
  selectedRunId: Id<"benchRuns"> | null;
  selectedSuiteId: Id<"benchSuites"> | null;
  onSelectRun: (runId: Id<"benchRuns">) => void;
  onSelectSuite: (suiteId: Id<"benchSuites">) => void;
};

/**
 * Grouped by suite, since a suite is the unit that gets compared. A suite header
 * row selects it for the Compare tab; a run row selects that single run for the
 * live view above.
 */
export function HistorySection({
  runs,
  suites,
  selectedRunId,
  selectedSuiteId,
  onSelectRun,
  onSelectSuite,
}: HistorySectionProps) {
  // One shared time domain so bar lengths compare directly across rows.
  const domainMs = useMemo(
    () => Math.max(...runs.map((r) => runPhases(r).totalMs), 1),
    [runs],
  );

  const groups = useMemo(() => {
    const bySuite = new Map<string, BenchRun[]>();
    const loose: BenchRun[] = [];
    for (const run of runs) {
      if (run.suiteId) {
        bySuite.set(run.suiteId, [...(bySuite.get(run.suiteId) ?? []), run]);
      } else {
        loose.push(run);
      }
    }
    const suiteGroups = suites
      .filter((s) => bySuite.has(s._id))
      .map((suite) => ({
        suite,
        // Oldest first, so the interleaved schedule reads in execution order.
        runs: [...bySuite.get(suite._id)!].sort(
          (a, b) => a.createdAtMs - b.createdAtMs,
        ),
      }));
    return { suiteGroups, loose };
  }, [runs, suites]);

  if (runs.length === 0) {
    return (
      <Card bg="dark.7" p="lg">
        <Stack gap="xs">
          <SectionHeading title="Run history" />
          <Text c="gray.5" size="sm">
            No runs yet.
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Card bg="dark.7" p="lg">
      <Stack gap="md">
        <SectionHeading
          title="Run history"
          right={
            <Text size="xs" c="gray.6">
              Select a comparison to open it
            </Text>
          }
        />

        <Table.ScrollContainer minWidth={860}>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Mode</Table.Th>
                <Table.Th>Repeat</Table.Th>
                <Table.Th ta="right">p50</Table.Th>
                <Table.Th ta="right">p95</Table.Th>
                <Table.Th ta="right">ops/s</Table.Th>
                <Table.Th ta="right">to consistency</Table.Th>
                <Table.Th w={140}>Phases</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groups.suiteGroups.map(({ suite, runs: suiteRunRows }) => {
                const { done, total } = suiteProgress(suite, runs);
                const selected = suite._id === selectedSuiteId;
                return (
                  <Fragment key={suite._id}>
                    <Table.Tr
                      bg={selected ? "dark.5" : "dark.6"}
                      onClick={() => onSelectSuite(suite._id)}
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Td colSpan={8}>
                        <Group gap="sm" wrap="nowrap">
                          <Text size="xs" c="gray.3" fw={600}>
                            {scenarioMeta(suite.config.scenario).label}
                          </Text>
                          <Text size="xs" c="gray.5">
                            {configSummary(suite.config)}
                          </Text>
                          <Badge
                            size="xs"
                            variant="light"
                            color={suite.status === "running" ? "blue" : "gray"}
                          >
                            {done}/{total} runs
                          </Badge>
                          {selected && (
                            <Badge size="xs" variant="light" color="cyan">
                              comparing
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                    {suiteRunRows.map((run) => (
                      <RunRow
                        key={run._id}
                        run={run}
                        domainMs={domainMs}
                        selected={run._id === selectedRunId}
                        onSelect={onSelectRun}
                      />
                    ))}
                  </Fragment>
                );
              })}

              {groups.loose.length > 0 && (
                <Fragment key="loose">
                  <Table.Tr bg="dark.6">
                    <Table.Td colSpan={8}>
                      <Text size="xs" c="gray.3" fw={600}>
                        Single runs
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  {groups.loose.map((run) => (
                    <RunRow
                      key={run._id}
                      run={run}
                      domainMs={domainMs}
                      selected={run._id === selectedRunId}
                      onSelect={onSelectRun}
                    />
                  ))}
                </Fragment>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </Card>
  );
}

function RunRow({
  run,
  domainMs,
  selected,
  onSelect,
}: {
  run: BenchRun;
  domainMs: number;
  selected: boolean;
  onSelect: (runId: Id<"benchRuns">) => void;
}) {
  const { enqueueMs, drainMs, totalMs } = runPhases(run);
  return (
    <Table.Tr
      onClick={() => onSelect(run._id)}
      style={{
        cursor: "pointer",
        borderLeft: selected
          ? `3px solid ${MODE_COLOR[run.config.mode]}`
          : "3px solid transparent",
      }}
    >
      <Table.Td>
        <Badge
          size="sm"
          variant="light"
          color={run.config.mode === "async" ? "blue" : "orange"}
        >
          {run.config.mode === "async" ? "Queued" : "Eager"}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="gray.5" style={{ fontVariantNumeric: "tabular-nums" }}>
          {run.repeatIndex === undefined ? "–" : `#${run.repeatIndex + 1}`}
        </Text>
      </Table.Td>
      <Numeric>
        {run.results ? formatMs(run.results.latency.jobLatency.p50) : "–"}
      </Numeric>
      <Numeric>
        {run.results ? formatMs(run.results.latency.jobLatency.p95) : "–"}
      </Numeric>
      <Numeric>
        {run.results ? formatRate(run.results.throughput.enqueueOpsPerSec) : "–"}
      </Numeric>
      <Numeric>{formatSeconds(totalMs)}</Numeric>
      <Table.Td>
        <RunPhaseTimeline
          mode={run.config.mode}
          enqueueMs={enqueueMs}
          drainMs={drainMs}
          domainMs={domainMs}
          height={12}
          showLabels={false}
        />
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="gray.4">
          {phaseLabel(run.status)}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

function Numeric({ children }: { children: React.ReactNode }) {
  return (
    <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
      <Text size="xs" c="white">
        {children}
      </Text>
    </Table.Td>
  );
}

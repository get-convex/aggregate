import { Alert, Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowsSort,
  IconCheck,
  IconClockPlay,
  IconX,
} from "@tabler/icons-react";
import { BenchStatRow, type BenchStatTile } from "./BenchStatRow";
import { RunPhaseTimeline } from "./RunPhaseTimeline";
import { MODE_COLOR } from "./charts/chartTheme";
import { formatCount, formatMs, formatRate, formatSeconds } from "./charts/scale";
import {
  configSummary,
  isInFlight,
  phaseLabel,
  runPhases,
  scenarioMeta,
  type BenchRun,
} from "./benchTypes";

export function LiveRunSection({ run }: { run: BenchRun | null }) {
  if (!run) {
    return (
      <Card bg="dark.7" p="md">
        <Stack gap="xs">
          <Title order={2} c="white">
            No run selected
          </Title>
          <Text c="gray.4" size="sm">
            Run a comparison from the sidebar, or pick a run from the history
            below.
          </Text>
        </Stack>
      </Card>
    );
  }

  const { enqueueMs, drainMs, totalMs } = runPhases(run);
  const results = run.results;
  const live = isInFlight(run.status);
  const pendingCommitsFailure = run.errors?.some((e) => e.includes("PENDING_COMMITS"));

  const tiles: BenchStatTile[] = [
    {
      label: "Ops committed",
      value: `${formatCount(run.progress.opsCommitted || results?.ops.committed || 0)} / ${formatCount(run.config.totalOps)}`,
    },
    {
      label: "Jobs done",
      value: `${formatCount(run.progress.jobsSucceeded)} / ${formatCount(run.progress.jobsScheduled)}`,
      hint: run.progress.jobsFailed > 0 ? `${run.progress.jobsFailed} failed` : undefined,
      status: run.progress.jobsFailed > 0 ? "warning" : undefined,
    },
    {
      label: "p50 write",
      value: results ? formatMs(results.latency.jobLatency.p50) : "–",
      hint: "end to end",
    },
    {
      label: "p95 write",
      value: results ? formatMs(results.latency.jobLatency.p95) : "–",
      hint: "end to end",
    },
    {
      label: "Throughput",
      value: results
        ? `${formatRate(results.throughput.enqueueOpsPerSec)} ops/s`
        : "–",
      hint: run.config.mode === "async" ? "enqueue only" : undefined,
    },
    {
      label: "Peak queue",
      value: formatCount(
        results?.queue.peakOperations ?? run.progress.lastQueueOperations,
      ),
      hint: "pending ops",
    },
    {
      label: "Drain",
      value: formatSeconds(drainMs),
    },
    {
      label: "Concurrency",
      value: results
        ? `${results.concurrency.achieved} / ${results.concurrency.offered}`
        : "–",
      hint: "achieved / offered",
      status:
        results && results.concurrency.achieved <= 1 ? "warning" : undefined,
    },
  ];

  return (
    <Card bg="dark.7" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Badge
              variant="light"
              leftSection={
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: MODE_COLOR[run.config.mode],
                  }}
                />
              }
              color={run.config.mode === "async" ? "blue" : "orange"}
            >
              {run.config.mode === "async" ? "Queued" : "Eager"}
            </Badge>
            <Text c="white" fw={500}>
              {scenarioMeta(run.config.scenario).label}
            </Text>
            <Text c="dimmed" size="sm">
              {configSummary(run.config)}
            </Text>
            {run.repeatIndex !== undefined && (
              <Badge size="sm" variant="default">
                repeat {run.repeatIndex + 1}
              </Badge>
            )}
          </Group>
          {/* Phase is carried by an icon and a word, never by color alone. */}
          <Badge
            color={statusColor(run.status)}
            variant="light"
            leftSection={statusIcon(run.status)}
          >
            {phaseLabel(run.status)}
          </Badge>
        </Group>

        <Stack gap={2} align="center">
          <Text
            fw={700}
            c="white"
            style={{
              fontSize: "clamp(2.75rem, 8vw, 4.5rem)",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.03em",
            }}
          >
            {formatSeconds(totalMs)}
          </Text>
          <Text
            tt="uppercase"
            c="gray.5"
            size="xs"
            style={{ letterSpacing: "0.12em" }}
          >
            time to consistency{live ? " · so far" : ""}
          </Text>
        </Stack>

        <RunPhaseTimeline
          mode={run.config.mode}
          enqueueMs={enqueueMs}
          drainMs={drainMs}
        />

        {pendingCommitsFailure && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={18} />}
            title="Eager write blocked by a non-empty queue"
          >
            While queued writes are waiting to be applied,
            <code> assertNoPendingCommits </code> makes every eager write, every
            non-stale read, and even <code>clear</code> throw{" "}
            <code>PENDING_COMMITS</code> on this aggregate. Wait for the worker to
            drain, then run again.
          </Alert>
        )}

        {run.errors && run.errors.length > 0 && !pendingCommitsFailure && (
          <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Run failed">
            {run.errors.join("; ")}
          </Alert>
        )}

        <BenchStatRow tiles={tiles} />

      </Stack>
    </Card>
  );
}

function statusColor(status: BenchRun["status"]): string {
  if (status === "done") return "green";
  if (status === "failed") return "red";
  if (status === "canceled") return "gray";
  return "blue";
}

function statusIcon(status: BenchRun["status"]) {
  if (status === "enqueuing") return <IconClockPlay size={14} />;
  if (status === "draining") return <IconArrowsSort size={14} />;
  if (status === "done") return <IconCheck size={14} />;
  if (status === "failed" || status === "canceled") return <IconX size={14} />;
  return <IconClockPlay size={14} />;
}

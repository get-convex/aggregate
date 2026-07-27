import { Card, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { QueueDepthChart, type QueueSeries } from "./charts/QueueDepthChart";
import { SectionHeading } from "./SectionHeading";
import { formatCount } from "./charts/scale";
import { runPhases, type BenchRun, type QueueSample } from "./benchTypes";

export function QueueDepthSection({
  run,
  samples,
}: {
  run: BenchRun | null;
  samples: QueueSample[];
}) {
  const series = useMemo<QueueSeries[]>(() => {
    if (!run || samples.length === 0) return [];
    const start = run.enqueueStartedAtMs ?? run.createdAtMs;
    const { enqueueMs } = runPhases(run);
    return [
      {
        label: run.config.mode === "async" ? "Queued run" : "Eager run",
        mode: run.config.mode,
        enqueueEndedAt: run.enqueueEndedAtMs ? enqueueMs : undefined,
        points: samples.map((s) => ({
          t: Math.max(s.atMs - start, 0),
          operations: s.operations,
          worker: s.worker,
          phase: s.phase,
        })),
      },
    ];
  }, [run, samples]);

  if (!run) return null;

  return (
    <Card bg="dark.7" p="lg">
      <Stack gap="sm">
        <SectionHeading
          title="Pending operations"
          figure={
            run.results
              ? formatCount(run.results.queue.peakOperations)
              : formatCount(run.progress.lastQueueOperations)
          }
          figureLabel="peak"
        />
        {series.length === 0 ? (
          <Text c="gray.5" size="sm">
            No samples yet.
          </Text>
        ) : (
          <QueueDepthChart series={series} />
        )}
      </Stack>
    </Card>
  );
}

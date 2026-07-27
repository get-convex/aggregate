import { Card, Divider, Stack, Text } from "@mantine/core";
import { ChartLegend, type LegendItem } from "./charts/ChartLegend";
import {
  ConsistencyChart,
  type ConsistencySeries,
} from "./charts/ConsistencyChart";
import { INK, MODE_COLOR } from "./charts/chartTheme";
import { MODES } from "./benchTypes";
import { SectionHeading } from "./SectionHeading";
import { TimeToConsistency } from "./TimeToConsistency";
import type { CellStats } from "./suiteStats";

/**
 * The page's main exhibit: operations not yet applied, over time, both modes on
 * one axis. It's the one quantity that means the same thing in both modes, so it
 * is the one place they are compared directly — the time-to-consistency readout
 * beneath it is the width of the curves as a figure.
 */
export function ConsistencySection({
  series,
  cells,
  burstMarksMs = [],
}: {
  series: ConsistencySeries[];
  /** Queued first, eager second. */
  cells: CellStats[];
  /** When the workload's bursts were due, if the scenario has any. */
  burstMarksMs?: number[];
}) {
  const drawable = series.filter((s) => s.points.length > 0);
  const hasQueue = drawable.some((s) => s.points.some((p) => p.queued > 0));
  // One entry per mode however many repeats there are — colour is the mode. A
  // queued run's dashed queue line is filed under its mode, not as a third
  // series.
  const legend: LegendItem[] = [];
  for (const mode of MODES) {
    const group = drawable.filter((s) => s.mode === mode);
    if (group.length === 0) continue;
    legend.push({
      label:
        group.length > 1
          ? `${group[0].label} · ${group.length} runs`
          : group[0].label,
      color: MODE_COLOR[mode],
      shape: "line",
      group: mode,
    });
    // Only when there's a queue to explain — otherwise the entry names a line
    // that never appears.
    if (mode === "async" && hasQueue) {
      legend.push({
        label: "in queue",
        color: MODE_COLOR.async,
        shape: "dashedLine",
        group: mode,
      });
    }
  }
  if (burstMarksMs.some((t) => t > 0)) {
    legend.push({ label: "burst due", color: INK.muted, shape: "dashedLine" });
  }

  return (
    <Card bg="dark.7" p="lg">
      <Stack gap="md">
        <SectionHeading
          title="Operations not yet applied"
          right={legend.length > 0 ? <ChartLegend items={legend} /> : undefined}
        />
        {drawable.length === 0 ? (
          <Text c="gray.5" size="sm">
            {cells.length === 0
              ? "Run a comparison to populate this chart."
              : "No samples yet."}
          </Text>
        ) : (
          <ConsistencyChart series={drawable} marksMs={burstMarksMs} />
        )}
        {cells.some((cell) => cell.totalMs !== null) && (
          <>
            <Divider color="dark.5" />
            <TimeToConsistency cells={cells} />
          </>
        )}
      </Stack>
    </Card>
  );
}

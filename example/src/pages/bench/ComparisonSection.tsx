import { Card, Stack, Text } from "@mantine/core";
import {
  GroupedBarChart,
  type BarSeries,
  type BarValue,
} from "./charts/GroupedBarChart";
import { SectionHeading } from "./SectionHeading";
import { formatMs, formatRate } from "./charts/scale";
import type { CellStats, Spread } from "./suiteStats";

/**
 * Each mode against itself. A queued write's latency is the time to accept it
 * into the queue and an eager write's is the time to apply it, so p50 queued
 * beside p50 eager compares two different events; the same goes for the rate
 * writers saw. Grouping by mode puts a mode's percentiles together, where the
 * shape of each is what there is to read, and keeps the modes off a shared bar.
 *
 * Faceted by unit — latency in ms, throughput in ops/s. Never one chart mixing
 * them. Bars are medians over the suite's repeats with min–max whiskers.
 */
/** Shared by every facet, so all bars rise from the same baseline. */
const SERIES_LABEL_WIDTH = 124;

export function ComparisonSection({ cells }: { cells: CellStats[] }) {
  const order = cells.filter((c) => c.n > 0);
  if (order.length === 0) return null;

  // One group per mode; the series repeat inside each and take the mode's color.
  const byMode = (
    picks: { label: string; pick: (cell: CellStats) => Spread | null }[],
  ): BarSeries[] =>
    picks.map(({ label, pick }) => ({
      label,
      color: "transparent",
      values: order.map((cell) => toBarValue(pick(cell), cell.color)),
    }));

  return (
    <Card bg="dark.7" p="lg">
      <Stack gap="lg">
        <SectionHeading title="Within each mode" />

        <Facet
          title="Write latency"
          groups={order.map((c) => c.label)}
          series={byMode([
            { label: "p50", pick: (c) => c.p50 },
            { label: "p95", pick: (c) => c.p95 },
            { label: "p99", pick: (c) => c.p99 },
          ])}
          format={formatMs}
        />

        {/* Two observers of one run, not two phases: the rate a writer saw, and
            the rate the aggregate actually became consistent at. For queued
            writes the gap between them is the whole trade being measured; for
            eager writes the two coincide. */}
        <Facet
          title="Throughput (ops/s)"
          groups={order.map((c) => c.label)}
          series={byMode([
            { label: "as seen by writers", pick: (c) => c.enqueueOpsPerSec },
            { label: "to consistency", pick: (c) => c.applyOpsPerSec },
          ])}
          format={formatRate}
        />
      </Stack>
    </Card>
  );
}

function toBarValue(spread: Spread | null, color: string): BarValue | null {
  if (!spread) return null;
  return spread.n > 1
    ? { value: spread.median, low: spread.min, high: spread.max, color }
    : { value: spread.median, color };
}

function Facet({
  title,
  groups,
  series,
  format,
}: {
  title: string;
  groups: string[];
  series: BarSeries[];
  format: (v: number) => string;
}) {
  return (
    <Stack gap={8}>
      <Text
        tt="uppercase"
        size="xs"
        c="gray.5"
        fw={600}
        style={{ letterSpacing: "0.1em" }}
      >
        {title}
      </Text>
      <GroupedBarChart
        groups={groups}
        series={series}
        format={format}
        ariaLabel={title}
        seriesLabelWidth={SERIES_LABEL_WIDTH}
      />
    </Stack>
  );
}

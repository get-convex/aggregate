import { Card, Stack, Text } from "@mantine/core";
import { ChartLegend } from "./charts/ChartLegend";
import {
  GroupedBarChart,
  type BarSeries,
  type BarValue,
} from "./charts/GroupedBarChart";
import { SectionHeading } from "./SectionHeading";
import { MODE_COLOR } from "./charts/chartTheme";
import { formatMs, formatRate, formatSeconds } from "./charts/scale";
import type { CellStats, Spread } from "./suiteStats";

/**
 * Faceted by unit — latency in ms, throughput in ops/s, time in seconds, work in
 * documents. Never one chart mixing them.
 *
 * Bars are medians over the suite's repeats with min–max whiskers, so a reader
 * can see whether two bars have actually separated.
 */
export function ComparisonSection({
  cells,
}: {
  cells: { queued: CellStats; eager: CellStats };
}) {
  const { queued, eager } = cells;
  if (queued.n === 0 || eager.n === 0) return null;

  // Queued first everywhere on the page, so the legend, the bar order within each
  // group, and the scoreboard columns all read the same way.
  const order = [queued, eager];
  const series = (picks: ((cell: CellStats) => Spread | null)[]): BarSeries[] =>
    order.map((cell) => ({
      label: cell.mode === "async" ? "Queued" : "Eager",
      color: MODE_COLOR[cell.mode],
      values: picks.map((pick) => toBarValue(pick(cell))),
    }));

  return (
    <Card bg="dark.7" p="lg">
      <Stack gap="lg">
        <SectionHeading
          title="Queued vs eager"
          right={
            <ChartLegend
              items={order.map((cell) => ({
                label: cell.mode === "async" ? "Queued" : "Eager",
                color: MODE_COLOR[cell.mode],
                shape: "swatch" as const,
              }))}
            />
          }
        />

        <Facet
          title="Write latency"
          groups={["p50", "p95", "p99"]}
          series={series([(c) => c.p50, (c) => c.p95, (c) => c.p99])}
          format={formatMs}
        />

        <Facet
          title="Throughput (ops/s)"
          groups={["enqueue", "incl. drain"]}
          series={series([(c) => c.enqueueOpsPerSec, (c) => c.applyOpsPerSec])}
          format={formatRate}
        />

        <Facet
          title="Time"
          groups={["enqueue", "drain", "total"]}
          series={series([(c) => c.enqueueMs, (c) => c.drainMs, (c) => c.totalMs])}
          format={formatSeconds}
        />

        <Facet
          title="Documents per operation"
          groups={["written", "read"]}
          series={series([
            (c) => c.documentsWrittenPerOp,
            (c) => c.documentsReadPerOp,
          ])}
          format={(v) => v.toFixed(1)}
        />
      </Stack>
    </Card>
  );
}

function toBarValue(spread: Spread | null): BarValue | null {
  if (!spread) return null;
  return spread.n > 1
    ? { value: spread.median, low: spread.min, high: spread.max }
    : { value: spread.median };
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
      />
    </Stack>
  );
}

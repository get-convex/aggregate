import { Card, Group, Stack, Text } from "@mantine/core";
import { LatencyHistogram } from "./charts/LatencyHistogram";
import { SectionHeading } from "./SectionHeading";
import { bucketExtent } from "./charts/histBuckets";
import { formatCount } from "./charts/scale";
import type { CellStats } from "./suiteStats";

/**
 * Small multiples over a shared x-domain rather than overlaid — overlapping
 * distributions are unreadable, and a shared domain makes the shift between them
 * obvious.
 *
 * Each histogram pools every repeat's buckets, so it shows the shape of the whole
 * sample rather than of whichever single run happened to be selected.
 */
export function LatencySection({ cells }: { cells: CellStats[] }) {
  const order = cells.filter((c) => c.jobCount > 0);
  if (order.length === 0) return null;

  const domain = sharedDomain(order.map((c) => c.buckets));

  return (
    <Card bg="dark.7" p="lg">
      <Stack gap="lg">
        <SectionHeading title="Write latency distribution" />
        {order.map((cell) => (
          <Stack key={cell.mode} gap={4}>
            <Group gap={6}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: cell.color,
                }}
              />
              <Text size="sm" c="white">
                {cell.label}
              </Text>
              <Text size="xs" c="dimmed">
                {formatCount(cell.jobCount)} jobs over {cell.n} run
                {cell.n === 1 ? "" : "s"}
              </Text>
            </Group>
            <LatencyHistogram
              buckets={cell.buckets}
              color={cell.color}
              name={cell.label}
              domain={domain}
              percentiles={percentiles(cell)}
            />
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

/** Median percentile across repeats — the same numbers the scoreboard quotes. */
function percentiles(cell: CellStats) {
  return [
    { label: "p50", spread: cell.p50 },
    { label: "p95", spread: cell.p95 },
    { label: "p99", spread: cell.p99 },
  ]
    .filter((p) => p.spread !== null)
    .map((p) => ({ label: p.label, valueMs: p.spread!.median }));
}

function sharedDomain(bucketSets: number[][]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const buckets of bucketSets) {
    const [a, b] = bucketExtent(buckets);
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  return Number.isFinite(lo) ? [lo, hi] : [0, 1];
}

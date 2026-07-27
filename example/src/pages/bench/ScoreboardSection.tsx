import { Box, Card, Group, Select, Stack, Text, Tooltip } from "@mantine/core";
import { MODE_COLOR, INK } from "./charts/chartTheme";
import { formatMs, formatRate, formatSeconds } from "./charts/scale";
import {
  ratio,
  rangesOverlap,
  type CellStats,
  type Spread,
} from "./suiteStats";
import {
  suiteLabel,
  suiteProgress,
  type BenchMode,
  type BenchRun,
  type BenchSuite,
} from "./benchTypes";
import type { Id } from "../../../convex/_generated/dataModel";

type Metric = {
  label: string;
  /** Unit shown per cell, so a bare number never floats without one. */
  unit?: string;
  pick: (cell: CellStats) => Spread | null;
  format: (v: number) => string;
  better: "lower" | "higher";
  verb: string;
};

const METRICS: Metric[] = [
  { label: "p50 write", pick: (c) => c.p50, format: formatMs, better: "lower", verb: "faster" },
  { label: "p95 write", pick: (c) => c.p95, format: formatMs, better: "lower", verb: "faster" },
  { label: "p99 write", pick: (c) => c.p99, format: formatMs, better: "lower", verb: "faster" },
  {
    label: "Write throughput",
    unit: "ops/s",
    pick: (c) => c.enqueueOpsPerSec,
    format: formatRate,
    better: "higher",
    verb: "higher",
  },
  {
    label: "Time to consistency",
    pick: (c) => c.totalMs,
    format: formatSeconds,
    better: "lower",
    verb: "faster",
  },
  {
    label: "Docs written / op",
    pick: (c) => c.documentsWrittenPerOp,
    format: (v) => v.toFixed(1),
    better: "lower",
    verb: "fewer",
  },
  {
    label: "Docs read / op",
    pick: (c) => c.documentsReadPerOp,
    format: (v) => v.toFixed(1),
    better: "lower",
    verb: "fewer",
  },
];

export type ScoreboardSectionProps = {
  cells: { queued: CellStats; eager: CellStats };
  suite: BenchSuite | null;
  suites: BenchSuite[];
  runs: BenchRun[];
  onSelectSuite: (suiteId: Id<"benchSuites">) => void;
};

/**
 * The head-to-head board. Built to be read from the back of a room: one row per
 * metric, both modes side by side at display size, and the multiple between the
 * medians as its own column.
 *
 * Every number is a median over the suite's repeats, with the observed min–max
 * range beneath it. A delta whose two ranges overlap is struck through rather
 * than quoted — with that much run-to-run noise the medians haven't separated,
 * and the honest reading is "not resolved at this sample size".
 */
export function ScoreboardSection({
  cells,
  suite,
  suites,
  runs,
  onSelectSuite,
}: ScoreboardSectionProps) {
  const { queued, eager } = cells;
  const ready = queued.n > 0 && eager.n > 0;

  const rows = METRICS.map((metric) => {
    const q = metric.pick(queued);
    const e = metric.pick(eager);
    return {
      metric,
      q,
      e,
      r: ratio(q, e, metric.better),
      resolved: q && e ? !rangesOverlap(q, e) : false,
    };
  });

  const headline = rows[0];

  return (
    <Card bg="dark.7" p="xl" radius="md">
      <Stack gap="xl">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Select
            data={suites.map((s) => {
              const { done, total } = suiteProgress(s, runs);
              return {
                value: s._id,
                label: `${suiteLabel(s)} — ${done}/${total}`,
              };
            })}
            value={suite?._id ?? null}
            onChange={(value) => value && onSelectSuite(value as Id<"benchSuites">)}
            placeholder="No comparisons yet"
            allowDeselect={false}
            size="sm"
            w={420}
            styles={{ input: { backgroundColor: "var(--mantine-color-dark-5)" } }}
          />
          <SampleCount queued={queued} eager={eager} />
        </Group>

        {!ready ? (
          <Text c="gray.5" ta="center" py="xl">
            Run a comparison to populate this board.
          </Text>
        ) : (
          <>
            {headline.r !== null && (
              <Stack gap={2} align="center">
                <Text
                  fw={700}
                  c={INK.primary}
                  style={{
                    fontSize: "clamp(3rem, 9vw, 5.5rem)",
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.03em",
                    textDecoration: headline.resolved ? undefined : "line-through",
                  }}
                >
                  {formatRatio(headline.r)}
                </Text>
                <Text
                  tt="uppercase"
                  size="sm"
                  c="gray.5"
                  style={{ letterSpacing: "0.12em" }}
                >
                  {headline.resolved
                    ? "lower p50 write latency, queued vs eager"
                    : "p50 ranges overlap — not resolved at this sample size"}
                </Text>
              </Stack>
            )}

            <Stack gap={0}>
              <Row
                label=""
                cells={[
                  <ColumnHead key="q" mode="async" label="Queued" />,
                  <ColumnHead key="e" mode="eager" label="Eager" />,
                ]}
                trailing={
                  <Text
                    tt="uppercase"
                    size="xs"
                    c="gray.6"
                    ta="right"
                    style={{ letterSpacing: "0.1em" }}
                  >
                    Delta
                  </Text>
                }
                header
              />
              {rows.map(({ metric, q, e, r, resolved }) => {
                const queuedWins = r !== null && r >= 1;
                return (
                  <Row
                    key={metric.label}
                    label={metric.label}
                    cells={[
                      <Value
                        key="q"
                        spread={q}
                        unit={metric.unit}
                        format={metric.format}
                        win={r !== null && queuedWins}
                      />,
                      <Value
                        key="e"
                        spread={e}
                        unit={metric.unit}
                        format={metric.format}
                        win={r !== null && !queuedWins}
                      />,
                    ]}
                    trailing={
                      r === null ? null : (
                        <Delta ratio={r} verb={metric.verb} resolved={resolved} />
                      )
                    }
                  />
                );
              })}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}

function SampleCount({
  queued,
  eager,
}: {
  queued: CellStats;
  eager: CellStats;
}) {
  const label =
    queued.n === eager.n ? `n = ${queued.n}` : `n = ${queued.n} / ${eager.n}`;
  return (
    <Group gap={8} wrap="nowrap">
      <Text
        tt="uppercase"
        size="xs"
        c="gray.5"
        fw={600}
        style={{ letterSpacing: "0.1em", fontVariantNumeric: "tabular-nums" }}
      >
        {label}
      </Text>
      <Text size="xs" c="gray.6">
        {queued.n <= 1 || eager.n <= 1
          ? "single run — no spread"
          : "median · min–max"}
      </Text>
    </Group>
  );
}

function Delta({
  ratio: value,
  verb,
  resolved,
}: {
  ratio: number;
  verb: string;
  resolved: boolean;
}) {
  const body = (
    <Group gap={6} justify="flex-end" align="baseline" wrap="nowrap">
      <Text
        fw={700}
        c={resolved ? INK.primary : INK.muted}
        style={{
          fontSize: "1.375rem",
          fontVariantNumeric: "tabular-nums",
          textDecoration: resolved ? undefined : "line-through",
        }}
      >
        {formatRatio(value >= 1 ? value : 1 / value)}
      </Text>
      <Text size="xs" c="gray.5">
        {verb}
      </Text>
    </Group>
  );
  return resolved ? (
    body
  ) : (
    <Tooltip label="The two ranges overlap — not resolved at this sample size">
      {body}
    </Tooltip>
  );
}

function Row({
  label,
  cells,
  trailing,
  header = false,
}: {
  label: string;
  cells: React.ReactNode[];
  trailing: React.ReactNode;
  header?: boolean;
}) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 1.2fr) 1fr 1fr minmax(110px, 0.9fr)",
        alignItems: header ? "baseline" : "center",
        columnGap: "var(--mantine-spacing-md)",
        padding: header ? "0 0 8px" : "14px 0",
        borderBottom: header
          ? "1px solid var(--mantine-color-dark-4)"
          : "1px solid var(--mantine-color-dark-6)",
      }}
    >
      <Text size="sm" c="gray.4">
        {label}
      </Text>
      {cells}
      {trailing}
    </Box>
  );
}

function ColumnHead({ mode, label }: { mode: BenchMode; label: string }) {
  return (
    <Group gap={8} wrap="nowrap">
      <Box
        w={10}
        h={10}
        style={{ borderRadius: 2, background: MODE_COLOR[mode], flexShrink: 0 }}
      />
      <Text
        tt="uppercase"
        size="xs"
        c="gray.3"
        fw={600}
        style={{ letterSpacing: "0.1em" }}
      >
        {label}
      </Text>
    </Group>
  );
}

function Value({
  spread,
  unit,
  format,
  win,
}: {
  spread: Spread | null;
  unit?: string;
  format: (v: number) => string;
  win: boolean;
}) {
  if (!spread) {
    return (
      <Text c={INK.muted} style={{ fontSize: "1.75rem" }}>
        –
      </Text>
    );
  }
  return (
    <Stack gap={0}>
      <Group gap={5} align="baseline" wrap="nowrap">
        <Text
          fw={win ? 700 : 500}
          c={win ? INK.primary : INK.muted}
          style={{
            fontSize: "1.75rem",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
        >
          {format(spread.median)}
        </Text>
        {unit && (
          <Text size="xs" c="gray.6">
            {unit}
          </Text>
        )}
      </Group>
      {spread.n > 1 && (
        <Text size="xs" c="gray.6" style={{ fontVariantNumeric: "tabular-nums" }}>
          {format(spread.min)} – {format(spread.max)}
        </Text>
      )}
    </Stack>
  );
}

function formatRatio(ratio: number): string {
  const r = ratio >= 1 ? ratio : 1 / ratio;
  return `${r >= 100 ? Math.round(r) : r.toFixed(1)}×`;
}

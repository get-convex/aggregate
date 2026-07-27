import { Box, Group, Stack, Text, Tooltip } from "@mantine/core";
import { INK } from "./charts/chartTheme";
import { formatRatio, formatSeconds } from "./charts/scale";
import { ratio, rangesOverlap, type CellStats } from "./suiteStats";

/**
 * The one number that means the same thing in both modes: first write accepted
 * to the aggregate being consistent. It's the width of each curve above it, read
 * off as a figure — the median over the suite's repeats with the observed range,
 * and queued's multiple against eager.
 *
 * A multiple whose two ranges overlap is struck through rather than quoted — at
 * that much run-to-run noise the medians haven't separated, and the honest
 * reading is "not resolved at this sample size".
 */
export function TimeToConsistency({ cells }: { cells: CellStats[] }) {
  const ready = cells.filter((cell) => cell.totalMs !== null);
  if (ready.length === 0) return null;
  const baseline = cells[1]?.totalMs ?? null;
  const thin = ready.some((cell) => cell.n <= 1);

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Text
          tt="uppercase"
          size="xs"
          c="gray.5"
          fw={600}
          style={{ letterSpacing: "0.1em" }}
        >
          Time to consistency
        </Text>
        <Text size="xs" c="gray.6">
          {thin ? "single run — no spread" : "median · min–max"}
        </Text>
      </Group>
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${ready.length}, minmax(0, 1fr))`,
          columnGap: "var(--mantine-spacing-md)",
        }}
      >
        {ready.map((cell, i) => {
          const spread = cell.totalMs!;
          const r =
            i === 0 && ready.length > 1
              ? ratio(spread, baseline, "lower")
              : null;
          return (
            <Stack key={cell.mode} gap={2}>
              <Group gap={8} wrap="nowrap" align="center">
                <Box
                  w={10}
                  h={10}
                  style={{
                    borderRadius: 2,
                    background: cell.color,
                    flexShrink: 0,
                  }}
                />
                <Text
                  tt="uppercase"
                  size="xs"
                  c="gray.3"
                  fw={600}
                  style={{ letterSpacing: "0.1em" }}
                >
                  {cell.label} · n = {cell.n}
                </Text>
              </Group>
              <Text
                fw={600}
                c={INK.primary}
                style={{
                  fontSize: "1.75rem",
                  lineHeight: 1.1,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                {formatSeconds(spread.median)}
              </Text>
              {spread.n > 1 && (
                <Text
                  size="xs"
                  c="gray.6"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatSeconds(spread.min)} – {formatSeconds(spread.max)}
                </Text>
              )}
              {r !== null && baseline && (
                <Multiple
                  value={r}
                  resolved={!rangesOverlap(spread, baseline)}
                />
              )}
            </Stack>
          );
        })}
      </Box>
    </Stack>
  );
}

/** Queued against eager. Below 1 is a result too; the verb carries direction. */
function Multiple({ value, resolved }: { value: number; resolved: boolean }) {
  const body = (
    <Group gap={6} align="baseline" wrap="nowrap">
      <Text
        fw={700}
        c={!resolved || value < 1 ? INK.muted : INK.primary}
        style={{
          fontSize: "0.9375rem",
          fontVariantNumeric: "tabular-nums",
          textDecoration: resolved ? undefined : "line-through",
        }}
      >
        {formatRatio(value)}
      </Text>
      <Text size="xs" c="gray.5">
        {value >= 1 ? "faster than eager" : "slower than eager"}
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

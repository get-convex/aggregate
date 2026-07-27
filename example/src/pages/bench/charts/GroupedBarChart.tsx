import { Box, Stack, Text } from "@mantine/core";
import { INK, MARK } from "./chartTheme";

export type BarValue = {
  value: number;
  /** Observed range across repeats. Omitted for a single sample. */
  low?: number;
  high?: number;
};

export type BarSeries = {
  label: string;
  color: string;
  /** One entry per group, aligned with `groups`. */
  values: (BarValue | null)[];
};

export type GroupedBarChartProps = {
  groups: string[];
  series: BarSeries[];
  format: (v: number) => string;
  ariaLabel: string;
};

const LABEL_WIDTH = 104;
/** Reserved to the right of the track so a tip label is never clipped. */
const VALUE_GUTTER = 84;
const GROUP_GAP = 18;

/**
 * Horizontal grouped bars with a direct value label at each tip. Used one facet
 * per unit — never one chart mixing ms with ops/s.
 *
 * The bar length is the median over the suite's repeats; the whisker spans the
 * observed min–max. Bars whose whiskers overlap have not separated at this
 * sample size, which is exactly what the reader needs to see before quoting a
 * difference.
 *
 * Laid out in HTML rather than a scaled SVG viewBox: percentage widths make the
 * bars responsive without stretching the label glyphs, which a `viewBox` plus
 * `preserveAspectRatio="none"` does.
 */
export function GroupedBarChart({
  groups,
  series,
  format,
  ariaLabel,
}: GroupedBarChartProps) {
  const max = Math.max(
    ...series.flatMap((s) =>
      s.values.flatMap((v) =>
        v ? [v.value, v.high ?? v.value].filter(Number.isFinite) : [],
      ),
    ),
    0,
  );

  if (max === 0) {
    return (
      <Text size="sm" c="dimmed">
        No data yet.
      </Text>
    );
  }

  const pct = (v: number) => (v / max) * 100;

  return (
    <Stack gap={GROUP_GAP} role="img" aria-label={ariaLabel}>
      {groups.map((group, gi) => (
        <Box
          key={group}
          style={{
            display: "grid",
            gridTemplateColumns: `${LABEL_WIDTH}px minmax(0, 1fr)`,
            alignItems: "center",
            columnGap: 12,
          }}
        >
          <Text size="sm" c={INK.secondary}>
            {group}
          </Text>
          <Stack gap={MARK.surfaceGap}>
            {series.map((s) => {
              const entry = s.values[gi];
              if (!entry || !Number.isFinite(entry.value)) return null;
              const barPct = Math.max(pct(entry.value), entry.value > 0 ? 0.5 : 0);
              const hasRange =
                entry.low !== undefined &&
                entry.high !== undefined &&
                entry.high > entry.low;
              return (
                <Box
                  key={s.label}
                  style={{
                    position: "relative",
                    height: MARK.barMaxThickness,
                    marginRight: VALUE_GUTTER,
                  }}
                >
                  <Box
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: `${barPct}%`,
                      background: s.color,
                      // Rounded at the data end, square at the baseline.
                      borderRadius: `1px ${MARK.barEndRadius}px ${MARK.barEndRadius}px 1px`,
                    }}
                  />
                  {hasRange && (
                    <Whisker
                      lowPct={pct(entry.low!)}
                      highPct={pct(entry.high!)}
                    />
                  )}
                  {/* Always outside the tip, so a short bar can't clip it. */}
                  <Text
                    span
                    fw={600}
                    c={INK.primary}
                    style={{
                      position: "absolute",
                      left: `calc(${Math.max(barPct, hasRange ? pct(entry.high!) : 0)}% + 10px)`,
                      top: 0,
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      fontSize: "0.875rem",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {format(entry.value)}
                  </Text>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

/**
 * Drawn in ink rather than the series color: it's an uncertainty annotation on
 * the mark, not a second series, and it has to stay legible on top of the fill.
 */
function Whisker({ lowPct, highPct }: { lowPct: number; highPct: number }) {
  const capHeight = Math.round(MARK.barMaxThickness * 0.6);
  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: `${lowPct}%`,
        width: `${Math.max(highPct - lowPct, 0)}%`,
        display: "flex",
        alignItems: "center",
      }}
    >
      <Cap />
      <Box style={{ flex: 1, height: 1, background: INK.primary, opacity: 0.85 }} />
      <Cap />
    </Box>
  );

  function Cap() {
    return (
      <Box
        style={{
          width: 1,
          height: capHeight,
          background: INK.primary,
          opacity: 0.85,
          flexShrink: 0,
        }}
      />
    );
  }
}

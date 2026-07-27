import { Box, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { ChartFrame } from "./ChartFrame";
import { ChartTooltip } from "./ChartTooltip";
import { INK, MARK, MODE_COLOR } from "./chartTheme";
import { bucketExtent, bucketIndexOf, bucketLowerBound } from "./histBuckets";
import { formatCount, formatMs, verticalBarPath } from "./scale";

export type LatencyHistogramProps = {
  buckets: number[];
  mode: "async" | "eager";
  /** Marked with hairline rules and labelled above the plot. */
  percentiles?: { label: string; valueMs: number }[];
  /** Shared across small multiples so two runs are directly comparable. */
  domain?: [number, number];
  height?: number;
};

export function LatencyHistogram({
  buckets,
  mode,
  percentiles = [],
  domain,
  height = 200,
}: LatencyHistogramProps) {
  const [hover, setHover] = useState<{ index: number; left: number } | null>(
    null,
  );
  const [lo, hi] = domain ?? bucketExtent(buckets);
  const visible = buckets.slice(lo, hi + 1);
  const yMax = Math.max(...visible, 1);
  const color = MODE_COLOR[mode];

  if (visible.length === 0) return null;

  return (
    <Stack gap={4}>
      <Box pos="relative">
        <ChartFrame
          height={height}
          xDomain={[lo, hi + 1]}
          yDomain={[0, yMax]}
          yTickMinStep={1}
          ariaLabel={`Distribution of ${mode} write latency`}
          formatX={(v) => formatMs(bucketLowerBound(v))}
          formatY={(v) => formatCount(v)}
        >
          {({ x, y, innerHeight }) => {
            const slot = x(lo + 1) - x(lo);
            const width = Math.min(
              Math.max(slot - MARK.surfaceGap, 1),
              MARK.barMaxThickness,
            );
            return (
              <g>
                {visible.map((count, i) => {
                  if (count === 0) return null;
                  const index = lo + i;
                  const left = x(index) + (slot - width) / 2;
                  return (
                    <path
                      key={index}
                      d={verticalBarPath(
                        left,
                        width,
                        y(count),
                        innerHeight,
                        MARK.barEndRadius,
                      )}
                      fill={color}
                      onPointerEnter={(event) =>
                        setHover({
                          index,
                          left: event.clientX,
                        })
                      }
                      onPointerLeave={() => setHover(null)}
                    />
                  );
                })}

                {percentiles.map((p, i) => {
                  const at = bucketIndexOf(p.valueMs);
                  if (at < lo || at > hi + 1) return null;
                  return (
                    <g key={p.label}>
                      <line
                        x1={x(at)}
                        x2={x(at)}
                        y1={0}
                        y2={innerHeight}
                        stroke={INK.muted}
                        strokeWidth={1}
                      />
                      {/* Stagger the labels down the plot: percentiles sit
                          close together on a log axis and would otherwise
                          overlap into unreadable runs like "p95p99". */}
                      <text
                        x={x(at) + 3}
                        y={10 + i * 12}
                        fill={INK.muted}
                        fontSize={10}
                      >
                        {p.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          }}
        </ChartFrame>

        {hover && (
          <ChartTooltip
            left={hover.left}
            top={height - 8}
            title={`${formatMs(bucketLowerBound(hover.index))} – ${formatMs(
              bucketLowerBound(hover.index + 1),
            )}`}
            rows={[
              {
                label: "jobs",
                value: formatCount(buckets[hover.index] ?? 0),
                color,
              },
            ]}
          />
        )}
      </Box>
      {percentiles.length > 0 && (
        <Text size="xs" c="dimmed">
          {percentiles.map((p) => `${p.label} ${formatMs(p.valueMs)}`).join(" · ")}
        </Text>
      )}
    </Stack>
  );
}

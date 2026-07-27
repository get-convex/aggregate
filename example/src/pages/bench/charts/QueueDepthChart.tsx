import { Box, Stack } from "@mantine/core";
import { useMemo, useState } from "react";
import { ChartFrame } from "./ChartFrame";
import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";
import { CHART, INK, MARK, MODE_COLOR } from "./chartTheme";
import { formatCount, formatSeconds } from "./scale";

export type QueuePoint = {
  /** Ms since the run started. */
  t: number;
  operations: number;
  worker: "idle" | "running" | "stopped" | null;
  phase: "enqueuing" | "draining";
};

export type QueueSeries = {
  label: string;
  mode: "async" | "eager";
  points: QueuePoint[];
  /** Ms since run start when enqueuing ended, for the phase band. */
  enqueueEndedAt?: number;
};

const RIBBON_HEIGHT = 8;

/**
 * Pending operations over time — the clearest picture of what queued writes
 * actually do. The queue ramps while enqueuing, then drains; an eager run sits
 * flat at zero, which is the comparison in one image.
 *
 * The worker-status ribbon shares the x scale rather than taking a second
 * y-axis (never a dual-axis chart).
 */
export function QueueDepthChart({
  series,
  height = 240,
}: {
  series: QueueSeries[];
  height?: number;
}) {
  const [hover, setHover] = useState<{ t: number; left: number } | null>(null);

  const { xMax, yMax } = useMemo(() => {
    let x = 0;
    let y = 0;
    for (const s of series) {
      for (const p of s.points) {
        if (p.t > x) x = p.t;
        if (p.operations > y) y = p.operations;
      }
    }
    return { xMax: x || 1, yMax: y || 1 };
  }, [series]);

  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return null;
  }

  const primary = series[0];

  return (
    <Stack gap="xs">
      <ChartLegend
        items={series.map((s) => ({
          label: s.label,
          color: MODE_COLOR[s.mode],
          shape: "line" as const,
        }))}
      />
      <Box pos="relative">
        <ChartFrame
          height={height}
          xDomain={[0, xMax]}
          yDomain={[0, yMax]}
          yTickMinStep={1}
          ariaLabel="Pending aggregate operations over time, with background worker status"
          formatX={(v) => formatSeconds(v)}
          formatY={(v) => formatCount(v)}
          bottomGutter={RIBBON_HEIGHT + 6}
          onPointerMove={({ xValue, clientX }) =>
            setHover({ t: xValue, left: clientX })
          }
          onPointerLeave={() => setHover(null)}
          background={({ x, innerHeight }) =>
            primary.enqueueEndedAt !== undefined ? (
              <g>
                {/* Recessive band over the enqueue window, so the ramp-then-
                    drain shape reads without needing the legend. */}
                <rect
                  x={0}
                  y={0}
                  width={Math.max(x(primary.enqueueEndedAt), 0)}
                  height={innerHeight}
                  fill={CHART.band}
                />
                <text x={4} y={12} fill={INK.muted} fontSize={10}>
                  enqueuing
                </text>
              </g>
            ) : null
          }
          gutter={({ x, innerWidth }) => (
            <g>
              {primary.points.map((p, i) => {
                const next = primary.points[i + 1];
                const x0 = x(p.t);
                const x1 = next ? x(next.t) : innerWidth;
                return (
                  <rect
                    key={`w-${p.t}-${i}`}
                    x={x0}
                    y={0}
                    width={Math.max(x1 - x0, 0)}
                    height={RIBBON_HEIGHT}
                    fill={
                      p.worker === "running"
                        ? MODE_COLOR[primary.mode]
                        : CHART.idle
                    }
                  />
                );
              })}
            </g>
          )}
        >
          {({ x, y, innerHeight }) => (
            <g>
              {series.map((s) => {
                if (s.points.length === 0) return null;
                const color = MODE_COLOR[s.mode];
                const line = s.points
                  .map(
                    (p, i) =>
                      `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.operations)}`,
                  )
                  .join(" ");
                const area =
                  `${line} L ${x(s.points[s.points.length - 1].t)} ${innerHeight}` +
                  ` L ${x(s.points[0].t)} ${innerHeight} Z`;
                return (
                  <g key={s.label}>
                    <path
                      d={area}
                      fill={color}
                      fillOpacity={MARK.areaFillOpacity}
                    />
                    <path
                      d={line}
                      fill="none"
                      stroke={color}
                      strokeWidth={MARK.lineWidth}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}

              {hover && (
                <line
                  x1={x(hover.t)}
                  x2={x(hover.t)}
                  y1={0}
                  y2={innerHeight}
                  stroke={INK.muted}
                  strokeWidth={1}
                />
              )}
            </g>
          )}
        </ChartFrame>

        {hover && (
          <ChartTooltip
            title={formatSeconds(hover.t)}
            left={hover.left}
            top={height - 8}
            rows={series.map((s) => {
              const point = nearest(s.points, hover.t);
              return {
                label: s.label,
                color: MODE_COLOR[s.mode],
                value: point
                  ? `${formatCount(point.operations)} queued${
                      point.worker ? ` · worker ${point.worker}` : ""
                    }`
                  : "–",
              };
            })}
          />
        )}
      </Box>
    </Stack>
  );
}

function nearest(points: QueuePoint[], t: number): QueuePoint | undefined {
  let best: QueuePoint | undefined;
  let bestDelta = Infinity;
  for (const p of points) {
    const delta = Math.abs(p.t - t);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = p;
    }
  }
  return best;
}

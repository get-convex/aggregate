import { Box } from "@mantine/core";
import { useMemo, useState } from "react";
import { ChartFrame } from "./ChartFrame";
import { ChartTooltip } from "./ChartTooltip";
import { INK, MARK, MODE_COLOR } from "./chartTheme";
import { formatCount, formatSeconds } from "./scale";
import { MODES, type BenchMode } from "../benchTypes";
import type { ConsistencyPoint } from "../../../../convex/utils/benchMath";

export type ConsistencySeries = {
  mode: BenchMode;
  label: string;
  repeatIndex: number;
  points: ConsistencyPoint[];
};

/**
 * Operations not yet in the aggregate, over time, both modes on one axis. A
 * curve's width is its run's time to consistency and its shape is how the mode
 * got there.
 *
 * One curve per repeat, colored by mode rather than by run: the spread within a
 * mode should read as a band, and a hue per run would imply each repeat is its
 * own thing to identify rather than one sample of the same thing. A curve stops
 * where its run stopped — carried flat to the chart's full width it read as a run
 * still going long after it had finished.
 *
 * The dashed line under a queued curve is the queue itself. The gap between the
 * two is work no writer has handed over yet, so together they say whether a
 * queued run is waiting on its writers or on the worker.
 */
export function ConsistencyChart({
  series,
  marksMs = [],
  height = 240,
}: {
  series: ConsistencySeries[];
  /**
   * Elapsed times to rule off behind the curves — the bursty scenario's burst
   * schedule. A curve still up at the next mark is a burst the mode hadn't
   * absorbed before the following one arrived. Empty for other scenarios.
   */
  marksMs?: number[];
  height?: number;
}) {
  const [hover, setHover] = useState<{ t: number; left: number } | null>(null);

  const { xMax, yMax } = useMemo(() => {
    let x = 0;
    let y = 0;
    for (const s of series) {
      for (const p of s.points) {
        if (p.elapsedMs > x) x = p.elapsedMs;
        if (p.outstanding > y) y = p.outstanding;
      }
    }
    return { xMax: x || 1, yMax: y || 1 };
  }, [series]);

  const drawable = useMemo(
    () => series.filter((s) => s.points.length > 0),
    [series],
  );
  if (drawable.length === 0) return null;

  return (
    <Box pos="relative">
      <ChartFrame
        height={height}
        xDomain={[0, xMax]}
        yDomain={[0, yMax]}
        ariaLabel="Operations not yet applied to the aggregate over time, queued against eager"
        formatX={(v) => formatSeconds(v)}
        formatY={(v) => formatCount(v)}
        onPointerMove={({ xValue, offsetX }) =>
          setHover({ t: xValue, left: offsetX })
        }
        onPointerLeave={() => setHover(null)}
      >
        {({ x, y, innerHeight }) => (
          <g>
            {/* Only inside the drawn domain — a mark past the end of every run
                would stretch the axis to describe a burst that never got
                scheduled. */}
            {marksMs
              .filter((t) => t > 0 && t <= xMax)
              .map((t) => (
                <line
                  key={t}
                  x1={x(t)}
                  x2={x(t)}
                  y1={0}
                  y2={innerHeight}
                  stroke={INK.muted}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  opacity={0.5}
                />
              ))}
            {drawable.map((s) => {
              const end = s.points[s.points.length - 1];
              const inQueue = s.points.some((p) => p.queued > 0);
              return (
                <g key={`${s.mode}-${s.repeatIndex}`}>
                  {inQueue && (
                    <path
                      d={path(s.points, x, y, (p) => p.queued)}
                      fill="none"
                      stroke={MODE_COLOR[s.mode]}
                      strokeWidth={MARK.lineWidth}
                      strokeDasharray="4 4"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={0.7}
                    />
                  )}
                  <path
                    d={path(s.points, x, y, (p) => p.outstanding)}
                    fill="none"
                    stroke={MODE_COLOR[s.mode]}
                    strokeWidth={MARK.lineWidth}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                  {/* Hollow when the run ended above zero — that one didn't
                      finish its work, and a filled dot would read as a clean
                      landing. */}
                  <circle
                    cx={x(end.elapsedMs)}
                    cy={y(end.outstanding)}
                    r={MARK.markerRadius}
                    fill={
                      end.outstanding === 0 ? MODE_COLOR[s.mode] : "transparent"
                    }
                    stroke={MODE_COLOR[s.mode]}
                    strokeWidth={MARK.lineWidth}
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
          left={hover.left}
          top={height - 8}
          title={formatSeconds(hover.t)}
          rows={modeRows(drawable, hover.t)}
        />
      )}
    </Box>
  );
}

function path(
  points: ConsistencyPoint[],
  x: (v: number) => number,
  y: (v: number) => number,
  value: (p: ConsistencyPoint) => number,
): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.elapsedMs)} ${y(value(p))}`)
    .join(" ");
}

/**
 * One row per mode spanning its repeats — six rows of individual runs is not a
 * readout. A mode whose runs had all finished by `t` reads "finished" rather than
 * the zero it would otherwise hold.
 */
function modeRows(series: ConsistencySeries[], t: number) {
  const rows = [];
  for (const mode of MODES) {
    const mine = series.filter((s) => s.mode === mode);
    if (mine.length === 0) continue;
    const live = mine.filter(
      (s) => s.points[s.points.length - 1].elapsedMs >= t,
    );
    if (live.length === 0) {
      rows.push({
        label: mine[0].label,
        value: "finished",
        color: MODE_COLOR[mode],
      });
      continue;
    }
    const values = live.map((s) => at(s.points, t, (p) => p.outstanding));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const queued = live.map((s) => at(s.points, t, (p) => p.queued));
    const inQueue = Math.max(...queued);
    rows.push({
      label: mine[0].label,
      value:
        (lo === hi
          ? formatCount(lo)
          : `${formatCount(lo)} – ${formatCount(hi)}`) +
        (inQueue > 0 ? ` · ${formatCount(inQueue)} in queue` : ""),
      color: MODE_COLOR[mode],
    });
  }
  return rows;
}

/** Value of the nearest sample at or before `t`, so the readout never invents one. */
function at(
  points: ConsistencyPoint[],
  t: number,
  value: (p: ConsistencyPoint) => number,
): number {
  let out = points[0] ? value(points[0]) : 0;
  for (const p of points) {
    if (p.elapsedMs > t) break;
    out = value(p);
  }
  return out;
}

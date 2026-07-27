import { Box } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";
import { CHART, INK } from "./chartTheme";
import { linearScale, niceTicks, type Scale } from "./scale";

export type FrameRender = (args: {
  innerWidth: number;
  innerHeight: number;
  x: Scale;
  y: Scale;
}) => ReactNode;

export type ChartFrameProps = {
  height: number;
  xDomain: [number, number];
  yDomain: [number, number];
  /** Accessible description of what the chart shows. */
  ariaLabel: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  xTickCount?: number;
  yTickCount?: number;
  /** Minimum y tick step. Pass 1 on a count axis to keep ticks integral. */
  yTickMinStep?: number;
  /** Extra room below the plot, e.g. for the worker-status ribbon. */
  bottomGutter?: number;
  /** Drawn behind the gridlines — phase bands and the like. */
  background?: FrameRender;
  children: FrameRender;
  /** Drawn in the bottom gutter, sharing the x scale. */
  gutter?: FrameRender;
  onPointerMove?: (args: { xValue: number; clientX: number }) => void;
  onPointerLeave?: () => void;
};

const MARGIN = { top: 12, right: 16, bottom: 26, left: 48 };

/**
 * Shared chart chrome: responsive sizing, hairline gridlines, axes, and tick
 * labels. Every chart on the page renders through this so the whole page reads
 * as one system.
 */
export function ChartFrame({
  height,
  xDomain,
  yDomain,
  ariaLabel,
  formatX,
  formatY,
  xTickCount = 6,
  yTickCount = 4,
  yTickMinStep = 0,
  bottomGutter = 0,
  background,
  children,
  gutter,
  onPointerMove,
  onPointerLeave,
}: ChartFrameProps) {
  const { ref, width } = useElementSize();

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(
    height - MARGIN.top - MARGIN.bottom - bottomGutter,
    0,
  );
  const x = linearScale(xDomain, [0, innerWidth]);
  const y = linearScale(yDomain, [innerHeight, 0]);
  const ready = innerWidth > 0 && innerHeight > 0;

  const xTicks = niceTicks(xDomain[0], xDomain[1], xTickCount);
  const yTicks = niceTicks(yDomain[0], yDomain[1], yTickCount, yTickMinStep);

  return (
    // Fixed height even before measurement, so the layout never jumps.
    <Box ref={ref} pos="relative" w="100%" h={height}>
      {ready && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          style={{ display: "block" }}
          onPointerMove={
            onPointerMove
              ? (event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const offset = event.clientX - rect.left - MARGIN.left;
                  const clamped = Math.min(Math.max(offset, 0), innerWidth);
                  const span = xDomain[1] - xDomain[0];
                  onPointerMove({
                    xValue:
                      xDomain[0] +
                      (innerWidth === 0 ? 0 : (clamped / innerWidth) * span),
                    clientX: event.clientX,
                  });
                }
              : undefined
          }
          onPointerLeave={onPointerLeave}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {background?.({ innerWidth, innerHeight, x, y })}

            {yTicks.map((tick) => (
              <line
                key={`gy-${tick}`}
                x1={0}
                x2={innerWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke={CHART.grid}
                strokeWidth={1}
              />
            ))}

            {children({ innerWidth, innerHeight, x, y })}

            <line
              x1={0}
              x2={innerWidth}
              y1={innerHeight}
              y2={innerHeight}
              stroke={CHART.axis}
              strokeWidth={1}
            />

            {yTicks.map((tick) => (
              <text
                key={`ty-${tick}`}
                x={-8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill={INK.muted}
                fontSize={11}
              >
                {formatY ? formatY(tick) : tick}
              </text>
            ))}

            {xTicks.map((tick) => (
              <text
                key={`tx-${tick}`}
                x={x(tick)}
                y={innerHeight + 16}
                textAnchor="middle"
                fill={INK.muted}
                fontSize={11}
              >
                {formatX ? formatX(tick) : tick}
              </text>
            ))}

            {gutter && (
              <g transform={`translate(0,${innerHeight + MARGIN.bottom})`}>
                {gutter({ innerWidth, innerHeight: bottomGutter, x, y })}
              </g>
            )}
          </g>
        </svg>
      )}
    </Box>
  );
}

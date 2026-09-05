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
  /** Minimum y tick step. Pass 1 on a count axis to keep ticks integral. */
  yTickMinStep?: number;
  children: FrameRender;
  /**
   * `offsetX` is measured from the left edge of this component's own relatively
   * positioned box, so it can be handed straight to `ChartTooltip`'s `left`.
   */
  onPointerMove?: (args: { xValue: number; offsetX: number }) => void;
  onPointerLeave?: () => void;
};

const MARGIN = { top: 12, right: 16, bottom: 26, left: 48 };
const X_TICKS = 6;
const Y_TICKS = 4;

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
  yTickMinStep = 0,
  children,
  onPointerMove,
  onPointerLeave,
}: ChartFrameProps) {
  const { ref, width } = useElementSize();

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);
  const x = linearScale(xDomain, [0, innerWidth]);
  const y = linearScale(yDomain, [innerHeight, 0]);
  const ready = innerWidth > 0 && innerHeight > 0;

  const xTicks = niceTicks(xDomain[0], xDomain[1], X_TICKS);
  const yTicks = niceTicks(yDomain[0], yDomain[1], Y_TICKS, yTickMinStep);

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
                  const offsetX = event.clientX - rect.left;
                  const clamped = Math.min(
                    Math.max(offsetX - MARGIN.left, 0),
                    innerWidth,
                  );
                  const span = xDomain[1] - xDomain[0];
                  onPointerMove({
                    xValue:
                      xDomain[0] +
                      (innerWidth === 0 ? 0 : (clamped / innerWidth) * span),
                    offsetX,
                  });
                }
              : undefined
          }
          onPointerLeave={onPointerLeave}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
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
          </g>
        </svg>
      )}
    </Box>
  );
}

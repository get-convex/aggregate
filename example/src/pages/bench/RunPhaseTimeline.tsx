import { Box, Group, Text, Tooltip } from "@mantine/core";
import { CHART, MARK, PHASE_COLOR } from "./charts/chartTheme";
import { formatSeconds } from "./charts/scale";

export type PhaseTimelineProps = {
  mode: "async" | "eager";
  enqueueMs: number;
  drainMs: number;
  /**
   * Shared across every timeline shown together, so bar lengths are directly
   * comparable. Defaults to this run's own total.
   */
  domainMs?: number;
  height?: number;
  showLabels?: boolean;
};

/**
 * The total-time story in one mark: an eager run is a single "write" segment
 * that pays everything up front; a queued run is a short enqueue segment plus a
 * drain tail. Doubles as the progress indicator — two honest phases beat one
 * ambiguous percentage.
 */
export function RunPhaseTimeline({
  mode,
  enqueueMs,
  drainMs,
  domainMs,
  height = 20,
  showLabels = true,
}: PhaseTimelineProps) {
  const total = Math.max(enqueueMs + drainMs, 1);
  const domain = Math.max(domainMs ?? total, 1);
  const colors = PHASE_COLOR[mode];
  const enqueuePct = (enqueueMs / domain) * 100;
  const drainPct = (drainMs / domain) * 100;

  return (
    <Box>
      <Group gap={0} align="center" wrap="nowrap" w="100%">
        <Box
          w="100%"
          h={height}
          style={{ position: "relative", borderRadius: 3, overflow: "hidden" }}
          bg={CHART.band}
        >
          <Tooltip
            label={`${mode === "eager" ? "write" : "enqueue"} ${formatSeconds(enqueueMs)}`}
          >
            <Box
              h={height}
              bg={colors.enqueue}
              style={{
                position: "absolute",
                left: 0,
                width: `${enqueuePct}%`,
                borderRadius: 3,
              }}
            />
          </Tooltip>
          {drainMs > 0 && (
            <Tooltip label={`drain ${formatSeconds(drainMs)}`}>
              <Box
                h={height}
                bg={colors.drain}
                style={{
                  position: "absolute",
                  // A 2px gap in the surface color separates the segments,
                  // rather than a stroke.
                  left: `calc(${enqueuePct}% + ${MARK.surfaceGap}px)`,
                  width: `max(0px, calc(${drainPct}% - ${MARK.surfaceGap}px))`,
                  borderRadius: 3,
                }}
              />
            </Tooltip>
          )}
        </Box>
      </Group>

      {showLabels && (
        <Group gap="md" mt={4}>
          <LabelKey
            color={colors.enqueue}
            label={mode === "eager" ? "write" : "enqueue"}
            value={formatSeconds(enqueueMs)}
          />
          {drainMs > 0 && (
            <LabelKey
              color={colors.drain}
              label="drain"
              value={formatSeconds(drainMs)}
            />
          )}
        </Group>
      )}
    </Box>
  );
}

function LabelKey({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <Group gap={6} wrap="nowrap">
      <Box w={8} h={8} bg={color} style={{ borderRadius: 2 }} />
      <Text size="xs" c="gray.4">
        {label}
      </Text>
      <Text size="xs" c="white" fw={600}>
        {value}
      </Text>
    </Group>
  );
}

import { Box, Group, Paper, Stack, Text } from "@mantine/core";

export type TooltipRow = {
  label: string;
  value: string;
  color?: string;
};

/**
 * Value first and prominent, series name secondary, a colored key beside it.
 * Positioned relative to the chart's own `pos="relative"` box.
 */
export function ChartTooltip({
  title,
  rows,
  left,
  top,
}: {
  title?: string;
  rows: TooltipRow[];
  left: number;
  top: number;
}) {
  return (
    <Paper
      bg="dark.5"
      p="xs"
      radius="sm"
      withBorder
      style={{
        position: "absolute",
        left,
        top,
        pointerEvents: "none",
        transform: "translate(-50%, -100%)",
        zIndex: 5,
        whiteSpace: "nowrap",
      }}
    >
      <Stack gap={4}>
        {title && (
          <Text size="xs" c="gray.5">
            {title}
          </Text>
        )}
        {rows.map((row) => (
          <Group key={row.label} gap={6} wrap="nowrap">
            {row.color && (
              <Box
                w={10}
                h={2}
                bg={row.color}
                style={{ borderRadius: 1, flexShrink: 0 }}
              />
            )}
            <Text size="sm" c="white" fw={600}>
              {row.value}
            </Text>
            <Text size="xs" c="gray.5">
              {row.label}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

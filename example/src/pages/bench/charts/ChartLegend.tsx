import { Box, Group, Text } from "@mantine/core";

export type LegendItem = {
  label: string;
  color: string;
  /** Lines get a 2px rule; fills get a swatch. */
  shape?: "line" | "swatch";
};

/**
 * Always rendered for two or more series, so identity is never carried by color
 * alone. A single-series chart needs none — its title names it.
 */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <Group gap="md" wrap="wrap">
      {items.map((item) => (
        <Group key={item.label} gap={6} wrap="nowrap">
          {item.shape === "line" ? (
            <Box w={12} h={2} bg={item.color} style={{ borderRadius: 1 }} />
          ) : (
            <Box w={8} h={8} bg={item.color} style={{ borderRadius: 2 }} />
          )}
          <Text size="xs" c="gray.4">
            {item.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

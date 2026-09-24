import { Box, Group, Text } from "@mantine/core";

export type LegendItem = {
  label: string;
  color: string;
  /** Lines get a 2px rule; fills get a swatch. */
  shape?: "line" | "dashedLine" | "swatch";
  /**
   * Consecutive items sharing a group sit tight together, so a mark that
   * belongs to a series — a queued run's dashed queue line — reads as part of
   * that series' entry rather than as a third series.
   */
  group?: string;
};

/**
 * Always rendered for two or more series, so identity is never carried by color
 * alone. A single-series chart needs none — its title names it.
 */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  const clusters: LegendItem[][] = [];
  for (const item of items) {
    const last = clusters[clusters.length - 1];
    if (last && item.group !== undefined && last[0].group === item.group) {
      last.push(item);
    } else {
      clusters.push([item]);
    }
  }
  return (
    <Group gap="md" wrap="wrap">
      {clusters.map((cluster) => (
        <Group key={cluster[0].label} gap={8} wrap="nowrap">
          {cluster.map((item) => (
            <Group key={item.label} gap={6} wrap="nowrap">
              <Key item={item} />
              <Text size="xs" c="gray.4">
                {item.label}
              </Text>
            </Group>
          ))}
        </Group>
      ))}
    </Group>
  );
}

function Key({ item }: { item: LegendItem }) {
  if (item.shape === "line") {
    return <Box w={12} h={2} bg={item.color} style={{ borderRadius: 1 }} />;
  }
  if (item.shape === "dashedLine") {
    // Matches the mark: a dashed rule, same hue, so the key reads as the same
    // line and not as a second series.
    return (
      <Box
        w={12}
        h={2}
        style={{
          backgroundImage: `repeating-linear-gradient(to right, ${item.color} 0 4px, transparent 4px 8px)`,
        }}
      />
    );
  }
  return <Box w={8} h={8} bg={item.color} style={{ borderRadius: 2 }} />;
}

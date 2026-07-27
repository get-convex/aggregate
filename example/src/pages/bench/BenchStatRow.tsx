import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { INK, STATUS_COLOR } from "./charts/chartTheme";

export type BenchStatTile = {
  label: string;
  value: string;
  /** Small note under the value — what it measures, or a caveat. */
  hint?: string;
  status?: "good" | "warning" | "critical";
};

/**
 * Purpose-built rather than reusing `common/StatsGrid`: that component takes a
 * fixed 7-key object and hardcodes a " ms" suffix, and these tiles carry mixed
 * units (ms, ops/s, s, plain counts). Sized to read from a distance — the value
 * is the largest thing in the tile and the label recedes above it.
 */
export function BenchStatRow({ tiles }: { tiles: BenchStatTile[] }) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
      {tiles.map((tile) => (
        <Card key={tile.label} bg="dark.6" p="md" radius="sm">
          <Stack gap={2}>
            <Text
              tt="uppercase"
              size="xs"
              c="gray.5"
              fw={600}
              style={{ letterSpacing: "0.1em" }}
            >
              {tile.label}
            </Text>
            <Text
              fw={700}
              c={tile.status ? undefined : INK.primary}
              style={{
                fontSize: "1.625rem",
                lineHeight: 1.15,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
                ...(tile.status ? { color: STATUS_COLOR[tile.status] } : {}),
              }}
            >
              {tile.value}
            </Text>
            {tile.hint && (
              <Text size="xs" c="gray.6">
                {tile.hint}
              </Text>
            )}
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

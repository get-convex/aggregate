import { Title, Text, Card, Stack, SimpleGrid } from "@mantine/core";

export function StatsGrid({
  stats,
  size = "large",
}: {
  stats: {
    mean: number;
    median: number;
    p75: number;
    p95: number;
    min: number;
    max: number;
    count: number;
  };
  size?: "small" | "large";
}) {
  const getGridCols = () => {
    if (size === "small") {
      // For compact display - fewer columns to allow wrapping
      return { base: 1, xs: 2, sm: 2, md: 2 };
    }
    // For large display - original behavior
    return { base: 1, xs: 2, sm: 3, md: 6 };
  };

  const getCardPadding = () => {
    return size === "small" ? "sm" : "md";
  };

  const getTitleOrder = () => {
    return size === "small" ? 4 : 3;
  };

  return (
    <SimpleGrid cols={getGridCols()} spacing="md">
      <Card bg="dark.6" p={getCardPadding()}>
        <Stack gap="xs">
          <Text size="sm" c="gray.4">
            Count
          </Text>
          <Title order={getTitleOrder()} c="white">
            {stats.count}
          </Title>
        </Stack>
      </Card>
      <Card bg="dark.6" p={getCardPadding()}>
        <Stack gap="xs">
          <Text size="sm" c="gray.4">
            Mean
          </Text>
          <Title order={getTitleOrder()} c="white">
            {stats.mean.toFixed(2)} ms
          </Title>
        </Stack>
      </Card>
      <Card bg="dark.6" p={getCardPadding()}>
        <Stack gap="xs">
          <Text size="sm" c="gray.4">
            Median
          </Text>
          <Title order={getTitleOrder()} c="white">
            {stats.median.toFixed(2)} ms
          </Title>
        </Stack>
      </Card>
      <Card bg="dark.6" p={getCardPadding()}>
        <Stack gap="xs">
          <Text size="sm" c="gray.4">
            75th Percentile
          </Text>
          <Title order={getTitleOrder()} c="white">
            {stats.p75.toFixed(2)} ms
          </Title>
        </Stack>
      </Card>
      <Card bg="dark.6" p={getCardPadding()}>
        <Stack gap="xs">
          <Text size="sm" c="gray.4">
            95th Percentile
          </Text>
          <Title order={getTitleOrder()} c="white">
            {stats.p95.toFixed(2)} ms
          </Title>
        </Stack>
      </Card>
      <Card bg="dark.6" p={getCardPadding()}>
        <Stack gap="xs">
          <Text size="sm" c="gray.4">
            Min
          </Text>
          <Title order={getTitleOrder()} c="white">
            {stats.min.toFixed(2)} ms
          </Title>
        </Stack>
      </Card>
      <Card bg="dark.6" p={getCardPadding()}>
        <Stack gap="xs">
          <Text size="sm" c="gray.4">
            Max
          </Text>
          <Title order={getTitleOrder()} c="white">
            {stats.max.toFixed(2)} ms
          </Title>
        </Stack>
      </Card>
    </SimpleGrid>
  );
}

import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Title,
  Text,
  Card,
  Stack,
  Group,
  NumberInput,
  Button,
  Alert,
} from "@mantine/core";
import { IconChartPie } from "@tabler/icons-react";
import { useState } from "react";

export function StatsPage() {
  const [latency, setLatency] = useState<number | "">("");

  const stats = useQuery(api.stats.getStats);

  const reportLatency = useMutation(api.stats.reportLatency);

  return (
    <Stack gap="xl">
      <Group justify="center" gap="md">
        <IconChartPie size={32} color="yellow" />
        <Title order={1} ta="center" c="white">
          Stats Demo
        </Title>
      </Group>

      <Text c="gray.3" ta="center">
        Direct aggregation without table dependencies - perfect for analytics
        and metrics
      </Text>

      {/* Add Latency Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Report Latency
          </Title>
          <Group gap="md">
            <NumberInput
              label="Latency (ms)"
              value={latency}
              onChange={(value) =>
                setLatency(
                  value === "" ? "" : typeof value === "number" ? value : ""
                )
              }
              placeholder="Enter latency value"
              min={0}
              style={{ flex: 1 }}
            />
            <Button
              onClick={() => {
                if (latency !== "") {
                  reportLatency({ latency: latency })
                    .then(() => {
                      setLatency("");
                    })
                    .catch(console.error);
                }
              }}
              disabled={latency === ""}
              style={{ alignSelf: "end" }}
            >
              Report Latency
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Statistics Display */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Latency Statistics
          </Title>

          {stats ? (
            <Group gap="md">
              <Card bg="dark.6" p="md" style={{ flex: 1 }}>
                <Stack gap="xs">
                  <Text size="sm" c="gray.4">
                    Mean
                  </Text>
                  <Title order={3} c="white">
                    {stats.mean.toFixed(2)} ms
                  </Title>
                </Stack>
              </Card>
              <Card bg="dark.6" p="md" style={{ flex: 1 }}>
                <Stack gap="xs">
                  <Text size="sm" c="gray.4">
                    Median
                  </Text>
                  <Title order={3} c="white">
                    {stats.median.toFixed(2)} ms
                  </Title>
                </Stack>
              </Card>
              <Card bg="dark.6" p="md" style={{ flex: 1 }}>
                <Stack gap="xs">
                  <Text size="sm" c="gray.4">
                    75th Percentile
                  </Text>
                  <Title order={3} c="white">
                    {stats.p75.toFixed(2)} ms
                  </Title>
                </Stack>
              </Card>
              <Card bg="dark.6" p="md" style={{ flex: 1 }}>
                <Stack gap="xs">
                  <Text size="sm" c="gray.4">
                    95th Percentile
                  </Text>
                  <Title order={3} c="white">
                    {stats.p95.toFixed(2)} ms
                  </Title>
                </Stack>
              </Card>
              <Card bg="dark.6" p="md" style={{ flex: 1 }}>
                <Stack gap="xs">
                  <Text size="sm" c="gray.4">
                    Min
                  </Text>
                  <Title order={3} c="white">
                    {stats.min.toFixed(2)} ms
                  </Title>
                </Stack>
              </Card>
              <Card bg="dark.6" p="md" style={{ flex: 1 }}>
                <Stack gap="xs">
                  <Text size="sm" c="gray.4">
                    Max
                  </Text>
                  <Title order={3} c="white">
                    {stats.max.toFixed(2)} ms
                  </Title>
                </Stack>
              </Card>
            </Group>
          ) : (
            <Alert color="blue" title="No stats yet">
              Report some latency values to see the statistics!
            </Alert>
          )}
        </Stack>
      </Card>

      {/* Info Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            How It Works
          </Title>
          <Text c="gray.3">
            This demo uses DirectAggregate, which allows you to aggregate data
            that isn't stored in a Convex table. This is perfect for analytics,
            metrics, and temporary data that you want to aggregate efficiently.
          </Text>
          <Text c="gray.3">
            Unlike TableAggregate, DirectAggregate gives you full control over
            when data is inserted, updated, or deleted. You handle all the
            operations yourself, making it ideal for complex aggregation
            scenarios.
          </Text>
          <Text c="gray.3">
            The aggregate still provides O(log(n)) performance for counting,
            summing, and finding min/max values, but without the automatic table
            synchronization.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Stack, Title, Alert } from "@mantine/core";
import { StatsGrid } from "../../common/StatsGrid";

export function StatsDisplaySection() {
  const stats = useQuery(api.stats.getStats);

  return (
    <Card bg="dark.7" p="md">
      <Stack gap="md">
        <Title order={2} c="white">
          Latency Statistics
        </Title>

        {stats ? (
          <StatsGrid stats={stats} size="small" />
        ) : (
          <Alert color="blue" title="No stats yet">
            Report some latency values to see the statistics!
          </Alert>
        )}
      </Stack>
    </Card>
  );
}

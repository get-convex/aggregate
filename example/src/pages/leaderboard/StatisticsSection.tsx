import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Text, Card, Stack, Group, Title } from "@mantine/core";

export function StatisticsSection() {
  const totalCount = useQuery(api.leaderboard.countScores);
  const totalSum = useQuery(api.leaderboard.sumNumbers);

  return (
    <Stack gap="sm">
      <Card bg="dark.7" p="md">
        <Stack gap="xs">
          <Text size="xs" c="gray.4">
            Total Scores
          </Text>
          <Title order={3} c="white">
            {totalCount ?? "Loading..."}
          </Title>
        </Stack>
      </Card>
      <Card bg="dark.7" p="md">
        <Stack gap="xs">
          <Text size="xs" c="gray.4">
            Total Sum
          </Text>
          <Title order={3} c="white">
            {totalSum ?? "Loading..."}
          </Title>
        </Stack>
      </Card>
      <Card bg="dark.7" p="md">
        <Stack gap="xs">
          <Text size="xs" c="gray.4">
            Average Score
          </Text>
          <Title order={3} c="white">
            {totalCount && totalSum
              ? (totalSum / totalCount).toFixed(2)
              : "Loading..."}
          </Title>
        </Stack>
      </Card>
    </Stack>
  );
}

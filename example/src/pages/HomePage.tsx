import { Title, Text, Card, Stack, Group, Badge } from "@mantine/core";

export function HomePage() {
  return (
    <Stack gap="xl">
      <Title order={1} ta="center" size="3rem" fw={700} c="white">
        Convex Aggregate Demo
      </Title>

      <Text size="lg" c="gray.3" ta="center">
        Explore the power of Convex Aggregate component with these interactive
        examples
      </Text>

      <Group justify="center" gap="md">
        <Card bg="dark.7" p="lg" style={{ minWidth: 200 }}>
          <Stack gap="md">
            <Title order={3} c="white">
              Leaderboard
            </Title>
            <Text size="sm" c="gray.4">
              Game scores with rankings, averages, and user statistics
            </Text>
            <Badge color="blue">Score Aggregation</Badge>
          </Stack>
        </Card>

        <Card bg="dark.7" p="lg" style={{ minWidth: 200 }}>
          <Stack gap="md">
            <Title order={3} c="white">
              Photos
            </Title>
            <Text size="sm" c="gray.4">
              Offset-based pagination for photo galleries
            </Text>
            <Badge color="green">Pagination</Badge>
          </Stack>
        </Card>

        <Card bg="dark.7" p="lg" style={{ minWidth: 200 }}>
          <Stack gap="md">
            <Title order={3} c="white">
              Shuffle
            </Title>
            <Text size="sm" c="gray.4">
              Random selection and shuffled music playlists
            </Text>
            <Badge color="purple">Random Access</Badge>
          </Stack>
        </Card>

        <Card bg="dark.7" p="lg" style={{ minWidth: 200 }}>
          <Stack gap="md">
            <Title order={3} c="white">
              Stats
            </Title>
            <Text size="sm" c="gray.4">
              Direct aggregation without table dependencies
            </Text>
            <Badge color="orange">Direct Aggregation</Badge>
          </Stack>
        </Card>
      </Group>

      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            What is Convex Aggregate?
          </Title>
          <Text c="gray.3">
            The Aggregate component provides O(log(n))-time lookups for
            counting, summing, and ranking data. It's perfect for leaderboards,
            pagination, random access, and statistical calculations without the
            O(n) complexity of traditional approaches.
          </Text>
          <Text c="gray.3">
            Each example demonstrates different aggregation patterns and use
            cases that showcase the component's capabilities for efficient data
            analysis and retrieval.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}

import { Title, Text, Card, Stack, Group } from "@mantine/core";
import {
  IconHome,
  IconTrophy,
  IconPhoto,
  IconArrowsShuffle,
  IconChartPie,
  IconBinaryTree,
} from "@tabler/icons-react";
import { routes } from "../../routes";

export function HomePage() {
  return (
    <Stack gap="xl">
      <Group justify="center" gap="md">
        <IconHome size={48} color="white" />
        <Title order={1} ta="center" size="3rem" fw={700} c="white">
          Convex Aggregate Demo
        </Title>
      </Group>

      <Text size="lg" c="gray.3" ta="center">
        Explore the power of Convex Aggregate component with these interactive
        examples
      </Text>

      <Group justify="center" gap="md">
        <Card
          bg="dark.7"
          p="lg"
          style={{ minWidth: 200, cursor: "pointer" }}
          onClick={() => routes.leaderboard().push()}
          className="hover-card"
        >
          <Stack gap="md">
            <Group gap="sm">
              <IconTrophy size={24} color="orange" />
              <Title order={3} c="white">
                Leaderboard
              </Title>
            </Group>
            <Text size="sm" c="gray.4">
              Game scores with rankings, averages, and user statistics
            </Text>
          </Stack>
        </Card>

        <Card
          bg="dark.7"
          p="lg"
          style={{ minWidth: 200, cursor: "pointer" }}
          onClick={() => routes.photos().push()}
          className="hover-card"
        >
          <Stack gap="md">
            <Group gap="sm">
              <IconPhoto size={24} color="cyan" />
              <Title order={3} c="white">
                Photos
              </Title>
            </Group>
            <Text size="sm" c="gray.4">
              Offset-based pagination for photo galleries
            </Text>
          </Stack>
        </Card>

        <Card
          bg="dark.7"
          p="lg"
          style={{ minWidth: 200, cursor: "pointer" }}
          onClick={() => routes.shuffle().push()}
          className="hover-card"
        >
          <Stack gap="md">
            <Group gap="sm">
              <IconArrowsShuffle size={24} color="purple" />
              <Title order={3} c="white">
                Shuffle
              </Title>
            </Group>
            <Text size="sm" c="gray.4">
              Random selection and shuffled music playlists
            </Text>
          </Stack>
        </Card>

        <Card
          bg="dark.7"
          p="lg"
          style={{ minWidth: 200, cursor: "pointer" }}
          onClick={() => routes.stats().push()}
          className="hover-card"
        >
          <Stack gap="md">
            <Group gap="sm">
              <IconChartPie size={24} color="yellow" />
              <Title order={3} c="white">
                Stats
              </Title>
            </Group>
            <Text size="sm" c="gray.4">
              Direct aggregation without table dependencies
            </Text>
          </Stack>
        </Card>

        <Card
          bg="dark.7"
          p="lg"
          style={{ minWidth: 200, cursor: "pointer" }}
          onClick={() => routes.btree().push()}
          className="hover-card"
        >
          <Stack gap="md">
            <Group gap="sm">
              <IconBinaryTree size={24} color="green" />
              <Title order={3} c="white">
                B-Tree
              </Title>
            </Group>
            <Text size="sm" c="gray.4">
              Visualize the B-tree structure as it evolves
            </Text>
          </Stack>
        </Card>
      </Group>
    </Stack>
  );
}

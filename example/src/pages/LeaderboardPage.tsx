import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Title,
  Text,
  Card,
  Stack,
  Group,
  TextInput,
  NumberInput,
  Button,
  Table,
  Badge,
  Alert,
  Anchor,
  ThemeIcon,
  Code,
  Paper,
  List,
} from "@mantine/core";
import {
  IconTrophy,
  IconCode,
  IconBolt,
  IconRocket,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useState } from "react";
import { useApiErrorHandler } from "@/utils/errors";

export function LeaderboardPage() {
  const onApiError = useApiErrorHandler();

  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState<number | "">("");
  const [searchScore, setSearchScore] = useState<number | "">("");
  const [searchPlayer, setSearchPlayer] = useState("");
  const [isAddingMockScores, setIsAddingMockScores] = useState(false);

  const scores = useQuery(api.leaderboard.scoresInOrder);
  const totalCount = useQuery(api.leaderboard.countScores);
  const totalSum = useQuery(api.leaderboard.sumNumbers);

  const addScore = useMutation(api.leaderboard.addScore);
  const removeScore = useMutation(api.leaderboard.removeScore);
  const addMockScores = useMutation(api.leaderboard.add100MockScores);

  const rankOfScore = useQuery(
    api.leaderboard.rankOfScore,
    searchScore !== "" ? { score: searchScore } : "skip"
  );
  const userAverage = useQuery(
    api.leaderboard.userAverageScore,
    searchPlayer ? { name: searchPlayer } : "skip"
  );
  const userHighScore = useQuery(
    api.leaderboard.userHighScore,
    searchPlayer ? { name: searchPlayer } : "skip"
  );

  return (
    <Stack gap="xl">
      <Group justify="center" gap="md">
        <IconTrophy size={32} color="orange" />
        <Title order={1} ta="center" c="white">
          Leaderboard Demo
        </Title>
      </Group>

      <Text c="gray.3" ta="center" size="lg">
        Lightning-fast leaderboards with instant rankings, statistics, and user
        analytics using Convex Aggregate
      </Text>

      <Group justify="center">
        <Card bg="dark.6" p="md">
          <Group gap="md">
            <IconCode size={20} color="cyan" />
            <Text size="sm" c="gray.3">
              View the source:
            </Text>
            <Anchor
              href="https://github.com/get-convex/aggregate/blob/main/example/convex/leaderboard.ts"
              target="_blank"
              c="cyan"
              size="sm"
            >
              convex/leaderboard.ts
            </Anchor>
          </Group>
        </Card>
      </Group>

      {/* Quick explanation */}
      <Card bg="dark.7" p="md">
        <Group justify="center" gap="xl">
          <Group gap="xs">
            <ThemeIcon color="red" variant="light" size="sm">
              <IconBolt size={14} />
            </ThemeIcon>
            <Text size="sm" c="gray.3">
              Traditional:{" "}
              <Badge color="red" size="xs">
                O(n)
              </Badge>{" "}
              - Scan all scores to find rankings
            </Text>
          </Group>
          <Group gap="xs">
            <ThemeIcon color="green" variant="light" size="sm">
              <IconRocket size={14} />
            </ThemeIcon>
            <Text size="sm" c="gray.3">
              Aggregate:{" "}
              <Badge color="green" size="xs">
                O(log n)
              </Badge>{" "}
              - Find any ranking instantly
            </Text>
          </Group>
        </Group>
      </Card>

      {/* Add Score Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Add New Score
          </Title>
          <Group gap="md">
            <TextInput
              label="Player Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter player name"
              style={{ flex: 1 }}
            />
            <NumberInput
              label="Score"
              value={score}
              onChange={(value) =>
                setScore(value === "" ? "" : (value as number))
              }
              placeholder="Enter score"
              min={0}
              style={{ flex: 1 }}
            />
            <Button
              onClick={() => {
                if (!playerName) return;
                if (!score) return;
                addScore({ name: playerName, score: score })
                  .then(() => {
                    setPlayerName("");
                    setScore("");
                  })
                  .catch(onApiError);
              }}
              disabled={!playerName || score === ""}
              style={{ alignSelf: "end" }}
            >
              Add Score
            </Button>
            <Button
              onClick={() => {
                setIsAddingMockScores(true);
                addMockScores({})
                  .catch(onApiError)
                  .finally(() => setIsAddingMockScores(false));
              }}
              disabled={isAddingMockScores}
              color="blue"
              variant="outline"
              style={{ alignSelf: "end" }}
              loading={isAddingMockScores}
            >
              Add 100 Mock Scores
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Statistics Section */}
      <Group gap="md">
        <Card bg="dark.7" p="lg" style={{ flex: 1 }}>
          <Stack gap="xs">
            <Text size="sm" c="gray.4">
              Total Scores
            </Text>
            <Title order={2} c="white">
              {totalCount ?? "Loading..."}
            </Title>
          </Stack>
        </Card>
        <Card bg="dark.7" p="lg" style={{ flex: 1 }}>
          <Stack gap="xs">
            <Text size="sm" c="gray.4">
              Total Sum
            </Text>
            <Title order={2} c="white">
              {totalSum ?? "Loading..."}
            </Title>
          </Stack>
        </Card>
        <Card bg="dark.7" p="lg" style={{ flex: 1 }}>
          <Stack gap="xs">
            <Text size="sm" c="gray.4">
              Average Score
            </Text>
            <Title order={2} c="white">
              {totalCount && totalSum
                ? (totalSum / totalCount).toFixed(2)
                : "Loading..."}
            </Title>
          </Stack>
        </Card>
      </Group>

      {/* Search Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Search & Analysis
          </Title>

          <Group gap="md">
            <Stack gap="md" style={{ flex: 1 }}>
              <Text size="sm" c="gray.4">
                Find Rank of Score
              </Text>
              <Group gap="md">
                <NumberInput
                  value={searchScore}
                  onChange={(value) =>
                    setSearchScore(value === "" ? "" : (value as number))
                  }
                  placeholder="Enter score"
                  min={0}
                  style={{ flex: 1 }}
                />
                <Badge size="lg" color="blue">
                  Rank: {rankOfScore !== undefined ? rankOfScore + 1 : "N/A"}
                </Badge>
              </Group>
            </Stack>

            <Stack gap="md" style={{ flex: 1 }}>
              <Text size="sm" c="gray.4">
                Player Statistics
              </Text>
              <Group gap="md">
                <TextInput
                  value={searchPlayer}
                  onChange={(e) => setSearchPlayer(e.target.value)}
                  placeholder="Enter player name"
                  style={{ flex: 1 }}
                />
                <Group gap="xs">
                  <Badge size="sm" color="green">
                    Avg: {userAverage ? userAverage.toFixed(2) : "N/A"}
                  </Badge>
                  <Badge size="sm" color="orange">
                    High: {userHighScore ?? "N/A"}
                  </Badge>
                </Group>
              </Group>
            </Stack>
          </Group>
        </Stack>
      </Card>

      {/* Leaderboard Table */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Current Leaderboard
          </Title>

          {scores && scores.length > 0 ? (
            <Table bg="dark.6">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th c="white">Rank</Table.Th>
                  <Table.Th c="white">Player</Table.Th>
                  <Table.Th c="white">Score</Table.Th>
                  <Table.Th c="white">Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {scores.map((score, index) => {
                  // Handle the "..." truncation string case
                  if (typeof score === "string") {
                    return (
                      <Table.Tr key={index}>
                        <Table.Td c="white" colSpan={4} ta="center">
                          {score}
                        </Table.Td>
                      </Table.Tr>
                    );
                  }

                  return (
                    <Table.Tr key={score._id}>
                      <Table.Td c="white">{index + 1}</Table.Td>
                      <Table.Td c="white">{score.name}</Table.Td>
                      <Table.Td c="white">{score.score}</Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          color="red"
                          onClick={() =>
                            removeScore({ id: score._id }).catch(onApiError)
                          }
                        >
                          Remove
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          ) : (
            <Alert color="blue" title="No scores yet">
              Add some scores to see the leaderboard!
            </Alert>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

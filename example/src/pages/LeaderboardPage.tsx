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
} from "@mantine/core";
import { IconTrophy } from "@tabler/icons-react";
import { useState } from "react";

export function LeaderboardPage() {
  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState<number | "">("");
  const [searchScore, setSearchScore] = useState<number | "">("");
  const [searchPlayer, setSearchPlayer] = useState("");

  // Queries
  const scores = useQuery(api.leaderboard.scoresInOrder);
  const totalCount = useQuery(api.leaderboard.countScores);
  const totalSum = useQuery(api.leaderboard.sumNumbers);

  // Mutations
  const addScore = useMutation(api.leaderboard.addScore);
  const removeScore = useMutation(api.leaderboard.removeScore);

  // Computed queries
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

  const handleAddScore = () => {
    if (playerName && score !== "") {
      addScore({ name: playerName, score: score })
        .then(() => {
          setPlayerName("");
          setScore("");
        })
        .catch(console.error);
    }
  };

  const handleRemoveScore = (id: string) => {};

  const handleScoreChange = (value: number | string) => {
    setScore(value === "" ? "" : (value as number));
  };

  const handleSearchScoreChange = (value: number | string) => {
    setSearchScore(value === "" ? "" : (value as number));
  };

  return (
    <Stack gap="xl">
      <Group justify="center" gap="md">
        <IconTrophy size={32} color="orange" />
        <Title order={1} ta="center" c="white">
          Leaderboard Demo
        </Title>
      </Group>

      <Text c="gray.3" ta="center">
        Add scores and explore aggregation features like rankings, averages, and
        statistics
      </Text>

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
              onChange={handleScoreChange}
              placeholder="Enter score"
              min={0}
              style={{ flex: 1 }}
            />
            <Button
              onClick={handleAddScore}
              disabled={!playerName || score === ""}
              style={{ alignSelf: "end" }}
            >
              Add Score
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
                  onChange={handleSearchScoreChange}
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
                            removeScore({ id: score._id }).catch(console.error)
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

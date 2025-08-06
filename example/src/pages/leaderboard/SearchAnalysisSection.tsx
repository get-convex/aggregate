import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Title,
  Text,
  Card,
  Stack,
  Group,
  TextInput,
  NumberInput,
  Badge,
} from "@mantine/core";
import { useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";

export function SearchAnalysisSection() {
  const [searchScore, setSearchScore] = useState<number | "">("");
  const [searchPlayer, setSearchPlayer] = useState("");

  // Debounce the search inputs with 300ms delay
  const [debouncedSearchScore] = useDebouncedValue(searchScore, 300);
  const [debouncedSearchPlayer] = useDebouncedValue(searchPlayer, 300);

  const rankOfScore = useQuery(
    api.leaderboard.rankOfScore,
    debouncedSearchScore !== "" ? { score: debouncedSearchScore } : "skip"
  );
  const userAverage = useQuery(
    api.leaderboard.userAverageScore,
    debouncedSearchPlayer ? { name: debouncedSearchPlayer } : "skip"
  );
  const userHighScore = useQuery(
    api.leaderboard.userHighScore,
    debouncedSearchPlayer ? { name: debouncedSearchPlayer } : "skip"
  );

  return (
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
  );
}

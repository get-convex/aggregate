import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Title,
  Card,
  Stack,
  Group,
  TextInput,
  NumberInput,
  Button,
} from "@mantine/core";
import { useState } from "react";
import { useApiErrorHandler } from "@/utils/errors";

export function AddScoreSection() {
  const onApiError = useApiErrorHandler();
  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState<number | "">("");
  const [isAddingMockScores, setIsAddingMockScores] = useState(false);

  const addScore = useMutation(api.leaderboard.addScore);
  const addMockScores = useMutation(api.leaderboard.add100MockScores);

  return (
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
  );
}

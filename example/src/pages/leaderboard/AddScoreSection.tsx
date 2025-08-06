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
  Paper,
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
    <Paper bg="dark.7" p="md">
      <Stack gap="md">
        <Title order={3} c="white">
          Add New Score
        </Title>
        <Stack gap="sm">
          <TextInput
            label="Player Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter player name"
            size="sm"
          />
          <NumberInput
            label="Score"
            value={score}
            onChange={(value) =>
              setScore(value === "" ? "" : (value as number))
            }
            placeholder="Enter score"
            min={0}
            size="sm"
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
            size="sm"
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
            loading={isAddingMockScores}
            size="sm"
          >
            Add 100 Mock Scores
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

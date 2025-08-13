import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Stack,
  Text,
  TextInput,
  NumberInput,
  Button,
  Paper,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useApiErrorHandler } from "@/utils/errors";
import { StatsGrid } from "../../common/StatsGrid";

export function BTreeAside() {
  const onApiError = useApiErrorHandler();
  const [name, setName] = useState("");
  const [score, setScore] = useState<number | string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stats = useQuery(api.btree.getStats);
  const addScore = useMutation(api.btree.addScore);

  return (
    <Stack
      gap="xl"
      h="100%"
      style={{
        overflowY: "auto",
        paddingBottom: "1rem", // Ensure some space at bottom when scrolling
      }}
    >
      {/* Add Score Section */}
      <Paper p="md" radius="md" bg="dark.5">
        <Stack gap="md">
          <Text size="lg" fw={500} c="white">
            Add Score
          </Text>

          <TextInput
            label="Name"
            placeholder="Enter player name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            styles={{
              label: { color: "white" },
              input: { backgroundColor: "var(--mantine-color-dark-4)" },
            }}
          />

          <NumberInput
            label="Score"
            placeholder="Enter score"
            value={score}
            onChange={setScore}
            min={0}
            styles={{
              label: { color: "white" },
              input: { backgroundColor: "var(--mantine-color-dark-4)" },
            }}
          />

          <Button
            leftSection={<IconPlus size={16} />}
            onClick={async () => {
              if (!name.trim() || score === "" || score === null) return;

              setIsSubmitting(true);
              await addScore({ name: name.trim(), score: Number(score) })
                .catch(onApiError)
                .finally(() => setIsSubmitting(false));
            }}
            loading={isSubmitting}
            disabled={!name.trim() || score === "" || score === null}
            variant="filled"
            color="orange"
            fullWidth
          >
            Add Score
          </Button>
        </Stack>
      </Paper>

      {/* Stats Section */}
      {stats && (
        <Paper p="md" radius="md" bg="dark.5">
          <Stack gap="md">
            <Text size="lg" fw={500} c="white">
              Stats
            </Text>
            <StatsGrid stats={stats} size="small" />
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

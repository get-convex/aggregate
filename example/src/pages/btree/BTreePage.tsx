import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Title,
  Stack,
  Group,
  Text,
  Code,
  Grid,
  TextInput,
  NumberInput,
  Button,
  Paper,
} from "@mantine/core";
import { IconBinaryTree, IconPlus } from "@tabler/icons-react";
import { useApiErrorHandler } from "@/utils/errors";
import { useState } from "react";
import { StatsGrid } from "../../common/StatsGrid";

export function BTreePage() {
  const onApiError = useApiErrorHandler();
  const [name, setName] = useState("");
  const [score, setScore] = useState<number | string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const listTrees = useQuery(api.btree.listTrees);
  const listNodes = useQuery(api.btree.listNodes);
  const stats = useQuery(api.btree.getStats);
  const addScore = useMutation(api.btree.addScore);

  return (
    <Stack gap="xl">
      <Group justify="center" gap="md">
        <IconBinaryTree size={32} color="orange" />
        <Title order={1} ta="center" c="white">
          BTree Demo
        </Title>
      </Group>

      <Grid>
        <Grid.Col span={8}>
          <Stack gap="md">
            <Text size="lg" fw={500} c="white">
              Tree Structure
            </Text>
            <Code block>{JSON.stringify(listTrees, null, 2)}</Code>
            <Text size="lg" fw={500} c="white">
              Node Details
            </Text>
            <Code block>{JSON.stringify(listNodes, null, 2)}</Code>
          </Stack>
        </Grid.Col>

        <Grid.Col span={4}>
          <Paper p="md" radius="md" bg="dark.6">
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
                  input: { backgroundColor: "var(--mantine-color-dark-5)" },
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
                  input: { backgroundColor: "var(--mantine-color-dark-5)" },
                }}
              />

              <Button
                leftSection={<IconPlus size={16} />}
                onClick={async () => {
                  if (!name.trim() || score === "" || score === null) {
                    return;
                  }

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

          {stats && (
            <Stack gap="sm" mt="md">
              <Text size="lg" fw={500} c="white">
                Stats
              </Text>
              <StatsGrid stats={stats} size="small" />
            </Stack>
          )}
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

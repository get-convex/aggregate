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
  Alert,
  Anchor,
  ThemeIcon,
  Code,
  Paper,
  Badge,
} from "@mantine/core";
import {
  IconBinaryTree,
  IconCode,
  IconBolt,
  IconRocket,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useState } from "react";
import { useApiErrorHandler } from "@/utils/errors";

export function BTreePage() {
  const onApiError = useApiErrorHandler();

  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState<number | "">("");

  const scores = useQuery(api.btree.getAllScores);
  const totalCount = useQuery(api.btree.countScores);
  const btreeStructured = useQuery(api.btree.getBTreeStructured);

  const addScore = useMutation(api.btree.addScore);
  const removeScore = useMutation(api.btree.removeScore);

  return (
    <Stack gap="xl">
      <Group justify="center" gap="md">
        <IconBinaryTree size={32} color="green" />
        <Title order={1} ta="center" c="white">
          B-Tree Visualization Demo
        </Title>
      </Group>

      <Text c="gray.3" ta="center" size="lg">
        See the B-tree structure evolve in real-time as you add scores. Watch
        how the tree balances itself automatically for optimal O(log n)
        performance.
      </Text>

      <Group justify="center">
        <Card bg="dark.6" p="md">
          <Group gap="md">
            <IconCode size={20} color="cyan" />
            <Text size="sm" c="gray.3">
              View the source:
            </Text>
            <Anchor
              href="https://github.com/get-convex/aggregate/blob/main/example/convex/btree.ts"
              target="_blank"
              c="cyan"
              size="sm"
            >
              convex/btree.ts
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
              - Linear scan through data
            </Text>
          </Group>
          <Group gap="xs">
            <ThemeIcon color="green" variant="light" size="sm">
              <IconRocket size={14} />
            </ThemeIcon>
            <Text size="sm" c="gray.3">
              B-Tree:{" "}
              <Badge color="green" size="xs">
                O(log n)
              </Badge>{" "}
              - Self-balancing tree structure
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
          </Group>
        </Stack>
      </Card>

      {/* B-Tree Visualization */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2} c="white">
              B-Tree Structure
            </Title>
            <Badge size="lg" color="blue">
              Total nodes: {totalCount ?? 0}
            </Badge>
          </Group>

          <Alert color="blue" title="B-Tree Structure (JSON)">
            <Text size="sm">
              Below is the raw structured representation of the B-tree. Each
              node shows its keys and children arrays. Leaf nodes have empty
              children arrays.
            </Text>
          </Alert>

          {btreeStructured ? (
            <Paper bg="dark.8" p="md">
              <Code
                block
                c="white"
                bg="dark.8"
                style={{
                  fontSize: "14px",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(btreeStructured, null, 2)}
              </Code>
            </Paper>
          ) : (
            <Paper bg="dark.8" p="md">
              <Text c="gray.5" ta="center" style={{ fontFamily: "monospace" }}>
                Empty tree - add some scores to see the structure!
              </Text>
            </Paper>
          )}
        </Stack>
      </Card>

      {/* Current Scores Table */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Current Scores (Sorted)
          </Title>

          {scores && scores.length > 0 ? (
            <Table bg="dark.6">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th c="white">Player</Table.Th>
                  <Table.Th c="white">Score</Table.Th>
                  <Table.Th c="white">Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {scores.map((score) => (
                  <Table.Tr key={score._id}>
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
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Alert color="blue" title="No scores yet">
              Add some scores to see the B-tree structure evolve!
            </Alert>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

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
  const addDemoScore = useMutation(api.btree.addDemoScore);
  const clearBTree = useMutation(api.btree.clearBTree);

  const [nextAction, setNextAction] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);

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

      {/* Educational Controls */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Educational Demo Controls
          </Title>

          <Group gap="md">
            <Button
              onClick={() => {
                addDemoScore()
                  .then((result) => {
                    const count = totalCount ?? 0;
                    setNextAction(
                      `Added ${result.name} with score ${result.score}. ${count >= 3 ? "Watch how the B-tree splits and balances!" : "Add more entries to see B-tree splits."}`
                    );
                  })
                  .catch(onApiError);
              }}
              color="blue"
              size="lg"
            >
              Add Demo Entry
            </Button>

            <Button
              onClick={() => setShowSettings(!showSettings)}
              variant="outline"
              color="gray"
            >
              Settings
            </Button>
          </Group>

          {showSettings && (
            <Card bg="dark.6" p="md">
              <Stack gap="md">
                <Text size="sm" c="gray.3">
                  Clear and reinitialize the B-tree:
                </Text>
                <Group gap="md">
                  <Button
                    onClick={() => {
                      clearBTree({ maxNodeSize: 4, rootLazy: true })
                        .then(() =>
                          setNextAction(
                            "Cleared! Root is LAZY (aggregates computed on-demand). Max node size: 4."
                          )
                        )
                        .catch(onApiError);
                    }}
                    color="orange"
                    variant="outline"
                  >
                    Clear (Lazy Root)
                  </Button>
                  <Button
                    onClick={() => {
                      clearBTree({ maxNodeSize: 4, rootLazy: false })
                        .then(() =>
                          setNextAction(
                            "Cleared! Root is EAGER (aggregates precomputed). Max node size: 4."
                          )
                        )
                        .catch(onApiError);
                    }}
                    color="red"
                    variant="outline"
                  >
                    Clear (Eager Root)
                  </Button>
                </Group>
              </Stack>
            </Card>
          )}

          {nextAction && (
            <Alert color="green" title="What just happened:">
              <Text size="sm">{nextAction}</Text>
            </Alert>
          )}

          <Alert color="yellow" title="Next: Try this!">
            <Text size="sm">
              {totalCount === 0 &&
                "Click 'Add Demo Entry' to insert your first item and create the B-tree."}
              {totalCount === 1 &&
                "Add another entry. With max node size 4, you won't see splits until 5+ entries."}
              {totalCount === 2 &&
                "Keep adding! You're building up to your first B-tree node split."}
              {totalCount === 3 &&
                "One more and you might see some interesting B-tree behavior!"}
              {totalCount === 4 &&
                "Next entry will likely cause a B-tree split - watch the structure change!"}
              {(totalCount ?? 0) >= 5 &&
                "Great! You should see B-tree splits and internal nodes with aggregates. Try clearing with different settings."}
            </Text>
          </Alert>
        </Stack>
      </Card>

      {/* Manual Add Score Section */}
      <Card bg="dark.8" p="lg">
        <Stack gap="md">
          <Title order={3} c="white">
            Manual Entry (Optional)
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
                    setNextAction(
                      `Manually added ${playerName} with score ${score}`
                    );
                  })
                  .catch(onApiError);
              }}
              disabled={!playerName || score === ""}
              variant="outline"
            >
              Add Custom Score
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

          <Alert color="blue" title="B-Tree Database Structure">
            <Text size="sm">
              This shows the actual database structure: the btree metadata and
              all btreeNode entries. Notice the 'aggregate' field in each node
              showing denormalized counts and sums.
              <strong>
                {" "}
                Root Lazy:{" "}
                {btreeStructured?.treeMetadata?.isRootLazy ? "Yes" : "No"}
              </strong>{" "}
              |
              <strong>
                {" "}
                Max Node Size: {btreeStructured?.treeMetadata?.maxNodeSize}
              </strong>
            </Text>
          </Alert>

          {btreeStructured?.status === "active" ? (
            <Stack gap="md">
              {/* Quick Stats */}
              <Group gap="md">
                <Badge size="lg" color="blue">
                  Count: {totalCount ?? 0}
                </Badge>
                <Badge size="lg" color="green">
                  Root Lazy:{" "}
                  {btreeStructured.treeMetadata.isRootLazy ? "Yes" : "No"}
                </Badge>
                <Badge size="lg" color="orange">
                  Max Node Size: {btreeStructured.treeMetadata.maxNodeSize}
                </Badge>
              </Group>

              {/* Full Structure */}
              <Paper bg="dark.8" p="md">
                <Code
                  block
                  c="white"
                  bg="dark.8"
                  style={{
                    fontSize: "12px",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(btreeStructured, null, 2)}
                </Code>
              </Paper>
            </Stack>
          ) : (
            <Paper bg="dark.8" p="md">
              <Text c="gray.5" ta="center" style={{ fontFamily: "monospace" }}>
                Empty tree - click 'Add Demo Entry' to create the B-tree
                structure!
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
                  <Table.Tr key={score.id}>
                    <Table.Td c="white">{score.name}</Table.Td>
                    <Table.Td c="white">{score.score}</Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        color="red"
                        onClick={() =>
                          removeScore({ id: score.id }).catch(onApiError)
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

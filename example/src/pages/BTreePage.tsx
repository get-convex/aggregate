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
  Tree,
  TreeNodeData,
} from "@mantine/core";
import {
  IconBinaryTree,
  IconCode,
  IconBolt,
  IconRocket,
  IconInfoCircle,
  IconFolder,
  IconFolderOpen,
  IconFileText,
} from "@tabler/icons-react";
import { useState } from "react";
import { useApiErrorHandler } from "@/utils/errors";

export function BTreePage() {
  const onApiError = useApiErrorHandler();

  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState<number | "">("");

  const scores = useQuery(api.btree.getAllScores);
  const totalCount = useQuery(api.btree.countScores);
  const btreeVisualization = useQuery(api.btree.getBTreeVisualization);
  const btreeStructured = useQuery(api.btree.getBTreeStructured);

  const addScore = useMutation(api.btree.addScore);
  const removeScore = useMutation(api.btree.removeScore);

  // Convert structured B-tree data to Mantine Tree format
  const convertStructuredToTreeData = (structuredData: any): TreeNodeData[] => {
    if (!structuredData) {
      return [];
    }

    let nodeCounter = 0;
    const getNextNodeId = () => `node-${nodeCounter++}`;

    const convertNode = (node: any): TreeNodeData => {
      const isLeaf = node.children.length === 0;
      const label =
        node.keys.length > 0
          ? node.keys.join(" | ")
          : isLeaf
            ? "Empty Leaf"
            : "Internal Node";

      return {
        value: getNextNodeId(),
        label,
        children: node.children.map((child: any) => convertNode(child)),
      };
    };

    return [convertNode(structuredData)];
  };

  const treeData = btreeStructured
    ? convertStructuredToTreeData(btreeStructured)
    : [];

  // Custom render function for B-tree nodes
  const renderBTreeNode = ({
    node,
    expanded,
    hasChildren,
    elementProps,
  }: any) => {
    return (
      <Group gap={8} {...elementProps}>
        {hasChildren ? (
          expanded ? (
            <IconFolderOpen
              color="var(--mantine-color-blue-5)"
              size={16}
              stroke={2.5}
            />
          ) : (
            <IconFolder
              color="var(--mantine-color-blue-5)"
              size={16}
              stroke={2.5}
            />
          )
        ) : (
          <IconFileText
            color="var(--mantine-color-green-5)"
            size={16}
            stroke={2.5}
          />
        )}
        <Text
          size="sm"
          c={hasChildren ? "blue.3" : "green.3"}
          ff="monospace"
          fw={hasChildren ? 600 : 500}
        >
          {hasChildren ? `Internal: ${node.label}` : `Leaf: ${node.label}`}
        </Text>
      </Group>
    );
  };

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

          <Alert color="blue" title="How to read this visualization">
            <Text size="sm">
              <Group gap="xs" mb="xs">
                <IconFolder color="var(--mantine-color-blue-5)" size={14} />
                <Text size="sm" span>
                  Internal nodes - contain routing keys and child pointers
                </Text>
              </Group>
              <Group gap="xs">
                <IconFileText color="var(--mantine-color-green-5)" size={14} />
                <Text size="sm" span>
                  Leaf nodes - contain the actual data values
                </Text>
              </Group>
              Click folder icons to expand/collapse and explore the tree
              structure!
            </Text>
          </Alert>

          {treeData.length > 0 ? (
            <Paper bg="dark.8" p="md">
              <Tree
                data={treeData}
                levelOffset={24}
                selectOnClick
                clearSelectionOnOutsideClick
                renderNode={renderBTreeNode}
              />
            </Paper>
          ) : (
            <Paper bg="dark.8" p="md">
              <Text c="gray.5" ta="center" style={{ fontFamily: "monospace" }}>
                Empty tree - add some scores to see the structure!
              </Text>
            </Paper>
          )}

          {/* Show raw bracket notation for reference */}
          {btreeVisualization && btreeVisualization !== "empty" && (
            <Paper bg="dark.9" p="sm" mt="md">
              <Text size="xs" c="gray.6" mb="xs">
                Raw B-tree structure:
              </Text>
              <Code
                block
                c="gray.4"
                bg="dark.9"
                style={{ fontSize: "12px", fontFamily: "monospace" }}
              >
                {btreeVisualization}
              </Code>
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

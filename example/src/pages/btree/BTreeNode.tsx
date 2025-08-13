import {
  Box,
  Text,
  Stack,
  Badge,
  Group,
  Paper,
  ActionIcon,
} from "@mantine/core";
import { Handle, Position } from "@xyflow/react";
import { IconTrash } from "@tabler/icons-react";

interface BTreeNodeProps {
  data: {
    node: any;
    isRoot: boolean;
    isLeaf: boolean;
    onDeleteItem?: (itemId: string, score: number) => void;
  };
}

export function BTreeNode({ data }: BTreeNodeProps) {
  const { node, isRoot, isLeaf, onDeleteItem } = data;

  return (
    <Box
      style={{
        minWidth: 200,
        maxWidth: 300,
        padding: 12,
        border: `2px solid ${
          isRoot ? "#fd7e14" : isLeaf ? "#51cf66" : "#339af0"
        }`,
        borderRadius: 8,
        backgroundColor: "var(--mantine-color-dark-6)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Handles for connections */}
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: "#555",
            width: 8,
            height: 8,
          }}
        />
      )}
      {!isLeaf && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: "#555",
            width: 8,
            height: 8,
          }}
        />
      )}

      <Stack gap="xs">
        {/* Node header with type and aggregate data */}
        <Group justify="space-between" align="center">
          <Badge
            size="sm"
            color={isRoot ? "orange" : isLeaf ? "green" : "blue"}
            variant="filled"
          >
            {isRoot ? "Root" : isLeaf ? "Leaf" : "Internal"}
          </Badge>
          {node.aggregate && (
            <Group gap="xs">
              <Badge size="xs" color="teal" variant="light">
                Count: {node.aggregate.count}
              </Badge>
              <Badge size="xs" color="violet" variant="light">
                Sum: {node.aggregate.sum}
              </Badge>
            </Group>
          )}
        </Group>

        {/* Items in the node */}
        {node.items && node.items.length > 0 && (
          <Stack gap="xs">
            <Text size="xs" c="dimmed" fw={500}>
              Items ({node.items.length}):
            </Text>
            {node.items.map((item: any, idx: number) => (
              <Paper
                key={idx}
                p="xs"
                bg="dark.5"
                style={{ borderRadius: 4, border: "1px solid #444" }}
              >
                <Group justify="space-between" gap="xs">
                  <Text size="xs" c="white" truncate style={{ flex: 1 }}>
                    {item.v}
                  </Text>
                  <Group gap="xs">
                    <Badge size="xs" color="yellow" variant="light">
                      {item.s}
                    </Badge>
                    {onDeleteItem && (
                      <ActionIcon
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent node selection
                          // Extract id from item.v (format: "name-timestamp")
                          const itemId = item.v;
                          onDeleteItem(itemId, item.s);
                        }}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}

        {/* Subtree count for internal nodes */}
        {node.subtrees && node.subtrees.length > 0 && (
          <Text size="xs" c="dimmed" ta="center">
            {node.subtrees.length} subtrees
          </Text>
        )}

        {/* Node ID (for debugging) */}
        <Text
          size="xs"
          c="dimmed"
          ta="center"
          style={{ fontFamily: "monospace" }}
        >
          {node._id.slice(-8)}
        </Text>
      </Stack>
    </Box>
  );
}

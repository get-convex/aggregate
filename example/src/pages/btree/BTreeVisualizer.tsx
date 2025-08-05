import { Stack, Text, Code } from "@mantine/core";
import { BTreeDoc, BTreeNodeDoc } from "../../../convex/btree";

export function BTreeVisualizer({
  listTrees,
  listNodes,
}: {
  listTrees: BTreeDoc[];
  listNodes: BTreeNodeDoc[];
}) {
  return (
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
  );
}

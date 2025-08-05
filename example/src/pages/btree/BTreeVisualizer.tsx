import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Box, Text } from "@mantine/core";
import { BTreeDoc, BTreeNodeDoc } from "../../../convex/btree";
import { BTreeNode } from "./BTreeNode";
import { useTreeLayout } from "./useTreeLayout";
import {
  controlsStyle,
  REACT_FLOW_PROPS,
  CONTAINER_STYLES,
  REACT_FLOW_STYLES,
  BACKGROUND_STYLES,
  CONTROLS_STYLES,
} from "./styles";

// Node types for React Flow
const nodeTypes = {
  btreeNode: BTreeNode,
};

interface BTreeVisualizerProps {
  listTrees: BTreeDoc[];
  listNodes: BTreeNodeDoc[];
  onDeleteItem?: (itemId: string, score: number) => void;
}

export function BTreeVisualizer({
  listTrees,
  listNodes,
  onDeleteItem,
}: BTreeVisualizerProps) {
  const initialData = useTreeLayout(listTrees, listNodes, onDeleteItem);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges);

  // Update nodes and edges when data changes
  useMemo(() => {
    setNodes(initialData.nodes);
    setEdges(initialData.edges);
  }, [initialData.nodes, initialData.edges, setNodes, setEdges]);

  if (!listTrees.length || !listNodes.length) {
    return (
      <Box
        h={CONTAINER_STYLES.height}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--mantine-color-dark-7)",
          borderRadius: 8,
        }}
      >
        <Text c="dimmed">
          No B-tree data available. Add some scores to see the visualization!
        </Text>
      </Box>
    );
  }

  return (
    <Box h={CONTAINER_STYLES.height} style={CONTAINER_STYLES}>
      <style>{controlsStyle}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        style={REACT_FLOW_STYLES}
        {...REACT_FLOW_PROPS}
      >
        <Background color="#333" gap={16} style={BACKGROUND_STYLES} />
        <Controls style={CONTROLS_STYLES} />
      </ReactFlow>
    </Box>
  );
}

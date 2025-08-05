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

// Custom styles for dark theme React Flow controls
const controlsStyle = `
  .react-flow__controls-button {
    background-color: var(--mantine-color-dark-5) !important;
    border: 1px solid var(--mantine-color-dark-4) !important;
    color: white !important;
  }
  .react-flow__controls-button:hover {
    background-color: var(--mantine-color-dark-4) !important;
  }
  .react-flow__controls-button svg {
    fill: white !important;
  }
`;

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
        h="calc(100vh - 60px)"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--mantine-color-dark-7)",
          borderRadius: 0,
          overflow: "hidden",
          width: "100%",
        }}
      >
        <Text c="dimmed">
          No B-tree data available. Add some scores to see the visualization!
        </Text>
      </Box>
    );
  }

  return (
    <Box
      h="calc(100vh - 60px)"
      style={{
        backgroundColor: "var(--mantine-color-dark-7)",
        borderRadius: 0,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <style>{controlsStyle}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{
          btreeNode: BTreeNode,
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        style={{
          backgroundColor: "var(--mantine-color-dark-8)",
        }}
        fitView={true}
        fitViewOptions={{ padding: 50 }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
      >
        <Background
          color="#333"
          gap={16}
          style={{
            backgroundColor: "var(--mantine-color-dark-8)",
          }}
        />
        <Controls
          style={{
            backgroundColor: "var(--mantine-color-dark-6)",
            border: "1px solid var(--mantine-color-dark-4)",
            borderRadius: "8px",
          }}
        />
      </ReactFlow>
    </Box>
  );
}

import { useMemo } from "react";
import { Node, Edge } from "@xyflow/react";
import { BTreeDoc, BTreeNodeDoc } from "../../../convex/btree";

interface TreeLayoutResult {
  nodes: Node[];
  edges: Edge[];
}

export function useTreeLayout(
  listTrees: BTreeDoc[],
  listNodes: BTreeNodeDoc[],
  onDeleteItem?: (itemId: string, score: number) => void
): TreeLayoutResult {
  return useMemo(() => {
    if (!listTrees.length || !listNodes.length) {
      return { nodes: [], edges: [] };
    }

    const tree = listTrees[0];
    const nodeMap = new Map(listNodes.map((node) => [node._id, node]));

    // First, count nodes at each level for better spacing
    const levelCounts = new Map<number, number>();
    const visited = new Set<string>();

    function countNodesAtLevel(nodeId: string, level: number): void {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      levelCounts.set(level, (levelCounts.get(level) || 0) + 1);

      const node = nodeMap.get(nodeId);
      if (node?.subtrees) {
        node.subtrees.forEach((subtreeId) =>
          countNodesAtLevel(subtreeId, level + 1)
        );
      }
    }

    countNodesAtLevel(tree.root, 0);
    visited.clear();

    // Build the tree structure and calculate positions
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const levelIndexes = new Map<number, number>();

    function buildSubtree(nodeId: string, level: number): void {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) return;

      const isRoot = nodeId === tree.root;
      const isLeaf = !node.subtrees || node.subtrees.length === 0;

      // Calculate position with better spacing
      const nodesAtLevel = levelCounts.get(level) || 1;
      const currentIndex = levelIndexes.get(level) || 0;
      levelIndexes.set(level, currentIndex + 1);

      const levelWidth = Math.max(800, nodesAtLevel * 250); // Dynamic width based on node count
      const levelHeight = 400;
      const nodeSpacing = levelWidth / Math.max(nodesAtLevel, 1);

      const x = (currentIndex - (nodesAtLevel - 1) / 2) * nodeSpacing;
      const y = level * levelHeight;

      // Create React Flow node (draggable)
      nodes.push({
        id: nodeId,
        type: "btreeNode",
        position: { x, y },
        draggable: true, // Make nodes draggable
        data: {
          node,
          isRoot,
          isLeaf,
          onDeleteItem,
        },
      });

      // Process subtrees
      if (node.subtrees && node.subtrees.length > 0) {
        node.subtrees.forEach((subtreeId) => {
          // Create edge
          edges.push({
            id: `${nodeId}-${subtreeId}`,
            source: nodeId,
            target: subtreeId,
            type: "smoothstep",
            style: { stroke: "#666", strokeWidth: 2 },
            animated: false,
          });

          // Recursively build subtree
          buildSubtree(subtreeId, level + 1);
        });
      }
    }

    // Start building from root
    buildSubtree(tree.root, 0);

    return { nodes, edges };
  }, [listTrees, listNodes, onDeleteItem]);
}

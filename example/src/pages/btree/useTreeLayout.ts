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
  onDeleteItem?: (itemId: string, score: number) => void,
): TreeLayoutResult {
  return useMemo(() => {
    if (!listTrees.length || !listNodes.length) {
      return { nodes: [], edges: [] };
    }

    const tree = listTrees[0];
    const nodeMap = new Map(listNodes.map((node) => [node._id, node]));

    // First pass: find the maximum depth and count nodes at each level
    const levelCounts = new Map<number, number>();
    const nodeDepths = new Map<string, number>();
    let maxDepth = 0;
    const visited = new Set<string>();

    function calculateDepthsAndCounts(nodeId: string, level: number): void {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      nodeDepths.set(nodeId, level);
      levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
      maxDepth = Math.max(maxDepth, level);

      const node = nodeMap.get(nodeId);
      if (node?.subtrees) {
        node.subtrees.forEach((subtreeId) =>
          calculateDepthsAndCounts(subtreeId, level + 1),
        );
      }
    }

    calculateDepthsAndCounts(tree.root, 0);
    visited.clear();

    // Second pass: assign visual depths - all leaves should be at the same level
    const visualDepths = new Map<string, number>();

    function assignVisualDepths(nodeId: string): number {
      if (visualDepths.has(nodeId)) {
        return visualDepths.get(nodeId)!;
      }

      const node = nodeMap.get(nodeId);
      if (!node) return 0;

      const isLeaf = !node.subtrees || node.subtrees.length === 0;

      if (isLeaf) {
        // All leaves should be at the maximum depth level
        visualDepths.set(nodeId, maxDepth);
        return maxDepth;
      } else {
        // Internal nodes: find the minimum depth of their children minus 1
        const childDepths = node.subtrees!.map((subtreeId) =>
          assignVisualDepths(subtreeId),
        );
        const minChildDepth = Math.min(...childDepths);
        const visualDepth = Math.max(0, minChildDepth - 1);
        visualDepths.set(nodeId, visualDepth);
        return visualDepth;
      }
    }

    // Calculate visual depths starting from root
    assignVisualDepths(tree.root);

    // Build the tree structure and calculate positions
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const visualLevelIndexes = new Map<number, number>();

    // Count nodes at each visual level for spacing
    const visualLevelCounts = new Map<number, number>();
    visualDepths.forEach((depth) => {
      visualLevelCounts.set(depth, (visualLevelCounts.get(depth) || 0) + 1);
    });

    function buildSubtree(nodeId: string): void {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) return;

      const isRoot = nodeId === tree.root;
      const isLeaf = !node.subtrees || node.subtrees.length === 0;
      const visualLevel = visualDepths.get(nodeId) || 0;

      // Calculate position with consistent level spacing
      const nodesAtVisualLevel = visualLevelCounts.get(visualLevel) || 1;
      const currentIndex = visualLevelIndexes.get(visualLevel) || 0;
      visualLevelIndexes.set(visualLevel, currentIndex + 1);

      const levelWidth = Math.max(800, nodesAtVisualLevel * 250);
      const levelHeight = 350; // Reduced height for better visual density
      const nodeSpacing = levelWidth / Math.max(nodesAtVisualLevel, 1);

      const x = (currentIndex - (nodesAtVisualLevel - 1) / 2) * nodeSpacing;
      const y = visualLevel * levelHeight;

      // Create React Flow node (draggable)
      nodes.push({
        id: nodeId,
        type: "btreeNode",
        position: { x, y },
        draggable: true,
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
          buildSubtree(subtreeId);
        });
      }
    }

    // Start building from root
    buildSubtree(tree.root);

    return { nodes, edges };
  }, [listTrees, listNodes, onDeleteItem]);
}

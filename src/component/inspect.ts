import { v } from "convex/values";
import { Id } from "./_generated/dataModel.js";
import { DatabaseReader, query } from "./_generated/server.js";
import { getTree, Namespace, p } from "./btree.js";
import { Value as ConvexValue } from "convex/values";

export const display = query({
  args: { namespace: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const tree = await getTree(ctx.db, args.namespace);
    if (!tree) {
      return "empty";
    }
    return await displayNode(ctx.db, tree.root);
  },
});

async function displayNode(
  db: DatabaseReader,
  node: Id<"btreeNode">,
  depth: number = 0
) {
  const n = (await db.get(node))!;
  for (let i = 0; i < n.items.length; i++) {
    if (n.subtrees.length > 0) {
      await displayNode(db, n.subtrees[i], depth + 1);
    }
    console.log(" ".repeat(depth) + p(n.items[i].k));
  }
  if (n.subtrees.length > 0) {
    await displayNode(db, n.subtrees[n.subtrees.length - 1], depth + 1);
  }
}

export const dump = query({
  args: {
    namespace: v.optional(v.any()),
    format: v.optional(v.union(v.literal("string"), v.literal("structured"))),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    if (args.format === "structured")
      return await dumpTreeStructured(ctx.db, args.namespace);

    // Default to string format for backwards compatibility
    const structured = await dumpTreeStructured(ctx.db, args.namespace);
    if (structured?.status === "active" && structured.rootNode)
      return structuredToString(structured.rootNode);

    return "empty";
  },
});

export async function dumpTree(db: DatabaseReader, namespace: Namespace) {
  const structured = await dumpTreeStructured(db, namespace);
  if (structured?.status === "active" && structured.rootNode) {
    return structuredToString(structured.rootNode);
  }
  return "empty";
}

export async function dumpTreeStructured(
  db: DatabaseReader,
  namespace: Namespace
): Promise<
  | { status: "empty"; message: string }
  | {
      status: "active";
      treeMetadata: {
        _id: string;
        root: string;
        namespace: ConvexValue;
        maxNodeSize: number;
        isRootLazy: boolean;
        _creationTime: number;
      };
      rootNode: StructuredNode;
    }
> {
  const tree = await getTree(db, namespace);
  if (!tree) {
    return {
      status: "empty",
      message: "No B-tree exists yet",
    };
  }

  const rootNode = await db.get(tree.root);
  const isRootLazy = rootNode!.aggregate === undefined;

  const structuredRoot = await dumpNodeStructuredImpl(db, tree.root);

  return {
    status: "active",
    treeMetadata: {
      _id: tree._id,
      root: tree.root,
      namespace: tree.namespace,
      maxNodeSize: tree.maxNodeSize,
      isRootLazy,
      _creationTime: tree._creationTime,
    },
    rootNode: structuredRoot,
  };
}

type StructuredNode = {
  _id: string;
  keys: ConvexValue[];
  isLeaf: boolean;
  aggregate?: {
    count: number;
    sum: number;
  };
  children: StructuredNode[];
  _creationTime: number;
};

/// Converts structured representation back to string format for backwards compatibility
function structuredToString(node: StructuredNode): string {
  if (node.children.length === 0) {
    // Leaf node
    return `[${node.keys.map(p).join(", ")}]`;
  } else {
    // Internal node
    let s = "[";
    for (let i = 0; i < node.keys.length; i++) {
      s += `${structuredToString(node.children[i])}, ${p(node.keys[i])}, `;
    }
    s += structuredToString(node.children[node.children.length - 1]);
    s += "]";
    return s;
  }
}

/// Returns structured representation of B-tree node with all metadata
async function dumpNodeStructuredImpl(
  db: DatabaseReader,
  node: Id<"btreeNode">
): Promise<StructuredNode> {
  const n = (await db.get(node))!;
  const keys = n.items.map((i) => i.k);
  const isLeaf = n.subtrees.length === 0;

  let children: StructuredNode[] = [];
  if (!isLeaf) {
    children = await Promise.all(
      n.subtrees.map((subtree) => dumpNodeStructuredImpl(db, subtree))
    );
  }

  return {
    _id: node,
    keys,
    isLeaf,
    aggregate: n.aggregate,
    children,
    _creationTime: n._creationTime,
  };
}

export const inspectNode = query({
  args: { node: v.optional(v.string()), namespace: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tree = await getTree(ctx.db, args.namespace);
    if (!tree) {
      console.log("no tree");
      return;
    }
    let n = await ctx.db.get(tree.root);
    if (args.node) {
      n = await ctx.db.get(args.node as Id<"btreeNode">);
    }
    if (!n) {
      console.log("no node");
      return;
    }
    console.log("btreeNode", n._id);
    console.log("aggregate", n.aggregate);
    for (let i = 0; i < n.items.length; i++) {
      if (n.subtrees.length > 0) {
        console.log("subtree", n.subtrees[i]);
      }
      console.log("item", n.items[i]);
    }
    if (n.subtrees.length > 0) {
      console.log("subtree", n.subtrees[n.subtrees.length - 1]);
    }
  },
});

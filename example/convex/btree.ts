/**
 * Example showing B-tree visualization as scores are added.
 * Demonstrates the underlying B-tree structure using the inspect dump function.
 */

import { TableAggregate } from "@convex-dev/aggregate";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
} from "../../example/convex/_generated/server";
import { components, internal } from "../../example/convex/_generated/api";
import { DataModel } from "../../example/convex/_generated/dataModel";
import { v } from "convex/values";

const btreeAggregate = new TableAggregate<{
  Key: number;
  DataModel: DataModel;
  TableName: "btreeDemo";
}>(components.btreeAggregate, {
  sortKey: (doc) => doc.score,
});

export const addScore = mutation({
  args: {
    name: v.string(),
    score: v.number(),
  },
  returns: v.id("btreeDemo"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("btreeDemo", {
      name: args.name,
      score: args.score,
    });
    const doc = await ctx.db.get(id);
    await btreeAggregate.insert(ctx, doc!);
    return id;
  },
});

export const removeScore = mutation({
  args: {
    id: v.id("btreeDemo"),
  },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return;
    await ctx.db.delete(id);
    await btreeAggregate.delete(ctx, doc);
  },
});

export const getAllScores = query({
  returns: v.array(
    v.object({
      _id: v.id("btreeDemo"),
      name: v.string(),
      score: v.number(),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx) => {
    const scores = [];
    for await (const { id } of btreeAggregate.iter(ctx, {
      bounds: undefined,
      order: "asc",
    })) {
      const doc = (await ctx.db.get(id))!;
      scores.push(doc);
    }
    return scores;
  },
});

export const countScores = query({
  handler: async (ctx) => {
    return await btreeAggregate.count(ctx);
  },
});

/**
 * Get the B-tree structure as structured data
 */
export const getBTreeStructured = query({
  returns: v.any(),
  handler: async (ctx) => {
    // Use the inspect component to get structured tree data
    return await ctx.runQuery(components.btreeAggregate.inspect.dump, {
      namespace: undefined,
      format: "structured",
    });
  },
});

// ----- internal -----

export const resetAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    console.log("Resetting B-tree demo...");

    // Clear docs
    const btreeDocs = await ctx.db.query("btreeDemo").collect();
    for (const doc of btreeDocs) await ctx.db.delete(doc._id);

    // Reset aggregate
    await btreeAggregate.clear(ctx);

    console.log("B-tree demo reset complete");
    return null;
  },
});

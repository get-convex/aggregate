/**
 * Example of collecting statistics on data not tied to a Convex table.
 */

import {
  internalMutation,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { DirectAggregate, Trigger } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx } from "convex-helpers/server/customFunctions";
import { customMutation } from "convex-helpers/server/customFunctions";
import schema from "./schema";

const foodStats = new DirectAggregate<{
  Namespace: string;
  Key: string;
  Id: string;
}>(components.stats);

const foodStatsTrigger: Trigger<MutationCtx, DataModel, "dishes"> = async (
  ctx,
  change
) => {
  if (change.operation === "insert") {
    const id = change.newDoc._id;
    for (const ingredient in change.newDoc.ingredients) {
      await foodStats.insert(ctx, { namespace: ingredient, id, key: id });
    }
  } else if (change.operation === "update") {
    const id = change.newDoc._id;
    for (const ingredient in change.newDoc.ingredients) {
      if (!change.oldDoc.ingredients.includes(ingredient)) {
        await foodStats.insert(ctx, { namespace: ingredient, id, key: id });
      }
    }
    for (const ingredient in change.oldDoc.ingredients) {
      if (!change.newDoc.ingredients.includes(ingredient)) {
        await foodStats.delete(ctx, { namespace: ingredient, id, key: id });
      }
    }
  } else if (change.operation === "delete") {
    for (const ingredient in change.oldDoc.ingredients) {
      const id = change.oldDoc._id;
      await foodStats.insert(ctx, { namespace: ingredient, id, key: id });
    }
  }
};

const triggers = new Triggers<DataModel>();

triggers.register("dishes", foodStatsTrigger);

const wrappedMutation = customMutation(mutation, customCtx(triggers.wrapDB));
const wrappedInternalMutation = customMutation(
  internalMutation,
  customCtx(triggers.wrapDB)
);

export const addDish = wrappedMutation({
  args: schema.tables.dishes.validator,
  handler: async (ctx, args) => {
    await ctx.db.insert("dishes", args);
  },
});

export const reportLatency = mutation({
  args: {
    latency: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { latency }) => {
    await stats.insert(ctx, {
      key: latency,
      id: new Date().toISOString(),
      sumValue: latency,
    });
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const count = await stats.count(ctx);
    if (count === 0) {
      throw new Error("No data");
    }
    const mean = (await stats.sum(ctx)) / count;
    const median = (await stats.at(ctx, Math.floor(count / 2))).key;
    const p75 = (await stats.at(ctx, Math.floor(count * 0.75))).key;
    const p95 = (await stats.at(ctx, Math.floor(count * 0.95))).key;
    const min = (await stats.min(ctx))!.key;
    const max = (await stats.max(ctx))!.key;
    return {
      mean,
      median,
      p75,
      p95,
      max,
      min,
    };
  },
});

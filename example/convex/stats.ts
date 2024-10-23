/**
 * Example of collecting statistics on data not tied to a Convex table.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";

const stats = new DirectAggregate<number, string>(components.stats);

export const reportLatency = mutation({
  args: {
    latency: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { latency }) => {
    await stats.insert(ctx, latency, new Date().toISOString(), latency);
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

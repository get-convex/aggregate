/**
 * Example of collecting statistics on data not tied to a Convex table.
 */

import {
  mutation,
  query,
  internalMutation,
} from "../../example/convex/_generated/server";
import { v } from "convex/values";
import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "../../example/convex/_generated/api";

const stats = new DirectAggregate<{
  Key: number;
  Id: string;
}>(components.stats);

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
    if (count === 0) return null;

    const mean = (await stats.sum(ctx)) / count;
    const median = (await stats.at(ctx, Math.floor(count / 2))).key;
    const p75 = (await stats.at(ctx, Math.floor(count * 0.75))).key;
    const p95 = (await stats.at(ctx, Math.floor(count * 0.95))).key;
    const min = (await stats.min(ctx))!.key;
    const max = (await stats.max(ctx))!.key;
    return {
      count,
      mean,
      median,
      p75,
      p95,
      max,
      min,
    };
  },
});

// ----- internal -----

export const resetAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    console.log("Resetting stats...");

    // Clear the direct aggregate
    await stats.clear(ctx);

    console.log("Stats reset complete");
    return null;
  },
});

export const addLatencies = mutation({
  args: {
    latencies: v.array(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { latencies }) => {
    await Promise.all(
      latencies.map((latency) =>
        stats.insert(ctx, {
          key: latency,
          id: new Date().toISOString(),
          sumValue: latency,
        })
      )
    );
  },
});

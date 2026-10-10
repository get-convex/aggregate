/**
 * Example of collecting statistics on data not tied to a Convex table.
 */

import { v } from "convex/values";
import { resetStatusValidator } from "./utils/resetStatus";
import { internalMutation, mutation, query } from "./utils/queued.js";
import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";

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
    await stats.insert(
      ctx,
      { key: latency, id: new Date().toISOString(), sumValue: latency },
      ctx.aggregateOpts,
    );
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const opts = { ...ctx.aggregateOpts };
    const count = await stats.count(ctx, opts);
    if (count === 0) return null;

    const mean = (await stats.sum(ctx, opts)) / count;
    const median = (await stats.at(ctx, Math.floor(count / 2), opts)).key;
    const p75 = (await stats.at(ctx, Math.floor(count * 0.75), opts)).key;
    const p95 = (await stats.at(ctx, Math.floor(count * 0.95), opts)).key;
    const min = (await stats.min(ctx, opts))!.key;
    const max = (await stats.max(ctx, opts))!.key;
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
  returns: resetStatusValidator,
  handler: async (ctx): Promise<"all_reset" | "partial_reset"> => {
    console.log("Resetting stats...");
    await stats.clear(ctx);
    console.log("Stats reset complete");
    return "all_reset";
  },
});

export const addLatencies = internalMutation({
  args: {
    latencies: v.array(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { latencies }) => {
    await Promise.all(
      latencies.map((latency) =>
        stats.insert(
          ctx,
          { key: latency, id: new Date().toISOString(), sumValue: latency },
          ctx.aggregateOpts,
        ),
      ),
    );
  },
});

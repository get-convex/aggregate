/**
 * The app-wide toggle between synchronous and queued aggregate modes.
 * See utils/queued.ts for how the mode reaches each aggregate call.
 */

import { Aggregate } from "@convex-dev/aggregate";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server.js";

// How long to wait before re-checking whether the batch worker has caught up.
const DRAIN_POLL_MS = 250;

export const queuedModeValidator = v.object({
  queued: v.boolean(),
  draining: v.boolean(),
});

export const getQueuedMode = query({
  args: {},
  returns: queuedModeValidator,
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    return {
      queued: settings?.queued ?? false,
      draining: settings?.draining ?? false,
    };
  },
});

export const setQueuedMode = mutation({
  args: { queued: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { queued }) => {
    if (queued) {
      await writeSettings(ctx, { queued: true, draining: false });
      return null;
    }
    // Turning queued mode off can't take effect until the batch worker has
    // applied every queued write, because synchronous reads and writes throw
    // while any are outstanding. Stay in queued mode until the queue drains.
    await writeSettings(ctx, { queued: true, draining: true });
    await ctx.scheduler.runAfter(0, internal.settings.finishDisabling, {});
    return null;
  },
});

export const finishDisabling = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    // Queued mode was turned back on while we were waiting.
    if (!settings?.draining) return null;

    if (!(await aggregatesAreDrained(ctx))) {
      await ctx.scheduler.runAfter(
        DRAIN_POLL_MS,
        internal.settings.finishDisabling,
        {},
      );
      return null;
    }

    await ctx.db.patch("settings", settings._id, {
      queued: false,
      draining: false,
    });
    return null;
  },
});

async function writeSettings(
  ctx: MutationCtx,
  settings: { queued: boolean; draining: boolean },
) {
  const existing = await ctx.db.query("settings").first();
  if (existing) {
    await ctx.db.patch("settings", existing._id, settings);
  } else {
    await ctx.db.insert("settings", settings);
  }
}

// Every aggregate in the app, as a bare `Aggregate` so we can do a synchronous
// read against each one without caring about its key or namespace type.
const allAggregates = [
  components.aggregateByScore,
  components.aggregateScoreByUser,
  components.music,
  components.photos,
  components.stats,
  components.btreeAggregate,
].map((component) => new Aggregate<number, string>(component));

/**
 * Whether the batch worker has applied every queued write, i.e. whether it's
 * safe to read and write the aggregates synchronously.
 */
export async function aggregatesAreDrained(ctx: QueryCtx): Promise<boolean> {
  for (const aggregate of allAggregates) {
    try {
      // A synchronous read throws if anything is still queued.
      await aggregate.count(ctx);
    } catch (error) {
      if (
        error instanceof ConvexError &&
        (error.data as { code?: string } | undefined)?.code ===
          "PENDING_OPERATIONS"
      ) {
        return false;
      }
      throw error;
    }
  }
  return true;
}

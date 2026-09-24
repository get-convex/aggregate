/**
 * Shared plumbing for the app-wide "queued mode" toggle.
 *
 * Every aggregate in this example can run in one of two modes:
 *
 * - synchronous (the default): writes update the aggregate's B-tree in the same
 *   transaction as the data they're derived from, and reads see those writes
 *   immediately.
 * - queued: writes are enqueued with `{ async: true }` and applied later by the
 *   component's batch worker, and reads pass `{ stale: true }` so they read the
 *   most recently applied snapshot instead of throwing.
 *
 * The mode is one global setting rather than a per-caller argument because the
 * aggregate throws if a synchronous read or write happens while queued writes
 * are still outstanding, so the whole app has to agree on the mode.
 *
 * Functions defined with the `query`/`mutation` builders below get
 * `ctx.aggregateOpts`, which can be spread into any aggregate read or passed as
 * the trailing opts argument of any aggregate write:
 *
 * ```ts
 * await aggregate.count(ctx, { ...ctx.aggregateOpts });
 * await aggregate.insert(ctx, doc, ctx.aggregateOpts);
 * ```
 */

import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Triggers } from "convex-helpers/server/triggers";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
  query as rawQuery,
  type MutationCtx as RawMutationCtx,
  type QueryCtx as RawQueryCtx,
} from "../_generated/server.js";
import type { DataModel } from "../_generated/dataModel.js";

/** Options accepted by the aggregate's read and write methods. */
export type AggregateOpts = { stale: boolean; async: boolean };

export const SYNCHRONOUS: AggregateOpts = { stale: false, async: false };
export const QUEUED: AggregateOpts = { stale: true, async: true };

/** Ctx of a mode-aware mutation, including the one triggers are called with. */
export type MutationCtx = RawMutationCtx & { aggregateOpts: AggregateOpts };

export async function queuedModeEnabled(
  ctx: Pick<RawQueryCtx, "db">,
): Promise<boolean> {
  const settings = await ctx.db.query("settings").first();
  return settings?.queued ?? false;
}

async function aggregateOpts(
  ctx: Pick<RawQueryCtx, "db">,
): Promise<AggregateOpts> {
  return (await queuedModeEnabled(ctx)) ? QUEUED : SYNCHRONOUS;
}

export const query = customQuery(
  rawQuery,
  customCtx(async (ctx) => ({ aggregateOpts: await aggregateOpts(ctx) })),
);

export const mutation = customMutation(
  rawMutation,
  customCtx(async (ctx) => ({ aggregateOpts: await aggregateOpts(ctx) })),
);

/**
 * Maintenance functions (resetting and seeding) always run synchronously,
 * regardless of the toggle: they call `clear`, which can't be enqueued and
 * throws while there are queued writes outstanding. See `settings.ts` for how
 * the queue is drained before those functions run.
 */
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(() => ({ aggregateOpts: SYNCHRONOUS })),
);

export type AppTriggers = Triggers<DataModel, MutationCtx>;

/** `mutation`, with a trigger-wrapped `ctx.db`. */
export function mutationWithTriggers(triggers: AppTriggers) {
  return customMutation(
    rawMutation,
    customCtx(async (ctx: RawMutationCtx) =>
      triggers.wrapDB({ ...ctx, aggregateOpts: await aggregateOpts(ctx) }),
    ),
  );
}

/** `internalMutation`, with a trigger-wrapped `ctx.db`. */
export function internalMutationWithTriggers(triggers: AppTriggers) {
  return customMutation(
    rawInternalMutation,
    customCtx((ctx: RawMutationCtx) =>
      triggers.wrapDB({ ...ctx, aggregateOpts: SYNCHRONOUS }),
    ),
  );
}

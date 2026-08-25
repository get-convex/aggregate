import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { paginator } from "convex-helpers/server/pagination";
import { mutation, query } from "./_generated/server.js";
import schema from "./schema.js";

export const vDeadLetterEntry =
  schema.tables.deadLetterOperations.validator.extend({
    _id: v.id("deadLetterOperations"),
    _creationTime: v.number(),
  });

/**
 * List dead-lettered operations.
 *
 * Entries are ordered by `commitTs` of the enqueued operation, defaulting to
 * ascending order.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  returns: paginationResultValidator(vDeadLetterEntry),
  handler: async (ctx, { paginationOpts, order }) => {
    return await paginator(ctx.db, schema)
      .query("deadLetterOperations")
      .withIndex("by_commitTs")
      .order(order ?? "asc")
      .paginate(paginationOpts);
  },
});

/**
 * Fetch a dead-lettered operation by id, or `null` if it does not exist.
 */
export const get = query({
  args: { id: v.id("deadLetterOperations") },
  returns: v.union(vDeadLetterEntry, v.null()),
  handler: async (ctx, { id }) => {
    return await ctx.db.get("deadLetterOperations", id);
  },
});

/**
 * Delete a dead-lettered operation by id. Returns false if the operation does
 * not exist.
 */
export const delete_ = mutation({
  args: { id: v.id("deadLetterOperations") },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    if (!(await ctx.db.get("deadLetterOperations", id))) {
      return false;
    }
    await ctx.db.delete("deadLetterOperations", id);
    return true;
  },
});

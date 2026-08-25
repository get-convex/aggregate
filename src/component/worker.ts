import { defineBatchWorkerValidators, ping } from "@convex-dev/batch-worker";
import { ConvexError, getConvexSize, type Infer, v } from "convex/values";
import type { TransactionMetrics } from "convex/server";
import {
  type DatabaseWriter,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server.js";
import { components, internal } from "./_generated/api.js";
import { type Operation, vOperation } from "./schema.js";
import {
  deleteHandler,
  deleteIfExistsHandler,
  insertHandler,
  replaceHandler,
  replaceOrInsertHandler,
} from "./btree.js";

export function batchMaxBytes(metrics: TransactionMetrics): number {
  const { used, remaining } = metrics.bytesRead;
  return (used + remaining) / 4;
}

export const BATCH_MAX_OPERATIONS = 1024;
export const MAX_OPERATIONS_PER_ENTRY = 512;

export const OPS_WORKER_NAME = "ops";

export async function enqueueOperation(ctx: MutationCtx, operation: Operation) {
  const newestEntry = await ctx.db
    .query("pendingOperations")
    .withIndex("by_commitTs", (q) => q.eq("commitTs", ctx.db.vars.commitTs))
    .order("desc")
    .first();
  if (newestEntry && newestEntry.operations.length < MAX_OPERATIONS_PER_ENTRY) {
    await ctx.db.patch("pendingOperations", newestEntry._id, {
      operations: [...newestEntry.operations, operation],
    });
  } else {
    await ctx.db.insert("pendingOperations", {
      commitTs: ctx.db.vars.commitTs,
      operations: [operation],
    });
  }
  await ping(ctx, components.batchWorker, {
    // TODO: explore separate queues by namespace
    name: OPS_WORKER_NAME,
    workQuery: internal.worker.getBatch,
    workerMutation: internal.worker.processBatch,
  });
}

const vBatchEntry = v.object({
  id: v.id("pendingOperations"),
  commitTs: v.int64(),
  operations: v.array(vOperation),
});
type BatchEntry = Infer<typeof vBatchEntry>;

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } =
  defineBatchWorkerValidators({
    batch: { entries: v.array(vBatchEntry) },
  });

export const getBatch = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { cursor }) => {
    const maxBytes = batchMaxBytes(await ctx.meta.getTransactionMetrics());
    const rows = ctx.db
      .query("pendingOperations")
      .withIndex("by_commitTs", (q) =>
        cursor === undefined ? q : q.gte("commitTs", cursor),
      );
    const entries: BatchEntry[] = [];
    let bytes = 0;
    let operations = 0;
    for await (const row of rows) {
      if (typeof row.commitTs !== "bigint") {
        console.warn(
          `[aggregate] pendingOperations ${row._id} has an unresolved commitTs; skipping it. This should be impossible.`,
        );
        continue;
      }
      const rowBytes = getConvexSize(row);
      if (
        entries.length > 0 &&
        (bytes + rowBytes > maxBytes ||
          operations + row.operations.length > BATCH_MAX_OPERATIONS)
      ) {
        break;
      }
      entries.push({
        id: row._id,
        commitTs: row.commitTs,
        operations: row.operations,
      });
      bytes += rowBytes;
      operations += row.operations.length;
    }
    if (entries.length === 0) {
      return { kind: "idle" as const };
    }
    return { kind: "work" as const, batch: { entries } };
  },
});

const BATCH_LIMITS = [
  "bytesRead",
  "bytesWritten",
  "databaseQueries",
  "documentsRead",
  "documentsWritten",
] as const;

export type BatchLimit = (typeof BATCH_LIMITS)[number];

// Documents, reads, or queries reserved for finishing the cycle after its last
// operation.
export const RESERVE_HEADROOM = 100;
// Bytes reserved to cover rewriting a pendingOperations row
export const RESERVE_BYTES = 2 * 1024 * 1024; // 2 MiB = twice the document size limit

export const FINISH_RESERVE: Record<BatchLimit, number> = {
  bytesRead: RESERVE_BYTES,
  bytesWritten: RESERVE_BYTES,
  databaseQueries: RESERVE_HEADROOM,
  documentsRead: RESERVE_HEADROOM,
  documentsWritten: RESERVE_HEADROOM,
};

// Whether this transaction still has room to finish the cycle.
export function hasHeadroomToFinish(metrics: TransactionMetrics): boolean {
  return BATCH_LIMITS.every(
    (limit) => metrics[limit].remaining > FINISH_RESERVE[limit],
  );
}

const OPERATION_FAILED = "OPERATION_FAILED";

type OperationFailure = {
  entryIndex: number;
  operationIndex: number;
  error: string;
};

function operationFailure(e: unknown): OperationFailure | null {
  if (!(e instanceof ConvexError)) {
    return null;
  }
  return e.data?.code === OPERATION_FAILED ? e.data : null;
}

export const processBatchInner = internalMutation({
  args: { entries: v.array(vBatchEntry) },
  returns: v.int64(),
  handler: async (ctx, { entries }) => {
    let cursor: bigint | null = null;
    for (const [entryIndex, entry] of entries.entries()) {
      let applied = 0;
      for (const operation of entry.operations) {
        try {
          await applyOperation(ctx, operation);
        } catch (e) {
          throw new ConvexError({
            code: OPERATION_FAILED,
            entryIndex,
            operationIndex: applied,
            error: String(e),
          });
        }
        applied++;
        if (!hasHeadroomToFinish(await ctx.meta.getTransactionMetrics())) {
          break;
        }
      }
      cursor = entry.commitTs;
      if (applied < entry.operations.length) {
        await ctx.db.patch("pendingOperations", entry.id, {
          operations: entry.operations.slice(applied),
        });
        break;
      }
      await ctx.db.delete("pendingOperations", entry.id);
      if (!hasHeadroomToFinish(await ctx.meta.getTransactionMetrics())) {
        break;
      }
    }
    if (cursor === null) {
      throw new Error("[aggregate] a cycle made no progress on its batch");
    }
    return cursor;
  },
});

export const processBatch = internalMutation({
  args: vMutationArgs,
  returns: vMutationReturns,
  handler: async (
    ctx,
    { entries },
  ): Promise<{ cursor: bigint } | undefined> => {
    if (entries.length === 0) {
      throw new Error("[aggregate] a cycle got an empty batch");
    }
    try {
      // Apply operations in a subtransaction so that we can rollback the changes if an operation fails.
      const cursor = await ctx.runMutation(internal.worker.processBatchInner, {
        entries,
      });
      return { cursor };
    } catch (e) {
      const failure = operationFailure(e);
      if (!failure) {
        throw e;
      }
      const entry = entries[failure.entryIndex];
      const operation = entry.operations[failure.operationIndex];
      console.error(
        `[aggregate] dead-lettering a ${operation.type} operation from commitTs ${entry.commitTs}: ${failure.error}`,
      );
      await ctx.db.insert("deadLetterOperations", {
        commitTs: entry.commitTs,
        operation,
        error: failure.error,
      });
      const remaining = entry.operations.filter(
        (_, i) => i !== failure.operationIndex,
      );
      if (remaining.length > 0) {
        await ctx.db.patch("pendingOperations", entry.id, {
          operations: remaining,
        });
      } else {
        await ctx.db.delete("pendingOperations", entry.id);
      }
    }
  },
});

export async function applyOperation(
  ctx: { db: DatabaseWriter },
  op: Operation,
) {
  switch (op.type) {
    case "insert": {
      const { type: _, ...args } = op;
      await insertHandler(ctx, args);
      break;
    }
    case "delete": {
      const { type: _, ...args } = op;
      await deleteHandler(ctx, args);
      break;
    }
    case "replace": {
      const { type: _, ...args } = op;
      await replaceHandler(ctx, args);
      break;
    }
    case "deleteIfExists": {
      const { type: _, ...args } = op;
      await deleteIfExistsHandler(ctx, args);
      break;
    }
    case "replaceOrInsert": {
      const { type: _, ...args } = op;
      await replaceOrInsertHandler(ctx, args);
      break;
    }
    default:
      op satisfies never;
  }
}

import type {
  DocumentByName,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  TableNamesInDataModel,
} from "convex/server";
import type { Key } from "../component/btree.js";
import {
  type Position,
  positionToKey,
  boundToPosition,
  keyToPosition,
  type Bound,
  type Bounds,
  boundsToPositions,
} from "./positions.js";
import type { GenericId, Value as ConvexValue } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";

export type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
export type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;
export type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

// A `stale: true` read reads from a snapshot, which is only possible from a
// mutation (via `runQuery(..., { useStaleSnapshot: true })`) or an action (whose
// `runQuery` already reads a fresh snapshot per call). Both have `runMutation`,
// which a plain `QueryCtx` lacks — so passing `stale: true` from a query is a
// compile error.
export type StaleReadCtx = MutationCtx | ActionCtx;

// Any ctx a read can run from. Read impls and helpers accept this; the public
// overloads narrow it (QueryCtx for the default path, StaleReadCtx for stale).
export type AnyReadCtx = QueryCtx | MutationCtx | ActionCtx;

// Only a mutation ctx's `runQuery` accepts `{ useStaleSnapshot }`: a query ctx
// lacks `runMutation`, and an action ctx has `runAction` (its `runQuery` is
// already a fresh snapshot per call and takes no options).
function isMutationCtx(ctx: AnyReadCtx): ctx is MutationCtx {
  return "runMutation" in ctx && !("runAction" in ctx);
}

// Runs a component query, optionally against a stale snapshot. `stale` is passed
// through to the query (so its handler skips the pendingOps guard) and, on a
// mutation ctx, triggers a stale-snapshot read.
async function runQuery<
  Query extends FunctionReference<"query", "internal" | "public">,
>(
  ctx: AnyReadCtx,
  query: Query,
  args: FunctionArgs<Query>,
  stale: boolean | undefined,
): Promise<FunctionReturnType<Query>> {
  const argsWithStale = { ...args, stale };
  if (stale && isMutationCtx(ctx)) {
    return ctx.runQuery(query, argsWithStale, { useStaleSnapshot: true });
  }
  return ctx.runQuery(query, argsWithStale);
}

export type Item<K extends Key, ID extends string> = {
  key: K;
  id: ID;
  sumValue: number;
};

export type { Key, Bound, Bounds };

type BufferedOperation =
  | {
      type: "insert";
      key: any;
      value: any;
      summand?: number;
      namespace?: any;
    }
  | {
      type: "delete";
      key: any;
      namespace?: any;
    }
  | {
      type: "replace";
      currentKey: any;
      newKey: any;
      value: any;
      summand?: number;
      namespace?: any;
      newNamespace?: any;
    }
  | {
      type: "deleteIfExists";
      key: any;
      namespace?: any;
    }
  | {
      type: "replaceOrInsert";
      currentKey: any;
      newKey: any;
      value: any;
      summand?: number;
      namespace?: any;
      newNamespace?: any;
    };

/**
 * Write data to be aggregated, and read aggregated data.
 *
 * The data structure is effectively a key-value store sorted by key, where the
 * value is an ID and an optional sumValue.
 * 1. The key can be any Convex value (number, string, array, etc.).
 * 2. The ID is a string which should be unique.
 * 3. The sumValue is a number which is aggregated by summing. If not provided,
 *    it's assumed to be zero.
 *
 * Once values have been added to the data structure, you can query for the
 * count and sum of items between a range of keys.
 */
export class Aggregate<
  K extends Key,
  ID extends string,
  Namespace extends ConvexValue | undefined = undefined,
> {
  private isBuffering = false;
  // Whether the active buffer enqueues to the stale queue (true) or flushes
  // synchronously (false). A stale write into a non-stale buffer throws.
  private bufferStale = false;
  private currentFlushPromise: Promise<unknown> | null = null;
  private operationQueue: BufferedOperation[] = [];

  constructor(protected component: ComponentApi) {}

  /**
   * Start buffering write operations. When buffering is enabled, write operations are
   * queued and sent in a batch when flush() or stopBuffering() is called or when any read
   * operation is performed.
   *
   * Example usage:
   * ```ts
   * aggregate.startBuffering();
   * aggregate.insert(ctx, { key: 1, id: "a" });
   * aggregate.insert(ctx, { key: 2, id: "b" });
   * await aggregate.finishBuffering(ctx); // Send all buffered operations
   * ```
   *
   * Pass `{ stale: true }` to enqueue the buffered operations to the async queue
   * on flush instead of applying them synchronously. While a non-stale buffer is
   * active, a write with `stale: true` throws.
   */
  startBuffering(opts?: { stale?: boolean }): void {
    this.isBuffering = true;
    this.bufferStale = opts?.stale ?? false;
  }

  /**
   * Stop buffering write operations and flush all buffered operations.
   * @param ctx - The mutation context, used to flush the buffered operations.
   */
  async finishBuffering(ctx: MutationCtx): Promise<void> {
    await this.flush(ctx, { stopBuffering: true });
  }

  /**
   * Flush all buffered operations to the database.
   * This sends all queued write operations in a single batch mutation.
   * Called automatically before any read operation when buffering is enabled.
   */
  async flush(
    ctx: MutationCtx | ActionCtx,
    opts?: { stopBuffering?: boolean },
  ): Promise<void> {
    const { stopBuffering = false } = opts ?? {};
    while (this.currentFlushPromise) {
      await this.currentFlushPromise;
    }
    // start critical section (no awaiting allowed)
    const stale = this.bufferStale;
    if (stopBuffering) {
      this.isBuffering = false;
      this.bufferStale = false;
    }
    if (this.operationQueue.length === 0) {
      return;
    }
    const operations = this.operationQueue;
    this.operationQueue = [];
    const flushMutation = stale
      ? this.component.public.enqueue
      : this.component.public.batch;
    this.currentFlushPromise = ctx
      .runMutation(flushMutation, { operations })
      .then(() => (this.currentFlushPromise = null));
    // end critical section
    await this.currentFlushPromise;
  }

  private async flushBeforeRead(ctx: AnyReadCtx) {
    if (this.isBuffering && this.operationQueue.length > 0) {
      if (!("runMutation" in ctx)) {
        throw new Error(
          "Buffered operations found in a query context: " +
            this.operationQueue.map((op) => op.type).join(", "),
        );
      }
      await this.flush(ctx);
    } else if (this.currentFlushPromise) {
      await this.currentFlushPromise;
    }
  }

  // If buffering, queue the op and return true (caller returns early). A stale
  // write into a non-stale buffer is a mode mismatch and throws.
  private bufferOp(op: BufferedOperation, stale?: boolean): boolean {
    if (!this.isBuffering) {
      return false;
    }
    if (stale && !this.bufferStale) {
      throw new Error(
        "Cannot perform a stale write in a non-stale buffer; " +
          "start buffering with { stale: true }.",
      );
    }
    this.operationQueue.push(op);
    return true;
  }

  /// Aggregate queries.

  /**
   * Counts items between the given bounds.
   */
  count(
    ctx: AnyReadCtx,
    ...opts: NamespacedReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<number>;
  count(
    ctx: StaleReadCtx,
    ...opts: NamespacedStaleReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<number>;
  async count(
    ctx: AnyReadCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID>; stale?: boolean }, Namespace>
  ): Promise<number> {
    await this.flushBeforeRead(ctx);
    const { count } = await runQuery(
      ctx,
      this.component.btree.aggregateBetween,
      {
        ...boundsToPositions(opts[0]?.bounds),
        namespace: namespaceFromOpts(opts),
      },
      opts[0]?.stale,
    );
    return count;
  }

  /**
   * Batch version of count() - counts items for multiple bounds in a single call.
   */
  countBatch(
    ctx: AnyReadCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, Namespace>,
    opts?: { stale?: false },
  ): Promise<number[]>;
  countBatch(
    ctx: StaleReadCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, Namespace>,
    opts: { stale: true },
  ): Promise<number[]>;
  async countBatch(
    ctx: AnyReadCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, Namespace>,
    opts?: { stale?: boolean },
  ): Promise<number[]> {
    await this.flushBeforeRead(ctx);
    const queryArgs = queries.map((query) => {
      if (!query) {
        throw new Error("You must pass bounds and/or namespace");
      }
      const namespace = namespaceFromArg(query);
      const { k1, k2 } = boundsToPositions(query.bounds);
      return { k1, k2, namespace };
    });
    const results = await runQuery(
      ctx,
      this.component.btree.aggregateBetweenBatch,
      {
        queries: queryArgs,
      },
      opts?.stale,
    );
    return results.map((result: { count: number }) => result.count);
  }

  /**
   * Adds up the sumValue of items between the given bounds.
   */
  sum(
    ctx: AnyReadCtx,
    ...opts: NamespacedReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<number>;
  sum(
    ctx: StaleReadCtx,
    ...opts: NamespacedStaleReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<number>;
  async sum(
    ctx: AnyReadCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID>; stale?: boolean }, Namespace>
  ): Promise<number> {
    await this.flushBeforeRead(ctx);
    const { sum } = await runQuery(
      ctx,
      this.component.btree.aggregateBetween,
      {
        ...boundsToPositions(opts[0]?.bounds),
        namespace: namespaceFromOpts(opts),
      },
      opts[0]?.stale,
    );
    return sum;
  }

  /**
   * Batch version of sum() - sums items for multiple bounds in a single call.
   */
  sumBatch(
    ctx: AnyReadCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, Namespace>,
    opts?: { stale?: false },
  ): Promise<number[]>;
  sumBatch(
    ctx: StaleReadCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, Namespace>,
    opts: { stale: true },
  ): Promise<number[]>;
  async sumBatch(
    ctx: AnyReadCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, Namespace>,
    opts?: { stale?: boolean },
  ): Promise<number[]> {
    await this.flushBeforeRead(ctx);
    const queryArgs = queries.map((query) => {
      if (!query) {
        throw new Error("You must pass bounds and/or namespace");
      }
      const namespace = namespaceFromArg(query);
      const { k1, k2 } = boundsToPositions(query.bounds);
      return { k1, k2, namespace };
    });
    const results = await runQuery(
      ctx,
      this.component.btree.aggregateBetweenBatch,
      {
        queries: queryArgs,
      },
      opts?.stale,
    );
    return results.map((result: { sum: number }) => result.sum);
  }

  /**
   * Returns the item at the given offset/index/rank in the order of key,
   * within the bounds. Zero-indexed, so at(0) is the smallest key within the
   * bounds.
   *
   * If offset is negative, it counts from the end of the list, so at(-1) is the
   * item with the largest key within the bounds.
   */
  at(
    ctx: AnyReadCtx,
    offset: number,
    ...opts: NamespacedReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID>>;
  at(
    ctx: StaleReadCtx,
    offset: number,
    ...opts: NamespacedStaleReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID>>;
  async at(
    ctx: AnyReadCtx,
    offset: number,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID>; stale?: boolean }, Namespace>
  ): Promise<Item<K, ID>> {
    await this.flushBeforeRead(ctx);
    const stale = opts[0]?.stale;
    if (offset < 0) {
      const item = await runQuery(
        ctx,
        this.component.btree.atNegativeOffset,
        {
          offset: -offset - 1,
          namespace: namespaceFromOpts(opts),
          ...boundsToPositions(opts[0]?.bounds),
        },
        stale,
      );
      return btreeItemToAggregateItem(item);
    }
    const item = await runQuery(
      ctx,
      this.component.btree.atOffset,
      {
        offset,
        namespace: namespaceFromOpts(opts),
        ...boundsToPositions(opts[0]?.bounds),
      },
      stale,
    );
    return btreeItemToAggregateItem(item);
  }
  /**
   * Batch version of at() - returns items at multiple offsets in a single call.
   */
  atBatch(
    ctx: AnyReadCtx,
    queries: NamespacedOptsBatch<
      { offset: number; bounds?: Bounds<K, ID> },
      Namespace
    >,
    opts?: { stale?: false },
  ): Promise<Item<K, ID>[]>;
  atBatch(
    ctx: StaleReadCtx,
    queries: NamespacedOptsBatch<
      { offset: number; bounds?: Bounds<K, ID> },
      Namespace
    >,
    opts: { stale: true },
  ): Promise<Item<K, ID>[]>;
  async atBatch(
    ctx: AnyReadCtx,
    queries: NamespacedOptsBatch<
      { offset: number; bounds?: Bounds<K, ID> },
      Namespace
    >,
    opts?: { stale?: boolean },
  ): Promise<Item<K, ID>[]> {
    await this.flushBeforeRead(ctx);
    const queryArgs = queries.map((q) => ({
      offset: q.offset,
      ...boundsToPositions(q.bounds),
      namespace: namespaceFromArg(q),
    }));

    const results = await runQuery(
      ctx,
      this.component.btree.atOffsetBatch,
      {
        queries: queryArgs,
      },
      opts?.stale,
    );

    return results.map(btreeItemToAggregateItem<K, ID>);
  }
  /**
   * Returns the rank/offset/index of the given key, within the bounds.
   * Specifically, it returns the index of the first item with
   *
   * - key >= the given key if `order` is "asc" (default)
   * - key <= the given key if `order` is "desc"
   */
  indexOf(
    ctx: AnyReadCtx,
    key: K,
    ...opts: NamespacedReadOpts<
      { id?: ID; bounds?: Bounds<K, ID>; order?: "asc" | "desc" },
      Namespace
    >
  ): Promise<number>;
  indexOf(
    ctx: StaleReadCtx,
    key: K,
    ...opts: NamespacedStaleReadOpts<
      { id?: ID; bounds?: Bounds<K, ID>; order?: "asc" | "desc" },
      Namespace
    >
  ): Promise<number>;
  async indexOf(
    ctx: AnyReadCtx,
    key: K,
    ...opts: NamespacedOpts<
      { id?: ID; bounds?: Bounds<K, ID>; order?: "asc" | "desc"; stale?: boolean },
      Namespace
    >
  ): Promise<number> {
    await this.flushBeforeRead(ctx);
    const { k1, k2 } = boundsToPositions(opts[0]?.bounds);
    const stale = opts[0]?.stale;
    if (opts[0]?.order === "desc") {
      return await runQuery(
        ctx,
        this.component.btree.offsetUntil,
        {
          key: boundToPosition("upper", {
            key,
            id: opts[0]?.id,
            inclusive: true,
          }),
          k2,
          namespace: namespaceFromOpts(opts),
        },
        stale,
      );
    }
    return await runQuery(
      ctx,
      this.component.btree.offset,
      {
        key: boundToPosition("lower", { key, id: opts[0]?.id, inclusive: true }),
        k1,
        namespace: namespaceFromOpts(opts),
      },
      stale,
    );
  }
  /**
   * @deprecated Use `indexOf` instead.
   */
  async offsetOf(
    ctx: AnyReadCtx,
    key: K,
    namespace: Namespace,
    id?: ID,
    bounds?: Bounds<K, ID>,
  ): Promise<number> {
    return this.indexOf(ctx, key, { id, bounds, order: "asc", namespace });
  }
  /**
   * @deprecated Use `indexOf` instead.
   */
  async offsetUntil(
    ctx: AnyReadCtx,
    key: K,
    namespace: Namespace,
    id?: ID,
    bounds?: Bounds<K, ID>,
  ): Promise<number> {
    return this.indexOf(ctx, key, { id, bounds, order: "desc", namespace });
  }

  /**
   * Gets the minimum item within the given bounds.
   */
  min(
    ctx: AnyReadCtx,
    ...opts: NamespacedReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID> | null>;
  min(
    ctx: StaleReadCtx,
    ...opts: NamespacedStaleReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID> | null>;
  async min(
    ctx: AnyReadCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID>; stale?: boolean }, Namespace>
  ): Promise<Item<K, ID> | null> {
    const { page } = await this.firstPage(ctx, "asc", opts);
    return page[0] ?? null;
  }
  /**
   * Gets the maximum item within the given bounds.
   */
  max(
    ctx: AnyReadCtx,
    ...opts: NamespacedReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID> | null>;
  max(
    ctx: StaleReadCtx,
    ...opts: NamespacedStaleReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID> | null>;
  async max(
    ctx: AnyReadCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID>; stale?: boolean }, Namespace>
  ): Promise<Item<K, ID> | null> {
    const { page } = await this.firstPage(ctx, "desc", opts);
    return page[0] ?? null;
  }
  // Shared by min/max: a single-item page in the given order, forwarding stale to
  // the right paginate overload.
  private firstPage(
    ctx: AnyReadCtx,
    order: "asc" | "desc",
    opts: NamespacedOpts<{ bounds?: Bounds<K, ID>; stale?: boolean }, Namespace>,
  ): Promise<{ page: Item<K, ID>[]; cursor: string; isDone: boolean }> {
    const args = {
      namespace: namespaceFromOpts(opts),
      bounds: opts[0]?.bounds,
      order,
      pageSize: 1,
    } as { namespace: Namespace; bounds?: Bounds<K, ID>; order: "asc" | "desc"; pageSize: number };
    if (opts[0]?.stale) {
      return this.paginate(ctx as StaleReadCtx, { ...args, stale: true });
    }
    return this.paginate(ctx, args);
  }
  /**
   * Gets a uniformly random item within the given bounds.
   */
  random(
    ctx: AnyReadCtx,
    ...opts: NamespacedReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID> | null>;
  random(
    ctx: StaleReadCtx,
    ...opts: NamespacedStaleReadOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID> | null>;
  async random(
    ctx: AnyReadCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID>; stale?: boolean }, Namespace>
  ): Promise<Item<K, ID> | null> {
    if (opts[0]?.stale) {
      const staleCtx = ctx as StaleReadCtx;
      const staleOpts = opts as NamespacedStaleReadOpts<
        { bounds?: Bounds<K, ID> },
        Namespace
      >;
      const count = await this.count(staleCtx, ...staleOpts);
      if (count === 0) {
        return null;
      }
      const index = Math.floor(Math.random() * count);
      return await this.at(staleCtx, index, ...staleOpts);
    }
    const nonStaleOpts = opts as NamespacedReadOpts<
      { bounds?: Bounds<K, ID> },
      Namespace
    >;
    const count = await this.count(ctx, ...nonStaleOpts);
    if (count === 0) {
      return null;
    }
    const index = Math.floor(Math.random() * count);
    return await this.at(ctx, index, ...nonStaleOpts);
  }
  /**
   * Get a page of items between the given bounds, with a cursor to paginate.
   * Use `iter` to iterate over all items within the bounds.
   */
  paginate(
    ctx: AnyReadCtx,
    ...opts: NamespacedReadOpts<
      {
        bounds?: Bounds<K, ID>;
        cursor?: string;
        order?: "asc" | "desc";
        pageSize?: number;
      },
      Namespace
    >
  ): Promise<{ page: Item<K, ID>[]; cursor: string; isDone: boolean }>;
  paginate(
    ctx: StaleReadCtx,
    ...opts: NamespacedStaleReadOpts<
      {
        bounds?: Bounds<K, ID>;
        cursor?: string;
        order?: "asc" | "desc";
        pageSize?: number;
      },
      Namespace
    >
  ): Promise<{ page: Item<K, ID>[]; cursor: string; isDone: boolean }>;
  async paginate(
    ctx: AnyReadCtx,
    ...opts: NamespacedOpts<
      {
        bounds?: Bounds<K, ID>;
        cursor?: string;
        order?: "asc" | "desc";
        pageSize?: number;
        stale?: boolean;
      },
      Namespace
    >
  ): Promise<{ page: Item<K, ID>[]; cursor: string; isDone: boolean }> {
    await this.flushBeforeRead(ctx);
    const order = opts[0]?.order ?? "asc";
    const pageSize = opts[0]?.pageSize ?? 100;
    const {
      page,
      cursor: newCursor,
      isDone,
    } = await runQuery(
      ctx,
      this.component.btree.paginate,
      {
        namespace: namespaceFromOpts(opts),
        ...boundsToPositions(opts[0]?.bounds),
        cursor: opts[0]?.cursor,
        order,
        limit: pageSize,
      },
      opts[0]?.stale,
    );
    return {
      page: page.map(btreeItemToAggregateItem<K, ID>),
      cursor: newCursor,
      isDone,
    };
  }
  /**
   * Example usage:
   * ```ts
   * for await (const item of aggregate.iter(ctx, bounds)) {
   *   console.log(item);
   * }
   * ```
   */
  iter(
    ctx: AnyReadCtx,
    ...opts: NamespacedReadOpts<
      { bounds?: Bounds<K, ID>; order?: "asc" | "desc"; pageSize?: number },
      Namespace
    >
  ): AsyncGenerator<Item<K, ID>, void, undefined>;
  iter(
    ctx: StaleReadCtx,
    ...opts: NamespacedStaleReadOpts<
      { bounds?: Bounds<K, ID>; order?: "asc" | "desc"; pageSize?: number },
      Namespace
    >
  ): AsyncGenerator<Item<K, ID>, void, undefined>;
  async *iter(
    ctx: AnyReadCtx,
    ...opts: NamespacedOpts<
      {
        bounds?: Bounds<K, ID>;
        order?: "asc" | "desc";
        pageSize?: number;
        stale?: boolean;
      },
      Namespace
    >
  ): AsyncGenerator<Item<K, ID>, void, undefined> {
    const order = opts[0]?.order ?? "asc";
    const pageSize = opts[0]?.pageSize ?? 100;
    const bounds = opts[0]?.bounds;
    const namespace = namespaceFromOpts(opts);
    const stale = opts[0]?.stale;
    let isDone = false;
    let cursor: string | undefined = undefined;
    while (!isDone) {
      const args = { namespace, bounds, cursor, order, pageSize } as {
        namespace: Namespace;
        bounds?: Bounds<K, ID>;
        cursor?: string;
        order: "asc" | "desc";
        pageSize: number;
      };
      const {
        page,
        cursor: newCursor,
        isDone: newIsDone,
      }: { page: Item<K, ID>[]; cursor: string; isDone: boolean } = stale
        ? await this.paginate(ctx as StaleReadCtx, {
            ...args,
            stale: true,
          })
        : await this.paginate(ctx, args);
      for (const item of page) {
        yield item;
      }
      isDone = newIsDone;
      cursor = newCursor;
    }
  }

  /** Write operations. See {@link DirectAggregate} for docstrings. */
  async _insert(
    ctx: MutationCtx | ActionCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    summand?: number,
    stale?: boolean,
  ): Promise<void> {
    const args = { key: keyToPosition(key, id), summand, value: id, namespace };
    const op = { type: "insert" as const, ...args };
    if (this.bufferOp(op, stale)) {
      return;
    }
    if (this.currentFlushPromise) {
      await this.currentFlushPromise;
    }
    if (stale) {
      await ctx.runMutation(this.component.public.enqueue, { operations: [op] });
    } else {
      await ctx.runMutation(this.component.public.insert, args);
    }
  }
  async _delete(
    ctx: MutationCtx | ActionCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    stale?: boolean,
  ): Promise<void> {
    const args = { key: keyToPosition(key, id), namespace };
    const op = { type: "delete" as const, ...args };
    if (this.bufferOp(op, stale)) {
      return;
    }
    if (this.currentFlushPromise) {
      await this.currentFlushPromise;
    }
    if (stale) {
      await ctx.runMutation(this.component.public.enqueue, { operations: [op] });
    } else {
      await ctx.runMutation(this.component.public.delete_, args);
    }
  }
  async _replace(
    ctx: MutationCtx | ActionCtx,
    currentNamespace: Namespace,
    currentKey: K,
    newNamespace: Namespace,
    newKey: K,
    id: ID,
    summand?: number,
    stale?: boolean,
  ): Promise<void> {
    const args = {
      currentKey: keyToPosition(currentKey, id),
      newKey: keyToPosition(newKey, id),
      summand,
      value: id,
      namespace: currentNamespace,
      newNamespace,
    };
    const op = { type: "replace" as const, ...args };
    if (this.bufferOp(op, stale)) {
      return;
    }
    if (this.currentFlushPromise) {
      await this.currentFlushPromise;
    }
    if (stale) {
      await ctx.runMutation(this.component.public.enqueue, { operations: [op] });
    } else {
      await ctx.runMutation(this.component.public.replace, args);
    }
  }
  async _insertIfDoesNotExist(
    ctx: MutationCtx | ActionCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    summand?: number,
    stale?: boolean,
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      namespace,
      key,
      namespace,
      key,
      id,
      summand,
      stale,
    );
  }
  async _deleteIfExists(
    ctx: MutationCtx | ActionCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    stale?: boolean,
  ): Promise<void> {
    const args = {
      key: keyToPosition(key, id),
      namespace,
    };
    const op = { type: "deleteIfExists" as const, ...args };
    if (this.bufferOp(op, stale)) {
      return;
    }
    if (this.currentFlushPromise) {
      await this.currentFlushPromise;
    }
    if (stale) {
      await ctx.runMutation(this.component.public.enqueue, { operations: [op] });
    } else {
      await ctx.runMutation(this.component.public.deleteIfExists, args);
    }
  }
  async _replaceOrInsert(
    ctx: MutationCtx | ActionCtx,
    currentNamespace: Namespace,
    currentKey: K,
    newNamespace: Namespace,
    newKey: K,
    id: ID,
    summand?: number,
    stale?: boolean,
  ): Promise<void> {
    const args = {
      currentKey: keyToPosition(currentKey, id),
      newKey: keyToPosition(newKey, id),
      value: id,
      summand,
      namespace: currentNamespace,
      newNamespace,
    };
    const op = { type: "replaceOrInsert" as const, ...args };
    if (this.bufferOp(op, stale)) {
      return;
    }
    if (this.currentFlushPromise) {
      await this.currentFlushPromise;
    }
    if (stale) {
      await ctx.runMutation(this.component.public.enqueue, { operations: [op] });
    } else {
      await ctx.runMutation(this.component.public.replaceOrInsert, args);
    }
  }

  /// Initialization and maintenance.

  /**
   * (re-)initialize the data structure, removing all items if it exists.
   *
   * Change the maxNodeSize if provided, otherwise keep it the same.
   *   maxNodeSize is how you tune the data structure's width and depth.
   *   Larger values can reduce write contention but increase read latency.
   *   Default is 16.
   * Set rootLazy = false to eagerly compute aggregates on the root node, which
   *   improves aggregation latency at the expense of making all writes contend
   *   with each other, so it's only recommended for read-heavy workloads.
   *   Default is true.
   */
  async clear(
    ctx: MutationCtx | ActionCtx,
    ...opts: NamespacedOpts<
      { maxNodeSize?: number; rootLazy?: boolean },
      Namespace
    >
  ): Promise<void> {
    await this.flushBeforeRead(ctx);
    await ctx.runMutation(this.component.public.clear, {
      maxNodeSize: opts[0]?.maxNodeSize,
      rootLazy: opts[0]?.rootLazy,
      namespace: namespaceFromOpts(opts),
    });
  }
  /**
   * If rootLazy is false (the default is true but it can be set to false by
   * `clear`), the aggregates data structure writes to a single root node on
   * every insert/delete/replace, which can cause contention.
   *
   * If your data structure has frequent writes, you can reduce contention by
   * calling makeRootLazy, which removes the frequent writes to the root node.
   * With a lazy root node, updates will only contend with other updates to the
   * same shard of the tree. The number of shards is determined by maxNodeSize,
   * so larger maxNodeSize can also help.
   */
  async makeRootLazy(
    ctx: MutationCtx | ActionCtx,
    namespace: Namespace,
  ): Promise<void> {
    await ctx.runMutation(this.component.public.makeRootLazy, { namespace });
  }

  paginateNamespaces(
    ctx: AnyReadCtx,
    cursor?: string,
    pageSize?: number,
    opts?: { stale?: false },
  ): Promise<{ page: Namespace[]; cursor: string; isDone: boolean }>;
  paginateNamespaces(
    ctx: StaleReadCtx,
    cursor: string | undefined,
    pageSize: number | undefined,
    opts: { stale: true },
  ): Promise<{ page: Namespace[]; cursor: string; isDone: boolean }>;
  async paginateNamespaces(
    ctx: AnyReadCtx,
    cursor?: string,
    pageSize: number = 100,
    opts?: { stale?: boolean },
  ): Promise<{ page: Namespace[]; cursor: string; isDone: boolean }> {
    await this.flushBeforeRead(ctx);
    const {
      page,
      cursor: newCursor,
      isDone,
    } = await runQuery(
      ctx,
      this.component.btree.paginateNamespaces,
      {
        cursor,
        limit: pageSize,
      },
      opts?.stale,
    );
    return {
      page: page as Namespace[],
      cursor: newCursor,
      isDone,
    };
  }

  iterNamespaces(
    ctx: AnyReadCtx,
    pageSize?: number,
    opts?: { stale?: false },
  ): AsyncGenerator<Namespace, void, undefined>;
  iterNamespaces(
    ctx: StaleReadCtx,
    pageSize: number | undefined,
    opts: { stale: true },
  ): AsyncGenerator<Namespace, void, undefined>;
  async *iterNamespaces(
    ctx: AnyReadCtx,
    pageSize: number = 100,
    opts?: { stale?: boolean },
  ): AsyncGenerator<Namespace, void, undefined> {
    let isDone = false;
    let cursor: string | undefined = undefined;
    while (!isDone) {
      const {
        page,
        cursor: newCursor,
        isDone: newIsDone,
      }: { page: Namespace[]; cursor: string; isDone: boolean } = opts?.stale
        ? await this.paginateNamespaces(
            ctx as StaleReadCtx,
            cursor,
            pageSize,
            { stale: true },
          )
        : await this.paginateNamespaces(ctx, cursor, pageSize);
      for (const item of page) {
        yield item ?? (undefined as Namespace);
      }
      isDone = newIsDone;
      cursor = newCursor;
    }
  }

  async clearAll(
    ctx: MutationCtx | ActionCtx,
    opts?: { maxNodeSize?: number; rootLazy?: boolean },
  ): Promise<void> {
    await this.flushBeforeRead(ctx);
    for await (const namespace of this.iterNamespaces(ctx)) {
      await this.clear(ctx, { ...opts, namespace });
    }
    // In case there are no namespaces, make sure we create at least one tree,
    // at namespace=undefined. This is where the default settings are stored.
    await this.clear(ctx, { ...opts, namespace: undefined as Namespace });
  }

  async makeAllRootsLazy(ctx: MutationCtx | ActionCtx): Promise<void> {
    for await (const namespace of this.iterNamespaces(ctx)) {
      await this.makeRootLazy(ctx, namespace);
    }
  }
}

export type DirectAggregateType<
  K extends Key,
  ID extends string,
  Namespace extends ConvexValue | undefined = undefined,
> = {
  Key: K;
  Id: ID;
  Namespace?: Namespace;
};
type AnyDirectAggregateType = DirectAggregateType<
  Key,
  string,
  ConvexValue | undefined
>;
type DirectAggregateNamespace<T extends AnyDirectAggregateType> =
  "Namespace" extends keyof T ? T["Namespace"] : undefined;

/**
 * A DirectAggregate is an Aggregate where you can insert, delete, and replace
 * items directly, and keys and IDs can be customized.
 *
 * Contrast with TableAggregate, which follows a table with Triggers and
 * computes keys and sumValues from the table's documents.
 */
export class DirectAggregate<
  T extends AnyDirectAggregateType,
> extends Aggregate<T["Key"], T["Id"], DirectAggregateNamespace<T>> {
  /**
   * Insert a new key into the data structure.
   * The id should be unique.
   * If not provided, the sumValue is assumed to be zero.
   * If the tree does not exist yet, it will be initialized with the default
   * maxNodeSize and lazyRoot=true.
   * If the [key, id] pair already exists, this will throw.
   */
  async insert(
    ctx: MutationCtx | ActionCtx,
    args: NamespacedArgs<
      { key: T["Key"]; id: T["Id"]; sumValue?: number; stale?: boolean },
      DirectAggregateNamespace<T>
    >,
  ): Promise<void> {
    await this._insert(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.sumValue,
      args.stale,
    );
  }
  /**
   * Delete the key with the given ID from the data structure.
   * Throws if the given key and ID do not exist.
   */
  async delete(
    ctx: MutationCtx | ActionCtx,
    args: NamespacedArgs<
      { key: T["Key"]; id: T["Id"]; stale?: boolean },
      DirectAggregateNamespace<T>
    >,
  ): Promise<void> {
    await this._delete(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.stale,
    );
  }
  /**
   * Update an existing item in the data structure.
   * This is effectively a delete followed by an insert, but it's performed
   * atomically so it's impossible to view the data structure with the key missing.
   */
  async replace(
    ctx: MutationCtx | ActionCtx,
    currentItem: NamespacedArgs<
      { key: T["Key"]; id: T["Id"] },
      DirectAggregateNamespace<T>
    >,
    newItem: NamespacedArgs<
      { key: T["Key"]; sumValue?: number; stale?: boolean },
      DirectAggregateNamespace<T>
    >,
  ): Promise<void> {
    await this._replace(
      ctx,
      namespaceFromArg(currentItem),
      currentItem.key,
      namespaceFromArg(newItem),
      newItem.key,
      currentItem.id,
      newItem.sumValue,
      newItem.stale,
    );
  }
  /**
   * Equivalents to `insert`, `delete`, and `replace` where the item may or may not exist.
   * This can be useful for live backfills:
   * 1. Update live writes to use these methods to write into the new Aggregate.
   * 2. Run a background backfill, paginating over existing data, calling `insertIfDoesNotExist` on each item.
   * 3. Once the backfill is complete, use `insert`, `delete`, and `replace` for live writes.
   * 4. Begin using the Aggregate read methods.
   */
  async insertIfDoesNotExist(
    ctx: MutationCtx | ActionCtx,
    args: NamespacedArgs<
      { key: T["Key"]; id: T["Id"]; sumValue?: number; stale?: boolean },
      DirectAggregateNamespace<T>
    >,
  ): Promise<void> {
    await this._insertIfDoesNotExist(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.sumValue,
      args.stale,
    );
  }
  async deleteIfExists(
    ctx: MutationCtx | ActionCtx,
    args: NamespacedArgs<
      { key: T["Key"]; id: T["Id"]; stale?: boolean },
      DirectAggregateNamespace<T>
    >,
  ): Promise<void> {
    await this._deleteIfExists(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.stale,
    );
  }
  async replaceOrInsert(
    ctx: MutationCtx | ActionCtx,
    currentItem: NamespacedArgs<
      { key: T["Key"]; id: T["Id"] },
      DirectAggregateNamespace<T>
    >,
    newItem: NamespacedArgs<
      { key: T["Key"]; sumValue?: number; stale?: boolean },
      DirectAggregateNamespace<T>
    >,
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      namespaceFromArg(currentItem),
      currentItem.key,
      namespaceFromArg(newItem),
      newItem.key,
      currentItem.id,
      newItem.sumValue,
      newItem.stale,
    );
  }
}

export type TableAggregateType<
  K extends Key,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
  Namespace extends ConvexValue | undefined = undefined,
> = {
  Key: K;
  DataModel: DataModel;
  TableName: TableName;
  Namespace?: Namespace;
};

type AnyTableAggregateType = TableAggregateType<
  Key,
  GenericDataModel,
  TableNamesInDataModel<GenericDataModel>,
  ConvexValue | undefined
>;
type TableAggregateNamespace<T extends AnyTableAggregateType> =
  "Namespace" extends keyof T ? T["Namespace"] : undefined;
type TableAggregateDocument<T extends AnyTableAggregateType> = DocumentByName<
  T["DataModel"],
  T["TableName"]
>;
type TableAggregateId<T extends AnyTableAggregateType> = GenericId<
  T["TableName"]
>;
type TableAggregateTrigger<Ctx, T extends AnyTableAggregateType> = Trigger<
  Ctx,
  T["DataModel"],
  T["TableName"]
>;

export class TableAggregate<T extends AnyTableAggregateType> extends Aggregate<
  T["Key"],
  GenericId<T["TableName"]>,
  TableAggregateNamespace<T>
> {
  constructor(
    component: ComponentApi,
    private options: {
      sortKey: (d: TableAggregateDocument<T>) => T["Key"];
      sumValue?: (d: TableAggregateDocument<T>) => number;
    } & (undefined extends TableAggregateNamespace<T>
      ? {
          namespace?: (
            d: TableAggregateDocument<T>,
          ) => TableAggregateNamespace<T>;
        }
      : {
          namespace: (
            d: TableAggregateDocument<T>,
          ) => TableAggregateNamespace<T>;
        }),
  ) {
    super(component);
  }

  async insert(
    ctx: MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: { stale?: boolean },
  ): Promise<void> {
    await this._insert(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      this.options.sumValue?.(doc),
      opts?.stale,
    );
  }
  async delete(
    ctx: MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: { stale?: boolean },
  ): Promise<void> {
    await this._delete(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      opts?.stale,
    );
  }
  async replace(
    ctx: MutationCtx | ActionCtx,
    oldDoc: TableAggregateDocument<T>,
    newDoc: TableAggregateDocument<T>,
    opts?: { stale?: boolean },
  ): Promise<void> {
    await this._replace(
      ctx,
      this.options.namespace?.(oldDoc),
      this.options.sortKey(oldDoc),
      this.options.namespace?.(newDoc),
      this.options.sortKey(newDoc),
      newDoc._id as TableAggregateId<T>,
      this.options.sumValue?.(newDoc),
      opts?.stale,
    );
  }
  async insertIfDoesNotExist(
    ctx: MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: { stale?: boolean },
  ): Promise<void> {
    await this._insertIfDoesNotExist(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      this.options.sumValue?.(doc),
      opts?.stale,
    );
  }
  async deleteIfExists(
    ctx: MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: { stale?: boolean },
  ): Promise<void> {
    await this._deleteIfExists(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      opts?.stale,
    );
  }
  async replaceOrInsert(
    ctx: MutationCtx | ActionCtx,
    oldDoc: TableAggregateDocument<T>,
    newDoc: TableAggregateDocument<T>,
    opts?: { stale?: boolean },
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      this.options.namespace?.(oldDoc),
      this.options.sortKey(oldDoc),
      this.options.namespace?.(newDoc),
      this.options.sortKey(newDoc),
      newDoc._id as TableAggregateId<T>,
      this.options.sumValue?.(newDoc),
      opts?.stale,
    );
  }
  /**
   * Returns the rank/offset/index of the given document, within the bounds.
   * This differs from `indexOf` in that it take the document rather than key.
   * Specifically, it returns the index of the first item with
   *
   * - key >= the given doc's key if `order` is "asc" (default)
   * - key <= the given doc's key if `order` is "desc"
   */
  async indexOfDoc(
    ctx: AnyReadCtx,
    doc: TableAggregateDocument<T>,
    opts?: {
      id?: TableAggregateId<T>;
      bounds?: Bounds<T["Key"], TableAggregateId<T>>;
      order?: "asc" | "desc";
    },
  ): Promise<number> {
    const key = this.options.sortKey(doc);
    return this.indexOf(ctx, key, {
      namespace: this.options.namespace?.(doc),
      ...opts,
    });
  }

  trigger<Ctx extends MutationCtx>(): TableAggregateTrigger<Ctx, T> {
    return async (ctx, change) => {
      if (change.operation === "insert") {
        await this.insert(ctx, change.newDoc);
      } else if (change.operation === "update") {
        await this.replace(ctx, change.oldDoc, change.newDoc);
      } else if (change.operation === "delete") {
        await this.delete(ctx, change.oldDoc);
      }
    };
  }

  idempotentTrigger<Ctx extends MutationCtx>(): TableAggregateTrigger<Ctx, T> {
    return async (ctx, change) => {
      if (change.operation === "insert") {
        await this.insertIfDoesNotExist(ctx, change.newDoc);
      } else if (change.operation === "update") {
        await this.replaceOrInsert(ctx, change.oldDoc, change.newDoc);
      } else if (change.operation === "delete") {
        await this.deleteIfExists(ctx, change.oldDoc);
      }
    };
  }
}

export type Trigger<
  Ctx,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = (ctx: Ctx, change: Change<DataModel, TableName>) => Promise<void>;

export type Change<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = {
  id: GenericId<TableName>;
} & (
  | {
      operation: "insert";
      oldDoc: null;
      newDoc: DocumentByName<DataModel, TableName>;
    }
  | {
      operation: "update";
      oldDoc: DocumentByName<DataModel, TableName>;
      newDoc: DocumentByName<DataModel, TableName>;
    }
  | {
      operation: "delete";
      oldDoc: DocumentByName<DataModel, TableName>;
      newDoc: null;
    }
);

export function btreeItemToAggregateItem<K extends Key, ID extends string>({
  k,
  s,
}: {
  k: unknown;
  s: number;
}): Item<K, ID> {
  const { key, id } = positionToKey(k as Position);
  return {
    key: key as K,
    id: id as ID,
    sumValue: s,
  };
}

export type NamespacedArgs<Args, Namespace> =
  | (Args & { namespace: Namespace })
  | (Namespace extends undefined ? Args : never);

export type NamespacedOpts<Opts, Namespace> =
  | [{ namespace: Namespace } & Opts]
  | (undefined extends Namespace ? [Opts?] : never);

export type NamespacedOptsBatch<Opts, Namespace> = Array<
  undefined extends Namespace ? Opts : { namespace: Namespace } & Opts
>;

// Read-method option helpers. The non-stale overload forbids `stale: true` (so it
// can't be paired with a plain query ctx), while the stale overload requires it.
export type NamespacedReadOpts<Opts, Namespace> = NamespacedOpts<
  Opts & { stale?: false },
  Namespace
>;
export type NamespacedStaleReadOpts<Opts, Namespace> = NamespacedOpts<
  Opts & { stale: true },
  Namespace
>;

function namespaceFromArg<Namespace>(
  args: { namespace: Namespace } | object,
): Namespace {
  if ("namespace" in args) {
    return args["namespace"]!;
  }
  return undefined as Namespace;
}
function namespaceFromOpts<Opts, Namespace>(
  opts: NamespacedOpts<Opts, Namespace>,
): Namespace {
  if (opts.length === 0) {
    // Only possible if Namespace extends undefined, so undefined is the only valid namespace.
    return undefined as Namespace;
  }
  const [{ namespace }] = opts as [{ namespace: Namespace }];
  return namespace;
}

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
import type { Operation as QueuedOperation } from "../component/schema.js";
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

export type QueryCtx = Pick<
  GenericQueryCtx<GenericDataModel>,
  "runQuery" | "meta"
>;
export type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "meta"
>;
export type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction" | "meta"
>;

// Helper function to run one of the component's queries.
async function runQuery<
  Query extends FunctionReference<"query", "internal" | "public">,
>(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  query: Query,
  args: FunctionArgs<Query>,
  stale?: boolean,
): Promise<FunctionReturnType<Query>> {
  if (stale && (await ctx.meta.getFunctionMetadata()).type === "mutation") {
    // Run stale reads with `useStaleSnapshot` in mutations to avoid OCC conflicts.
    return await (ctx as MutationCtx).runQuery(query, args, {
      useStaleSnapshot: true,
    });
  }
  // Actions and queries do not have a `useStaleSnapshot` option.
  return await ctx.runQuery(query, args);
}

export type Item<K extends Key, ID extends string> = {
  key: K;
  id: ID;
  sumValue: number;
};

export type { Key, Bound, Bounds };

/**
 * A single write in a batch passed to {@link DirectAggregate.enqueueBatch}.
 */
export type AggregateOperation<
  K extends Key,
  ID extends string,
  Namespace extends ConvexValue | undefined = undefined,
> =
  | ({ type: "insert" } & NamespacedArgs<
      { key: K; id: ID; sumValue?: number },
      Namespace
    >)
  | ({ type: "insertIfDoesNotExist" } & NamespacedArgs<
      { key: K; id: ID; sumValue?: number },
      Namespace
    >)
  | ({ type: "delete" } & NamespacedArgs<{ key: K; id: ID }, Namespace>)
  | ({ type: "deleteIfExists" } & NamespacedArgs<{ key: K; id: ID }, Namespace>)
  | {
      type: "replace";
      currentItem: NamespacedArgs<{ key: K; id: ID }, Namespace>;
      newItem: NamespacedArgs<{ key: K; sumValue?: number }, Namespace>;
    }
  | {
      type: "replaceOrInsert";
      currentItem: NamespacedArgs<{ key: K; id: ID }, Namespace>;
      newItem: NamespacedArgs<{ key: K; sumValue?: number }, Namespace>;
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
  constructor(protected component: ComponentApi) {}

  private async _enqueue(
    ctx: MutationCtx | ActionCtx,
    operation: QueuedOperation,
  ): Promise<void> {
    await ctx.runMutation(this.component.public.enqueue, { operation });
  }

  protected async _enqueueBatch(
    ctx: MutationCtx | ActionCtx,
    operations: QueuedOperation[],
  ): Promise<void> {
    if (operations.length === 0) {
      return;
    }
    await ctx.runMutation(this.component.public.enqueueBatch, { operations });
  }

  /// Aggregate queries.

  /**
   * Counts items between the given bounds.
   */
  async count(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; stale?: boolean },
      Namespace
    >
  ): Promise<number> {
    const { count } = await runQuery(
      ctx,
      this.component.btree.aggregateBetween,
      {
        ...boundsToPositions(opts[0]?.bounds),
        namespace: namespaceFromOpts(opts),
        stale: opts[0]?.stale,
      },
      opts[0]?.stale,
    );
    return count;
  }

  /**
   * Batch version of count() - counts items for multiple bounds in a single call.
   */
  async countBatch(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, Namespace>,
    opts?: { stale?: boolean },
  ): Promise<number[]> {
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
        stale: opts?.stale,
      },
      opts?.stale,
    );
    return results.map((result: { count: number }) => result.count);
  }

  /**
   * Adds up the sumValue of items between the given bounds.
   */
  async sum(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; stale?: boolean },
      Namespace
    >
  ): Promise<number> {
    const { sum } = await runQuery(
      ctx,
      this.component.btree.aggregateBetween,
      {
        ...boundsToPositions(opts[0]?.bounds),
        namespace: namespaceFromOpts(opts),
        stale: opts[0]?.stale,
      },
      opts[0]?.stale,
    );
    return sum;
  }

  /**
   * Batch version of sum() - sums items for multiple bounds in a single call.
   */
  async sumBatch(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, Namespace>,
    opts?: { stale?: boolean },
  ): Promise<number[]> {
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
        stale: opts?.stale,
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
  async at(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    offset: number,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; stale?: boolean },
      Namespace
    >
  ): Promise<Item<K, ID>> {
    if (offset < 0) {
      const item = await runQuery(
        ctx,
        this.component.btree.atNegativeOffset,
        {
          offset: -offset - 1,
          namespace: namespaceFromOpts(opts),
          ...boundsToPositions(opts[0]?.bounds),
          stale: opts[0]?.stale,
        },
        opts[0]?.stale,
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
        stale: opts[0]?.stale,
      },
      opts[0]?.stale,
    );
    return btreeItemToAggregateItem(item);
  }
  /**
   * Batch version of at() - returns items at multiple offsets in a single call.
   */
  async atBatch(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    queries: NamespacedOptsBatch<
      { offset: number; bounds?: Bounds<K, ID> },
      Namespace
    >,
    opts?: { stale?: boolean },
  ): Promise<Item<K, ID>[]> {
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
        stale: opts?.stale,
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
  async indexOf(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    key: K,
    ...opts: NamespacedOpts<
      {
        id?: ID;
        bounds?: Bounds<K, ID>;
        order?: "asc" | "desc";
        stale?: boolean;
      },
      Namespace
    >
  ): Promise<number> {
    const { k1, k2 } = boundsToPositions(opts[0]?.bounds);
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
          stale: opts[0]?.stale,
        },
        opts[0]?.stale,
      );
    }
    return await runQuery(
      ctx,
      this.component.btree.offset,
      {
        key: boundToPosition("lower", {
          key,
          id: opts[0]?.id,
          inclusive: true,
        }),
        k1,
        namespace: namespaceFromOpts(opts),
        stale: opts[0]?.stale,
      },
      opts[0]?.stale,
    );
  }
  /**
   * @deprecated Use `indexOf` instead.
   */
  async offsetOf(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    key: K,
    namespace: Namespace,
    id?: ID,
    bounds?: Bounds<K, ID>,
    stale?: boolean,
  ): Promise<number> {
    return this.indexOf(ctx, key, {
      id,
      bounds,
      order: "asc",
      namespace,
      stale,
    });
  }
  /**
   * @deprecated Use `indexOf` instead.
   */
  async offsetUntil(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    key: K,
    namespace: Namespace,
    id?: ID,
    bounds?: Bounds<K, ID>,
    stale?: boolean,
  ): Promise<number> {
    return this.indexOf(ctx, key, {
      id,
      bounds,
      order: "desc",
      namespace,
      stale,
    });
  }

  /**
   * Gets the minimum item within the given bounds.
   */
  async min(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; stale?: boolean },
      Namespace
    >
  ): Promise<Item<K, ID> | null> {
    const { page } = await this.paginate(ctx, {
      namespace: namespaceFromOpts(opts),
      bounds: opts[0]?.bounds,
      order: "asc",
      pageSize: 1,
      stale: opts[0]?.stale,
    });
    return page[0] ?? null;
  }
  /**
   * Gets the maximum item within the given bounds.
   */
  async max(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; stale?: boolean },
      Namespace
    >
  ): Promise<Item<K, ID> | null> {
    const { page } = await this.paginate(ctx, {
      namespace: namespaceFromOpts(opts),
      bounds: opts[0]?.bounds,
      order: "desc",
      pageSize: 1,
      stale: opts[0]?.stale,
    });
    return page[0] ?? null;
  }
  /**
   * Gets a uniformly random item within the given bounds.
   */
  async random(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; stale?: boolean },
      Namespace
    >
  ): Promise<Item<K, ID> | null> {
    const count = await this.count(ctx, ...opts);
    if (count === 0) {
      return null;
    }
    const index = Math.floor(Math.random() * count);
    return await this.at(ctx, index, ...opts);
  }
  /**
   * Get a page of items between the given bounds, with a cursor to paginate.
   * Use `iter` to iterate over all items within the bounds.
   */
  async paginate(
    ctx: QueryCtx | MutationCtx | ActionCtx,
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
        stale: opts[0]?.stale,
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
  async *iter(
    ctx: QueryCtx | MutationCtx | ActionCtx,
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
    const stale = opts[0]?.stale;
    const namespace = namespaceFromOpts(opts);
    let isDone = false;
    let cursor: string | undefined = undefined;
    while (!isDone) {
      const {
        page,
        cursor: newCursor,
        isDone: newIsDone,
      } = await this.paginate(ctx, {
        namespace,
        bounds,
        cursor,
        order,
        pageSize,
        stale,
      });
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
    opts?: { async?: boolean },
  ): Promise<void> {
    const position = keyToPosition(key, id);
    if (opts?.async) {
      await this._enqueue(ctx, {
        type: "insert",
        key: position,
        value: id,
        summand,
        namespace,
      });
      return;
    }
    await ctx.runMutation(this.component.public.insert, {
      key: position,
      summand,
      value: id,
      namespace,
    });
  }
  async _delete(
    ctx: MutationCtx | ActionCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    opts?: { async?: boolean },
  ): Promise<void> {
    const position = keyToPosition(key, id);
    if (opts?.async) {
      await this._enqueue(ctx, { type: "delete", key: position, namespace });
      return;
    }
    await ctx.runMutation(this.component.public.delete_, {
      key: position,
      namespace,
    });
  }
  async _replace(
    ctx: MutationCtx | ActionCtx,
    currentNamespace: Namespace,
    currentKey: K,
    newNamespace: Namespace,
    newKey: K,
    id: ID,
    summand?: number,
    opts?: { async?: boolean },
  ): Promise<void> {
    const currentPosition = keyToPosition(currentKey, id);
    const newPosition = keyToPosition(newKey, id);
    if (opts?.async) {
      await this._enqueue(ctx, {
        type: "replace",
        currentKey: currentPosition,
        newKey: newPosition,
        value: id,
        summand,
        namespace: currentNamespace,
        newNamespace,
      });
      return;
    }
    await ctx.runMutation(this.component.public.replace, {
      currentKey: currentPosition,
      newKey: newPosition,
      summand,
      value: id,
      namespace: currentNamespace,
      newNamespace,
    });
  }
  async _insertIfDoesNotExist(
    ctx: MutationCtx | ActionCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    summand?: number,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      namespace,
      key,
      namespace,
      key,
      id,
      summand,
      opts,
    );
  }
  async _deleteIfExists(
    ctx: MutationCtx | ActionCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    opts?: { async?: boolean },
  ): Promise<void> {
    const position = keyToPosition(key, id);
    if (opts?.async) {
      await this._enqueue(ctx, {
        type: "deleteIfExists",
        key: position,
        namespace,
      });
      return;
    }
    await ctx.runMutation(this.component.public.deleteIfExists, {
      key: position,
      namespace,
    });
  }
  async _replaceOrInsert(
    ctx: MutationCtx | ActionCtx,
    currentNamespace: Namespace,
    currentKey: K,
    newNamespace: Namespace,
    newKey: K,
    id: ID,
    summand?: number,
    opts?: { async?: boolean },
  ): Promise<void> {
    const currentPosition = keyToPosition(currentKey, id);
    const newPosition = keyToPosition(newKey, id);
    if (opts?.async) {
      await this._enqueue(ctx, {
        type: "replaceOrInsert",
        currentKey: currentPosition,
        newKey: newPosition,
        value: id,
        summand,
        namespace: currentNamespace,
        newNamespace,
      });
      return;
    }
    await ctx.runMutation(this.component.public.replaceOrInsert, {
      currentKey: currentPosition,
      newKey: newPosition,
      summand,
      value: id,
      namespace: currentNamespace,
      newNamespace,
    });
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

  async paginateNamespaces(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    cursor?: string,
    pageSize: number = 100,
    stale?: boolean,
  ): Promise<{ page: Namespace[]; cursor: string; isDone: boolean }> {
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
        stale,
      },
      stale,
    );
    return {
      page: page as Namespace[],
      cursor: newCursor,
      isDone,
    };
  }

  async *iterNamespaces(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    pageSize: number = 100,
    stale?: boolean,
  ): AsyncGenerator<Namespace, void, undefined> {
    let isDone = false;
    let cursor: string | undefined = undefined;
    while (!isDone) {
      const {
        page,
        cursor: newCursor,
        isDone: newIsDone,
      } = await this.paginateNamespaces(ctx, cursor, pageSize, stale);
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
   * Enqueue a batch of writes, to be applied asynchronously by the batch
   * worker.
   *
   * Equivalent to calling the individual write methods with `{ async: true }`,
   * except that the whole batch is sent to the component in a single call.
   * The operations are applied in the order they are given.
   */
  async enqueueBatch(
    ctx: MutationCtx | ActionCtx,
    operations: AggregateOperation<
      T["Key"],
      T["Id"],
      DirectAggregateNamespace<T>
    >[],
  ): Promise<void> {
    await this._enqueueBatch(
      ctx,
      operations.map(aggregateOperationToQueuedOperation),
    );
  }

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
      { key: T["Key"]; id: T["Id"]; sumValue?: number },
      DirectAggregateNamespace<T>
    >,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._insert(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.sumValue,
      opts,
    );
  }
  /**
   * Delete the key with the given ID from the data structure.
   * Throws if the given key and ID do not exist.
   */
  async delete(
    ctx: MutationCtx | ActionCtx,
    args: NamespacedArgs<
      { key: T["Key"]; id: T["Id"] },
      DirectAggregateNamespace<T>
    >,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._delete(ctx, namespaceFromArg(args), args.key, args.id, opts);
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
      { key: T["Key"]; sumValue?: number },
      DirectAggregateNamespace<T>
    >,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._replace(
      ctx,
      namespaceFromArg(currentItem),
      currentItem.key,
      namespaceFromArg(newItem),
      newItem.key,
      currentItem.id,
      newItem.sumValue,
      opts,
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
      { key: T["Key"]; id: T["Id"]; sumValue?: number },
      DirectAggregateNamespace<T>
    >,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._insertIfDoesNotExist(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.sumValue,
      opts,
    );
  }
  async deleteIfExists(
    ctx: MutationCtx | ActionCtx,
    args: NamespacedArgs<
      { key: T["Key"]; id: T["Id"] },
      DirectAggregateNamespace<T>
    >,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._deleteIfExists(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      opts,
    );
  }
  async replaceOrInsert(
    ctx: MutationCtx | ActionCtx,
    currentItem: NamespacedArgs<
      { key: T["Key"]; id: T["Id"] },
      DirectAggregateNamespace<T>
    >,
    newItem: NamespacedArgs<
      { key: T["Key"]; sumValue?: number },
      DirectAggregateNamespace<T>
    >,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      namespaceFromArg(currentItem),
      currentItem.key,
      namespaceFromArg(newItem),
      newItem.key,
      currentItem.id,
      newItem.sumValue,
      opts,
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

/**
 * A single write in a batch passed to {@link TableAggregate.enqueueBatch}.
 */
export type TableAggregateOperation<T extends AnyTableAggregateType> =
  | { type: "insert"; doc: TableAggregateDocument<T> }
  | { type: "insertIfDoesNotExist"; doc: TableAggregateDocument<T> }
  | { type: "delete"; doc: TableAggregateDocument<T> }
  | { type: "deleteIfExists"; doc: TableAggregateDocument<T> }
  | {
      type: "replace";
      oldDoc: TableAggregateDocument<T>;
      newDoc: TableAggregateDocument<T>;
    }
  | {
      type: "replaceOrInsert";
      oldDoc: TableAggregateDocument<T>;
      newDoc: TableAggregateDocument<T>;
    };

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

  /**
   * Enqueue a batch of writes, to be applied asynchronously by the batch
   * worker.
   *
   * Equivalent to calling the individual write methods with `{ async: true }`,
   * except that the whole batch is sent to the component in a single call.
   * The operations are applied in the order they are given.
   */
  async enqueueBatch(
    ctx: MutationCtx | ActionCtx,
    operations: TableAggregateOperation<T>[],
  ): Promise<void> {
    await this._enqueueBatch(
      ctx,
      operations.map((operation) => this.toQueuedOperation(operation)),
    );
  }

  private toQueuedOperation(
    operation: TableAggregateOperation<T>,
  ): QueuedOperation {
    switch (operation.type) {
      case "insert":
      case "insertIfDoesNotExist":
      case "delete":
      case "deleteIfExists": {
        const { doc } = operation;
        return aggregateOperationToQueuedOperation({
          type: operation.type,
          key: this.options.sortKey(doc),
          id: doc._id as TableAggregateId<T>,
          sumValue: this.options.sumValue?.(doc),
          namespace: this.options.namespace?.(
            doc,
          ) as TableAggregateNamespace<T>,
        });
      }
      case "replace":
      case "replaceOrInsert": {
        const { oldDoc, newDoc } = operation;
        return aggregateOperationToQueuedOperation({
          type: operation.type,
          currentItem: {
            key: this.options.sortKey(oldDoc),
            id: newDoc._id as TableAggregateId<T>,
            namespace: this.options.namespace?.(
              oldDoc,
            ) as TableAggregateNamespace<T>,
          },
          newItem: {
            key: this.options.sortKey(newDoc),
            sumValue: this.options.sumValue?.(newDoc),
            namespace: this.options.namespace?.(
              newDoc,
            ) as TableAggregateNamespace<T>,
          },
        });
      }
      default:
        operation satisfies never;
        throw new Error(
          `Unknown operation type: ${(operation as { type: string }).type}`,
        );
    }
  }

  async insert(
    ctx: MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._insert(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      this.options.sumValue?.(doc),
      opts,
    );
  }
  async delete(
    ctx: MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._delete(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      opts,
    );
  }
  async replace(
    ctx: MutationCtx | ActionCtx,
    oldDoc: TableAggregateDocument<T>,
    newDoc: TableAggregateDocument<T>,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._replace(
      ctx,
      this.options.namespace?.(oldDoc),
      this.options.sortKey(oldDoc),
      this.options.namespace?.(newDoc),
      this.options.sortKey(newDoc),
      newDoc._id as TableAggregateId<T>,
      this.options.sumValue?.(newDoc),
      opts,
    );
  }
  async insertIfDoesNotExist(
    ctx: MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._insertIfDoesNotExist(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      this.options.sumValue?.(doc),
      opts,
    );
  }
  async deleteIfExists(
    ctx: MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._deleteIfExists(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      opts,
    );
  }
  async replaceOrInsert(
    ctx: MutationCtx | ActionCtx,
    oldDoc: TableAggregateDocument<T>,
    newDoc: TableAggregateDocument<T>,
    opts?: { async?: boolean },
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      this.options.namespace?.(oldDoc),
      this.options.sortKey(oldDoc),
      this.options.namespace?.(newDoc),
      this.options.sortKey(newDoc),
      newDoc._id as TableAggregateId<T>,
      this.options.sumValue?.(newDoc),
      opts,
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
    ctx: QueryCtx | MutationCtx | ActionCtx,
    doc: TableAggregateDocument<T>,
    opts?: {
      id?: TableAggregateId<T>;
      bounds?: Bounds<T["Key"], TableAggregateId<T>>;
      order?: "asc" | "desc";
      stale?: boolean;
    },
  ): Promise<number> {
    const key = this.options.sortKey(doc);
    return this.indexOf(ctx, key, {
      namespace: this.options.namespace?.(doc),
      ...opts,
    });
  }

  trigger<Ctx extends MutationCtx>(opts?: {
    async?: boolean;
  }): TableAggregateTrigger<Ctx, T> {
    return async (ctx, change) => {
      if (change.operation === "insert") {
        await this.insert(ctx, change.newDoc, opts);
      } else if (change.operation === "update") {
        await this.replace(ctx, change.oldDoc, change.newDoc, opts);
      } else if (change.operation === "delete") {
        await this.delete(ctx, change.oldDoc, opts);
      }
    };
  }

  idempotentTrigger<Ctx extends MutationCtx>(opts?: {
    async?: boolean;
  }): TableAggregateTrigger<Ctx, T> {
    return async (ctx, change) => {
      if (change.operation === "insert") {
        await this.insertIfDoesNotExist(ctx, change.newDoc, opts);
      } else if (change.operation === "update") {
        await this.replaceOrInsert(ctx, change.oldDoc, change.newDoc, opts);
      } else if (change.operation === "delete") {
        await this.deleteIfExists(ctx, change.oldDoc, opts);
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

function aggregateOperationToQueuedOperation<
  K extends Key,
  ID extends string,
  Namespace extends ConvexValue | undefined,
>(operation: AggregateOperation<K, ID, Namespace>): QueuedOperation {
  switch (operation.type) {
    case "insert":
      return {
        type: "insert",
        key: keyToPosition(operation.key, operation.id),
        value: operation.id,
        summand: operation.sumValue,
        namespace: namespaceFromArg<Namespace>(operation),
      };
    case "delete":
      return {
        type: "delete",
        key: keyToPosition(operation.key, operation.id),
        namespace: namespaceFromArg<Namespace>(operation),
      };
    case "deleteIfExists":
      return {
        type: "deleteIfExists",
        key: keyToPosition(operation.key, operation.id),
        namespace: namespaceFromArg<Namespace>(operation),
      };
    case "insertIfDoesNotExist": {
      const position = keyToPosition(operation.key, operation.id);
      const namespace = namespaceFromArg<Namespace>(operation);
      return {
        type: "replaceOrInsert",
        currentKey: position,
        newKey: position,
        value: operation.id,
        summand: operation.sumValue,
        namespace,
        newNamespace: namespace,
      };
    }
    case "replace":
    case "replaceOrInsert": {
      const { currentItem, newItem } = operation;
      return {
        type: operation.type,
        currentKey: keyToPosition(currentItem.key, currentItem.id),
        newKey: keyToPosition(newItem.key, currentItem.id),
        value: currentItem.id,
        summand: newItem.sumValue,
        namespace: namespaceFromArg<Namespace>(currentItem),
        newNamespace: namespaceFromArg<Namespace>(newItem),
      };
    }
    default:
      operation satisfies never;
      throw new Error(
        `Unknown operation type: ${(operation as { type: string }).type}`,
      );
  }
}

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

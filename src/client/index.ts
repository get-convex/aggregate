import {
  DocumentByName,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  TableNamesInDataModel,
} from "convex/server";
import { Key } from "../component/btree.js";
import { api } from "../component/_generated/api.js";
import { UseApi } from "./useApi.js";
import {
  Position,
  positionToKey,
  boundToPosition,
  keyToPosition,
  Bound,
  Bounds,
  boundsToPositions,
} from "./positions.js";
import { GenericId, Value as ConvexValue } from "convex/values";

export type UsedAPI = UseApi<typeof api>;

// e.g. `ctx` from a Convex query or mutation or action.
export type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

// e.g. `ctx` from a Convex mutation or action.
export type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

export type Item<K extends Key, ID extends string> = {
  key: K;
  id: ID;
  sumValue: number;
};

export type { Key, Bound };

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
  constructor(protected component: UsedAPI) {}

  /// Aggregate queries.

  /**
   * Counts items between the given bounds.
   */
  async count(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds: Bounds<K, ID> }, Namespace>
  ): Promise<number> {
    const { count } = await ctx.runQuery(
      this.component.btree.aggregateBetween,
      {
        ...boundsToPositions(opts[0]?.bounds),
        namespace: namespaceFromOpts(opts),
      }
    );
    return count;
  }
  /**
   * Adds up the sumValue of items between the given bounds.
   */
  async sum(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds: Bounds<K, ID> }, Namespace>
  ): Promise<number> {
    const { sum } = await ctx.runQuery(this.component.btree.aggregateBetween, {
      ...boundsToPositions(opts[0]?.bounds),
      namespace: namespaceFromOpts(opts),
    });
    return sum;
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
    ctx: RunQueryCtx,
    offset: number,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID>> {
    if (offset < 0) {
      const item = await ctx.runQuery(this.component.btree.atNegativeOffset, {
        offset: -offset - 1,
        namespace: namespaceFromOpts(opts),
        ...boundsToPositions(opts[0]?.bounds),
      });
      return btreeItemToAggregateItem(item);
    }
    const item = await ctx.runQuery(this.component.btree.atOffset, {
      offset,
      namespace: namespaceFromOpts(opts),
      ...boundsToPositions(opts[0]?.bounds),
    });
    return btreeItemToAggregateItem(item);
  }
  /**
   * Returns the rank/offset/index of the given key, within the bounds.
   * Specifically, it returns the index of the first item with
   *
   * - key >= the given key if `order` is "asc" (default)
   * - key <= the given key if `order` is "desc"
   */
  async indexOf(
    ctx: RunQueryCtx,
    key: K,
    ...opts: NamespacedOpts<
      { id?: ID; bounds?: Bounds<K, ID>; order?: "asc" | "desc" },
      Namespace
    >
  ): Promise<number> {
    const { k1, k2 } = boundsToPositions(opts[0]?.bounds);
    if (opts[0]?.order === "desc") {
      return await ctx.runQuery(this.component.btree.offsetUntil, {
        key: boundToPosition("upper", {
          key,
          id: opts[0]?.id,
          inclusive: true,
        }),
        k2,
        namespace: namespaceFromOpts(opts),
      });
    }
    return await ctx.runQuery(this.component.btree.offset, {
      key: boundToPosition("lower", { key, id: opts[0]?.id, inclusive: true }),
      k1,
      namespace: namespaceFromOpts(opts),
    });
  }
  /**
   * @deprecated Use `indexOf` instead.
   */
  async offsetOf(
    ctx: RunQueryCtx,
    key: K,
    namespace: Namespace,
    id?: ID,
    bounds?: Bounds<K, ID>
  ): Promise<number> {
    return this.indexOf(ctx, key, { id, bounds, order: "asc", namespace });
  }
  /**
   * @deprecated Use `indexOf` instead.
   */
  async offsetUntil(
    ctx: RunQueryCtx,
    key: K,
    namespace: Namespace,
    id?: ID,
    bounds?: Bounds<K, ID>
  ): Promise<number> {
    return this.indexOf(ctx, key, { id, bounds, order: "desc", namespace });
  }

  /**
   * Gets the minimum item within the given bounds.
   */
  async min(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID> | null> {
    const { page } = await this.paginate(ctx, {
      namespace: namespaceFromOpts(opts),
      bounds: opts[0]?.bounds,
      order: "asc",
      pageSize: 1,
    });
    return page[0] ?? null;
  }
  /**
   * Gets the maximum item within the given bounds.
   */
  async max(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds: Bounds<K, ID> }, Namespace>
  ): Promise<Item<K, ID> | null> {
    const { page } = await this.paginate(ctx, {
      namespace: namespaceFromOpts(opts),
      bounds: opts[0]?.bounds,
      order: "desc",
      pageSize: 1,
    });
    return page[0] ?? null;
  }
  /**
   * Gets a uniformly random item within the given bounds.
   */
  async random(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds: Bounds<K, ID> }, Namespace>
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
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<
      {
        bounds?: Bounds<K, ID>;
        cursor?: string;
        order?: "asc" | "desc";
        pageSize?: number;
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
    } = await ctx.runQuery(this.component.btree.paginate, {
      namespace: namespaceFromOpts(opts),
      ...boundsToPositions(opts[0]?.bounds),
      cursor: opts[0]?.cursor,
      order,
      limit: pageSize,
    });
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
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; order?: "asc" | "desc"; pageSize?: number },
      Namespace
    >
  ): AsyncGenerator<Item<K, ID>, void, undefined> {
    const order = opts[0]?.order ?? "asc";
    const pageSize = opts[0]?.pageSize ?? 100;
    const bounds = opts[0]?.bounds;
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
    ctx: RunMutationCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    summand?: number
  ): Promise<void> {
    await ctx.runMutation(this.component.public.insert, {
      key: keyToPosition(key, id),
      summand,
      value: id,
      namespace,
    });
  }
  async _delete(
    ctx: RunMutationCtx,
    namespace: Namespace,
    key: K,
    id: ID
  ): Promise<void> {
    await ctx.runMutation(this.component.public.delete_, {
      key: keyToPosition(key, id),
      namespace,
    });
  }
  async _replace(
    ctx: RunMutationCtx,
    currentNamespace: Namespace,
    currentKey: K,
    newNamespace: Namespace,
    newKey: K,
    id: ID,
    summand?: number
  ): Promise<void> {
    await ctx.runMutation(this.component.public.replace, {
      currentKey: keyToPosition(currentKey, id),
      newKey: keyToPosition(newKey, id),
      summand,
      value: id,
      namespace: currentNamespace,
      newNamespace,
    });
  }
  async _insertIfDoesNotExist(
    ctx: RunMutationCtx,
    namespace: Namespace,
    key: K,
    id: ID,
    summand?: number
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      namespace,
      key,
      namespace,
      key,
      id,
      summand
    );
  }
  async _deleteIfExists(
    ctx: RunMutationCtx,
    namespace: Namespace,
    key: K,
    id: ID
  ): Promise<void> {
    await ctx.runMutation(this.component.public.deleteIfExists, {
      key: keyToPosition(key, id),
      namespace,
    });
  }
  async _replaceOrInsert(
    ctx: RunMutationCtx,
    currentNamespace: Namespace,
    currentKey: K,
    newNamespace: Namespace,
    newKey: K,
    id: ID,
    summand?: number
  ): Promise<void> {
    await ctx.runMutation(this.component.public.replaceOrInsert, {
      currentKey: keyToPosition(currentKey, id),
      newKey: keyToPosition(newKey, id),
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
    ctx: RunMutationCtx,
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
  async makeRootLazy(ctx: RunMutationCtx, namespace: Namespace): Promise<void> {
    await ctx.runMutation(this.component.public.makeRootLazy, { namespace });
  }

  async paginateNamespaces(
    ctx: RunQueryCtx,
    cursor?: string,
    pageSize: number = 100
  ): Promise<{ page: Namespace[]; cursor: string; isDone: boolean }> {
    const {
      page,
      cursor: newCursor,
      isDone,
    } = await ctx.runQuery(this.component.btree.paginateNamespaces, {
      cursor,
      limit: pageSize,
    });
    return {
      page: page as Namespace[],
      cursor: newCursor,
      isDone,
    };
  }

  async *iterNamespaces(
    ctx: RunQueryCtx,
    pageSize: number = 100
  ): AsyncGenerator<Namespace, void, undefined> {
    let isDone = false;
    let cursor: string | undefined = undefined;
    while (!isDone) {
      const {
        page,
        cursor: newCursor,
        isDone: newIsDone,
      } = await this.paginateNamespaces(ctx, cursor, pageSize);
      for (const item of page) {
        yield item;
      }
      isDone = newIsDone;
      cursor = newCursor;
    }
  }

  async clearAll(
    ctx: RunMutationCtx & RunQueryCtx,
    opts?: { maxNodeSize?: number; rootLazy?: boolean }
  ): Promise<void> {
    for await (const namespace of this.iterNamespaces(ctx)) {
      await this.clear(ctx, { ...opts, namespace });
    }
    // In case there are no namespaces, make sure we create at least one tree,
    // at namespace=undefined. This is where the default settings are stored.
    await this.clear(ctx, { ...opts, namespace: undefined as Namespace });
  }

  async makeAllRootsLazy(ctx: RunMutationCtx & RunQueryCtx): Promise<void> {
    for await (const namespace of this.iterNamespaces(ctx)) {
      await this.makeRootLazy(ctx, namespace);
    }
  }
}

export type DirectAggregateType<
  K extends Key,
  ID extends string,
  Namespace extends ConvexValue | undefined,
> = {
  Key: K;
  Id: ID;
  Namespace: Namespace;
};
type AnyDirectAggregateType = DirectAggregateType<
  Key,
  string,
  ConvexValue | undefined
>;

/**
 * A DirectAggregate is an Aggregate where you can insert, delete, and replace
 * items directly, and keys and IDs can be customized.
 *
 * Contrast with TableAggregate, which follows a table with Triggers and
 * computes keys and sumValues from the table's documents.
 */
export class DirectAggregate<
  T extends AnyDirectAggregateType,
> extends Aggregate<T["Key"], T["Id"], T["Namespace"]> {
  /**
   * Insert a new key into the data structure.
   * The id should be unique.
   * If not provided, the sumValue is assumed to be zero.
   * If the tree does not exist yet, it will be initialized with the default
   * maxNodeSize and lazyRoot=true.
   * If the [key, id] pair already exists, this will throw.
   */
  async insert(
    ctx: RunMutationCtx,
    args: NamespacedArgs<
      { key: T["Key"]; id: T["Id"]; sumValue?: number },
      T["Namespace"]
    >
  ): Promise<void> {
    await this._insert(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.sumValue
    );
  }
  /**
   * Delete the key with the given ID from the data structure.
   * Throws if the given key and ID do not exist.
   */
  async delete(
    ctx: RunMutationCtx,
    args: NamespacedArgs<{ key: T["Key"]; id: T["Id"] }, T["Namespace"]>
  ): Promise<void> {
    await this._delete(ctx, namespaceFromArg(args), args.key, args.id);
  }
  /**
   * Update an existing item in the data structure.
   * This is effectively a delete followed by an insert, but it's performed
   * atomically so it's impossible to view the data structure with the key missing.
   */
  async replace(
    ctx: RunMutationCtx,
    currentItem: NamespacedArgs<{ key: T["Key"]; id: T["Id"] }, T["Namespace"]>,
    newItem: NamespacedArgs<
      { key: T["Key"]; sumValue?: number },
      T["Namespace"]
    >
  ): Promise<void> {
    await this._replace(
      ctx,
      namespaceFromArg(currentItem),
      currentItem.key,
      namespaceFromArg(newItem),
      newItem.key,
      currentItem.id,
      newItem.sumValue
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
    ctx: RunMutationCtx,
    args: NamespacedArgs<
      { key: T["Key"]; id: T["Id"]; sumValue?: number },
      T["Namespace"]
    >
  ): Promise<void> {
    await this._insertIfDoesNotExist(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.sumValue
    );
  }
  async deleteIfExists(
    ctx: RunMutationCtx,
    args: NamespacedArgs<{ key: T["Key"]; id: T["Id"] }, T["Namespace"]>
  ): Promise<void> {
    await this._deleteIfExists(ctx, namespaceFromArg(args), args.key, args.id);
  }
  async replaceOrInsert(
    ctx: RunMutationCtx,
    currentItem: NamespacedArgs<{ key: T["Key"]; id: T["Id"] }, T["Namespace"]>,
    newItem: NamespacedArgs<
      { key: T["Key"]; sumValue?: number },
      T["Namespace"]
    >
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      namespaceFromArg(currentItem),
      currentItem.key,
      namespaceFromArg(newItem),
      newItem.key,
      currentItem.id,
      newItem.sumValue
    );
  }
}

export type TableAggregateType<
  K extends Key,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
  Namespace extends ConvexValue | undefined,
> = {
  Key: K;
  DataModel: DataModel;
  TableName: TableName;
  Namespace: Namespace;
};
type AnyTableAggregateType = TableAggregateType<
  Key,
  GenericDataModel,
  TableNamesInDataModel<GenericDataModel>,
  ConvexValue | undefined
>;
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
  T["Namespace"]
> {
  constructor(
    component: UsedAPI,
    private options: {
      namespace: (d: TableAggregateDocument<T>) => T["Namespace"];
      sortKey: (d: TableAggregateDocument<T>) => T["Key"];
      sumValue?: (d: TableAggregateDocument<T>) => number;
    }
  ) {
    super(component);
  }

  async insert(
    ctx: RunMutationCtx,
    doc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._insert(
      ctx,
      this.options.namespace(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      this.options.sumValue?.(doc)
    );
  }
  async delete(
    ctx: RunMutationCtx,
    doc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._delete(
      ctx,
      this.options.namespace(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>
    );
  }
  async replace(
    ctx: RunMutationCtx,
    oldDoc: TableAggregateDocument<T>,
    newDoc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._replace(
      ctx,
      this.options.namespace(oldDoc),
      this.options.sortKey(oldDoc),
      this.options.namespace(newDoc),
      this.options.sortKey(newDoc),
      newDoc._id as TableAggregateId<T>,
      this.options.sumValue?.(newDoc)
    );
  }
  async insertIfDoesNotExist(
    ctx: RunMutationCtx,
    doc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._insertIfDoesNotExist(
      ctx,
      this.options.namespace(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      this.options.sumValue?.(doc)
    );
  }
  async deleteIfExists(
    ctx: RunMutationCtx,
    doc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._deleteIfExists(
      ctx,
      this.options.namespace(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>
    );
  }
  async replaceOrInsert(
    ctx: RunMutationCtx,
    oldDoc: TableAggregateDocument<T>,
    newDoc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      this.options.namespace(oldDoc),
      this.options.sortKey(oldDoc),
      this.options.namespace(newDoc),
      this.options.sortKey(newDoc),
      newDoc._id as TableAggregateId<T>,
      this.options.sumValue?.(newDoc)
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
    ctx: RunQueryCtx,
    doc: TableAggregateDocument<T>,
    opts?: {
      id?: TableAggregateId<T>;
      bounds?: Bounds<T["Key"], TableAggregateId<T>>;
      order?: "asc" | "desc";
    }
  ): Promise<number> {
    const key = this.options.sortKey(doc);
    return this.indexOf(ctx, key, {
      namespace: this.options.namespace(doc),
      ...opts,
    });
  }

  trigger<Ctx extends RunMutationCtx>(): TableAggregateTrigger<Ctx, T> {
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

  idempotentTrigger<Ctx extends RunMutationCtx>(): TableAggregateTrigger<
    Ctx,
    T
  > {
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
  | (Namespace extends undefined ? [Opts?] : never);

function namespaceFromArg<Args extends object, Namespace>(
  args: NamespacedArgs<Args, Namespace>
): Namespace {
  if ("namespace" in args) {
    return args["namespace"];
  }
  return undefined as Namespace;
}
function namespaceFromOpts<Opts, Namespace>(
  opts: NamespacedOpts<Opts, Namespace>
): Namespace {
  if (opts.length === 0) {
    // Only possible if Namespace extends undefined, so undefined is the only valid namespace.
    return undefined as Namespace;
  }
  const [{ namespace }] = opts as [{ namespace: Namespace }];
  return namespace;
}

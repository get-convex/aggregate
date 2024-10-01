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
import { Position, positionToKey, boundToPosition, keyToPosition, Bound, Bounds, boundsToPositions } from "./positions.js";
import { GenericId } from "convex/values";

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
  summand: number;
};

export type { Key, Bound };

/**
 * Write data to be aggregated, and read aggregated data.
 * 
 * The data structure is effectively a key-value store sorted by key, where the
 * value is an ID and an optional summand.
 * 1. The key can be any Convex value (number, string, array, etc.).
 * 2. The ID is a string which should be unique.
 * 3. The summand is a number which is aggregated by summing. If not provided,
 *    it's assumed to be zero.
 * 
 * Once values have been added to the data structure, you can query for the
 * count and sum of items between a range of keys.
 */
export class Aggregate<
  K extends Key,
  ID extends string,
> {
  constructor(private component: UsedAPI) {}

  /// Aggregate queries.

  /**
   * Counts items between the given bounds.
   */
  async count(ctx: RunQueryCtx, bounds?: Bounds<K, ID>): Promise<number> {
    const { count } = await ctx.runQuery(this.component.btree.aggregateBetween,
      boundsToPositions(bounds),
    );
    return count;
  }
  /**
   * Adds up the summands of items between the given bounds.
   */
  async sum(ctx: RunQueryCtx, bounds?: Bounds<K, ID>): Promise<number> {
    const { sum } = await ctx.runQuery(this.component.btree.aggregateBetween,
      boundsToPositions(bounds),
    );
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
  async at(ctx: RunQueryCtx, offset: number, bounds?: Bounds<K, ID>): Promise<Item<K, ID>> {
    if (offset < 0) {
      const item = await ctx.runQuery(this.component.btree.atNegativeOffset, {
        offset: -offset - 1,
        ...boundsToPositions(bounds),
      });
      return btreeItemToAggregateItem(item);
    }
    const item = await ctx.runQuery(this.component.btree.atOffset, {
      offset,
      ...boundsToPositions(bounds),
    });
    return btreeItemToAggregateItem(item);
  }
  /**
   * Returns the rank/offset/index of the given key, within the bounds.
   * Specifically, it returns the index of the first item with a key >= the given key.
   */
  async offsetOf(ctx: RunQueryCtx, key: K, id?: ID, bounds?: Bounds<K, ID>): Promise<number> {
    const { k1 } = boundsToPositions(bounds);
    return await ctx.runQuery(this.component.btree.offset, {
      key: boundToPosition("lower", { key, id, inclusive: true }),
      k1,
    });
  }
  /**
   * Returns the rank/offset/index of the given key, counting from the end of
   * the list (or `upperBound`).
   */
  async offsetUntil(ctx: RunQueryCtx, key: K, id?: ID, bounds?: Bounds<K, ID>): Promise<number> {
    const { k2 } = boundsToPositions(bounds);
    return await ctx.runQuery(this.component.btree.offsetUntil, {
      key: boundToPosition("upper", { key, id, inclusive: true }),
      k2,
    });
  }
  /**
   * Gets the minimum item within the given bounds.
   */
  async min(ctx: RunQueryCtx, bounds?: Bounds<K, ID>): Promise<Item<K, ID> | null> {
    const { page } = await this.paginate(ctx, bounds, undefined, 'asc', 1);
    return page[0] ?? null;
  }
  /**
   * Gets the maximum item within the given bounds.
   */
  async max(ctx: RunQueryCtx, bounds?: Bounds<K, ID>): Promise<Item<K, ID> | null> {
    const { page } = await this.paginate(ctx, bounds, undefined, 'desc', 1);
    return page[0] ?? null;
  }
  /**
   * Gets a uniformly random item within the given bounds.
   */
  async random(ctx: RunQueryCtx, bounds?: Bounds<K, ID>): Promise<Item<K, ID> | null> {
    const count = await this.count(ctx, bounds);
    if (count === 0) {
      return null;
    }
    const index = Math.floor(Math.random() * count);
    return await this.at(ctx, index, bounds);
  }
  /**
   * Get a page of items between the given bounds, with a cursor to paginate.
   * Use `iter` to iterate over all items within the bounds.
   */
  async paginate(
    ctx: RunQueryCtx,
    bounds?: Bounds<K, ID>,
    cursor?: string,
    order: 'asc' | 'desc' = 'asc',
    pageSize: number = 100,
  ): Promise<{ page: Item<K, ID>[], cursor: string, isDone: boolean }> {
    const { page, cursor: newCursor, isDone } = await ctx.runQuery(this.component.btree.paginate, {
      ...boundsToPositions(bounds),
      cursor,
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
    bounds?: Bounds<K, ID>,
    order: 'asc' | 'desc' = 'asc',
    pageSize: number = 100,
  ): AsyncGenerator<Item<K, ID>, void, undefined> {
    let isDone = false;
    let cursor: string | undefined = undefined;
    while (!isDone) {
      const { page, cursor: newCursor, isDone: newIsDone } = await this.paginate(ctx, bounds, cursor, order, pageSize);
      for (const item of page) {
        yield item;
      }
      isDone = newIsDone;
      cursor = newCursor;
    }
  }

  /// Write operations.

  /**
   * Insert a new key into the data structure.
   * The id should be unique.
   * If not provided, the summand is assumed to be zero.
   * If the tree does not exist yet, it will be initialized with the default
   * maxNodeSize and lazyRoot=true.
   * If the [key, id] pair already exists, this will throw.
   */
  async insert(ctx: RunMutationCtx, key: K, id: ID, summand?: number): Promise<void> {
    await ctx.runMutation(this.component.public.insert, { key: keyToPosition(key, id), summand, value: id });
  }
  /**
   * Delete the key with the given ID from the data structure.
   * Throws if the given key and ID do not exist.
   */
  async delete(ctx: RunMutationCtx, key: K, id: ID): Promise<void> {
    await ctx.runMutation(this.component.public.delete_, { key: keyToPosition(key, id) });
  }
  /**
   * Update an existing item in the data structure.
   * This is effectively a delete followed by an insert, but it's performed
   * atomically so it's impossible to view the data structure with the key missing.
   */
  async replace(ctx: RunMutationCtx, currentKey: K, newKey: K, id: ID, summand?: number): Promise<void> {
    await ctx.runMutation(this.component.public.replace, {
      currentKey: keyToPosition(currentKey, id),
      newKey: keyToPosition(newKey, id),
      summand,
      value: id,
    });
  }
  /**
   * Equivalents to `insert`, `delete`, and `replace` where the item may or may not exist.
   * This can be useful for live backfills:
   * 1. Update live writes to use these methods to write into the new Aggregate.
   * 2. Run a background backfill, paginating over existing data, calling `insertIfDoesNotExist` on each item.
   * 3. Once the backfill is complete, use `insert`, `delete`, and `replace` for live writes.
   * 4. Begin using the Aggregate read methods.
   */
  async insertIfDoesNotExist(ctx: RunMutationCtx, key: K, id: ID, summand?: number): Promise<void> {
    await this.replaceOrInsert(ctx, key, key, id, summand);
  }
  async deleteIfExists(ctx: RunMutationCtx, key: K, id: ID): Promise<void> {
    await ctx.runMutation(this.component.public.deleteIfExists, { key: keyToPosition(key, id) });
  }
  async replaceOrInsert(ctx: RunMutationCtx, currentKey: K, newKey: K, id: ID, summand?: number): Promise<void> {
    await ctx.runMutation(this.component.public.replaceOrInsert, {
      currentKey: keyToPosition(currentKey, id),
      newKey: keyToPosition(newKey, id),
      summand,
      value: id,
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
  async clear(ctx: RunMutationCtx, maxNodeSize?: number, rootLazy?: boolean): Promise<void> {
    await ctx.runMutation(this.component.public.clear, { maxNodeSize, rootLazy });
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
  async makeRootLazy(ctx: RunMutationCtx): Promise<void> {
    await ctx.runMutation(this.component.public.makeRootLazy);
  }
}

export class TableAggregate<
  K extends Key,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> extends Aggregate<K, GenericId<TableName>> {
  trigger<
    Ctx extends RunMutationCtx,
  >(
    sortKey: (d: DocumentByName<DataModel, TableName>) => K,
    summand?: (d: DocumentByName<DataModel, TableName>) => number,
  ): Trigger<Ctx, DataModel, TableName> {
    return async (ctx, change) => {
      const id = change.id;
      if (change.operation === "insert") {
        await this.insert(ctx, sortKey(change.newDoc!), id, summand?.(change.newDoc));
      } else if (change.operation === "update") {
        await this.replace(ctx, sortKey(change.oldDoc!), sortKey(change.newDoc), id, summand?.(change.newDoc));
      } else if (change.operation === "delete") {
        await this.delete(ctx, sortKey(change.oldDoc), id);
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
} & ({
  operation: "insert";
  oldDoc: null
  newDoc: DocumentByName<DataModel, TableName>;
} | {
  operation: "update";
  oldDoc: DocumentByName<DataModel, TableName>;
  newDoc: DocumentByName<DataModel, TableName>;
} | {
  operation: "delete";
  oldDoc: DocumentByName<DataModel, TableName>;
  newDoc: null;
});

/**
 * Simplified Aggregate API that doesn't have keys or summands, so it's
 * simpler to use for counting all items or getting a random item.
 * 
 * See docstrings on Aggregate for more details.
 */
export class Randomize<
  ID extends string,
> {
  private aggregate: Aggregate<null, ID>;
  constructor(private component: UsedAPI) {
    this.aggregate = new Aggregate(component);
  }
  async count(ctx: RunQueryCtx): Promise<number> {
    return await this.aggregate.count(ctx);
  }
  async at(ctx: RunQueryCtx, offset: number): Promise<ID> {
    const item = await this.aggregate.at(ctx, offset);
    return item.id;
  }
  async random(ctx: RunQueryCtx): Promise<ID | null> {
    const item = await this.aggregate.random(ctx);
    return item ? item.id : null;
  }
  async insert(ctx: RunMutationCtx, id: ID): Promise<void> {
    await this.aggregate.insert(ctx, null, id);
  }
  async delete(ctx: RunMutationCtx, id: ID): Promise<void> {
    await this.aggregate.delete(ctx, null, id);
  }
  async insertIfDoesNotExist(ctx: RunMutationCtx, id: ID): Promise<void> {
    await this.aggregate.insertIfDoesNotExist(ctx, null, id);
  }
  async deleteIfExists(ctx: RunMutationCtx, id: ID): Promise<void> {
    await this.aggregate.deleteIfExists(ctx, null, id);
  }
  async clear(ctx: RunMutationCtx, maxNodeSize?: number, rootLazy?: boolean): Promise<void> {
    await this.aggregate.clear(ctx, maxNodeSize, rootLazy);
  }
}

export function btreeItemToAggregateItem<K extends Key, ID extends string>({
  k,
  s
}: {
  k: unknown,
  s: number,
}): Item<K, ID> {
  const { key, id } = positionToKey(k as Position);
  return {
    key: key as K,
    id: id as ID,
    summand: s,
  };
}

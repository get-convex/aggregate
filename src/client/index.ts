import {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import {
  Key,
} from "../component/btree.js";
import { api } from "../component/_generated/api.js";
import { UseApi } from "./useApi.js";

type UsedAPI = UseApi<typeof api>;

// IDs are strings so in the Convex ordering, null < IDs < arrays.
const BEFORE_ALL_IDS = null;
const AFTER_ALL_IDS: never[] = [];

export type Bound<K extends Key, ID extends string> = {
  key: K,
  id?: ID,
  inclusive: boolean,
};

export type Item<K extends Key, ID extends string> = {
  key: K;
  id: ID;
  summand: number;
};

/**
 * Write to the data structure which calculates aggregates.
 * The data structure is effectively a key-value store sorted by key, where the
 * value is an ID and an optional summand.
 * 1. The key can be any Convex value (number, string, array, etc.).
 * 2. The ID is a string which should be unique.
 * 3. The summand is a number which is aggregated by summing. If not provided,
 *    it's assumed to be zero.
 * 
 * Once values have been added to the data structure, you can query for the
 * count and sum of items between a range of keys, using the `Aggregate` class.
 */
export class AggregateWriter<
  K extends Key,
  ID extends string,
> {
  constructor(private component: UsedAPI) {}
  /**
   * Initialize a new Aggregates data structure. This should be called once.
   */
  async init(ctx: RunMutationCtx, maxNodeSize: number = 16): Promise<void> {
    await ctx.runMutation(this.component.btree.init, {
      maxNodeSize,
    });
  }
  /**
   * Empty the data structure, removing all items.
   * Change the maxNodeSize if provided, otherwise keep it the same.
   */
  async clear(ctx: RunMutationCtx, maxNodeSize?: number): Promise<void> {
    await ctx.runMutation(this.component.btree.clearTree, { maxNodeSize });
  }
  /**
   * Insert a new key into the data structure.
   * The id should be unique.
   * If not provided, the summand is assumed to be zero.
   */
  async insert(ctx: RunMutationCtx, key: K, id: ID, summand?: number): Promise<void> {
    await ctx.runMutation(this.component.btree.insert, { key: keyToPosition(key, id), summand, value: id });
  }
  /**
   * Delete the key with the given ID from the data structure.
   * Throws if the given key and ID do not exist.
   */
  async delete(ctx: RunMutationCtx, key: K, id: ID): Promise<void> {
    await ctx.runMutation(this.component.btree.delete_, { key: keyToPosition(key, id) });
  }
  /**
   * Update an existing item in the data structure.
   * This is effectively a delete followed by an insert, but it's performed
   * atomically so it's impossible to view the data structure with the key missing.
   */
  async replace(ctx: RunMutationCtx, currentKey: K, newKey: K, id: ID, summand?: number): Promise<void> {
    await ctx.runMutation(this.component.btree.replace, {
      currentKey: keyToPosition(currentKey, id),
      newKey: keyToPosition(newKey, id),
      summand,
      value: id,
    });
  }
  /**
   * By default, the aggregates data structure writes to the root node on every
   * insert/delete/replace, which can cause contention.
   * 
   * If your data structure has frequent writes, you can reduce contention by
   * calling makeRootLazy, which removes the frequent writes to the root node.
   * With a lazy root node, updates will only contend with other updates to the
   * same shard of the tree, as determined by maxNodeSize, so larger maxNodeSize
   * can also help.
   */
  async makeRootLazy(ctx: RunMutationCtx): Promise<void> {
    await ctx.runMutation(this.component.btree.makeRootLazy);
  }
}

/**
 * Read aggregates from the data structure.
 */
export class Aggregate<
  K extends Key,
  ID extends string,
> {
  constructor(private component: UsedAPI) {}
  /**
   * Returns the item at the given rank/offset/index in the order of key.
   */
  async at(ctx: RunQueryCtx, index: number): Promise<Item<K, ID>> {
    const { k, s } = await ctx.runQuery(this.component.btree.atIndex, { index });
    const { key, id } = positionToKey(k as Position);
    return {
      key: key as K,
      id: id as ID,
      summand: s,
    };
  }
  /**
   * Returns the rank/offset/index of the given key.
   * Specifically, it returns the index of the first item with a key >= the given key.
   */
  async rankOf(ctx: RunQueryCtx, key: K, id?: ID): Promise<number> {
    return await ctx.runQuery(this.component.btree.rank, { key: boundToPosition("lower", { key, id, inclusive: true }) });
  }
  async min(ctx: RunQueryCtx): Promise<Item<K, ID> | null> {
    const count = await this.count(ctx);
    if (count === 0) {
      return null;
    }
    return await this.at(ctx, 0);
  }
  async max(ctx: RunQueryCtx): Promise<Item<K, ID> | null> {
    const count = await this.count(ctx);
    if (count === 0) {
      return null;
    }
    return await this.at(ctx, count - 1);
  }
  /**
   * Counts items between the given lower and upper bounds.
   */
  async count(ctx: RunQueryCtx, bounds?: { lower?: Bound<K, ID>, upper?: Bound<K, ID> }): Promise<number> {
    const { count } = await ctx.runQuery(this.component.btree.aggregateBetween,
      { k1: boundToPosition("lower", bounds?.lower), k2: boundToPosition("upper", bounds?.upper) },
    );
    return count;
  }
  /**
   * Adds up the summands of items between the given lower and upper bounds.
   */
  async sum(ctx: RunQueryCtx, bounds?: { lower?: Bound<K, ID>, upper?: Bound<K, ID> }): Promise<number> {
    const { sum } = await ctx.runQuery(this.component.btree.aggregateBetween,
      { k1: boundToPosition("lower", bounds?.lower), k2: boundToPosition("upper", bounds?.upper) },
    );
    return sum;
  }
  /**
   * Gets a uniformly random item.
   */
  async random(ctx: RunQueryCtx): Promise<Item<K, ID> | null> {
    const count = await this.count(ctx);
    if (count === 0) {
      return null;
    }
    const index = Math.floor(Math.random() * count);
    return await this.at(ctx, index);
  }
  /**
   * Validates the internal data structure is consistent.
   * You shouldn't need to call this; it's just for sanity checking and tests.
   */
  async validate(ctx: RunQueryCtx): Promise<void> {
    await ctx.runQuery(this.component.btree.validate);
  }
  // TODO: iter items between keys
  // For now you can use `rankOf` and `at` to iterate.
}

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

type Position = ["" | null | never[], Key, string | null | never[], "" | null | never[]];

function keyToPosition<K extends Key, ID extends string>(
  key: K,
  id: ID,
): Position {
  return ["", key, id, ""];
}

function positionToKey<K extends Key, ID extends string>(
  position: Position,
): { key: K; id: ID } {
  return { key: position[1] as K, id: position[2] as ID };
}

function boundToPosition<
  K extends Key,
  ID extends string,
>(
  direction: 'lower' | 'upper',
  bound?: Bound<K, ID>,
): Position {
  if (direction === 'lower') {
    if (bound === undefined) {
      return [BEFORE_ALL_IDS, BEFORE_ALL_IDS as K, BEFORE_ALL_IDS, BEFORE_ALL_IDS];
    }
    return ["", bound.key, bound.id ?? BEFORE_ALL_IDS, bound.inclusive ? BEFORE_ALL_IDS : AFTER_ALL_IDS];
  } else {
    if (bound === undefined) {
      return [AFTER_ALL_IDS, AFTER_ALL_IDS as unknown as K, AFTER_ALL_IDS, AFTER_ALL_IDS];
    }
    return ["", bound.key, bound.id ?? AFTER_ALL_IDS, bound.inclusive ? AFTER_ALL_IDS : BEFORE_ALL_IDS];
  }
}

/**
 * The Aggregate API uses keys and IDs, where the keys are for sorting and
 * IDs are for tie-breaking uniqueness. The component's BTree API uses
 * positions, which are unique keys.
 */

import { Key } from "../component/btree.js";

export type Bound<K extends Key, ID extends string> = {
  key: K,
  id?: ID,
  inclusive: boolean,
};

// IDs are strings so in the Convex ordering, null < IDs < arrays.
const BEFORE_ALL_IDS = null;
const AFTER_ALL_IDS: never[] = [];

export type Position = ["" | null | never[], Key, string | null | never[], "" | null | never[]];

export function keyToPosition<K extends Key, ID extends string>(
  key: K,
  id: ID,
): Position {
  return ["", key, id, ""];
}

export function positionToKey<K extends Key, ID extends string>(
  position: Position,
): { key: K; id: ID } {
  return { key: position[1] as K, id: position[2] as ID };
}

export function boundToPosition<
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
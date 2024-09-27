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

export type SideBounds<K extends Key, ID extends string> = {
  lower?: Bound<K, ID>;
  upper?: Bound<K, ID>;
};

// e.g. TuplePrefix<[string, number]> = [] | [string] | [string, number]
export type TuplePrefix<K extends unknown[], P extends unknown[] = []> = 
  P['length'] extends K['length'] 
    ? P
    : P | TuplePrefix<K, [...P, K[P['length']]]>;

export type Bounds<K extends Key, ID extends string> = K extends unknown[] ? (
  SideBounds<K, ID> | {
    prefix: TuplePrefix<K>;
  }
) : SideBounds<K, ID>;

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

export function boundsToPositions<K extends Key, ID extends string>(
  bounds: Bounds<K, ID>,
): { k1: Position; k2: Position } {
  if ('prefix' in bounds) {
    return {
      lower: {
        key: ["", ...bounds.prefix, BEFORE_ALL_IDS],
        id: null,
        inclusive: true,
      },
      upper: {
        key: ["", ...bounds.prefix, AFTER_ALL_IDS],
        id: null,
        inclusive: false,
      },
    };
  }
  const lower: Bound<K, ID> | undefined = bounds.lower;
  return {
    k1: boundToPosition<K, ID>('lower', lower),
    k2: boundToPosition<K, ID>('upper', bounds.upper),
  };
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
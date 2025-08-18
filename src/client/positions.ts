/**
 * The Aggregate API uses keys and IDs, where the keys are for sorting and
 * IDs are for tie-breaking uniqueness. The component's BTree API uses
 * positions, which are unique keys.
 */

import { Value } from "convex/values";
import { Key } from "../component/btree.js";

export type Bound<K extends Key, ID extends string> = {
  key: K;
  id?: ID;
  inclusive: boolean;
};

export type SideBounds<K extends Key, ID extends string> = {
  lower?: Bound<K, ID>;
  upper?: Bound<K, ID>;
};

// e.g. TuplePrefix<[string, number]> = [] | [string] | [string, number]
export type TuplePrefix<
  K extends unknown[],
  P extends unknown[] = [],
> = P["length"] extends K["length"]
  ? P
  : P | TuplePrefix<K, [...P, K[P["length"]]]>;

export type Bounds<K extends Key, ID extends string> =
  | SideBounds<K, ID>
  | {
      prefix: TuplePrefix<Extract<K, unknown[]>>;
    };

// IDs are strings so in the Convex ordering, null < IDs < arrays.
const BEFORE_ALL_IDS = null;
const AFTER_ALL_IDS: never[] = [];

// First a key, which is exploded with explodeKey.
// Then the ID, or BEFORE_ALL_IDS or AFTER_ALL_IDS.
export type Position = [Key, string | null | never[]];

function explodeKey<K extends Key>(key: K): Key {
  if (Array.isArray(key)) {
    const exploded = [""];
    for (const item of key) {
      exploded.push(item);
      exploded.push("");
    }
    return exploded;
  }
  return key;
}

function implodeKey(k: Key): Key {
  if (Array.isArray(k)) {
    const imploded: Value[] = [];
    for (let i = 1; i < k.length; i += 2) {
      imploded.push(k[i]);
    }
    return imploded;
  }
  return k;
}

export function keyToPosition<K extends Key, ID extends string>(
  key: K,
  id: ID
): Position {
  return [explodeKey(key), id];
}

export function positionToKey<K extends Key, ID extends string>(
  position: Position
): { key: K; id: ID } {
  return { key: implodeKey(position[0]) as K, id: position[1] as ID };
}

export function boundsToPositions<K extends Key, ID extends string>(
  bounds?: Bounds<K, ID>
): { k1?: Position; k2?: Position } {
  if (bounds === undefined) {
    return {};
  }
  if ("prefix" in bounds) {
    const prefix: Key[] = bounds.prefix;
    const exploded: Key = [];
    for (const item of prefix) {
      exploded.push("");
      exploded.push(item);
    }
    return {
      k1: [exploded.concat([BEFORE_ALL_IDS]), BEFORE_ALL_IDS],
      k2: [exploded.concat([AFTER_ALL_IDS]), AFTER_ALL_IDS],
    };
  }
  return {
    k1: boundToPosition("lower", bounds.lower),
    k2: boundToPosition("upper", bounds.upper),
  };
}

export function boundToPosition<K extends Key, ID extends string>(
  direction: "lower" | "upper",
  bound: Bound<K, ID>
): Position;
export function boundToPosition(direction: "lower" | "upper"): undefined;
export function boundToPosition<K extends Key, ID extends string>(
  direction: "lower" | "upper",
  bound?: Bound<K, ID>
): Position | undefined;
export function boundToPosition<K extends Key, ID extends string>(
  direction: "lower" | "upper",
  bound?: Bound<K, ID>
): Position | undefined {
  if (bound === undefined) {
    return undefined;
  }
  if (direction === "lower") {
    return [
      explodeKey(bound.key),
      bound.id ?? (bound.inclusive ? BEFORE_ALL_IDS : AFTER_ALL_IDS),
    ];
  } else {
    return [
      explodeKey(bound.key),
      bound.id ?? (bound.inclusive ? AFTER_ALL_IDS : BEFORE_ALL_IDS),
    ];
  }
}

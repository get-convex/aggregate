/**
 * Frontend-only histogram helpers. The bucket math itself is shared with the
 * server in `convex/utils/benchMath.ts` so the axis can't disagree with the data.
 */

import {
  bucketIndex,
  bucketLowerBound,
} from "../../../../convex/utils/benchMath";

/**
 * Fractional bucket position of a latency, for placing a percentile rule between
 * bucket edges. `bucketIndex` clamps to the last bucket, so a percentile past the
 * histogram's range pins to the end rather than falling outside the domain and
 * being dropped.
 */
export function bucketPosition(valueMs: number): number {
  const i = bucketIndex(valueMs);
  const lo = bucketLowerBound(i);
  const hi = bucketLowerBound(i + 1);
  if (!(lo > 0) || !(hi > lo) || valueMs <= lo) return i;
  return i + Math.min(Math.log(valueMs / lo) / Math.log(hi / lo), 1);
}

/** Trailing empty buckets carry no information; drop them from the domain. */
export function bucketExtent(buckets: number[]): [number, number] {
  const firstFilled = buckets.findIndex((n) => n > 0);
  if (firstFilled < 0) return [0, 0];
  let last = buckets.length - 1;
  while (buckets[last] === 0) last--;
  const first = Math.max(firstFilled - 1, 0);
  return [first, Math.max(last + 1, first + 1)];
}

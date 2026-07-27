/** Mirrors the server-side histogram in convex/utils/benchMath.ts. */

const HIST_MIN_MS = 0.5;
const HIST_GROWTH = Math.pow(2, 0.25);

/** Lower edge of a bucket, in ms. */
export function bucketLowerBound(i: number): number {
  return i <= 0 ? 0 : HIST_MIN_MS * Math.pow(HIST_GROWTH, i);
}

/** Fractional bucket position of a latency, for placing percentile rules. */
export function bucketIndexOf(valueMs: number): number {
  if (valueMs <= HIST_MIN_MS) return 0;
  return Math.log(valueMs / HIST_MIN_MS) / Math.log(HIST_GROWTH);
}

/** Trailing empty buckets carry no information; drop them from the domain. */
export function bucketExtent(buckets: number[]): [number, number] {
  let first = buckets.findIndex((n) => n > 0);
  let last = buckets.length - 1;
  while (last >= 0 && buckets[last] === 0) last--;
  if (first < 0) return [0, buckets.length - 1];
  first = Math.max(first - 1, 0);
  return [first, Math.max(last + 1, first + 1)];
}

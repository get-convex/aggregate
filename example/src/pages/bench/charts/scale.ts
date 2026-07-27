/** Pure scale/tick helpers. Kept out of .tsx so react-refresh stays happy. */

export type Scale = (value: number) => number;

export function linearScale(
  domain: [number, number],
  range: [number, number],
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => r0;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * Ticks at 1/2/5 x 10^n covering the domain. `minStep` floors the step size —
 * pass 1 for a count axis, so a domain of [0, 1] yields 0 and 1 rather than
 * fractional ticks that collapse to duplicate integer labels.
 */
export function niceTicks(
  min: number,
  max: number,
  count = 5,
  minStep = 0,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min || 0];
  }
  const rawStep = (max - min) / Math.max(count, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = Math.max(
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
      magnitude,
    minStep,
  );
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 1e-9; t += step) {
    // Guard against float drift producing -0 or 0.30000000000000004.
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : Number(t.toPrecision(12)));
  }
  return ticks;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 100) return `${Math.round(ms)}ms`;
  if (ms >= 10) return `${ms.toFixed(1)}ms`;
  return `${ms.toFixed(2)}ms`;
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function formatRate(opsPerSec: number): string {
  if (!Number.isFinite(opsPerSec)) return "–";
  return opsPerSec >= 100 ? `${Math.round(opsPerSec)}` : opsPerSec.toFixed(1);
}

export function formatSeconds(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

/**
 * Rounded at the data end, square at the baseline — for a bar growing upward
 * from y0 to y1 (screen coords, y1 < y0).
 */
export function verticalBarPath(
  x: number,
  width: number,
  yTop: number,
  yBase: number,
  radius: number,
): string {
  const r = Math.max(0, Math.min(radius, width / 2, Math.abs(yBase - yTop)));
  return [
    `M ${x} ${yBase}`,
    `L ${x} ${yTop + r}`,
    `Q ${x} ${yTop} ${x + r} ${yTop}`,
    `L ${x + width - r} ${yTop}`,
    `Q ${x + width} ${yTop} ${x + width} ${yTop + r}`,
    `L ${x + width} ${yBase}`,
    "Z",
  ].join(" ");
}

/** Always ≥ 1×: the direction is carried by the verb beside it. */
export function formatRatio(ratio: number): string {
  const r = ratio >= 1 ? ratio : 1 / ratio;
  return `${r >= 100 ? Math.round(r) : r.toFixed(1)}×`;
}

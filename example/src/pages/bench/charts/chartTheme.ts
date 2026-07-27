/**
 * Chart tokens for the benchmark page.
 *
 * Colors are validated, not eyeballed — the categorical trio and both two-step
 * phase ramps pass the dataviz validator against this app's `#141517` surface
 * (lightness band, chroma floor, CVD separation, normal-vision floor, contrast;
 * and monotone lightness for the ramps).
 *
 * Color follows the entity: `async` is always blue and `eager` is always orange,
 * in every chart and every table row. Never reassign by rank.
 */

export const MODE_COLOR = {
  async: "#3987e5",
  eager: "#d95926",
} as const;

/**
 * Within a mode, phase is ordinal, so it's one hue at two steps rather than a
 * second identity color. Mode says who; shade says which phase.
 */
export const PHASE_COLOR = {
  async: { enqueue: "#3987e5", drain: "#86b6ef" },
  eager: { enqueue: "#d95926", drain: "#f0956b" },
} as const;

/** Third categorical slot, for reader series in the mixed scenario. */
export const READ_COLOR = "#199e70";

export const INK = {
  primary: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781",
} as const;

export const CHART = {
  /** Hairline gridlines — solid, never dashed. */
  grid: "#2c2c2a",
  axis: "#383835",
  /** Card background; also the color of gaps between adjacent fills. */
  surface: "#25262B",
  /** One step off the card, for recessive phase bands. */
  band: "#1f1f24",
  /** Worker "idle" segments in the status ribbon. */
  idle: "#3a3a38",
} as const;

/** Reserved for run state only. Never used as a series color. */
export const STATUS_COLOR = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
} as const;

export const MARK = {
  /** Bars never get fatter than this. */
  barMaxThickness: 24,
  lineWidth: 2,
  /** Gap between stacked segments and adjacent bars, in surface color. */
  surfaceGap: 2,
  markerRadius: 4,
  /** Rounded at the data end, square at the baseline. */
  barEndRadius: 4,
  areaFillOpacity: 0.1,
} as const;

export type BenchMode = keyof typeof MODE_COLOR;

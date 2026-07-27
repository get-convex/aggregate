/**
 * Chart tokens for the benchmark page.
 *
 * Color follows the entity: `async` is always blue and `eager` is always orange,
 * in every chart and every table row. Never reassign by rank.
 */

export const MODE_COLOR = {
  async: "#3987e5",
  eager: "#d95926",
} as const;

export const INK = {
  primary: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781",
} as const;

export const CHART = {
  /** Hairline gridlines — solid, never dashed. */
  grid: "#2c2c2a",
  axis: "#383835",
} as const;

export const MARK = {
  /** Bars never get fatter than this. */
  barMaxThickness: 24,
  lineWidth: 2,
  /** Gap between adjacent bars, showing the card behind them. */
  surfaceGap: 2,
  markerRadius: 4,
  /** Rounded at the data end, square at the baseline. */
  barEndRadius: 4,
} as const;

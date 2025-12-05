/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as batchedWrites from "../batchedWrites.js";
import type * as btree from "../btree.js";
import type * as crons from "../crons.js";
import type * as leaderboard from "../leaderboard.js";
import type * as photos from "../photos.js";
import type * as shuffle from "../shuffle.js";
import type * as stats from "../stats.js";
import type * as utils_resetStatus from "../utils/resetStatus.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  batchedWrites: typeof batchedWrites;
  btree: typeof btree;
  crons: typeof crons;
  leaderboard: typeof leaderboard;
  photos: typeof photos;
  shuffle: typeof shuffle;
  stats: typeof stats;
  "utils/resetStatus": typeof utils_resetStatus;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  aggregateByScore: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateByScore">;
  aggregateScoreByUser: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateScoreByUser">;
  music: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"music">;
  photos: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"photos">;
  stats: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"stats">;
  btreeAggregate: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"btreeAggregate">;
  batchedWrites: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"batchedWrites">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};

/* prettier-ignore-start */

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as btree from "../btree.js";
import type * as compare from "../compare.js";
import type * as inspect from "../inspect.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  btree: typeof btree;
  compare: typeof compare;
  inspect: typeof inspect;
}>;
declare const fullApiWithMounts: typeof fullApi & {
  btree: {
    aggregateBetween: FunctionReference<
      "query",
      "public",
      { k1?: any; k2?: any },
      { count: number; sum: number }
    >;
    aggregateBetweenHandler: FunctionReference<
      "query",
      "public",
      { k1?: any; k2?: any },
      { count: number; sum: number }
    >;
    atIndex: FunctionReference<"query", "public", { index: number }, any>;
    atIndexHandler: FunctionReference<
      "query",
      "public",
      { index: number },
      any
    >;
    clearTree: FunctionReference<"mutation", "public", {}, any>;
    count: FunctionReference<"query", "public", {}, any>;
    countHandler: FunctionReference<"query", "public", {}, any>;
    get: FunctionReference<"query", "public", { key: any }, any>;
    getHandler: FunctionReference<"query", "public", { key: any }, any>;
    init: FunctionReference<
      "mutation",
      "public",
      { getKey: string; maxNodeSize: number },
      any
    >;
    makeRootLazy: FunctionReference<"mutation", "public", {}, any>;
    rank: FunctionReference<"query", "public", { key: any }, any>;
    rankHandler: FunctionReference<"query", "public", { key: any }, any>;
    sum: FunctionReference<"query", "public", {}, any>;
    sumHandler: FunctionReference<"query", "public", {}, any>;
    trigger: FunctionReference<
      "mutation",
      "public",
      {
        change: {
          id: string;
          newDoc: any;
          oldDoc: any;
          type: "insert" | "patch" | "replace" | "delete";
        };
      },
      null
    >;
    validate: FunctionReference<"query", "public", {}, any>;
    validateTree: FunctionReference<"query", "public", {}, any>;
  };
  inspect: {
    display: FunctionReference<"query", "public", {}, any>;
    dump: FunctionReference<"query", "public", {}, string>;
    inspectNode: FunctionReference<"query", "public", { node?: string }, null>;
  };
};

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

/* prettier-ignore-end */

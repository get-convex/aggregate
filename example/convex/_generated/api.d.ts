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

import type * as leaderboard from "../leaderboard.js";

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
  leaderboard: typeof leaderboard;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {
  aggregateByScore: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any },
        { count: number; sum: number }
      >;
      atIndex: FunctionReference<
        "query",
        "internal",
        { index: number },
        { k: any; s: number; v: any }
      >;
      atIndexHandler: FunctionReference<
        "query",
        "internal",
        { index: number },
        { k: any; s: number; v: any }
      >;
      clearTree: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number },
        null
      >;
      count: FunctionReference<"query", "internal", {}, any>;
      countHandler: FunctionReference<"query", "internal", {}, any>;
      deleteHandler: FunctionReference<
        "mutation",
        "internal",
        { key: any },
        null
      >;
      delete_: FunctionReference<"mutation", "internal", { key: any }, null>;
      get: FunctionReference<
        "query",
        "internal",
        { key: any },
        null | { k: any; s: number; v: any }
      >;
      getHandler: FunctionReference<
        "query",
        "internal",
        { key: any },
        null | { k: any; s: number; v: any }
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      insertHandler: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<"mutation", "internal", {}, null>;
      rank: FunctionReference<"query", "internal", { key: any }, number>;
      rankHandler: FunctionReference<"query", "internal", { key: any }, number>;
      replace: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        null
      >;
      sum: FunctionReference<"query", "internal", {}, number>;
      sumHandler: FunctionReference<"query", "internal", {}, number>;
      validate: FunctionReference<"query", "internal", {}, any>;
      validateTree: FunctionReference<"query", "internal", {}, any>;
    };
    inspect: {
      display: FunctionReference<"query", "internal", {}, any>;
      dump: FunctionReference<"query", "internal", {}, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { node?: string },
        null
      >;
    };
  };
  aggregateScoreByUser: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any },
        { count: number; sum: number }
      >;
      atIndex: FunctionReference<
        "query",
        "internal",
        { index: number },
        { k: any; s: number; v: any }
      >;
      atIndexHandler: FunctionReference<
        "query",
        "internal",
        { index: number },
        { k: any; s: number; v: any }
      >;
      clearTree: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number },
        null
      >;
      count: FunctionReference<"query", "internal", {}, any>;
      countHandler: FunctionReference<"query", "internal", {}, any>;
      deleteHandler: FunctionReference<
        "mutation",
        "internal",
        { key: any },
        null
      >;
      delete_: FunctionReference<"mutation", "internal", { key: any }, null>;
      get: FunctionReference<
        "query",
        "internal",
        { key: any },
        null | { k: any; s: number; v: any }
      >;
      getHandler: FunctionReference<
        "query",
        "internal",
        { key: any },
        null | { k: any; s: number; v: any }
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      insertHandler: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<"mutation", "internal", {}, null>;
      rank: FunctionReference<"query", "internal", { key: any }, number>;
      rankHandler: FunctionReference<"query", "internal", { key: any }, number>;
      replace: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        null
      >;
      sum: FunctionReference<"query", "internal", {}, number>;
      sumHandler: FunctionReference<"query", "internal", {}, number>;
      validate: FunctionReference<"query", "internal", {}, any>;
      validateTree: FunctionReference<"query", "internal", {}, any>;
    };
    inspect: {
      display: FunctionReference<"query", "internal", {}, any>;
      dump: FunctionReference<"query", "internal", {}, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { node?: string },
        null
      >;
    };
  };
};

/* prettier-ignore-end */

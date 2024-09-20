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
export type Mounts = {
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
    atIndex: FunctionReference<
      "query",
      "public",
      { index: number },
      { k: any; s: number; v: any }
    >;
    atIndexHandler: FunctionReference<
      "query",
      "public",
      { index: number },
      { k: any; s: number; v: any }
    >;
    clearTree: FunctionReference<"mutation", "public", {}, null>;
    count: FunctionReference<"query", "public", {}, any>;
    countHandler: FunctionReference<"query", "public", {}, any>;
    deleteHandler: FunctionReference<"mutation", "public", { key: any }, null>;
    delete_: FunctionReference<"mutation", "public", { key: any }, null>;
    get: FunctionReference<
      "query",
      "public",
      { key: any },
      null | { k: any; s: number; v: any }
    >;
    getHandler: FunctionReference<
      "query",
      "public",
      { key: any },
      null | { k: any; s: number; v: any }
    >;
    init: FunctionReference<
      "mutation",
      "public",
      { maxNodeSize: number },
      null
    >;
    insert: FunctionReference<
      "mutation",
      "public",
      { key: any; summand?: number; value: any },
      null
    >;
    insertHandler: FunctionReference<
      "mutation",
      "public",
      { key: any; summand?: number; value: any },
      null
    >;
    makeRootLazy: FunctionReference<"mutation", "public", {}, null>;
    rank: FunctionReference<"query", "public", { key: any }, number>;
    rankHandler: FunctionReference<"query", "public", { key: any }, number>;
    replace: FunctionReference<
      "mutation",
      "public",
      { currentKey: any; newKey: any; summand?: number; value: any },
      null
    >;
    sum: FunctionReference<"query", "public", {}, number>;
    sumHandler: FunctionReference<"query", "public", {}, number>;
    validate: FunctionReference<"query", "public", {}, any>;
    validateTree: FunctionReference<"query", "public", {}, any>;
  };
  inspect: {
    display: FunctionReference<"query", "public", {}, any>;
    dump: FunctionReference<"query", "public", {}, string>;
    inspectNode: FunctionReference<"query", "public", { node?: string }, null>;
  };
};
// For now fullApiWithMounts is only fullApi which provides
// jump-to-definition in component client code.
// Use Mounts for the same type without the inference.
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};

/* prettier-ignore-end */

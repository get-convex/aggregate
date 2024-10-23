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
import type * as public from "../public.js";

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
  public: typeof public;
}>;
export type Mounts = {
  btree: {
    aggregateBetween: FunctionReference<
      "query",
      "public",
      { k1?: any; k2?: any },
      { count: number; sum: number }
    >;
    atNegativeOffset: FunctionReference<
      "query",
      "public",
      { k1?: any; k2?: any; offset: number },
      { k: any; s: number; v: any }
    >;
    atOffset: FunctionReference<
      "query",
      "public",
      { k1?: any; k2?: any; offset: number },
      { k: any; s: number; v: any }
    >;
    count: FunctionReference<"query", "public", {}, any>;
    get: FunctionReference<
      "query",
      "public",
      { key: any },
      null | { k: any; s: number; v: any }
    >;
    offset: FunctionReference<
      "query",
      "public",
      { k1?: any; key: any },
      number
    >;
    offsetUntil: FunctionReference<
      "query",
      "public",
      { k2?: any; key: any },
      number
    >;
    paginate: FunctionReference<
      "query",
      "public",
      {
        cursor?: string;
        k1?: any;
        k2?: any;
        limit: number;
        order: "asc" | "desc";
      },
      {
        cursor: string;
        isDone: boolean;
        page: Array<{ k: any; s: number; v: any }>;
      }
    >;
    sum: FunctionReference<"query", "public", {}, number>;
    validate: FunctionReference<"query", "public", {}, any>;
  };
  inspect: {
    display: FunctionReference<"query", "public", {}, any>;
    dump: FunctionReference<"query", "public", {}, string>;
    inspectNode: FunctionReference<"query", "public", { node?: string }, null>;
  };
  public: {
    clear: FunctionReference<
      "mutation",
      "public",
      { maxNodeSize?: number; rootLazy?: boolean },
      null
    >;
    deleteIfExists: FunctionReference<"mutation", "public", { key: any }, any>;
    delete_: FunctionReference<"mutation", "public", { key: any }, null>;
    init: FunctionReference<
      "mutation",
      "public",
      { maxNodeSize?: number; rootLazy?: boolean },
      null
    >;
    insert: FunctionReference<
      "mutation",
      "public",
      { key: any; summand?: number; value: any },
      null
    >;
    makeRootLazy: FunctionReference<"mutation", "public", {}, null>;
    replace: FunctionReference<
      "mutation",
      "public",
      { currentKey: any; newKey: any; summand?: number; value: any },
      null
    >;
    replaceOrInsert: FunctionReference<
      "mutation",
      "public",
      { currentKey: any; newKey: any; summand?: number; value: any },
      any
    >;
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

/* eslint-disable */
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
      { k1?: any; k2?: any; namespace?: any },
      { count: number; sum: number }
    >;
    atNegativeOffset: FunctionReference<
      "query",
      "public",
      { k1?: any; k2?: any; namespace?: any; offset: number },
      { k: any; s: number; v: any }
    >;
    atOffset: FunctionReference<
      "query",
      "public",
      { k1?: any; k2?: any; namespace?: any; offset: number },
      { k: any; s: number; v: any }
    >;
    batchAggregateBetween: FunctionReference<
      "query",
      "public",
      { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
      Array<{ count: number; sum: number }>
    >;
    batchAtNegativeOffset: FunctionReference<
      "query",
      "public",
      {
        queries: Array<{ k1?: any; k2?: any; namespace?: any; offset: number }>;
      },
      Array<{ k: any; s: number; v: any }>
    >;
    batchAtOffset: FunctionReference<
      "query",
      "public",
      {
        queries: Array<{ k1?: any; k2?: any; namespace?: any; offset: number }>;
      },
      Array<{ k: any; s: number; v: any }>
    >;
    get: FunctionReference<
      "query",
      "public",
      { key: any; namespace?: any },
      null | { k: any; s: number; v: any }
    >;
    offset: FunctionReference<
      "query",
      "public",
      { k1?: any; key: any; namespace?: any },
      number
    >;
    offsetUntil: FunctionReference<
      "query",
      "public",
      { k2?: any; key: any; namespace?: any },
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
        namespace?: any;
        order: "asc" | "desc";
      },
      {
        cursor: string;
        isDone: boolean;
        page: Array<{ k: any; s: number; v: any }>;
      }
    >;
    paginateNamespaces: FunctionReference<
      "query",
      "public",
      { cursor?: string; limit: number },
      { cursor: string; isDone: boolean; page: Array<any> }
    >;
    validate: FunctionReference<"query", "public", { namespace?: any }, any>;
  };
  inspect: {
    display: FunctionReference<"query", "public", { namespace?: any }, any>;
    dump: FunctionReference<"query", "public", { namespace?: any }, string>;
    inspectNode: FunctionReference<
      "query",
      "public",
      { namespace?: any; node?: string },
      null
    >;
    listTreeNodes: FunctionReference<
      "query",
      "public",
      { take?: number },
      Array<{
        _creationTime: number;
        _id: string;
        aggregate?: { count: number; sum: number };
        items: Array<{ k: any; s: number; v: any }>;
        subtrees: Array<string>;
      }>
    >;
    listTrees: FunctionReference<
      "query",
      "public",
      { take?: number },
      Array<{
        _creationTime: number;
        _id: string;
        maxNodeSize: number;
        namespace?: any;
        root: string;
      }>
    >;
  };
  public: {
    clear: FunctionReference<
      "mutation",
      "public",
      { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
      null
    >;
    deleteIfExists: FunctionReference<
      "mutation",
      "public",
      { key: any; namespace?: any },
      any
    >;
    delete_: FunctionReference<
      "mutation",
      "public",
      { key: any; namespace?: any },
      null
    >;
    init: FunctionReference<
      "mutation",
      "public",
      { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
      null
    >;
    insert: FunctionReference<
      "mutation",
      "public",
      { key: any; namespace?: any; summand?: number; value: any },
      null
    >;
    makeRootLazy: FunctionReference<
      "mutation",
      "public",
      { namespace?: any },
      null
    >;
    replace: FunctionReference<
      "mutation",
      "public",
      {
        currentKey: any;
        namespace?: any;
        newKey: any;
        newNamespace?: any;
        summand?: number;
        value: any;
      },
      null
    >;
    replaceOrInsert: FunctionReference<
      "mutation",
      "public",
      {
        currentKey: any;
        namespace?: any;
        newKey: any;
        newNamespace?: any;
        summand?: number;
        value: any;
      },
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

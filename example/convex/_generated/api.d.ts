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
import type * as photos from "../photos.js";
import type * as shuffle from "../shuffle.js";
import type * as stats from "../stats.js";

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
  photos: typeof photos;
  shuffle: typeof shuffle;
  stats: typeof stats;
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
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atNegativeOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      count: FunctionReference<"query", "internal", {}, any>;
      countHandler: FunctionReference<"query", "internal", {}, any>;
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
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      offsetUntilHandler: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
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
      paginateHandler: FunctionReference<
        "query",
        "internal",
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
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any },
        any
      >;
      delete_: FunctionReference<"mutation", "internal", { key: any }, null>;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<"mutation", "internal", {}, null>;
      replace: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        any
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
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atNegativeOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      count: FunctionReference<"query", "internal", {}, any>;
      countHandler: FunctionReference<"query", "internal", {}, any>;
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
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      offsetUntilHandler: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
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
      paginateHandler: FunctionReference<
        "query",
        "internal",
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
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any },
        any
      >;
      delete_: FunctionReference<"mutation", "internal", { key: any }, null>;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<"mutation", "internal", {}, null>;
      replace: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        any
      >;
    };
  };
  music: {
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
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atNegativeOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      count: FunctionReference<"query", "internal", {}, any>;
      countHandler: FunctionReference<"query", "internal", {}, any>;
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
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      offsetUntilHandler: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
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
      paginateHandler: FunctionReference<
        "query",
        "internal",
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
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any },
        any
      >;
      delete_: FunctionReference<"mutation", "internal", { key: any }, null>;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<"mutation", "internal", {}, null>;
      replace: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        any
      >;
    };
  };
  photos: {
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
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atNegativeOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      count: FunctionReference<"query", "internal", {}, any>;
      countHandler: FunctionReference<"query", "internal", {}, any>;
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
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      offsetUntilHandler: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
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
      paginateHandler: FunctionReference<
        "query",
        "internal",
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
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any },
        any
      >;
      delete_: FunctionReference<"mutation", "internal", { key: any }, null>;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<"mutation", "internal", {}, null>;
      replace: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        any
      >;
    };
  };
  stats: {
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
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atNegativeOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      count: FunctionReference<"query", "internal", {}, any>;
      countHandler: FunctionReference<"query", "internal", {}, any>;
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
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetHandler: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      offsetUntilHandler: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
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
      paginateHandler: FunctionReference<
        "query",
        "internal",
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
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any },
        any
      >;
      delete_: FunctionReference<"mutation", "internal", { key: any }, null>;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<"mutation", "internal", {}, null>;
      replace: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        { currentKey: any; newKey: any; summand?: number; value: any },
        any
      >;
    };
  };
};

/* prettier-ignore-end */

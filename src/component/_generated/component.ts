/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { aggregateName?: string; k1?: any; k2?: any; namespace?: any; stale?: boolean },
        { count: number; sum: number },
        Name
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{ aggregateName?: string; k1?: any; k2?: any; namespace?: any }>;
          stale?: boolean;
        },
        Array<{ count: number; sum: number }>,
        Name
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        {
          k1?: any;
          k2?: any;
          aggregateName?: string;
          namespace?: any;
          offset: number;
          stale?: boolean;
        },
        { k: any; s: number; v: any },
        Name
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        {
          k1?: any;
          k2?: any;
          aggregateName?: string;
          namespace?: any;
          offset: number;
          stale?: boolean;
        },
        { k: any; s: number; v: any },
        Name
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            aggregateName?: string;
            namespace?: any;
            offset: number;
          }>;
          stale?: boolean;
        },
        Array<{ k: any; s: number; v: any }>,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { aggregateName?: string; key: any; namespace?: any; stale?: boolean },
        null | { k: any; s: number; v: any },
        Name
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { aggregateName?: string; k1?: any; key: any; namespace?: any; stale?: boolean },
        number,
        Name
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { aggregateName?: string; k2?: any; key: any; namespace?: any; stale?: boolean },
        number,
        Name
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          aggregateName?: string;
          namespace?: any;
          order: "asc" | "desc";
          stale?: boolean;
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        },
        Name
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        {
          aggregateName?: string;
          cursor?: string;
          limit: number;
          stale?: boolean;
        },
        { cursor: string; isDone: boolean; page: Array<any> },
        Name
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { aggregateName?: string; namespace?: any; stale?: boolean },
        any,
        Name
      >;
    };
    deadLetter: {
      delete_: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        boolean,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          _creationTime: number;
          _id: string;
          commitTs: bigint;
          error: string;
          operation:
            | {
                key: any;
                aggregateName?: string;
                namespace?: any;
                summand?: number;
                type: "insert";
                value: any;
              }
            | { aggregateName?: string; key: any; namespace?: any; type: "delete" }
            | {
                currentKey: any;
                aggregateName?: string;
                namespace?: any;
                newKey: any;
                newNamespace?: any;
                summand?: number;
                type: "replace";
                value: any;
              }
            | { aggregateName?: string; key: any; namespace?: any; type: "deleteIfExists" }
            | {
                currentKey: any;
                aggregateName?: string;
                namespace?: any;
                newKey: any;
                newNamespace?: any;
                summand?: number;
                type: "replaceOrInsert";
                value: any;
              };
        } | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          order?: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            commitTs: bigint;
            error: string;
            operation:
              | {
                  key: any;
                  aggregateName?: string;
                  namespace?: any;
                  summand?: number;
                  type: "insert";
                  value: any;
                }
              | { aggregateName?: string; key: any; namespace?: any; type: "delete" }
              | {
                  currentKey: any;
                  aggregateName?: string;
                  namespace?: any;
                  newKey: any;
                  newNamespace?: any;
                  summand?: number;
                  type: "replace";
                  value: any;
                }
              | { aggregateName?: string; key: any; namespace?: any; type: "deleteIfExists" }
              | {
                  currentKey: any;
                  aggregateName?: string;
                  namespace?: any;
                  newKey: any;
                  newNamespace?: any;
                  summand?: number;
                  type: "replaceOrInsert";
                  value: any;
                };
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
    };
    inspect: {
      display: FunctionReference<
        "query",
        "internal",
        { aggregateName?: string; namespace?: any },
        any,
        Name
      >;
      dump: FunctionReference<
        "query",
        "internal",
        { aggregateName?: string; namespace?: any },
        string,
        Name
      >;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { aggregateName?: string; namespace?: any; node?: string },
        null,
        Name
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>,
        Name
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          aggregateName?: string;
          namespace?: any;
          root: string;
        }>,
        Name
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { aggregateName?: string; maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null,
        Name
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { aggregateName?: string; key: any; namespace?: any },
        null,
        Name
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { aggregateName?: string; key: any; namespace?: any },
        any,
        Name
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          operation:
            | {
                key: any;
                aggregateName?: string;
                namespace?: any;
                summand?: number;
                type: "insert";
                value: any;
              }
            | { aggregateName?: string; key: any; namespace?: any; type: "delete" }
            | {
                currentKey: any;
                aggregateName?: string;
                namespace?: any;
                newKey: any;
                newNamespace?: any;
                summand?: number;
                type: "replace";
                value: any;
              }
            | { aggregateName?: string; key: any; namespace?: any; type: "deleteIfExists" }
            | {
                currentKey: any;
                aggregateName?: string;
                namespace?: any;
                newKey: any;
                newNamespace?: any;
                summand?: number;
                type: "replaceOrInsert";
                value: any;
              };
        },
        null,
        Name
      >;
      enqueueBatch: FunctionReference<
        "mutation",
        "internal",
        {
          operations: Array<
            | {
                key: any;
                aggregateName?: string;
                namespace?: any;
                summand?: number;
                type: "insert";
                value: any;
              }
            | { aggregateName?: string; key: any; namespace?: any; type: "delete" }
            | {
                currentKey: any;
                aggregateName?: string;
                namespace?: any;
                newKey: any;
                newNamespace?: any;
                summand?: number;
                type: "replace";
                value: any;
              }
            | { aggregateName?: string; key: any; namespace?: any; type: "deleteIfExists" }
            | {
                currentKey: any;
                aggregateName?: string;
                namespace?: any;
                newKey: any;
                newNamespace?: any;
                summand?: number;
                type: "replaceOrInsert";
                value: any;
              }
          >;
        },
        null,
        Name
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { aggregateName?: string; maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null,
        Name
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { aggregateName?: string; key: any; namespace?: any; summand?: number; value: any },
        null,
        Name
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { aggregateName?: string; namespace?: any },
        null,
        Name
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          aggregateName?: string;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null,
        Name
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          aggregateName?: string;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any,
        Name
      >;
    };
  };

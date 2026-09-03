# Changelog

## 0.3.1

- Bump `@convex-dev/batch-worker` to 0.3.3, which includes fixes to reduce
  internal Batch Worker OCC errors.

## 0.3.0

- Add a new queued mode to the Aggregate component that improves performance
  under highly concurrent workloads and provides eventual consistency instead of
  full transactionality.
  - Queued writes: pass `{ async: true }` into aggregate writes to enqueue the
    update instead of applying it in the same transaction. This prevents
    concurrent writers from contending on shared B-tree nodes.
  - Stale reads: pass `{ stale: true }` option into aggregate reads, which reads
    from a stale snapshot without causing OCC conflicts in mutations.
  - Queued and non-queued modes cannot be mixed: a non-stale read or non-async
    write throws when there are queued writes.
  - Use `enqueueBatch` to enqueue several operations with a single call into the
    component.

## 0.2.2

- Update ctx types for convex@1.41+

## 0.2.1

- Allow passing { bounds: { eq: key }}, supporting non-array keys for counts
  when a key is used more than once.
- Asserts that offset is an integer

## 0.2.0

- Adds /test and /\_generated/component.js entrypoints
- Drops commonjs support
- Improves source mapping for generated files
- Changes to a statically generated component API

## 0.1.25

- Add batch API for "sum"

## 0.1.24

- Adds batch APIs for "at" and "count"

## 0.1.23

- Fix inclusive bounds on complex IDs

## 0.1.22

- Fixes `clearAll` and general pagination handling of undefined namespaces

# Changelog

## 0.3.2-alpha.0

- Add component env vars for tuning how the Batch Worker idles, for queued
  workloads that still see OCC errors from writes contending on the worker's run
  state. Left unset, the Batch Worker's own defaults apply and behavior is
  unchanged.
  - `WORKER_IDLE_COOLDOWN_MS` and `WORKER_POLL_INTERVAL_MS` set how long the
    worker polls an empty queue before parking, and how often. Polling through
    the gaps between bursts keeps the worker from parking and being woken, which
    is what makes queued writes contend.
  - `WORKER_SCHEDULE_PING` schedules the ping rather than sending it from the
    queuing mutation, so queuing a write doesn't touch the worker component at
    all. Costs one scheduled function per queued write, so prefer a longer
    cooldown where that will do.

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

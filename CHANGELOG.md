# Changelog

## Unreleased

- Fix: the async-write worker could wedge its queue permanently. `getBatch` sized
  a batch only by the queued payload's bytes, but the cost of applying an
  operation is per-operation btree work. Small operations packed thousands into a
  payload far under the byte budget, and `processBatch` then exceeded the
  mutation execution-time limit. A mutation torn down by a system limit never
  reaches the dead letter queue's catch, so that batch retried on the monitor
  cadence forever, and the permanently non-empty queue made
  `assertNoPendingCommits` reject every synchronous read, every write, and
  `clear`. Batches are now capped by operation count as well as bytes.
- Fix: one failing operation no longer takes down a whole worker batch or applies
  half of a transaction's queued writes. Each queued commit is applied in its own
  sub-transaction, and a commit that throws is rolled back, recorded in a dead
  letter queue with its error, and logged; later commits still drain.

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

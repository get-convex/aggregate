# Example App

You can try out the examples online at:
https://aggregate-component-example.netlify.app/

## To run the examples

Once you have cloned this repo, **from the root of the repo**:

```bash
npm run setup
```

You will need to follow the instructions to setup a Convex project. Once done
you should be able to open the example at `http://localhost:5173/`

## Queued mode

The **Queued mode** switch in the header flips every aggregate in the app
between the two modes described in the
[main README](../README.md#queued-writes):

- **off** (default): aggregate writes update the B-tree in the same transaction
  as the data they're derived from, and reads see them immediately.
- **on**: writes are enqueued with `{ async: true }` and applied by the
  component's batch worker, and reads pass `{ stale: true }` so they read the
  most recently applied snapshot. Writes stop contending with each other, at the
  cost of counts and rankings lagging slightly behind the data.

The mode is one global setting rather than a per-caller argument, because the
aggregate throws if a synchronous read or write happens while queued writes are
still outstanding. `convex/utils/queued.ts` holds the plumbing: the `query` and
`mutation` builders defined there give every function a `ctx.aggregateOpts` to
spread into its aggregate calls. Turning the switch off keeps reading stale
until the batch worker has drained the queue — see `convex/settings.ts`.

# Convex Component: Aggregate

[![npm version](https://badge.fury.io/js/@convex-dev%2Faggregate.svg?)](https://badge.fury.io/js/@convex-dev%2Faggregate)

This Convex component calculates count and sums of values for efficient
aggregation.

Suppose you have a leaderboard of game scores. These are some operations
that the Aggregate component makes easy and efficient, with `O(log(n))`-time
lookups, instead of the `O(n)` that would result from naive usage of
`.collect()` in Convex or `COUNT(*)` in MySQL or Postgres:

1. Count the total number of scores: `aggregate.count(ctx)`
2. Count the number of scores greater than 65: `aggregate.count(ctx, { lower: { key: 65, inclusive: true } })`
3. Find the p95 score: `aggregate.at(ctx, Math.floor(aggregate.count(ctx) * 0.95))`
4. Find the overall average score: `aggregate.sum(ctx) / aggregate.count(ctx)`
5. Find the ranking for a score of 65 in the leaderboard: `aggregate.offsetOf(ctx, 65)`
6. Find the average score for an individual user:

```ts
const bounds = { lower: { key: username, inclusive: true }, upper: { key: username, inclusive: true } };
const avgScoreForUser = aggregateByUser.sum(ctx, bounds) / aggregateByUser.count(ctx, bounds);
```

# What are Aggregates for?

With plain Convex indexes, you can insert new documents and you can paginate
through all documents. But you don't want to lose sight of the forest for the
trees. Sometimes you want big-picture data that encompases many of your
individual data points, and that's where aggregates come in.

The Aggregates component keeps a data structure with denormalized counts and
sums. It's effectively a key-value store which is sorted by the key, and where
you can count values that lie between two keys.

The keys may be arbitrary Convex values, so you can choose to sort your data by:

1. a number, like a leaderboard score
2. a string, like user ids -- so you can count the data owned by each user
3. an [index key](https://stack.convex.dev/pagination#whats-an-index-key), for
   full pagination support
4. nothing, use `key=null` for everything if you just want a counter (see Randomize below)

## More examples

- In a messaging app, how many messages have been sent within the past month?
- Offset-based pagination: view the 100th page of photos, where each page has
  50 photos.
- Look up a random song in a table, as the next song to play.

# How to install

See `example/` for a working demo.

1. Install the Aggregate component:

```bash
npm install @convex-dev/aggregate
```

2. Create a `convex.config.ts` file in your app's `convex/` folder and install the component by calling `use`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();
app.use(aggregate);
export default app;
```

Note you can aggregate multiple tables, multiple sort keys, or multiple values.
You would do this by using multiple aggregate components, which each have
their own name.

```ts
app.use(aggregate, { name: "aggregateUsers" });
app.use(aggregate, { name: "aggregateTeams" });
```

# How to Use

## Write to the aggregate data structure

```ts
import { components } from "./_generated/api";
import { Aggregate } from "@convex-dev/aggregate";
// The first generic parameter (number in this case) is for the sort key.
// The second generic parameter (Id<"mytable"> in this case) is a unique
// identifier for each aggregated item.
const aggregate = new Aggregate<number, Id<"mytable">>(components.aggregate);

// within a mutation, add values to be aggregated
await aggregate.insert(ctx, key, id);
// or delete values that were previously added
await aggregate.delete(ctx, key, id);
// or update values
await aggregate.replace(ctx, oldKey, newKey, id);
```

If you are aggregating data from a table, e.g. you are counting documents in
the "mytable" table you will want to modify the aggregate alongside the table

```ts
const id = await ctx.db.insert("mytable", { name });
await aggregate.insert(ctx, name, id);
```

Since these are happening in a
[mutation](https://docs.convex.dev/functions/mutation-functions#transactions),
you can rest assured that the table and its aggregate will update atomically.

However, it's important that *every* mutation modifying the table also updates
the associated aggregate. If they get out of sync then computed aggregates might
be incorrect.

> If you want to automatically update the aggregates based on changes to a table,
> [you can use](https://stack.convex.dev/custom-functions)
> `customFunction`s to wrap `ctx.db` in mutations. We intend to make this flow
> simpler; reach out in [Discord](https://convex.dev/community) to let us know if
> you're interested.

## Calculate aggregates

```ts
// convex/myfunctions.ts
// then in your queries and mutations you can do
const tableCount = await aggregate.count(ctx);
// or any of the other examples listed above.
```

See more examples in `example/convex/leaderboard.ts`.

### Running examples

1. Clone this repo.
2. `cd aggregate/example`
3. `npm run dev` and create a new project
4. The dashboard should open and you can run functions like
   `leaderboard:addScore` and `leaderboard:userAverageScore`.

## Total Count and Randomization

If you don't need the ordering or summing behavior of `Aggregate`, there's a
simpler interface you can use: `Randomize`. 

```ts
import { components } from "./_generated/api";
import { Randomize } from "@convex-dev/aggregate";
const randomize = new Randomize<Id<"mytable">>(components.aggregate);

// in a mutation, insert a document to be aggregated.
await randomize.insert(ctx, id);
// in a mutation, delete a document to be aggregated.
await randomize.delete(ctx, id);

// in a query, get the total document count.
const totalCount = await randomize.count(ctx);
// get a random document's id.
const randomId = await randomize.random(ctx);
```

See more examples in `example/convex/shuffle.ts`, including a paginated shuffle.

## Offset-based pagination

Convex supports infinite-scroll pagination which is
[reactive](https://stack.convex.dev/fully-reactive-pagination) so you never have
to worry about items going missing from your list. But sometimes you want to
display separate pages of results on separate pages of your app.

You can pick a page size and jump to any page once you have `Aggregate` to map
from offset to an index key.

In this example, if `offset` is 100 and `numItems` is 10, we get the hundredth
`_creationTime` (in ascending order) and starting there we get the next ten
documents.

```ts
export const pageOfPhotos({
  args: { offset: v.number(), numItems: v.number() },
  handler: async (ctx, { offset, numItems }) => {
    const { key } = await photos.at(ctx, offset);
    return await ctx.db.query("photos")
      .withIndex("by_creation_time", q=>q.gte("_creationTime", key))
      .take(numItems);
  },
});
```

See the full example in `example/convex/photos.ts`.

## Attach Aggregate to an existing table

Adding aggregation to an existing table requires a
[migration](https://stack.convex.dev/intro-to-migrations). There are several
ways to perform migrations, but here's an overview of one way:

1. When the data changes on the live path, use the `Aggregate` methods
   `insertIfDoesNotExist`, `deleteIfExists`, and `replaceOrInsert` to update the
   aggregation data structure. These methods act like `insert`, `delete`, and
   `replace` respectively, except they don't care whether the document currently
   exists.
2. Make sure you have covered all places where the data can change, and deploy
   this code change. If some place was missed, the aggregates may get out of
   sync with the source of truth. You can call `aggregate.clear(ctx)` to reset
   the aggregate data structure and start over.
3. Use a paginated background migration to walk all existing data and call
   `replaceOrInsert`.
4. Now all of the data is represented in the `Aggregate`, you can start calling
   read methods like `aggregate.count(ctx)` and you can replace
   `insertIfDoesNotExist` -> `insert`, `deleteIfExists` -> `delete` and
   `replaceOrInsert` -> `replace`.

# 🧑‍🏫 What is Convex?

[Convex](https://convex.dev) is a hosted backend platform with a
built-in database that lets you write your
[database schema](https://docs.convex.dev/database/schemas) and
[server functions](https://docs.convex.dev/functions) in
[TypeScript](https://docs.convex.dev/typescript). Server-side database
[queries](https://docs.convex.dev/functions/query-functions) automatically
[cache](https://docs.convex.dev/functions/query-functions#caching--reactivity) and
[subscribe](https://docs.convex.dev/client/react#reactivity) to data, powering a
[realtime `useQuery` hook](https://docs.convex.dev/client/react#fetching-data) in our
[React client](https://docs.convex.dev/client/react). There are also clients for
[Python](https://docs.convex.dev/client/python),
[Rust](https://docs.convex.dev/client/rust),
[ReactNative](https://docs.convex.dev/client/react-native), and
[Node](https://docs.convex.dev/client/javascript), as well as a straightforward
[HTTP API](https://docs.convex.dev/http-api/).

The database supports
[NoSQL-style documents](https://docs.convex.dev/database/document-storage) with
[opt-in schema validation](https://docs.convex.dev/database/schemas),
[relationships](https://docs.convex.dev/database/document-ids) and
[custom indexes](https://docs.convex.dev/database/indexes/)
(including on fields in nested objects).

The
[`query`](https://docs.convex.dev/functions/query-functions) and
[`mutation`](https://docs.convex.dev/functions/mutation-functions) server functions have transactional,
low latency access to the database and leverage our
[`v8` runtime](https://docs.convex.dev/functions/runtimes) with
[determinism guardrails](https://docs.convex.dev/functions/runtimes#using-randomness-and-time-in-queries-and-mutations)
to provide the strongest ACID guarantees on the market:
immediate consistency,
serializable isolation, and
automatic conflict resolution via
[optimistic multi-version concurrency control](https://docs.convex.dev/database/advanced/occ) (OCC / MVCC).

The [`action` server functions](https://docs.convex.dev/functions/actions) have
access to external APIs and enable other side-effects and non-determinism in
either our
[optimized `v8` runtime](https://docs.convex.dev/functions/runtimes) or a more
[flexible `node` runtime](https://docs.convex.dev/functions/runtimes#nodejs-runtime).

Functions can run in the background via
[scheduling](https://docs.convex.dev/scheduling/scheduled-functions) and
[cron jobs](https://docs.convex.dev/scheduling/cron-jobs).

Development is cloud-first, with
[hot reloads for server function](https://docs.convex.dev/cli#run-the-convex-dev-server) editing via the
[CLI](https://docs.convex.dev/cli),
[preview deployments](https://docs.convex.dev/production/hosting/preview-deployments),
[logging and exception reporting integrations](https://docs.convex.dev/production/integrations/),
There is a
[dashboard UI](https://docs.convex.dev/dashboard) to
[browse and edit data](https://docs.convex.dev/dashboard/deployments/data),
[edit environment variables](https://docs.convex.dev/production/environment-variables),
[view logs](https://docs.convex.dev/dashboard/deployments/logs),
[run server functions](https://docs.convex.dev/dashboard/deployments/functions), and more.

There are built-in features for
[reactive pagination](https://docs.convex.dev/database/pagination),
[file storage](https://docs.convex.dev/file-storage),
[reactive text search](https://docs.convex.dev/text-search),
[vector search](https://docs.convex.dev/vector-search),
[https endpoints](https://docs.convex.dev/functions/http-actions) (for webhooks),
[snapshot import/export](https://docs.convex.dev/database/import-export/),
[streaming import/export](https://docs.convex.dev/production/integrations/streaming-import-export), and
[runtime validation](https://docs.convex.dev/database/schemas#validators) for
[function arguments](https://docs.convex.dev/functions/args-validation) and
[database data](https://docs.convex.dev/database/schemas#schema-validation).

Everything scales automatically, and it’s [free to start](https://www.convex.dev/plans).

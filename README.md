# Convex Component: Aggregate

[![npm version](https://img.shields.io/npm/v/@convex-dev/aggregate.svg)](https://www.npmjs.com/package/@convex-dev/aggregate)

This Convex component calculates count and sums of values for efficient
aggregation.

Suppose you have a leaderboard of game scores. These are some operations
that the Aggregate component makes easy and efficient, with `O(log(n))`-time
lookups, instead of the `O(n)` that would result from naive usage of
`.collect()` in Convex or `COUNT(*)` in MySQL or Postgres:

1. Count the total number of scores: `aggregate.count(ctx)`
2. Count the number of scores greater than 65: `aggregate.count(ctx, { lower: { key: 65, inclusive: false } })`
3. Find the p95 score: `aggregate.at(ctx, Math.floor(aggregate.count(ctx) * 0.95))`
4. Find the overall average score: `aggregate.sum(ctx) / aggregate.count(ctx)`
5. Find the ranking for a score of 65 in the leaderboard: `aggregate.offsetOf(ctx, 65)`

Additionally, you can partition your data set (also known as sharding or
namespacing), and aggregate within each partition.

6. Find the average score for an individual user:

```ts
// aggregateScoreByUser is the leaderboard scores partitioned by username.
const bounds = { prefix: [username] };
const highScoreForUser = aggregateScoreByUser.max(ctx, bounds);
const avgScoreForUser = aggregateScoreByUser.sum(ctx, bounds) / aggregateScoreByUser.count(ctx, bounds);
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
3. an [index key](https://stack.convex.dev/pagination#whats-an-index-key)
4. nothing, use `key=null` for everything if you
    [just want a counter](#total-count-and-randomization).

You can use sorting to partition your data set. If you want to keep track
of multiple games with scores for each user, use a tuple of
`[game, username, score]`
as the key. Then you can bound your queries with a prefix of the key, like

1. `aggregateByGame.count(ctx, { prefix: [game] })` counts how many times
    a given game has been played
2. `aggregateByGame.count(ctx, { prefix: [game, username] })` counts how many
    times a given user has played a given game.
3. `aggregateByGame.max(ctx, { prefix: [game, username] })` returns the high
    score for a given user in a given game.

Pay attention to the sort order when aggregating. While
`aggregateByGame.max(ctx, { prefix: [game] })` looks like it might give the
highest score for a game, it actually gives the user with the highest username
who has played that game (like "Zach"). To get the highest score for a game, you
would need to aggregate with key `[game, score]`.

## More examples

The Aggregate component can efficiently calculate all of these:

- In a messaging app, how many messages have been sent within the past month?
- Offset-based pagination: view the 14th page of photos, where each page has
  50 photos.
- Look up a random song in a playlist, as the next song to play.

# How to install

See [`example/`](example/convex/) for a working demo.

1. Install the Aggregate component:

```bash
npm install @convex-dev/aggregate
```

2. Create a [`convex.config.ts`](example/convex/convex.config.ts) file in your
  app's `convex/` folder and install the component by calling `use`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();
app.use(aggregate);
export default app;
```

Note you can aggregate multiple tables, multiple sort keys, or multiple values.
You would do this by using the `aggregate` component multiple times, giving each
usage its own name.

```ts
app.use(aggregate, { name: "aggregateScores" });
app.use(aggregate, { name: "aggregateByGame" });
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
// if you want to use `.sum` to aggregate sums of values, insert with a summand
await aggregate.insert(ctx, key, id, summand);
// or delete values that were previously added
await aggregate.delete(ctx, key, id);
// or update values
await aggregate.replace(ctx, oldKey, newKey, id);
```

If you are aggregating data from a table, e.g. you are counting documents in
the "leaderboard" table you will want to modify the aggregate alongside the table

```ts
const id = await ctx.db.insert("leaderboard", { username, score });
await aggregate.insert(ctx, score, id, score);
```

Since these are happening in a
[mutation](https://docs.convex.dev/functions/mutation-functions#transactions),
you can rest assured that the table and its aggregate will update atomically.

However, it's important that *every* mutation modifying the table also updates
the associated aggregate. If they get out of sync then computed aggregates might
be incorrect. See [below](#attach-aggregate-to-an-existing-table).

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

See more examples in
[`example/convex/leaderboard.ts`](example/convex/leaderboard.ts), and see the
docstrings on [the Aggregate class](src/client/index.ts).

### Running examples

1. Clone this repo.
2. `cd aggregate/example`
3. `npm run dev` and create a new project
4. The dashboard should open and you can run functions like
   `leaderboard:addScore` and `leaderboard:userAverageScore`.

## Total Count and Randomization

If you don't need the ordering, partitioning, or summing behavior of
`Aggregate`, there's a simpler interface you can use: `Randomize`. 

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

See more examples in [`example/convex/shuffle.ts`](example/convex/shuffle.ts),
including a paginated random shuffle of some music.

## Offset-based pagination

Convex supports infinite-scroll pagination which is
[reactive](https://stack.convex.dev/fully-reactive-pagination) so you never have
to worry about items going missing from your list. But sometimes you want to
display separate pages of results on separate pages of your app.

For this example, imagine you have a table of photos

```ts
defineSchema({
  photos: defineTable({
    url: v.string(),
  }),
})
```

And an aggregate defined with key as `_creationTime`.

```ts
// convex.config.ts
app.use(aggregate, { name: "photos" });

// photos.ts
const photos = new Aggregate<number, Id<"photos">>(components.photos);

export const addPhoto = mutation({
  args: {
    url: v.string(),
  },
  returns: v.id("photos"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("photos", { url: args.url });
    const photo = (await ctx.db.get(id))!;
    await photos.insert(ctx, photo._creationTime, id);
    return id;
  },
});
```

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

See the full example in [`example/convex/photos.ts`](example/convex/photos.ts).

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
   sync with the source of truth. If that happens, see
   [below](#repair-incorrect-aggregates).
3. Use a paginated background migration to walk all existing data and call
   `insertIfDoesNotExist`.
4. Now all of the data is represented in the `Aggregate`, you can start calling
   read methods like `aggregate.count(ctx)` and you can replace
   `insertIfDoesNotExist` -> `insert`, `deleteIfExists` -> `delete` and
   `replaceOrInsert` -> `replace`.

## Repair incorrect aggregates

If some mutation or direct write in the Dashboard updated the source of truth
data without writing to the aggregate, they can get out of sync and the
returned aggregates may be incorrect.

The simplest way to fix is to start over. Either call
`await aggregate.clear(ctx)` or rename the component like
`app.use(aggregate, { name: "newName" })` which will reset it to be empty. Then
follow the instructions from [above](#attach-aggregate-to-an-existing-table).

There is an alternative which doesn't clear the aggregates: compare the source
of truth to the aggregate table. You can use `db.query("mytable").paginate()`
on your Convex table and `aggregate.paginate()` on the aggregate. Update the
aggregates based on the diff of these two paginated data streams.

# Reactivity and Atomicity

Like all Convex queries, aggregates are
[reactive](https://docs.convex.dev/tutorial/reactor#realtime-is-all-the-time),
and updating them is [transactional](https://www.convex.dev/database).

If aggregated data updates infrequently, everything runs smoothly.
However, if aggregated data updates frequently, the reactivity and atomicity can
cause issues: reactive queries can rerun often, and mutations can slow down.

## Reactivity

Reactivity means if you query an aggregate, like a count, sum, rank,
offset-based page, etc. your UI will automatically update to reflect updates.

If someone gets a new high score, everyone else's leaderboard will show them
moving down, and the total count of scores will increase.
If I add a new song, it will automatically get shuffled into the
music album.

Don't worry about polling to get new results. Don't worry about data needing a
few seconds to propagate through the system. And you don't need to refresh
your browser. As soon as the data is updated, the aggregates are updated
everywhere, including the user's UI.

## Transactions

Transactionality means if you do multiple writes in the same mutation, like
adding data to a table and inserting it into an aggregate, those operations
are performed together. No query or mutation can observe a race condition where
the data exists in the table but not in the aggregate. And if two mutations
insert data into an aggregate, the count will go up by two, even if the
mutations are running in parallel.

There's a special transactional property of components that is even better than
the Convex guarantees you're used to. If you were to keep a denormalized count
with a normal Convex mutation, you'll notice that the TypeScript can run with
various orderings, messing up the final result.

```ts
// You might try to do this before experiencing the wonders of the Aggregate component.
async function increment(ctx: MutationCtx) {
  const doc = (await ctx.query("count").unique())!;
  await ctx.db.patch(doc._id, { value: doc.value + 1 });
}
export const addTwo = mutation({
  handler: async (ctx) => {
    await Promise.all([
      increment(ctx),
      increment(ctx),
    ]);
  },
});
```

When you call the `addTwo` mutation, the count will increase by... one.
That's because TypeScript runs both `db.query`s before running the `db.patch`s.
But with the Aggregate component, the count goes up by two as intended. That's
because component operations are atomic.

```ts
export const addTwo = mutation({
  handler: async (ctx) => {
    await Promise.all([
      aggregate.insert(ctx, "some key", "a"),
      aggregate.insert(ctx, "other key", "b"),
    ]);
  },
});
```

You may have noticed that `Aggregate` methods can be called from actions, unlike
`ctx.db`. This was an accident, but it works, so let's call it a feature! In
particular, each `Aggregate` method called from any context, including from an
action, will be atomic within itself. However, we recommend calling the methods
from a mutation or query so they can be transactional with other database
reads and writes.

Reactivity and transactionality can be amazing for user experience, but if you
observe issues with queries rerunning often or mutations slowing down or
throwing errors, you may need to learn about the internals of the aggregate
component. Specifically, how reads and writes intersect.

## Read dependencies and writes

When a query calls `await aggregate.count(ctx)`, this depends on
the entire aggregate data structure. When any mutation changes the data
structure, i.e. `insert`, `delete`, or `replace`, the query reruns and sends new
results to the frontend. This is necessary to keep the frontend looking snappy,
but it can cause large function call and bandwidth usage on Convex.

When a *mutation* calls `await aggregate.count(ctx)`, then this mutation needs
to [run transactionally](https://docs.convex.dev/database/advanced/occ)
relative to other mutations. Another mutation that does an `insert`, `delete`,
or `replace` can cause an [OCC conflict](https://docs.convex.dev/error#1).

In order to calculate in `O(log(n))` time, the aggregate component stores
denormalized counts in an internal data structure. Data points with nearby keys
may have their counts accumulated in one place.

Imagine the leaderboard aggregate defined with key=`[username, score]`. Users
"Laura" and "Lauren" have adjacent keys, so there is a node internal to the
Aggregate component that includes the counts of Laura and Lauren combined.
If Laura is looking at her own high score, this involves reading from the
internal node shared with Lauren. So when Lauren gets a new high score,
Laura's query reruns (but its result doesn't change). And when Laura and Lauren
both get new scores at the same time, their mutations will run slower to make
the change to the internal node transactional.

Corollary: if a table's aggregate uses a key on `_creationTime`,
each new data point will be added to the same part of the data structure (the
end), because `_creationTime` keeps increasing. Therefore all inserts will
wait for each other and no mutations can run in parallel.

## Put bounds on aggregated data

To reduce the read dependency footprint of your query, you can partition your
aggregate space and make sure you're using `bounds` whenever possible. Examples:

```ts
// This query only reads scores between 95 and 100, so in a query it only reruns
// when a score in that range changes, and in a mutation it only conflicts with
// mutations that modify a score in that range.
await aggregateByScore.count(ctx, {
  lower: { key: 95, inclusive: false },
  upper: { key: 100, inclusive: true },
});

// This query only reads data from a specific user, so it will only rerun or
// conflict when a mutation modifies that user.
await aggregateUserByScore.count(ctx,
  { prefix: [username] },
);
```

## Lazy aggregation

The aggregate data structure internally denormalizes counts so they
can be calculated efficiently by only reading a few documents instead of every
document in your table.

However, this isn't always required: we can trade off speed and database
bandwidth for reduced impact of writes.

By default, the root aggregation document is lazy; it doesn't store a count.
This means `aggregate.count(ctx)` has to look at several documents instead of
just one, but it also means that an insert at a very small key won't intersect
with a write or read on a very large key.

If you want to maximize query speed without worrying about conflicts, e.g.
because the data changes infrequently but queries are frequent, you can turn
off the default behavior with `aggregate.clear(ctx, 16, false)`, setting
`rootLazy=false`.

Another way to optimize lazy aggregation is to increase the `maxNodeSize` of the
aggregate data structure. e.g. if the root is lazy and `maxNodeSize` is the
default of 16, that means each write updates some document that accumulates
1/16th of the entire data structure. So each write will intersect with 1/16th of
all other writes, and reads may spuriously rerun 1/16th of the time. To increase
`maxNodeSize`, run `aggregate.clear(ctx, maxNodeSize)`.

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

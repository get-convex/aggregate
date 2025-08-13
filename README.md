# Convex Component: Aggregate

[![npm version](https://img.shields.io/npm/v/@convex-dev/aggregate.svg)](https://www.npmjs.com/package/@convex-dev/aggregate)

<!-- START: Include on https://convex.dev/components -->

This Convex component calculates count and sums of values for efficient
aggregation.

[![Efficient COUNT, SUM, MAX with the Aggregate Component](https://thumbs.video-to-markdown.com/9c06ce06.jpg)](https://youtu.be/YD3nW_PtHWA)

Suppose you have a leaderboard of game scores. These are some operations
that the Aggregate component makes easy and efficient:

1. Count the total number of scores: `aggregate.count(ctx)`
2. Count the number of scores greater than 65: `aggregate.count(ctx, { bounds: { lower: { key: 65, inclusive: false } } })`
3. Find the p95 score: `aggregate.at(ctx, Math.floor(aggregate.count(ctx) * 0.95))`
4. Find the overall average score: `aggregate.sum(ctx) / aggregate.count(ctx)`
5. Find the ranking for a score of 65 in the leaderboard: `aggregate.indexOf(ctx, 65)`
6. Find the average score for an individual user. You can define another aggregate
   grouped by user and aggregate within each:

```ts
// aggregateScoreByUser is the leaderboard scores grouped by username.
const bounds = { prefix: [username] };
const highScoreForUser = await aggregateScoreByUser.max(ctx, { bounds });
const avgScoreForUser =
  (await aggregateScoreByUser.sum(ctx, { bounds })) /
  (await aggregateScoreByUser.count(ctx, { bounds }));
// It still enables adding or averaging all scores across all usernames.
const globalAverageScore =
  (await aggregateScoreByUser.sum(ctx)) /
  (await aggregateScoreByUser.count(ctx));
```

7. Alternatively, you can define an aggregate with separate namespaces,
   and do the same query. This method increases throughput because a user's data
   won't interfere with other users. However, you lose the ability to aggregate
   over all users.

```ts
const forUser = { namespace: username };
const highScoreForUser = await aggregateScoreByUser.max(ctx, forUser);
const avgScoreForUser =
  (await aggregateScoreByUser.sum(ctx, forUser)) /
  (await aggregateScoreByUser.count(ctx, forUser));
```

The Aggregate component provides `O(log(n))`-time lookups, instead of the `O(n)`
that would result from naive usage of `.collect()` in Convex or `COUNT(*)` in MySQL or Postgres.

## Examples

## What are Aggregates for?

With plain Convex indexes, you can insert new documents and you can paginate
through all documents. But sometimes you want big-picture data that encompases
many of your individual data points, without having to fetch them all.
That's where aggregates come in.

The Aggregates component keeps a data structure with denormalized counts and
sums. It's effectively a key-value store which is sorted by the key, and where
you can count values and number of keys that lie between two keys.

The keys may be arbitrary Convex values, so you can choose to sort your data by:

1. A number, like a leaderboard score
2. A string, like user ids -- so you can count the data owned by each user
3. An [index key](https://stack.convex.dev/pagination#whats-an-index-key)
4. Nothing, use `key=null` for everything if you just want
   [a total count, such as for random access](#total-count-and-randomization).

### Grouping

You can use sorting to group your data set.

If you want to keep track of multiple games with scores for each user,
use a tuple of `[game, username, score]` as the key.
Then you can bound your queries with a prefix of the key:

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

To support different sorting and partitioning keys, you can define multiple
instances. See [below](#defining-multiple-aggregates) for details.

If you separate your data via the `sortKey` and `prefix` bounds, you can look at
your data from any altitude. You can do a global `count` to see how many total
data points there are, or you can zero in on an individual group of the data.

However, there's a tradeoff: nearby data points can interfere with each other
in the internal data structure, reducing throughput. See
[below](#read-dependencies-and-writes) for more details. To avoid interference,
you can use Namespaces.

### Namespacing

If your data is separated into distinct partitions, and you don't need to
aggregate between partitions, then you can put each partition into its own
namespace. Each namespace gets its own internal data structure.

If your app has multiple games, it's not useful to aggregate scores across
different games. The scoring system for chess isn't related to the scoring
system for football. So we can namespace our scores based on the game.

Whenever we aggregate scores, we _must_ specify the namespace.
On the other hand, the internal aggregation data structure can keep the scores
separate and keep throughput high.

Here's how you would create the aggregate we just described:

```ts
const leaderboardByGame = new TableAggregate<{
  Namespace: Id<"games">;
  Key: number;
  DataModel: DataModel;
  TableName: "scores";
}>(components.leaderboardByGame, {
  namespace: (doc) => doc.gameId,
  sortKey: (doc) => doc.score,
});
```

And whenever you use this aggregate, you specify the namespace.

```ts
const footballHighScore = await leaderboardByGame.max(ctx, {
  namespace: footballId,
});
```

See an example of a namespaced aggregate in
[example/convex/photos.ts](./example/convex/photos.ts).

### More examples

The Aggregate component can efficiently calculate all of these:

- In a messaging app, how many messages have been sent within the past month?
- [Offset-based pagination](#offset-based-pagination): view the 14th page of photos,
  where each page has 50 photos.
- [Random access](#total-count-and-randomization): Look up a random song in a playlist, as the next song to play.

Try it out: https://aggregate-component-example.netlify.app/

## Pre-requisite: Convex

You'll need an existing Convex project to use the component.
Convex is a hosted backend platform, including a database, serverless functions,
and a ton more you can learn about [here](https://docs.convex.dev/get-started).

Run `npm create convex` or follow any of the [quickstarts](https://docs.convex.dev/home) to set one up.

## Installation

See [`example/`](./example/convex/) for a working demo.

1. Install the Aggregate component:

```bash
npm install @convex-dev/aggregate
```

2. Create a [`convex.config.ts`](./example/convex/convex.config.ts) file in your
   app's `convex/` folder and install the component by calling `use`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(aggregate);
export default app;
```

### Defining multiple aggregates

You can aggregate multiple tables, multiple sort keys, or multiple values, but
you need to make an instance of the aggregate component for each.

You do this by using the `aggregate` component multiple times, giving each
usage its own name.

```ts
app.use(aggregate, { name: "aggregateScores" });
app.use(aggregate, { name: "aggregateByGame" });
```

You then use the named aggregate when initializing the `TableAggregate` as we'll
see below, using `components.aggregateScores` instead of `components.aggregate`.

## Usage

### Write to the aggregate data structure

Usually you want to aggregate data in a Convex table.
If you're aggregating data that's not in a table, you can use the
[lower-level API](#aggregate-without-a-table).

For table-based data, you can use the `TableAggregate` to define how table data
will be sorted and summed in the aggregate component.

```ts
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { mutation as rawMutation } from "./_generated/server";
import { TableAggregate } from "@convex-dev/aggregate";

const aggregate = new TableAggregate<{
  Key: number;
  DataModel: DataModel;
  TableName: "mytable";
}>(components.aggregate, {
  sortKey: (doc) => doc._creationTime, // Allows querying across time ranges.
  sumValue: (doc) => doc.value, // The value to be used in `.sum` calculations.
});
```

Pick your key as described [above](#what-are-aggregates-for). For example,
here's how you might define `aggregateByGame`, as an aggregate on the "scores"
table:

```ts
const aggregateByGame = new TableAggregate<{
  Namespace: Id<"games">;
  Key: [string, number];
  DataModel: DataModel;
  TableName: "leaderboard";
}>(components.aggregateByGame, {
  namespace: (doc) => doc.gameId,
  sortKey: (doc) => [doc.username, doc.score],
});
```

When the table changes, you should update the aggregate as well, in the same
mutation.

```ts
// When you insert into the table, call `aggregate.insert`
const id = await ctx.db.insert("mytable", { foo, bar });
const doc = await ctx.db.get(id);
await aggregate.insert(ctx, doc!);

// If you update a document, use `aggregate.replace`
const oldDoc = await ctx.db.get(id);
await ctx.db.patch(id, { foo });
const newDoc = await ctx.db.get(id);
await aggregate.replace(ctx, oldDoc!, newDoc!);

// And if you delete a document, use `aggregate.delete`
const oldDoc = await ctx.db.get(id);
await ctx.db.delete(id);
await aggregate.delete(ctx, oldDoc!);
```

It's important that _every_ modification to the table also updates
the associated aggregate. See
[tips](#automatically-update-aggregate-when-table-changes) below.

Note that
[Convex mutations are atomic](https://docs.convex.dev/functions/mutation-functions#transactions),
so you don't need to worry about race
conditions where the document is written but the aggregate isn't, and you don't
need to worry about a query reading a document that isn't in the aggregate yet.

If the table already has data before attaching the aggregate,
[run a migration to backfill](#attach-aggregate-to-an-existing-table).

### Calculate aggregates

Now that your Aggregate component has all of the data from your table, you can
call any of the methods on your instance to aggregate data.

```ts
// convex/myfunctions.ts
// then in your queries and mutations you can do
const tableCount = await aggregateByGame.count(ctx);
// or any of the other examples listed above.
```

See more examples in
[`example/convex/leaderboard.ts`](example/convex/leaderboard.ts), and see the
docstrings on [the Aggregate class](src/client/index.ts).

## Example use-cases

To run the examples:

1. Clone this repo.
2. `npm i && cd aggregate/example && npm i`
3. `npm run dev` and create a new project
4. The dashboard should open and you can run functions like
   `leaderboard:addScore` and `leaderboard:userAverageScore`.

Or play with them online at: https://aggregate-component-example.netlify.app/

### Total Count and Randomization

If you don't need the ordering, partitioning, or summing behavior of
`TableAggregate`, you can set `namespace: undefined` and `sortKey: null`.

```ts
const randomize = new TableAggregate<{
  Key: null;
  DataModel: DataModel;
  TableName: "mytable";
}>(components.aggregate, { sortKey: (doc) => null });
```

Without sorting, all documents are ordered by their `_id` which is generally
random. And you can look up the document at any index to find one at random
or shuffle the whole table.

See more examples in [`example/convex/shuffle.ts`](example/convex/shuffle.ts),
including a paginated random shuffle of some music.

### Offset-based pagination

Convex supports infinite-scroll pagination which is
[reactive](https://stack.convex.dev/fully-reactive-pagination) so you never have
to worry about items going missing from your list. But sometimes you want to
display separate pages of results on separate pages of your app.

For this example, imagine you have a table of photo albums.

```ts
// convex/schema.ts
defineSchema({
  photos: defineTable({ album: v.string(), url: v.string() }).index(
    "by_album_creation_time",
    ["album"]
  ),
});
```

And an aggregate defined with key as `_creationTime` and namespace as `album`.

```ts
// convex/convex.config.ts
app.use(aggregate, { name: "photos" });

// convex/photos.ts
const photos = new TableAggregate<{
  Namespace: string; // album name
  Key: number; // creation time
  DataModel: DataModel;
  TableName: "photos";
}>(components.photos, {
  namespace: (doc) => doc.album,
  sortKey: (doc) => doc._creationTime,
});
```

You can pick a page size and jump to any page once you have `TableAggregate` to
map from offset to an index key.

In this example, if `offset` is 100 and `numItems` is 10, we get the hundredth
`_creationTime` (in ascending order) and starting there we get the next ten
documents. In this way we can paginate through the whole photo album.

```ts
export const pageOfPhotos({
  args: { offset: v.number(), numItems: v.number(), album: v.string() },
  handler: async (ctx, { offset, numItems, album }) => {
    const { key } = await photos.at(ctx, offset, { namespace: album });
    return await ctx.db.query("photos")
      .withIndex("by_album_creation_time", q=>q.eq("album", album).gte("_creationTime", key))
      .take(numItems);
  },
});
```

See the full example in [`example/convex/photos.ts`](example/convex/photos.ts).

### Aggregate without a table

Often you're aggregating over a table of data, but sometimes you want to
aggregate data that isn't stored anywhere else. For that, you can use the
`DirectAggregate` interface, which is like `TableAggregate` except you handle
insert, delete, and replace operations yourself.

```ts
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { DirectAggregate } from "@convex-dev/aggregate";
// Note the `id` should be unique to be a tie-breaker in case two data points
// have the same key.
const aggregate = new DirectAggregate<{ Key: number; Id: string }>(
  components.aggregate
);

// within a mutation, add values to be aggregated
await aggregate.insert(ctx, { key, id });
// if you want to use `.sum` to aggregate sums of values, insert with a sumValue
await aggregate.insert(ctx, { key, id, sumValue });
// or delete values that were previously added
await aggregate.delete(ctx, { key, id });
// or update values
await aggregate.replace(ctx, { key: oldKey, id }, { key: newKey });
```

See [`example/convex/stats.ts`](example/convex/stats.ts) for an example.

## Operations

You've set up your aggregate. Now let's see how to backfill it to account for
existing data, keep the data in sync with mutations, or repair it when the
data gets out of sync.

### Attach Aggregate to an existing table

Adding aggregation to an existing table requires a
[migration](https://stack.convex.dev/intro-to-migrations). There are several
ways to perform migrations, but here's an overview of one way:

1. Use `insertIfDoesNotExist`/`replaceOrInsert`/`deleteIfExists` in place of
   `insert`/`replace`/`delete` (or `idempotentTrigger` in place of `trigger`)
   to update items in the aggregate. These methods act the same, except they
   work even if the aggregate component isn't in sync with the table.
2. Deploy this code change, so the live path writing documents also write to the
   aggregate component.
3. Use a paginated background
   [migration](https://www.npmjs.com/package/@convex-dev/migrations)
   to walk all existing data and call `insertIfDoesNotExist`. In the example,
   you would run `runAggregateBackfill` in
   [leaderboard.ts](example/convex/leaderboard.ts).
4. Now all of the data is represented in the `Aggregate`, you can start calling
   read methods like `aggregate.count(ctx)` and you can change the write methods
   back (`insertIfDoesNotExist` -> `insert` etc.).

### Automatically update aggregate when table changes

It's important that _every_ modification to the table also updates
the associated aggregate. If they get out of sync then computed aggregates might
be incorrect. Then you might have to [fix them](#repair-incorrect-aggregates).

There are three ways to go about keeping data in sync:

1. Be careful to always update the `aggregate` in any mutation that updates the
   source-of-truth table.
2. \[Recommended\] Place all writes to a table in separate TypeScript functions,
   and always call these functions from mutations instead of writing to the db
   directly. This method is recommended, because it encapsulates the logic for
   updating a table, while still keeping all operations explicit. For example,

```ts
// Example of a mutation that calls `insertScore`.
export const playAGame = mutation(async (ctx) => {
  ...
  await insertScore(ctx, gameId, user1, user1Score);
  await insertScore(ctx, gameId, user2, user2Score);
});

// All inserts to the "scores" table go through this function.
async function insertScore(ctx, gameId, username, score) {
  const id = await ctx.db.insert("scores", { gameId, username, score });
  await doc = await ctx.db.get(id);
  await aggregateByGame.insert(ctx, doc!);
}
```

3. Register a
   [`Trigger`](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md#triggers),
   which automatically runs code when a mutation changes the data in a table.

```ts
// Triggers hook up writes to the table to the TableAggregate.
const triggers = new Triggers<DataModel>();
triggers.register("mytable", aggregate.trigger());
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

The [`example/convex/photos.ts`](example/convex/photos.ts) example uses
a trigger.

### Repair incorrect aggregates

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

## Reactivity and Atomicity

Like all Convex queries, aggregates are
[reactive](https://docs.convex.dev/tutorial/reactor#realtime-is-all-the-time),
and updating them is [transactional](https://www.convex.dev/database).

If aggregated data updates infrequently, everything runs smoothly.
However, if aggregated data updates frequently, the reactivity and atomicity can
cause issues: reactive queries can rerun often, and mutations can slow down.

### Reactivity

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

### Transactions

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
    await Promise.all([increment(ctx), increment(ctx)]);
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

### Read dependencies and writes

When a query calls `await aggregate.count(ctx)`, this depends on
the entire aggregate data structure. When any mutation changes the data
structure, i.e. `insert`, `delete`, or `replace`, the query reruns and sends new
results to the frontend. This is necessary to keep the frontend looking snappy,
but it can cause large function call and bandwidth usage on Convex.

When a _mutation_ calls `await aggregate.count(ctx)`, then this mutation needs
to [run transactionally](https://docs.convex.dev/database/advanced/occ)
relative to other mutations. Another mutation that does an `insert`, `delete`,
or `replace` can cause an [OCC conflict](https://docs.convex.dev/error#1).

In order to calculate in `O(log(n))` time, the aggregate component stores
denormalized counts in an internal data structure. Data points with nearby keys
may have their counts accumulated in one place.

Imagine the leaderboard aggregate defined with `Key: [username, score]`. Users
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

On the other hand, each namespace has its own data structure and there's no
overlap in internal nodes between namespaces. So if you use
`Namespace: username` and `Key: score`, which has similar capabilities
to an aggregate with `Key: [username, score]`, then you never have a problem
with "Laura" and "Lauren" having contention.

### Put bounds on aggregated data

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
await aggregateScoreByUser.count(ctx, { prefix: [username] });
```

### Lazy aggregation

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
off the default behavior by starting over with `aggregate.clear(ctx, 16, false)`
which set `rootLazy` to `false`.

Another way to optimize lazy aggregation is to increase the `maxNodeSize` of the
aggregate data structure. e.g. if the root is lazy and `maxNodeSize` is the
default of 16, that means each write updates some document that accumulates
1/16th of the entire data structure. So each write will intersect with 1/16th of
all other writes, and reads may spuriously rerun 1/16th of the time. To increase
`maxNodeSize`, run `aggregate.clear(ctx, maxNodeSize)` and start over.

Found a bug? Feature request? [File it here](https://github.com/get-convex/aggregate/issues).

<!-- END: Include on https://convex.dev/components -->

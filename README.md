# Convex Component: Aggregate

This component annotates a Convex table with counts and sums.

Imagine you have a "grades" table with documents containing fields
`{student: string; class: string; score: number}`.
You can apply the `aggregate` component to the table with key `[class, score]`
and summand `score`. Think of it as sorting the table by `[class, score]` and
giving counts and sums of scores on contiguous ranges.

That gives you an aggregation interface, with most operations taking
`O(log(n))` time. All of the following operations become easy and efficient:

1. Count the total number of grades in the table.
2. Count the total number of grades in each class.
3. Count the number of grades in each class with `95 < score < 100`.
4. Find the grade with the p95 score in each class.
5. Calculate the mean score in each class.
6. For each student, find their class ranking.

Other use-cases:

- Keep a leaderboard of high scores and show an individual user their rank.
- For pagination with fixed-size pages, display the number of pages, and jump
  to any page.

# How to use

See `example/` for a working demo.

First set up the Triggers component, because the Aggregate component will use
triggers to detect changes to the table.

TODO: link to triggers component setup.

1. Install the Aggregate component:

```
npm install @convex-dev/aggregate
```

2. Use it in your app:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import aggregate from "../../src/component/convex.config";
import triggers from "convex-dev-triggers/convex.config.js";

const app = defineApp();
app.use(aggregate);
app.use(triggers);
export default app;
```

3. Register the trigger to update aggregates when the table is updated.

```ts
const withAllTriggers: WithTriggers<DataModel> = withTriggers<DataModel>(components.triggers, {
  leaderboard: {
    atomicMutators: internal.leaderboard,
    triggers: [
      components.aggregate.btree.trigger as FunctionReference<"mutation", FunctionVisibility, TriggerArgs<DataModel, "leaderboard">, null>,
    ],
  },
});
```

4. Define the key and initialize the aggregates. This is where you define the
   sort order and values to be summed.

```ts
import { initBTree } from "@convex-dev/aggregate";
export const getKey = internalQuery({
  args: { doc: v.any() as Validator<Doc<"leaderboard">> },
  returns: v.object({ key: v.number(), summand: v.optional(v.number()) }),
  handler: async (_ctx, { doc }) => {
    return { key: doc.score };
  }
});
export const initAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    await initBTree(ctx, components.aggregateByScore, internal.leaderboard.getByScore);
  },
});
```

5. Start using the interface.

```ts
import { BTree } from "@convex-dev/aggregate";
function aggregate(ctx: QueryCtx) {
  return new BTree<DataModel, "leaderboard", number>(
    ctx,
    components.aggregate
  );
}
```

Then in your queries and mutations you can do

```ts
const tableCount = await aggregate(ctx).count();
const p95Document = await aggregate(ctx).at(Math.floor(tableCount * 0.95));
```

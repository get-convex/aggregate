import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";
import migrations from "@convex-dev/migrations/convex.config";

const app = defineApp();
app.use(aggregate, { name: "aggregateByScore" });
app.use(aggregate, { name: "aggregateScoreByUser" });
app.use(aggregate, { name: "music" });
app.use(aggregate, { name: "photos" });
app.use(aggregate, { name: "stats" });
app.use(aggregate, { name: "btreeAggregate" });
// Dedicated instance for the benchmark. It must not be shared: while a queued
// (async) run is draining, `assertNoPendingCommits` makes every eager write, every
// non-stale read, and even `clear` throw on that instance.
app.use(aggregate, { name: "benchAggregate" });

app.use(migrations);

export default app;

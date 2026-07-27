import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp({ httpPrefix: "/api" });
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

// Serves the built example app from this deployment's .convex.site domain. The
// component owns "/", so app HTTP routes (if any are added) live under "/api".
app.use(staticHosting, { httpPrefix: "/" });

export default app;

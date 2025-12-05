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
app.use(aggregate, { name: "batchedWrites" });

app.use(migrations);

export default app;

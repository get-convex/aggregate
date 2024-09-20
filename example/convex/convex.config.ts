import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();
app.use(aggregate, { name: "aggregateByScore" });
app.use(aggregate, { name: "aggregateScoreByUser" });

export default app;

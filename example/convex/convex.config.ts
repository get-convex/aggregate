import { defineApp } from "convex/server";
import aggregate from "../../src/component/convex.config";
import triggers from "convex-dev-triggers/convex.config.js";

const app = defineApp();
app.use(aggregate, { name: "aggregateByScore" });
app.use(aggregate, { name: "aggregateScoreByUser" });
app.use(triggers, { name: "triggers" });

export default app;

import { defineComponent } from "convex/server";
import batchWorker from "@convex-dev/batch-worker/convex.config.js";

const component = defineComponent("aggregate");
component.use(batchWorker)

export default component;

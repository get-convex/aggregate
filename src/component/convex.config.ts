import { defineComponent } from "convex/server";
import { v } from "convex/values";
import batchWorker from "@convex-dev/batch-worker/convex.config.js";

const component = defineComponent("aggregate", {
  env: {
    WORKER_IDLE_COOLDOWN_MS: v.optional(v.string()),
    WORKER_POLL_INTERVAL_MS: v.optional(v.string()),
  },
});
component.use(batchWorker);

export default component;

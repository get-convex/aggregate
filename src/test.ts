/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import batchWorker from "@convex-dev/batch-worker/test";
import schema from "./component/schema.js";
const modules = import.meta.glob("./component/**/*.ts");

/**
 * Register the component with the test convex instance.
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 * @param name - The name of the component, as registered in convex.config.ts.
 */
export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = "aggregate",
) {
  t.registerComponent(name, schema, modules);
  // The aggregate mounts the batch worker (it drains async writes), so anything
  // that reads the queue's status needs it registered too.
  batchWorker.register(t, `${name}/batchWorker`);
}
export default { register, schema, modules };

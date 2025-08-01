/// <reference types="vite/client" />

import { test } from "vitest";
import { convexTest } from "convex-test";

export const modules = import.meta.glob("./**/*.*s");

import { type GenericSchema, type SchemaDefinition } from "convex/server";
import { type UsedAPI } from "./index.js";
import { componentsGeneric } from "convex/server";

export { componentSchema };
import componentSchema from "../component/schema.js";

export const componentModules = import.meta.glob("../component/**/*.ts");

export function initConvexTest<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(schema: Schema) {
  const t = convexTest(schema, modules);
  t.registerComponent("aggregate", componentSchema, componentModules);
  return t;
}

export const components = componentsGeneric() as unknown as {
  aggregate: UsedAPI;
};

test("setup", () => {});

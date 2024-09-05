import { Expand, FunctionReference, FunctionVisibility } from "convex/server";

export type UseApi<API> = Expand<{
  [mod in keyof API]: API[mod] extends FunctionReference<
    infer FType,
    FunctionVisibility,
    infer FArgs,
    infer FReturnType,
    infer FComponentPath
  >
    ? FunctionReference<
        FType,
        "internal",
        FArgs,
        FReturnType,
        FComponentPath
      >
    : UseApi<API[mod]>;
}>;
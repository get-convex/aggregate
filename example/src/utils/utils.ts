export function exhaustiveCheck(param: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Exhaustive check failed: ${param}`);
}

export const iife = <T>(fn: () => T): T => fn();

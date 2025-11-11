export function exhaustiveCheck(param: never): never {
  throw new Error(`Exhaustive check failed: ${param}`);
}

export const iife = <T>(fn: () => T): T => fn();

import { fc } from "@fast-check/vitest";
import { Value } from "./btree.js";

const objectKeys = "abcdefghijklmnopqrstuvwxyz".split("");

// Floats that are nice to work with. No weird encodings, and you can add and
// subtract them without losing precision.
export const arbitraryNiceFloat = fc.float({ min: -10, max: 10, noNaN: true })
  .filter((f) => f !== 0 || 1 / f > 0); // exclude negative zero

export const arbitraryValue = fc.letrec((tie) => ({
  tree: fc.oneof({ depthSize: "small" }, tie("leaf"), tie("obj")),
  leaf: fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.string(),
    arbitraryNiceFloat,
    // fc.bigInt(),
    // fc.uint8Array().map((a) => a.buffer),
  ),
  obj: fc.dictionary(
    fc.string({ unit: fc.constantFrom(...objectKeys) }),
    tie("tree"),
    { maxKeys: 3 },
  ),
  arr: fc.array(tie("tree"), { maxLength: 4 }),
})).tree as fc.Arbitrary<Value>;

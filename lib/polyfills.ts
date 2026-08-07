import structuredCloneShim from "@ungap/structured-clone";

/**
 * Hermes has no `structuredClone`. DiceBear's core calls it while building a
 * Style, resolving Options and serialising an Avatar, so importing the avatar
 * module without this throws "Property 'structuredClone' doesn't exist".
 *
 * A JSON round-trip would cover the data DiceBear actually clones today, but
 * it silently drops `undefined` and mangles Dates/Maps — this is a real
 * implementation, and the shape of what a dependency clones is not ours to
 * assume.
 *
 * Importing this module installs the global. Import it BEFORE anything that
 * reaches DiceBear; `lib/avatar` constructs its styles at module scope.
 */
const globals = globalThis as typeof globalThis & { structuredClone?: typeof structuredClone };

if (typeof globals.structuredClone !== "function") {
  globals.structuredClone = ((value: unknown, options?: StructuredSerializeOptions) =>
    structuredCloneShim(value, options as never)) as typeof structuredClone;
}

export {};

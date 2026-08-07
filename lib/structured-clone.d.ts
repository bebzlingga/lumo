/**
 * `@ungap/structured-clone` ships no type declarations, so this describes the
 * one export `lib/polyfills` uses.
 */
declare module "@ungap/structured-clone" {
  /** `lossy` drops what cannot be cloned; `json` restricts to JSON semantics. */
  export default function structuredClone<T>(value: T, options?: { json?: boolean; lossy?: boolean }): T;
}

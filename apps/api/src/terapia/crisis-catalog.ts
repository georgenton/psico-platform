/**
 * The catalogue moved to `@psico/types` so the public help page can read it
 * without a network call. The API keeps serving it from there — this re-export
 * is the whole of it, so there is nothing here that could drift.
 *
 * What it serves is pinned, country by country and over HTTP, in
 * `crisis-catalog.e2e-spec.ts`.
 */
export { getCrisisFor } from "@psico/types";

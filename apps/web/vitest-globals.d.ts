/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

// Sprint S39: extends Vitest's `expect` with the jest-dom matchers used by
// our component tests (toBeInTheDocument, toBeDisabled, toHaveTextContent…).
//
// The matchers are registered at runtime by `vitest.setup.ts` via
// `import "@testing-library/jest-dom/vitest"`, but `tsc --noEmit` doesn't
// pick up the side-effect import. This ambient module merges the matcher
// types into Vitest's `Assertion` interface so `expect(el).toBeInTheDocument()`
// typechecks.

import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import "vitest";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<
    unknown,
    unknown
  > {}
}

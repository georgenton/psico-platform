// Sprint S39: Vitest global setup for the web app.
//
// Registers the jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`,
// `toHaveAttribute`, etc.) so RTL queries read naturally. Wires
// `afterEach(cleanup)` once so DOM state doesn't leak between tests.
//
// We do the matcher registration manually via `expect.extend(matchers)`
// instead of the side-effect `import "@testing-library/jest-dom/vitest"`
// shortcut because the subpath import was flaky on CI's pnpm resolution
// (worked locally, threw "Invalid Chai property: toBeInTheDocument" on
// GitHub Actions). The explicit form is robust and version-tolerant.

import { expect, afterEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

afterEach(() => {
  cleanup();
});

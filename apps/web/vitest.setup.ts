// Sprint S39: Vitest global setup for the web app.
//
// Imports the jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`,
// `toHaveAttribute`, etc.) so RTL queries read naturally. The auto-cleanup
// import from @testing-library/react is opt-in in Vitest — we wire it here
// once and forget about it.

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount every component after each test so DOM state doesn't leak.
afterEach(() => {
  cleanup();
});

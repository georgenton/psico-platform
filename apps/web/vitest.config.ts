/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Vitest config for the Next.js web app (Sprint S39).
 *
 * Notes:
 * - `jsdom` environment so React components can mount, query the DOM,
 *   and fire events. `happy-dom` is faster but a couple of RTL queries
 *   misbehave on edge cases — sticking with jsdom v25 for parity with
 *   the rest of the JS ecosystem.
 * - The `@/` alias mirrors tsconfig.json so test imports look identical
 *   to the production code.
 * - `globals: true` lets us use `describe`/`it`/`expect` without imports,
 *   matching how the API tests are written.
 * - `setupFiles` loads `@testing-library/jest-dom/vitest` so jest-dom
 *   matchers (toBeInTheDocument, toHaveTextContent, etc.) are available.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Headless mode for CI — no UI, parallel pool.
    pool: "threads",
    // Sprint S41: coverage thresholds as a soft floor for now. We turn
    // OFF the hard fail (`thresholds.lines: 60` would error) and just
    // surface the report. When we grow coverage beyond 60% lines on
    // tested files, flip `thresholds.autoUpdate: false` and enable a real
    // floor.
    coverage: {
      provider: "v8",
      include: [
        "src/components/dashboard/**/*.{ts,tsx}",
        "src/app/dashboard/_TourOverlay.tsx",
      ],
      exclude: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
      reporter: ["text", "json-summary"],
    },
  },
});

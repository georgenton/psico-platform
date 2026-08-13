import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

/**
 * PR-0.1 — the lock suite, and ONLY the lock suite.
 *
 * These specs need a real PostgreSQL (`TEST_DATABASE_URL`), so they live behind
 * their own glob (`*.pg-spec.ts`) and their own script rather than skipping
 * silently inside the main run: a barrier test that is quietly skipped is worse
 * than no barrier test at all, because it reads as coverage.
 *
 * NOTE — this does NOT `mergeConfig` with the base config: Vitest CONCATENATES
 * array options, so merging would drag the entire unit suite in alongside these.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2021",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    // `*.pg-spec.ts`, plus the named E2E suites that boot the real Nest app
    // against the SAME isolated PostgreSQL: the Guide HTTP/firewall suites
    // (CC-7.4D) and the Books optional-auth HTTP boundary suite.
    //
    // Listed one by one rather than matched by `*.e2e-spec.ts`. A filename is
    // not a promise of a database: an E2E written tomorrow against mocked
    // Prisma would join this gate silently and change what PG_LOCKS means,
    // which is the opposite of what a gate is for.
    include: [
      "src/**/*.pg-spec.ts",
      "src/guide/guide-*.e2e-spec.ts",
      "src/books/books-optional-auth.e2e-spec.ts",
    ],
    setupFiles: ["./src/test/setup-env.ts"],
    // Every test runs two genuinely concurrent transactions, each waiting on the
    // other to commit. They must not be starved of a worker thread.
    pool: "threads",
    testTimeout: 30_000,
    server: {
      deps: {
        // `voyageai` ships ESM directory imports that Node cannot resolve;
        // inlining it lets the Guide E2E boot the real AppModule (same reason
        // the unit config inlines it).
        inline: ["voyageai"],
      },
    },
  },
});

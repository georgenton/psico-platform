import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // SWC transforms TypeScript and emits decorator metadata
  // (`design:paramtypes`) that NestJS DI relies on. Vitest's default esbuild
  // transformer does NOT emit this metadata, which makes E2E tests that boot
  // the full AppModule fail with "Cannot read properties of undefined" inside
  // any service that injects a dependency. SWC fixes this.
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2021",
        parser: { syntax: "typescript", decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    // Default Vitest globs require `*.spec.ts` (with a `.` before `spec`).
    // We also pick up `*.e2e-spec.ts` so end-to-end tests run alongside units
    // — they're all in-process (no Docker, no real DB), so the cost is small.
    include: ["src/**/*.{test,spec}.ts", "src/**/*.e2e-spec.ts"],
    // Set env stubs BEFORE any module evaluates. AppModule's
    // ConfigModule.forRoot({ validate }) runs the Zod schema at construction
    // time; if env isn't ready, all downstream DI fails with cryptic
    // "configService is undefined" errors. setupFiles guarantees ordering.
    setupFiles: ["./src/test/setup-env.ts"],
    pool: "threads",
    poolOptions: {
      threads: { singleThread: false },
    },
    // Each E2E spec boots its own app, so we want a generous timeout.
    testTimeout: 15_000,
    // `voyageai` ships ESM with directory imports that Node's strict resolver
    // (used by Vitest) refuses. Inlining forces Vite to transform it into a
    // form Node accepts. This is a well-known workaround for SDKs that
    // haven't fully adopted the ESM spec yet.
    server: {
      deps: {
        inline: ["voyageai"],
      },
    },
  },
});

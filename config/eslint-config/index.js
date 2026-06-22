/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  plugins: ["@typescript-eslint"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports" },
    ],
  },
  env: {
    node: true,
    es2022: true,
  },
  overrides: [
    {
      // NestJS DI uses value imports — type-only imports break the IoC
      // container. The decorator (@Injectable, @Controller, @Processor, …)
      // reads constructor param metadata at runtime; if `import type` strips
      // the named import, `reflect-metadata` resolves `undefined` and DI
      // fails silently (e.g. ValidationPipe-style 400, or `Cannot read of
      // undefined` deep in the framework). Bug pattern hit in Sprint S5-front
      // (controllers + DTOs), Sprint G2 (BullMQ processor), Sprint G2b
      // (HomeService) — closing it here once.
      //
      // Pattern: anywhere we put a decorator that triggers Nest's DI metadata
      // reader. Convention matches file name suffixes; new types of
      // injectables (e.g. WebSocket gateways) should be added here.
      files: [
        "apps/api/src/**/*.service.ts",
        "apps/api/src/**/*.controller.ts",
        "apps/api/src/**/*.strategy.ts",
        "apps/api/src/**/*.guard.ts",
        "apps/api/src/**/*.module.ts",
        "apps/api/src/**/*.processor.ts",
        "apps/api/src/**/*.interceptor.ts",
        "apps/api/src/**/*.filter.ts",
        "apps/api/src/**/*.pipe.ts",
        "apps/api/src/**/*.subscriber.ts",
        "apps/api/src/**/*.gateway.ts",
        "apps/api/src/**/*.resolver.ts",
      ],
      rules: {
        "@typescript-eslint/consistent-type-imports": "off",
      },
    },
  ],
};

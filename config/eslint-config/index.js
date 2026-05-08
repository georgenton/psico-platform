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
      // NestJS DI uses value imports — type-only imports break the IoC container
      files: [
        "apps/api/src/**/*.service.ts",
        "apps/api/src/**/*.controller.ts",
        "apps/api/src/**/*.strategy.ts",
        "apps/api/src/**/*.guard.ts",
        "apps/api/src/**/*.module.ts",
      ],
      rules: {
        "@typescript-eslint/consistent-type-imports": "off",
      },
    },
  ],
};

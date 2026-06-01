#!/usr/bin/env node
// Generate packages/api-client/src/generated.ts from apps/api/openapi.json.
//
// Two modes:
//   - default: write the generated file.
//   - --check: fail with non-zero exit if the generated file would change.
//             Used by CI to catch DTO drift (back changed, client wasn't
//             regenerated).
//
// Usage:
//   pnpm --filter @psico/api-client generate
//   pnpm --filter @psico/api-client generate:check
//
// Prerequisite: apps/api/openapi.json must exist. It's written on every
// `pnpm --filter @psico/api dev` boot. For CI, run `pnpm --filter @psico/api
// build && node dist/main` once so it's emitted.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const OPENAPI_PATH = resolve(REPO_ROOT, "apps/api/openapi.json");
const OUTPUT_PATH = resolve(__dirname, "../src/generated.ts");

const checkMode = process.argv.includes("--check");

if (!existsSync(OPENAPI_PATH)) {
  console.error(
    `[generate] ${OPENAPI_PATH} not found.\n` +
      `Run \`pnpm --filter @psico/api dev\` once or \`pnpm --filter @psico/api build && cd apps/api && node dist/main\` to emit it.`,
  );
  process.exit(1);
}

const schema = JSON.parse(readFileSync(OPENAPI_PATH, "utf-8"));

const ast = await openapiTS(schema, {
  additionalProperties: false,
  // Use enum unions instead of string for tighter typing.
  enum: true,
});

const banner = `/**
 * AUTO-GENERATED from apps/api/openapi.json.
 * DO NOT EDIT MANUALLY — run \`pnpm --filter @psico/api-client generate\` instead.
 *
 * Source of truth: NestJS controllers in apps/api/src/**.
 * Pipeline owner: Sprint 0.B · ADR 0008.
 */
/* eslint-disable */
// @ts-nocheck

`;

const output = banner + astToString(ast);

if (checkMode) {
  const existing = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, "utf-8") : "";
  if (existing !== output) {
    console.error(
      "[generate:check] DRIFT detected — generated.ts is out of sync with apps/api/openapi.json.\n" +
        "Run `pnpm --filter @psico/api-client generate` and commit the result.",
    );
    process.exit(1);
  }
  console.log("[generate:check] OK — generated.ts is up to date.");
  process.exit(0);
}

writeFileSync(OUTPUT_PATH, output);
console.log(`[generate] Wrote ${OUTPUT_PATH} (${(output.length / 1024).toFixed(1)} KB)`);

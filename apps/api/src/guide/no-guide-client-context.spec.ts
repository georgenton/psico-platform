import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { GuideController } from "./guide.controller";

/**
 * CC-7.4D — ratchets over the PUBLIC Guide surface.
 *
 * The lifecycle already has its single-writer ratchets. These pin the SHAPE of
 * what is exposed:
 *
 *   GUIDE_HTTP_ROUTE_COUNT=5
 *   GUIDE_CONTROLLER_COUNT=1
 *   GUIDE_GENERIC_EVENT_ENDPOINT_COUNT=0
 *   GUIDE_CLIENT_CONTEXT_FIELDS=0
 *   GUIDE_CORRECT_OPTION_PUBLIC_REFERENCES=0
 *
 * The public boundary is: the parser's accepted keys, the DTO/OpenAPI schemas,
 * the controller and the API client. Grading internals may legitimately name
 * `correctOptionKey` — that is the server comparing an answer, not exposing it.
 */

const GUIDE_DIR = __dirname;
const CLIENT_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "api-client",
  "src",
);

/** The files that DEFINE the public wire. */
const PUBLIC_SURFACE = [
  join(GUIDE_DIR, "guide.controller.ts"),
  join(GUIDE_DIR, "guide-command-parser.ts"),
  join(GUIDE_DIR, "dto", "guide.openapi.ts"),
  join(CLIENT_DIR, "guide.ts"),
];

function listGuideRuntimeFiles(): string[] {
  return readdirSync(GUIDE_DIR)
    .map((entry) => join(GUIDE_DIR, entry))
    .filter((full) => statSync(full).isFile())
    .filter(
      (full) =>
        full.endsWith(".ts") &&
        !/\.(spec|pg-spec|e2e-spec|test)\.ts$/.test(full),
    );
}

describe("ratchet · guide public surface", () => {
  it("exposes exactly one controller with five routes", () => {
    const controllers = listGuideRuntimeFiles().filter((f) =>
      f.endsWith(".controller.ts"),
    );
    expect(controllers).toHaveLength(1);

    const source = readFileSync(controllers[0] as string, "utf8");
    const posts = source.match(/@Post\(/g) ?? [];
    expect(posts).toHaveLength(5);
    // Only POST — no GET/PATCH/PUT/DELETE surface in this PR.
    for (const verb of ["@Get(", "@Patch(", "@Put(", "@Delete("]) {
      expect(source.includes(verb), verb).toBe(false);
    }
    // The five handlers are the five commands.
    expect(
      Object.getOwnPropertyNames(GuideController.prototype)
        .filter((n) => n !== "constructor")
        .sort(),
    ).toEqual([
      "cancelGuideSession",
      "completeGuideSession",
      "completeGuideSessionStep",
      "createGuideSession",
      "submitGuideStepRecall",
      "toResponse",
      "unwrap",
    ]);
  });

  it("declares no generic event / progress / discovery route", () => {
    const source = readFileSync(join(GUIDE_DIR, "guide.controller.ts"), "utf8");
    for (const forbidden of [
      '"events"',
      '"progress"',
      '"definitions"',
      '"catalog"',
    ]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
  });

  it("no client-supplied editorial context exists on the public surface", () => {
    // These may never be ACCEPTED keys: the server derives the context.
    const forbiddenKeys = [
      "editionKey",
      "unitKey",
      "editionId",
      "unitId",
      "bookId",
      "revisionId",
      "userId",
    ];
    for (const file of PUBLIC_SURFACE) {
      const source = readFileSync(file, "utf8");
      for (const key of forbiddenKeys) {
        // As an object key or a quoted whitelist entry — a prose mention in a
        // comment explaining WHY it is absent is not a contract field.
        const asKey = new RegExp(`(^|[^\\w.])${key}\\s*:`, "m");
        const asWhitelisted = new RegExp(`"${key}"`);
        expect(asKey.test(stripComments(source)), `${file} → ${key}:`).toBe(
          false,
        );
        expect(
          asWhitelisted.test(stripComments(source)),
          `${file} → "${key}"`,
        ).toBe(false);
      }
    }
  });

  it("the correct option is never referenced on the public surface", () => {
    for (const file of PUBLIC_SURFACE) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(
        source.includes("correctOptionKey"),
        relative(GUIDE_DIR, file),
      ).toBe(false);
    }
  });
});

/** Drop line and block comments so prose never trips a contract ratchet. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

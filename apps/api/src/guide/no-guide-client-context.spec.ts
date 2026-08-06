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
 *   GUIDE_HTTP_ROUTE_COUNT=6
 *   GUIDE_HTTP_COMMAND_ROUTE_COUNT=5
 *   GUIDE_HTTP_AVAILABILITY_GET_COUNT=1
 *   GUIDE_CONTROLLER_COUNT=1
 *   GUIDE_GENERIC_EVENT_ENDPOINT_COUNT=0
 *   GUIDE_CLIENT_CONTEXT_FIELDS=0
 *   GUIDE_CORRECT_OPTION_PUBLIC_REFERENCES=0
 *
 * CC-7.R1 added ONE read route — the opaque `GET /availability` pilot gate.
 * GR-4 added a SECOND: contextual discovery, which answers whether a reading
 * context has a guided reading. Both are read-only and neither creates a row.
 * Everything else is unchanged: five commands, one controller, no generic
 * event or progress route.
 *
 * The public boundary is: the parser's accepted keys, the DTO/OpenAPI schemas,
 * the controller and the API client. Grading internals may legitimately name
 * `correctOptionKey` — that is the server comparing an answer, not exposing it.
 */

const GUIDE_DIR = __dirname;
const TYPES_GUIDE = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "types",
  "src",
  "guide.ts",
);
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

/**
 * The files that DECLARE the wire: a field here IS a contract field. The
 * public types are included because a shape added there becomes a contract
 * even before any parser accepts it.
 */
const CONTRACT_SURFACE = [
  join(GUIDE_DIR, "guide-command-parser.ts"),
  join(GUIDE_DIR, "dto", "guide.openapi.ts"),
  join(CLIENT_DIR, "guide.ts"),
  TYPES_GUIDE,
];

/**
 * The controller TRANSLATES; it declares no contract of its own. It is held to
 * the editorial-context rule (it must never read context from the wire) but not
 * to generic result-shaped words, since `result: GuideCommandResult` is a local
 * parameter, not a field a client could send.
 */
const PUBLIC_SURFACE = [
  ...CONTRACT_SURFACE,
  join(GUIDE_DIR, "guide.controller.ts"),
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
  it("exposes exactly one controller with five commands and the availability gate", () => {
    const controllers = listGuideRuntimeFiles().filter((f) =>
      f.endsWith(".controller.ts"),
    );
    expect(controllers).toHaveLength(1);

    const source = readFileSync(controllers[0] as string, "utf8");
    const posts = source.match(/@Post\(/g) ?? [];
    expect(posts).toHaveLength(5);
    // Exactly ONE read route — the CC-7.R1 availability gate — and no mutation
    // verb beyond the five POST commands.
    const gets = source.match(/@Get\(/g) ?? [];
    expect(gets).toHaveLength(3);
    expect(source).toContain('@Get("availability")');
    // GR-4 added the SECOND read route: contextual discovery. It is read-only
    // and answers a closed union; it is not a sixth command.
    expect(source).toContain('@Get("discovery/:bookSlug/:chapterOrder")');
    // GR-5 added the THIRD read route: actor-scoped session recovery, which is
    // what makes resume work on a second device. Also read-only, also a closed
    // union, and still not a sixth command — it creates nothing.
    expect(source).toContain('@Get("sessions/recoverable")');
    for (const verb of ["@Patch(", "@Put(", "@Delete("]) {
      expect(source.includes(verb), verb).toBe(false);
    }
    // The handlers: the five commands + the three reads (plus the three
    // private helpers — GR-3 added `toRecallResponse`, which decorates the
    // shared shape with the recall outcome and adds no route).
    expect(
      Object.getOwnPropertyNames(GuideController.prototype)
        .filter((n) => n !== "constructor")
        .sort(),
    ).toEqual([
      "cancelGuideSession",
      "completeGuideSession",
      "completeGuideSessionStep",
      "createGuideSession",
      "getGuideAvailability",
      "getGuideDiscovery",
      "getRecoverableGuideSession",
      "submitGuideStepRecall",
      "toRecallResponse",
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

  it("no server-owned verdict or envelope can become a contract field", () => {
    // Only on the files that DECLARE the wire — the controller's local
    // `result` variable is not a field a client could ever send.
    const forbiddenKeys = [
      "correctOptionKey",
      "result",
      "evaluationSource",
      "metadata",
      "payload",
    ];
    for (const file of CONTRACT_SURFACE) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const key of forbiddenKeys) {
        const asKey = new RegExp(`(^|[^\\w.])${key}\\s*:`, "m");
        const asWhitelisted = new RegExp(`"${key}"`);
        expect(asKey.test(source), `${file} → ${key}:`).toBe(false);
        expect(asWhitelisted.test(source), `${file} → "${key}"`).toBe(false);
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

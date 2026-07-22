import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.4D — ratchet over the PUBLISHED Guide contract (`openapi.json` + the
 * generated client). The pure parsers are the runtime authority; this spec
 * pins that the DOCUMENTED contract states the same thing:
 *
 *   - exactly five paths and five operation ids — no generic event endpoint,
 *     no progress endpoint, no discovery endpoint;
 *   - every request body is CLOSED (`additionalProperties: false`) with an
 *     exact `required` list;
 *   - the response is closed and carries only the seven public session fields;
 *   - the catalog's correct option, the editorial ids and `userId` appear
 *     NOWHERE in any Guide schema, and `selectedOptionKey` only in the recall
 *     body.
 *
 * Loosening any of these is a DELIBERATE contract change that must edit this
 * file too.
 */

interface Schema {
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  enum?: unknown[];
  nullable?: boolean;
}

interface Operation {
  operationId?: string;
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}

const openapi = JSON.parse(
  readFileSync(join(process.cwd(), "openapi.json"), "utf8"),
) as { paths: Record<string, Record<string, Operation>> };

const GUIDE_PATHS = Object.keys(openapi.paths)
  .filter((p) => p.startsWith("/api/guide"))
  .sort();

const EXPECTED_PATHS = [
  "/api/guide/sessions",
  "/api/guide/sessions/{sessionId}/cancel",
  "/api/guide/sessions/{sessionId}/complete",
  "/api/guide/sessions/{sessionId}/steps/{stepKey}/complete",
  "/api/guide/sessions/{sessionId}/steps/{stepKey}/recall",
];

const EXPECTED_OPERATION_IDS = [
  "cancelGuideSession",
  "completeGuideSession",
  "completeGuideSessionStep",
  "createGuideSession",
  "submitGuideStepRecall",
];

const bodyOf = (path: string): Schema =>
  openapi.paths[path]?.post?.requestBody?.content?.["application/json"]
    ?.schema as Schema;

const responseOf = (path: string, status: string): Schema =>
  openapi.paths[path]?.post?.responses?.[status]?.content?.["application/json"]
    ?.schema as Schema;

describe("ratchet · guide OpenAPI surface", () => {
  it("publishes exactly five paths and five operation ids", () => {
    expect(GUIDE_PATHS).toEqual(EXPECTED_PATHS);
    const ids = GUIDE_PATHS.map((p) => openapi.paths[p]?.post?.operationId)
      .filter((id): id is string => typeof id === "string")
      .sort();
    expect(ids).toEqual(EXPECTED_OPERATION_IDS);
  });

  it("exposes ONLY POST on every Guide path", () => {
    for (const path of GUIDE_PATHS) {
      expect(Object.keys(openapi.paths[path] ?? {})).toEqual(["post"]);
    }
  });

  it("has no generic event / progress / discovery endpoint", () => {
    for (const path of Object.keys(openapi.paths)) {
      expect(path).not.toBe("/api/guide/events");
      expect(path).not.toBe("/api/guide/complete");
      expect(path).not.toBe("/api/guide/progress");
      expect(path).not.toBe("/api/guide/definitions");
      expect(path).not.toBe("/api/learning-events");
    }
  });

  it("every request body is CLOSED with an exact required list", () => {
    const expected: Record<string, string[]> = {
      "/api/guide/sessions": ["guideKey", "guideVersion", "idempotencyKey"],
      "/api/guide/sessions/{sessionId}/cancel": ["idempotencyKey"],
      "/api/guide/sessions/{sessionId}/complete": ["idempotencyKey"],
      "/api/guide/sessions/{sessionId}/steps/{stepKey}/complete": [
        "idempotencyKey",
      ],
      "/api/guide/sessions/{sessionId}/steps/{stepKey}/recall": [
        "idempotencyKey",
        "selectedOptionKey",
      ],
    };
    for (const [path, required] of Object.entries(expected)) {
      const schema = bodyOf(path);
      expect(schema, path).toBeDefined();
      expect(schema.type, path).toBe("object");
      expect(schema.additionalProperties, path).toBe(false);
      expect([...(schema.required ?? [])].sort(), path).toEqual(required);
      expect(Object.keys(schema.properties ?? {}).sort(), path).toEqual(
        required,
      );
    }
  });

  it("the response is closed and carries only the public session fields", () => {
    const SESSION_FIELDS = [
      "currentStepKey",
      "guideKey",
      "guideVersion",
      "sessionId",
      "status",
      "stepsCompleted",
      "totalSteps",
    ];
    for (const path of GUIDE_PATHS) {
      for (const status of ["200", "201"]) {
        const schema = responseOf(path, status);
        expect(schema, `${path} ${status}`).toBeDefined();
        expect(schema.additionalProperties, `${path} ${status}`).toBe(false);
        expect([...(schema.required ?? [])].sort()).toEqual([
          "created",
          "replayed",
          "session",
        ]);
        const session = schema.properties?.session as Schema;
        expect(session.additionalProperties).toBe(false);
        expect([...(session.required ?? [])].sort()).toEqual(SESSION_FIELDS);
        expect(Object.keys(session.properties ?? {}).sort()).toEqual(
          SESSION_FIELDS,
        );
      }
    }
  });

  it("no Guide schema mentions the answer, the editorial ids or a userId", () => {
    const forbidden = [
      "correctOptionKey",
      "editionId",
      "unitId",
      "editionKey",
      "unitKey",
      "userId",
      "metadata",
      "payload",
      "result",
      "evaluationSource",
      "itemKey",
      "context",
    ];
    for (const path of GUIDE_PATHS) {
      const serialized = JSON.stringify(openapi.paths[path]);
      for (const term of forbidden) {
        // `"<term>"` as a JSON key or enum value — a prose mention inside a
        // description is not a contract field.
        expect(serialized.includes(`"${term}":`), `${path} → ${term}`).toBe(
          false,
        );
      }
    }
  });

  it("selectedOptionKey exists ONLY in the recall body", () => {
    for (const path of GUIDE_PATHS) {
      const props = Object.keys(bodyOf(path).properties ?? {});
      const isRecall = path.endsWith("/recall");
      expect(props.includes("selectedOptionKey"), path).toBe(isRecall);
      // …and never in any response.
      for (const status of ["200", "201"]) {
        expect(
          JSON.stringify(responseOf(path, status)).includes(
            '"selectedOptionKey"',
          ),
          `${path} ${status}`,
        ).toBe(false);
      }
    }
  });

  it("the generated client preserves the five Guide operations", () => {
    const generated = readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "packages",
        "api-client",
        "src",
        "generated.ts",
      ),
      "utf8",
    );
    for (const path of EXPECTED_PATHS) {
      expect(generated, path).toContain(path);
    }
    for (const id of EXPECTED_OPERATION_IDS) {
      expect(generated, id).toContain(id);
    }
    expect(generated).not.toContain("correctOptionKey");
  });
});

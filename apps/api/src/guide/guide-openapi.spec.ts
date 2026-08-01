import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.4D + CC-7.R1 — ratchet over the PUBLISHED Guide contract
 * (`openapi.json` + the generated client). The pure parsers are the runtime
 * authority; this spec pins that the DOCUMENTED contract states the same thing:
 *
 *   - exactly six paths — the five COMMANDS (POST) plus the opaque
 *     availability check (GET); no generic event endpoint, no progress
 *     endpoint, no discovery endpoint;
 *   - every command request body is CLOSED (`additionalProperties: false`)
 *     with an exact `required` list;
 *   - the command response is closed and carries only the seven public session
 *     fields;
 *   - the availability response is a single closed `{ available: boolean }` —
 *     it never states the mode, the allowlist or the reason;
 *   - only the five COMMANDS document `503 GUIDE_UNAVAILABLE`; the JWT-gated
 *     availability check never does (it answers `false` instead of denying);
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

interface Parameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: Schema & { minimum?: number; pattern?: string };
}

interface Operation {
  operationId?: string;
  parameters?: Parameter[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>;
  security?: unknown[];
}

interface PathItem {
  get?: Operation;
  post?: Operation;
}

const openapi = JSON.parse(
  readFileSync(join(process.cwd(), "openapi.json"), "utf8"),
) as { paths: Record<string, PathItem> };

const GUIDE_PATHS = Object.keys(openapi.paths)
  .filter((p) => p.startsWith("/api/guide"))
  .sort();

const AVAILABILITY_PATH = "/api/guide/availability";
const DISCOVERY_PATH = "/api/guide/discovery/{bookSlug}/{chapterOrder}";

/** The five COMMAND paths (POST) — the availability GET is deliberately not here. */
const EXPECTED_PATHS = [
  "/api/guide/sessions",
  "/api/guide/sessions/{sessionId}/cancel",
  "/api/guide/sessions/{sessionId}/complete",
  "/api/guide/sessions/{sessionId}/steps/{stepKey}/complete",
  "/api/guide/sessions/{sessionId}/steps/{stepKey}/recall",
];

/**
 * The full published Guide surface — the five commands plus the two read
 * routes: the pilot gate and GR-4 contextual discovery.
 */
const ALL_GUIDE_PATHS = [
  ...EXPECTED_PATHS,
  AVAILABILITY_PATH,
  DISCOVERY_PATH,
].sort();

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
  it("publishes exactly seven paths — five commands and two read routes", () => {
    expect(GUIDE_PATHS).toEqual(ALL_GUIDE_PATHS);
    const ids = EXPECTED_PATHS.map((p) => openapi.paths[p]?.post?.operationId)
      .filter((id): id is string => typeof id === "string")
      .sort();
    expect(ids).toEqual(EXPECTED_OPERATION_IDS);
  });

  it("exposes ONLY POST on the five COMMAND paths", () => {
    for (const path of EXPECTED_PATHS) {
      expect(Object.keys(openapi.paths[path] ?? {})).toEqual(["post"]);
    }
  });

  it("availability is a GET-only opaque boolean, with its own operationId", () => {
    const ops = openapi.paths[AVAILABILITY_PATH];
    expect(Object.keys(ops ?? {})).toEqual(["get"]);
    const get = ops?.get;
    expect(get?.operationId).toBe("getGuideAvailability");
    // No request body — it takes nothing but the JWT.
    expect(get?.requestBody).toBeUndefined();
    const schema =
      get?.responses?.["200"]?.content?.["application/json"]?.schema;
    expect(schema?.additionalProperties).toBe(false);
    expect([...(schema?.required ?? [])].sort()).toEqual(["available"]);
    expect(Object.keys(schema?.properties ?? {})).toEqual(["available"]);
    expect(schema?.properties?.available?.type).toBe("boolean");
  });

  it("has no generic event / progress / catalog endpoint", () => {
    for (const path of Object.keys(openapi.paths)) {
      expect(path).not.toBe("/api/guide/events");
      expect(path).not.toBe("/api/guide/complete");
      expect(path).not.toBe("/api/guide/progress");
      expect(path).not.toBe("/api/guide/definitions");
      // GR-4 discovery answers ONE pinned context; it is not a listing.
      expect(path).not.toBe("/api/guide/discovery");
      expect(path).not.toBe("/api/learning-events");
    }
  });

  // ── GR-4 · contextual discovery ────────────────────────────────────────────
  describe("contextual discovery", () => {
    const get = () => openapi.paths[DISCOVERY_PATH]?.get;

    it("is a GET-only, JWT-secured read route with its own operationId", () => {
      expect(Object.keys(openapi.paths[DISCOVERY_PATH] ?? {})).toEqual(["get"]);
      expect(get()?.operationId).toBe("getGuideDiscovery");
      expect(get()?.requestBody).toBeUndefined();
      expect(get()?.security).toEqual([{ bearer: [] }]);
    });

    it("documents both path parameters with the shape the route accepts", () => {
      const params = get()?.parameters ?? [];
      expect(params.map((p) => p.name)).toEqual(["bookSlug", "chapterOrder"]);
      for (const p of params) {
        expect(p.in, p.name).toBe("path");
        expect(p.required, p.name).toBe(true);
      }
      const [slug, order] = params;
      // Canonical kebab-case, not "any string".
      expect(slug?.schema?.type).toBe("string");
      expect(slug?.schema?.pattern).toBe("^[a-z0-9]+(?:-[a-z0-9]+)*$");
      // A positive integer — "chapter zero" is not a place a reader can stand.
      expect(order?.schema?.type).toBe("integer");
      expect(order?.schema?.minimum).toBe(1);
    });

    it("answers a CLOSED two-arm union, both arms sealed", () => {
      const schema = get()?.responses?.["200"]?.content?.["application/json"]
        ?.schema as Schema & { oneOf?: Schema[] };
      const arms = schema?.oneOf ?? [];
      expect(arms).toHaveLength(2);
      for (const arm of arms) {
        expect(arm.additionalProperties).toBe(false);
      }
      const [unavailable, available] = arms;
      expect([...(unavailable?.required ?? [])]).toEqual(["available"]);
      expect(Object.keys(unavailable?.properties ?? {})).toEqual(["available"]);
      expect([...(available?.required ?? [])].sort()).toEqual([
        "available",
        "guideKey",
        "guideVersion",
      ]);
    });

    it("documents 400, 401 and 500 — and never a 503", () => {
      const statuses = Object.keys(get()?.responses ?? {});
      for (const s of ["200", "400", "401", "500"]) {
        expect(statuses, s).toContain(s);
      }
      // Rollout-off is a 200 `available:false`, never a denial: publishing a
      // 503 here would describe a behaviour this route does not have.
      expect(statuses).not.toContain("503");
    });

    it("names no target, no editorial id and no actor", () => {
      const serialized = JSON.stringify(openapi.paths[DISCOVERY_PATH]);
      for (const term of [
        "conceptKey",
        "exerciseKey",
        "itemKey",
        "correctOptionKey",
        "editionId",
        "editionKey",
        "unitId",
        "unitKey",
        "revisionId",
        "bookId",
        "userId",
      ]) {
        expect(serialized.includes(`"${term}"`), term).toBe(false);
      }
    });
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

  it("only the five COMMANDS document 503, and the availability gate never does", () => {
    for (const path of EXPECTED_PATHS) {
      expect(
        Object.keys(openapi.paths[path]?.post?.responses ?? {}),
        `${path} → 503`,
      ).toContain("503");
    }
    // The JWT-gated availability check answers `false`; it never DENIES with a
    // 503, so publishing one would misrepresent the contract.
    expect(
      Object.keys(openapi.paths[AVAILABILITY_PATH]?.get?.responses ?? {}),
    ).not.toContain("503");
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
    for (const path of EXPECTED_PATHS) {
      // GR-3 — recall is the ONE command that says more than the session: it
      // also carries the outcome the reader is shown. Everything else stays
      // exactly at the three-field shape.
      const expectedTop = path.endsWith("/recall")
        ? ["created", "feedback", "replayed", "session"]
        : ["created", "replayed", "session"];
      for (const status of ["200", "201"]) {
        const schema = responseOf(path, status);
        expect(schema, `${path} ${status}`).toBeDefined();
        expect(schema.additionalProperties, `${path} ${status}`).toBe(false);
        expect(
          [...(schema.required ?? [])].sort(),
          `${path} ${status}`,
        ).toEqual(expectedTop);
        expect(
          Object.keys(schema.properties ?? {}).sort(),
          `${path} ${status}`,
        ).toEqual(expectedTop);
        const session = schema.properties?.session as Schema;
        expect(session.additionalProperties).toBe(false);
        expect([...(session.required ?? [])].sort()).toEqual(SESSION_FIELDS);
        expect(Object.keys(session.properties ?? {}).sort()).toEqual(
          SESSION_FIELDS,
        );
      }
    }
  });

  it("GR-3 — the recall feedback is closed, two-valued, and never says INCORRECT", () => {
    const recall = "/api/guide/sessions/{sessionId}/steps/{stepKey}/recall";
    for (const status of ["200", "201"]) {
      const feedback = responseOf(recall, status).properties
        ?.feedback as Schema;
      expect(feedback, status).toBeDefined();
      expect(feedback.additionalProperties, status).toBe(false);
      expect([...(feedback.required ?? [])], status).toEqual(["outcome"]);
      expect(Object.keys(feedback.properties ?? {}), status).toEqual([
        "outcome",
      ]);
      const outcome = feedback.properties?.outcome as Schema & {
        enum?: string[];
      };
      // Exactly two values. `INCORRECT` is the ledger's word for the graded
      // fact; the public vocabulary is an invitation to look again.
      expect([...(outcome.enum ?? [])].sort(), status).toEqual([
        "CORRECT",
        "REVIEW",
      ]);
    }
    // No other command grew a feedback object.
    for (const path of EXPECTED_PATHS.filter((p) => !p.endsWith("/recall"))) {
      for (const status of ["200", "201"]) {
        expect(
          JSON.stringify(responseOf(path, status)).includes('"feedback"'),
          `${path} ${status}`,
        ).toBe(false);
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
    for (const path of EXPECTED_PATHS) {
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

  it("the generated client preserves every published Guide path", () => {
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
    for (const path of ALL_GUIDE_PATHS) {
      expect(generated, path).toContain(path);
    }
    for (const id of [
      ...EXPECTED_OPERATION_IDS,
      "getGuideAvailability",
      "getGuideDiscovery",
    ]) {
      expect(generated, id).toContain(id);
    }
    expect(generated).not.toContain("correctOptionKey");
  });
});

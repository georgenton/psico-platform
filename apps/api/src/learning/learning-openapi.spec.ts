import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.3 — ratchet over the PUBLISHED learning contract (`openapi.json` +
 * the generated client). The runtime parsers are the authority; this spec
 * pins that the DOCUMENTED contract states the same thing:
 *
 *   - no generic learning-event endpoint exists;
 *   - every command body is CLOSED (`additionalProperties: false`);
 *   - the recall request is an EXACT two-variant `oneOf` whose closed
 *     variants make the objective/self-assessed choice a structural XOR;
 *   - the event record is a `type`-discriminated union of the seven exact
 *     payloads — no free-form payload, no `userId`;
 *   - the generated client preserves all of it.
 *
 * Loosening any of these is a DELIBERATE contract change that must edit this
 * file too.
 */

interface Schema {
  type?: string;
  oneOf?: Schema[];
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  enum?: unknown[];
  discriminator?: { propertyName?: string };
}

const openapi = JSON.parse(
  readFileSync(join(process.cwd(), "openapi.json"), "utf8"),
) as {
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: {
          content?: Record<string, { schema?: Schema }>;
        };
        responses?: Record<
          string,
          { content?: Record<string, { schema?: Schema }> }
        >;
      }
    >
  >;
};

const GENERATED = readFileSync(
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

const COMMAND_PATHS = [
  "/api/learning/units/{unitKey}/open",
  "/api/learning/units/{unitKey}/complete",
  "/api/learning/concepts/{conceptKey}/explore",
  "/api/learning/recall-attempts",
  "/api/learning/practices/{exerciseKey}/complete",
];

function bodySchema(path: string): Schema {
  const schema =
    openapi.paths[path]?.post?.requestBody?.content?.["application/json"]
      ?.schema;
  expect(schema, path).toBeDefined();
  return schema as Schema;
}

/** Every object this schema can accept is closed (directly or per-variant). */
function isClosed(schema: Schema): boolean {
  if (schema.oneOf) return schema.oneOf.every((v) => isClosed(v));
  return schema.additionalProperties === false;
}

describe("ratchet · learning OpenAPI contract", () => {
  it("GENERIC_LEARNING_EVENT_ENDPOINT_EXISTS=false", () => {
    const offenders = Object.keys(openapi.paths).filter((p) =>
      p.includes("/learning/events"),
    );
    expect(offenders).toEqual([]);
  });

  it("COMMAND_BODIES_ADDITIONAL_PROPERTIES=false — every command body is closed", () => {
    for (const path of COMMAND_PATHS) {
      expect(isClosed(bodySchema(path)), path).toBe(true);
    }
  });

  it("RECALL_REQUEST_ONE_OF_EXACT — two variants, exact required/properties, no server-owned fields", () => {
    const schema = bodySchema("/api/learning/recall-attempts");
    expect(schema.oneOf).toHaveLength(2);
    const [objective, selfAssessed] = schema.oneOf as [Schema, Schema];

    expect(objective.required?.slice().sort()).toEqual([
      "idempotencyKey",
      "itemKey",
      "selectedOptionKey",
    ]);
    expect(Object.keys(objective.properties ?? {}).sort()).toEqual([
      "idempotencyKey",
      "itemKey",
      "selectedOptionKey",
    ]);

    expect(selfAssessed.required?.slice().sort()).toEqual([
      "idempotencyKey",
      "itemKey",
      "selfResult",
    ]);
    expect(Object.keys(selfAssessed.properties ?? {}).sort()).toEqual([
      "idempotencyKey",
      "itemKey",
      "selfResult",
    ]);

    // The server-owned fields are documented in NEITHER variant:
    for (const variant of [objective, selfAssessed]) {
      for (const forbidden of ["result", "evaluationSource"]) {
        expect(variant.properties?.[forbidden], forbidden).toBeUndefined();
      }
    }
  });

  it("RECALL_REQUEST_XOR_DOCUMENTED — closed variants make the choice exclusive", () => {
    const schema = bodySchema("/api/learning/recall-attempts");
    const [objective, selfAssessed] = schema.oneOf as [Schema, Schema];
    // Each variant is closed AND lacks the other's discriminating field, so a
    // body carrying both fields matches NEITHER variant — structural XOR.
    expect(objective.additionalProperties).toBe(false);
    expect(selfAssessed.additionalProperties).toBe(false);
    expect(objective.properties?.selfResult).toBeUndefined();
    expect(selfAssessed.properties?.selectedOptionKey).toBeUndefined();
  });

  it("EVENT_RECORD_TYPE_PAYLOAD_DISCRIMINATED — seven coupled variants, discriminated by type", () => {
    const response =
      openapi.paths["/api/learning/units/{unitKey}/open"].post.responses?.[
        "201"
      ]?.content?.["application/json"]?.schema;
    expect(response).toBeDefined();
    const record = (response as Schema).properties?.event as Schema;
    expect(record.discriminator?.propertyName).toBe("type");
    expect(record.oneOf).toHaveLength(7);

    const types = (record.oneOf as Schema[]).map(
      (v) => v.properties?.type?.enum?.[0],
    );
    expect(types).toEqual([
      "unit_opened",
      "unit_completed",
      "concept_explored",
      "guide_session_started",
      "guide_session_completed",
      "active_recall_attempted",
      "practice_completed",
    ]);

    for (const variant of record.oneOf as Schema[]) {
      const label = String(variant.properties?.type?.enum?.[0]);
      // Every variant is a closed object whose `type` couples to its payload:
      expect(variant.additionalProperties, label).toBe(false);
      const payload = variant.properties?.payload as Schema;
      // EVENT_RECORD_PAYLOAD_FREE_FORM=false — no payload admits arbitrary
      // properties (recall is itself a two-variant closed union):
      expect(isClosed(payload), label).toBe(true);
      // The response never exposes the actor:
      expect(variant.properties?.userId, label).toBeUndefined();
      expect(JSON.stringify(variant), label).not.toContain("userId");
    }

    // active_recall_attempted documents BOTH evaluationSource variants:
    const recall = (record.oneOf as Schema[])[5].properties?.payload as Schema;
    expect(recall.oneOf).toHaveLength(2);
    const sources = (recall.oneOf as Schema[]).map(
      (v) => v.properties?.evaluationSource?.enum?.[0],
    );
    expect(sources.sort()).toEqual(["self_assessed", "server"]);
  });

  it("generated client preserves the union and leaks nothing", () => {
    // The recall REQUEST keeps the objective/self-assessed union and never
    // exposes the server-owned fields:
    const opStart = GENERATED.indexOf(
      "LearningController_submitRecallAttempt:",
    );
    expect(opStart).toBeGreaterThan(-1);
    const opBlock = GENERATED.slice(opStart, opStart + 4000);
    const requestSlice = opBlock.slice(
      opBlock.indexOf("requestBody"),
      opBlock.indexOf("responses"),
    );
    expect(requestSlice).toContain("selectedOptionKey");
    expect(requestSlice).toContain("selfResult");
    expect(requestSlice).not.toContain("evaluationSource");
    expect(requestSlice).not.toMatch(/\bresult\??:/);

    // The learning operations never model a payload as free-form and never
    // expose userId:
    const opsStart = GENERATED.indexOf("LearningController_openUnit:");
    const opsEnd = GENERATED.indexOf("LearningController_getProgress:");
    expect(opsStart).toBeGreaterThan(-1);
    const learningOps = GENERATED.slice(opsStart, opsEnd + 4000);
    expect(learningOps).not.toContain("Record<string, unknown>");
    expect(learningOps).not.toContain("userId");
    // The literal event types survived generation (openapi-typescript hoists
    // the inline enums into named aliases, so they live file-wide):
    for (const t of [
      '"unit_opened"',
      '"active_recall_attempted"',
      '"practice_completed"',
    ]) {
      expect(GENERATED).toContain(t);
    }
  });
});

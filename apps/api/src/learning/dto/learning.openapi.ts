import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

/**
 * CC-7.3 — CLOSED OpenAPI schemas for the learning surface.
 *
 * Raw schema objects (not class-based DTOs) so the published contract can
 * state what the CC-7.1 parsers actually enforce: `additionalProperties:
 * false` everywhere, the recall request as an EXACT two-variant `oneOf`
 * (mutually exclusive by construction — each closed variant rejects the
 * other's field), and the event record as a `type`-discriminated union of
 * the seven exact payloads. The parsers remain the runtime authority; these
 * schemas document them 1:1 instead of a loose approximation.
 */

const UUID_PROP: SchemaObject = {
  type: "string",
  format: "uuid",
  description: "Mandatory client idempotency key (UUID, any casing).",
};

const KEY_PROP: SchemaObject = { type: "string", minLength: 1, maxLength: 200 };

/** The closed body of open/complete/explore/practice commands. */
export const IDEMPOTENT_COMMAND_BODY: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["idempotencyKey"],
  properties: { idempotencyKey: UUID_PROP },
};

/**
 * The recall request — an exclusive union. Each variant is CLOSED, so the
 * presence of the other variant's field (or of the server-owned
 * `result`/`evaluationSource`) makes the request match neither: the XOR is
 * structural, not just prose.
 */
export const RECALL_ATTEMPT_BODY: SchemaObject = {
  description:
    "Exclusivo: un ítem objetivo envía selectedOptionKey (el SERVIDOR " +
    "califica); un ítem self-assessed envía selfResult. Nunca ambos; " +
    "`result`/`evaluationSource` jamás se aceptan del cliente.",
  oneOf: [
    {
      type: "object",
      title: "ObjectiveRecallAttempt",
      additionalProperties: false,
      required: ["idempotencyKey", "itemKey", "selectedOptionKey"],
      properties: {
        idempotencyKey: UUID_PROP,
        itemKey: KEY_PROP,
        selectedOptionKey: {
          ...KEY_PROP,
          description:
            "La opción elegida del catálogo del ítem — el servidor la califica.",
        },
      },
    },
    {
      type: "object",
      title: "SelfAssessedRecallAttempt",
      additionalProperties: false,
      required: ["idempotencyKey", "itemKey", "selfResult"],
      properties: {
        idempotencyKey: UUID_PROP,
        itemKey: KEY_PROP,
        selfResult: {
          type: "string",
          enum: ["correct", "incorrect", "skipped"],
          description:
            "La autoevaluación categórica del usuario (solo si el catálogo " +
            "declara el modo self-assessed).",
        },
      },
    },
  ],
};

// ─── the seven exact persisted payloads ─────────────────────────────────────

const closed = (
  required: string[],
  properties: Record<string, SchemaObject>,
): SchemaObject => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

const STR: SchemaObject = { type: "string" };
const NULLABLE_STR: SchemaObject = { type: "string", nullable: true };
const INT: SchemaObject = { type: "integer" };

export const LEARNING_EVENT_PAYLOADS: Record<string, SchemaObject> = {
  unit_opened: closed(["editionKey", "unitKey"], {
    editionKey: STR,
    unitKey: STR,
  }),
  unit_completed: closed(["editionKey", "unitKey", "revisionNumber"], {
    editionKey: STR,
    unitKey: STR,
    revisionNumber: INT,
  }),
  concept_explored: closed(["conceptKey", "unitKey"], {
    conceptKey: STR,
    unitKey: STR,
  }),
  guide_session_started: closed(["guideSessionId"], { guideSessionId: STR }),
  guide_session_completed: closed(["guideSessionId", "stepsCompleted"], {
    guideSessionId: STR,
    stepsCompleted: INT,
  }),
  active_recall_attempted: {
    description:
      "Unión discriminada por evaluationSource: la variante server conserva " +
      "la opción elegida; la self-assessed nunca finge una opción.",
    oneOf: [
      closed(
        [
          "unitKey",
          "itemKey",
          "conceptKey",
          "evaluationSource",
          "selectedOptionKey",
          "result",
        ],
        {
          unitKey: STR,
          itemKey: STR,
          conceptKey: NULLABLE_STR,
          evaluationSource: { type: "string", enum: ["server"] },
          selectedOptionKey: STR,
          result: { type: "string", enum: ["correct", "incorrect"] },
        },
      ),
      closed(
        [
          "unitKey",
          "itemKey",
          "conceptKey",
          "evaluationSource",
          "selectedOptionKey",
          "result",
        ],
        {
          unitKey: STR,
          itemKey: STR,
          conceptKey: NULLABLE_STR,
          evaluationSource: { type: "string", enum: ["self_assessed"] },
          selectedOptionKey: {
            type: "string",
            nullable: true,
            enum: [null],
            description: "Siempre null — una autoevaluación no elige opción.",
          },
          result: {
            type: "string",
            enum: ["correct", "incorrect", "skipped"],
          },
        },
      ),
    ],
  },
  practice_completed: closed(["exerciseKey", "unitKey"], {
    exerciseKey: STR,
    unitKey: STR,
  }),
};

/**
 * The public event record: a `type`-discriminated union of seven variants,
 * each coupling `type` to its EXACT payload. Never carries `userId`.
 */
export const LEARNING_EVENT_RECORD: SchemaObject = {
  discriminator: { propertyName: "type" },
  oneOf: Object.entries(LEARNING_EVENT_PAYLOADS).map(([type, payload]) => ({
    type: "object",
    title: `LearningEventRecord_${type}`,
    additionalProperties: false,
    required: [
      "id",
      "schemaVersion",
      "occurredAt",
      "type",
      "payload",
      "editionId",
      "unitId",
      "conceptId",
      "guideSessionId",
    ],
    properties: {
      id: STR,
      schemaVersion: { type: "integer", enum: [1] },
      occurredAt: {
        type: "string",
        format: "date-time",
        description: "Reloj del servidor — el cliente no fecha eventos.",
      },
      type: { type: "string", enum: [type] },
      payload,
      editionId: NULLABLE_STR,
      unitId: NULLABLE_STR,
      conceptId: NULLABLE_STR,
      guideSessionId: NULLABLE_STR,
    },
  })) as SchemaObject[],
};

/** The closed command response (201 create / 200 exact replay). */
export const LEARNING_COMMAND_RESPONSE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["created", "replayed", "event"],
  properties: {
    created: { type: "boolean" },
    replayed: { type: "boolean" },
    event: LEARNING_EVENT_RECORD,
  },
};

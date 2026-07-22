import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

/**
 * CC-7.4D — CLOSED OpenAPI schemas for the Guide surface.
 *
 * Raw schema objects (not class DTOs) so the published contract states exactly
 * what the pure parsers enforce: `additionalProperties: false` everywhere, the
 * catalog key grammar as a real pattern, and a response that carries only the
 * seven public session fields. The parsers remain the runtime authority; these
 * schemas document them 1:1 instead of approximating them.
 *
 * What is NOT here is the contract: no editorial context, no target keys, no
 * `result`/`evaluationSource`, no `correctOptionKey`, no `userId`, no
 * metadata/payload envelope.
 */

const UUID_PROP: SchemaObject = {
  type: "string",
  format: "uuid",
  description: "Clave de idempotencia del cliente (UUID, cualquier casing).",
};

/** The closed catalog grammar (ADR 0019 §2), as the parsers enforce it. */
const CATALOG_KEY_PROP: SchemaObject = {
  type: "string",
  pattern: "^[a-z0-9][a-z0-9._:-]{0,199}$",
  minLength: 1,
  maxLength: 200,
};

/** POST /api/guide/sessions */
export const START_GUIDE_SESSION_BODY: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["idempotencyKey", "guideKey", "guideVersion"],
  properties: {
    idempotencyKey: UUID_PROP,
    guideKey: {
      ...CATALOG_KEY_PROP,
      description: "Clave de la guía publicada.",
    },
    guideVersion: {
      type: "integer",
      minimum: 1,
      description:
        "Versión EXACTA — la superficie nunca resuelve una «última».",
    },
  },
};

/** The body of step-complete, cancel and session-complete. */
export const IDEMPOTENT_GUIDE_BODY: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["idempotencyKey"],
  properties: { idempotencyKey: UUID_PROP },
  description:
    "`sessionId` y `stepKey` viajan solo como parámetros de ruta; los " +
    "contadores de progreso los cuenta el servidor.",
};

/** POST …/steps/:stepKey/recall */
export const GUIDE_RECALL_BODY: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["idempotencyKey", "selectedOptionKey"],
  properties: {
    idempotencyKey: UUID_PROP,
    selectedOptionKey: {
      ...CATALOG_KEY_PROP,
      description:
        "La opción elegida del catálogo del ítem — el SERVIDOR la califica. " +
        "`itemKey`, `result` y `evaluationSource` nunca se aceptan.",
    },
  },
};

/** The ONLY session shape a client ever sees. */
const GUIDE_SESSION_VIEW: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "sessionId",
    "guideKey",
    "guideVersion",
    "status",
    "stepsCompleted",
    "totalSteps",
    "currentStepKey",
  ],
  properties: {
    sessionId: { type: "string" },
    guideKey: CATALOG_KEY_PROP,
    guideVersion: { type: "integer", minimum: 1 },
    status: { type: "string", enum: ["ACTIVE", "COMPLETED", "CANCELLED"] },
    stepsCompleted: {
      type: "integer",
      minimum: 0,
      description:
        "Derivado del ledger de pasos aceptados — nunca de un contador " +
        "enviado por el cliente ni de LearningEvents.",
    },
    totalSteps: { type: "integer", minimum: 1 },
    currentStepKey: {
      type: "string",
      nullable: true,
      pattern: "^[a-z0-9][a-z0-9._:-]{0,199}$",
    },
  },
};

/** The response of all five commands. */
export const GUIDE_COMMAND_RESPONSE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["created", "replayed", "session"],
  properties: {
    created: {
      type: "boolean",
      description: "Esta llamada aplicó la transición (HTTP 201).",
    },
    replayed: {
      type: "boolean",
      description:
        "Un comando idéntico anterior ya la aplicó; nada corrió ahora " +
        "(HTTP 200).",
    },
    session: GUIDE_SESSION_VIEW,
  },
};

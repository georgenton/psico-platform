import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

import {
  GUIDE_CARD_STATES_KEY_PATTERN,
  GUIDE_CARD_STATES_MAX_CHAPTER_ORDER,
  GUIDE_CARD_STATES_MAX_PINS,
  GUIDE_CARD_STATES_MAX_VERSION,
  GUIDE_CARD_STATES_UNIT_KEY_PATTERN,
} from "../guide-card-states-params";

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

/**
 * CC-7.R1 — GET /api/guide/availability.
 *
 * A single opaque boolean: whether Guide is on for the authenticated actor
 * right now. It never states the rollout mode, the pilot allowlist or the
 * reason it is false.
 */
export const GUIDE_AVAILABILITY_RESPONSE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["available"],
  properties: { available: { type: "boolean" } },
};

/**
 * GR-4 — GET /api/guide/discovery/:bookSlug/:chapterOrder.
 *
 * A CLOSED union. The unavailable arm carries no pin at all, so a negative
 * answer can never be mined for a guide key; the available arm carries the
 * exact pin and nothing else — no requested context, no internal ids, no
 * target keys, no rollout reason.
 */
export const GUIDE_DISCOVERY_UNAVAILABLE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["available"],
  properties: { available: { type: "boolean", enum: [false] } },
};

export const GUIDE_DISCOVERY_AVAILABLE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["available", "guideKey", "guideVersion"],
  properties: {
    available: { type: "boolean", enum: [true] },
    guideKey: {
      type: "string",
      description: "Clave exacta de la guía ofrecida para este contexto.",
    },
    guideVersion: {
      type: "integer",
      minimum: 1,
      description: "Versión exacta; el par clave@versión es inmutable.",
    },
  },
};

export const GUIDE_DISCOVERY_RESPONSE: SchemaObject = {
  oneOf: [GUIDE_DISCOVERY_UNAVAILABLE, GUIDE_DISCOVERY_AVAILABLE],
};

/**
 * GR-5 — GET /api/guide/sessions/recoverable.
 *
 * A CLOSED union with the same discipline as discovery: the negative arm
 * carries `session: null` and nothing else, so it cannot be mined to learn
 * whether somebody has an active session under a different pin.
 */
export const GUIDE_RECOVERABLE_NONE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["recoverable", "session"],
  properties: {
    recoverable: { type: "boolean", enum: [false] },
    session: { type: "null" },
  },
};

export const GUIDE_RECOVERABLE_SOME: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["recoverable", "session"],
  properties: {
    recoverable: { type: "boolean", enum: [true] },
    session: GUIDE_SESSION_VIEW,
  },
};

export const GUIDE_RECOVERABLE_SESSION_RESPONSE: SchemaObject = {
  oneOf: [GUIDE_RECOVERABLE_NONE, GUIDE_RECOVERABLE_SOME],
};

/**
 * GR-7 — GET /api/guide/sessions/state.
 *
 * Three arms, each with `session` and `summary` pinned to exactly what that
 * state can carry. `NOT_STARTED` holds two nulls so it cannot be told apart
 * from "someone else's session" — a foreign run and no run must look
 * identical, or the endpoint becomes a way to probe other actors.
 */
export const GUIDE_COMPLETION_SUMMARY_VIEW: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["conceptsExplored", "practicesConfirmed", "recalls"],
  properties: {
    conceptsExplored: { type: "integer", minimum: 0 },
    practicesConfirmed: { type: "integer", minimum: 0 },
    recalls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["outcome"],
        properties: {
          // The PUBLIC verdict only. The chosen option and the correct one
          // are both absent by construction.
          outcome: { type: "string", enum: ["CORRECT", "REVIEW"] },
        },
      },
    },
  },
};

export const GUIDE_STATE_NOT_STARTED: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["state", "session", "summary"],
  properties: {
    state: { type: "string", enum: ["NOT_STARTED"] },
    session: { type: "null" },
    summary: { type: "null" },
  },
};

export const GUIDE_STATE_ACTIVE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["state", "session", "summary"],
  properties: {
    state: { type: "string", enum: ["ACTIVE"] },
    session: GUIDE_SESSION_VIEW,
    summary: { type: "null" },
  },
};

export const GUIDE_STATE_COMPLETED: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["state", "session", "summary"],
  properties: {
    state: { type: "string", enum: ["COMPLETED"] },
    session: GUIDE_SESSION_VIEW,
    summary: GUIDE_COMPLETION_SUMMARY_VIEW,
  },
};

export const GUIDE_EXPERIENCE_STATE_RESPONSE: SchemaObject = {
  oneOf: [GUIDE_STATE_NOT_STARTED, GUIDE_STATE_ACTIVE, GUIDE_STATE_COMPLETED],
};

/** C.1 — one requested pin in the card-state batch. */
const GUIDE_CARD_PIN: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["guideKey", "guideVersion"],
  properties: {
    // Taken from the parser, not retyped next to it: a published contract that
    // drifts from the code enforcing it is worse than no contract.
    guideKey: {
      type: "string",
      pattern: GUIDE_CARD_STATES_KEY_PATTERN,
      minLength: 1,
      maxLength: 200,
    },
    guideVersion: {
      type: "integer",
      minimum: 1,
      maximum: GUIDE_CARD_STATES_MAX_VERSION,
    },
  },
};

/**
 * C.3R — where the reader is, as the client can honestly describe it.
 *
 * `unitKey` is an ENVIRONMENT-LOCAL locator and never proof of anything: the
 * server looks the unit up by it inside the published revision and then
 * requires the claimed navigation to be where that unit actually sits. There is
 * deliberately no `contentUnitId` here, in either direction — a client that
 * could name an internal id could also name someone else's.
 */
const GUIDE_CARD_STATES_READER: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["bookSlug", "chapterOrder", "unitKey"],
  properties: {
    bookSlug: {
      type: "string",
      pattern: GUIDE_CARD_STATES_KEY_PATTERN,
      minLength: 1,
      maxLength: 200,
    },
    chapterOrder: {
      type: "integer",
      minimum: 1,
      maximum: GUIDE_CARD_STATES_MAX_CHAPTER_ORDER,
      description:
        "Navegación, no identidad: se contrasta con la del capítulo real y " +
        "nunca elige la unidad.",
    },
    unitKey: {
      type: "string",
      pattern: GUIDE_CARD_STATES_UNIT_KEY_PATTERN,
      minLength: 1,
      maxLength: 200,
      description:
        "Localizador local del entorno. NO es una identidad portable: la " +
        "misma obra ingerida dos veces produce claves distintas.",
    },
  },
};

/** POST /api/guide/experiences/state */
export const GUIDE_CARD_STATES_BODY: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["pins", "reader"],
  properties: {
    reader: GUIDE_CARD_STATES_READER,
    pins: {
      type: "array",
      minItems: 1,
      maxItems: GUIDE_CARD_STATES_MAX_PINS,
      items: GUIDE_CARD_PIN,
      description:
        "Pines publicados, uno por tarjeta. El orden se conserva y un pin " +
        "repetido recibe la misma respuesta repetida: dos experiencias " +
        "ligadas a la misma guía comparten linaje de verdad.",
    },
  },
};

export const GUIDE_CARD_STATES_RESPONSE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "guidePin",
          "status",
          "resumePin",
          "applicability",
          "evaluatedPin",
        ],
        properties: {
          guidePin: GUIDE_CARD_PIN,
          applicability: {
            type: "string",
            enum: ["APPLIES", "UNAVAILABLE"],
            description:
              "C.3R — si esta guía es sobre la unidad en la que está el " +
              "lector, resuelto EN EL SERVIDOR comparando identidades. El " +
              "cliente no recibe ningún identificador para recalcularlo.",
          },
          evaluatedPin: {
            ...GUIDE_CARD_PIN,
            description:
              "El pin sobre el que se emitió el veredicto: el reanudable " +
              "cuando hay linaje abierto, el publicado en caso contrario.",
          },
          status: {
            type: "string",
            enum: ["START", "CONTINUE", "COMPLETED"],
            description:
              "CONTINUE si hay una sesión ACTIVE del mismo guideKey, sea cual " +
              "sea su versión; COMPLETED solo si el pin EXACTO está " +
              "completado; START en cualquier otro caso.",
          },
          resumePin: {
            ...GUIDE_CARD_PIN,
            description:
              "El pin que debe ejecutarse al pulsar: el de la sesión abierta " +
              "cuando la hay, el publicado en caso contrario.",
          },
        },
      },
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

/**
 * GR-3 — the recall command's response. The ONE command that says more than
 * the session: the outcome the reader is shown.
 *
 * Two values, closed. `REVIEW` and not `INCORRECT`: the ledger keeps the
 * graded fact, the wire carries an invitation to look again. There is no
 * score, no percentage, no `selectedOptionKey` echo and — above all — never
 * the catalog's correct option.
 */
export const GUIDE_RECALL_COMMAND_RESPONSE: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["created", "replayed", "session", "feedback"],
  properties: {
    created: {
      type: "boolean",
      description: "Esta llamada aplicó la transición (HTTP 201).",
    },
    replayed: {
      type: "boolean",
      description:
        "Un comando idéntico anterior ya la aplicó; nada corrió ahora " +
        "(HTTP 200). El feedback es el mismo que devolvió el intento " +
        "original — se lee del ledger, no se vuelve a calificar.",
    },
    session: GUIDE_SESSION_VIEW,
    feedback: {
      type: "object",
      additionalProperties: false,
      required: ["outcome"],
      properties: {
        outcome: {
          type: "string",
          enum: ["CORRECT", "REVIEW"],
          description:
            "Lo que se le dice a la persona. Calificado por el servidor " +
            "contra la respuesta canónica del catálogo, que nunca sale.",
        },
      },
    },
  },
};

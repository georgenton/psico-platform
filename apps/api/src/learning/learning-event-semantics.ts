import type { LearningEventKind } from "@prisma/client";
import { RECALL_RESULTS } from "@psico/types";
import type {
  LearningEventPayload,
  LearningEventPayloadByType,
  LearningEventTypeV1,
} from "@psico/types";
import type { ValidatedLearningEvent } from "./validated-learning-event";

/**
 * CC-7.2 — pure semantics of the V1 learning-event store. No IO, no Nest, no
 * Prisma client: only the type↔kind vocabulary, the field-by-field payload
 * reconstruction, the exact parse of a stored payload, and the semantic
 * comparator the idempotency path relies on.
 */

// ─── type ↔ kind vocabulary ─────────────────────────────────────────────────

/**
 * Exhaustive V1 map (the `satisfies` fails to compile if a V1 type is missing
 * or maps outside the Prisma enum). The four non-V1 kinds are deliberately
 * absent: they cannot be produced through the typed repository.
 */
export const TYPE_TO_KIND = {
  unit_opened: "UNIT_OPENED",
  unit_completed: "UNIT_COMPLETED",
  concept_explored: "CONCEPT_EXPLORED",
  guide_session_started: "GUIDE_SESSION_STARTED",
  guide_session_completed: "GUIDE_SESSION_COMPLETED",
  active_recall_attempted: "ACTIVE_RECALL_ATTEMPTED",
  practice_completed: "PRACTICE_COMPLETED",
} as const satisfies Record<LearningEventTypeV1, LearningEventKind>;

/** Reverse lookup — undefined for the four non-V1 kinds. */
export const KIND_TO_TYPE: Partial<Record<string, LearningEventTypeV1>> =
  Object.fromEntries(
    (Object.entries(TYPE_TO_KIND) as Array<[LearningEventTypeV1, string]>).map(
      ([type, kind]) => [kind, type],
    ),
  );

// ─── payload reconstruction (write path) ────────────────────────────────────

/**
 * Rebuild the payload FIELD BY FIELD from the validated union. This is the
 * write-path guarantee that no extra property on a caller's object — however
 * it was constructed — can ride into storage: only the declared fields of the
 * declared type are copied, never a spread of the input.
 */
export function rebuildPayload(
  event: ValidatedLearningEvent,
): LearningEventPayload {
  switch (event.type) {
    case "unit_opened":
      return {
        editionKey: event.payload.editionKey,
        unitKey: event.payload.unitKey,
      };
    case "unit_completed":
      return {
        editionKey: event.payload.editionKey,
        unitKey: event.payload.unitKey,
        revisionNumber: event.payload.revisionNumber,
      };
    case "concept_explored":
      return {
        conceptKey: event.payload.conceptKey,
        unitKey: event.payload.unitKey,
      };
    case "guide_session_started":
      return { guideSessionId: event.payload.guideSessionId };
    case "guide_session_completed":
      return {
        guideSessionId: event.payload.guideSessionId,
        stepsCompleted: event.payload.stepsCompleted,
      };
    case "active_recall_attempted":
      // CC-7.3 — the payload is a union discriminated by evaluationSource:
      // objective preserves the chosen option; self-assessed never fakes one.
      return event.payload.evaluationSource === "server"
        ? {
            unitKey: event.payload.unitKey,
            itemKey: event.payload.itemKey,
            conceptKey: event.payload.conceptKey,
            evaluationSource: "server",
            selectedOptionKey: event.payload.selectedOptionKey,
            result: event.payload.result,
          }
        : {
            unitKey: event.payload.unitKey,
            itemKey: event.payload.itemKey,
            conceptKey: event.payload.conceptKey,
            evaluationSource: "self_assessed",
            selectedOptionKey: null,
            result: event.payload.result,
          };
    case "practice_completed":
      return {
        exerciseKey: event.payload.exerciseKey,
        unitKey: event.payload.unitKey,
      };
  }
}

// ─── stored payload parse (read path) ───────────────────────────────────────

const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => Number.isInteger(v);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Exact key set — a stored payload with extra or missing keys is malformed. */
function hasExactKeys(o: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

/**
 * Exact parse of a stored payload for a given V1 type. Returns the typed
 * payload, or `null` when the stored JSON does not match the declared shape
 * exactly (wrong keys, wrong primitive types, out-of-enum members). A
 * malformed stored payload is never "equivalent" to anything and never
 * reaches a caller as a typed record.
 */
export function readStoredPayload<T extends LearningEventTypeV1>(
  type: T,
  stored: unknown,
): LearningEventPayloadByType[T] | null {
  if (!isPlainObject(stored)) return null;
  const parsed = parseByType(type, stored);
  // The switch above proves the shape; the cast re-states for the generic
  // signature what the type system cannot carry out of a runtime switch.
  return parsed as LearningEventPayloadByType[T] | null;
}

function parseByType(
  type: LearningEventTypeV1,
  o: Record<string, unknown>,
): LearningEventPayload | null {
  switch (type) {
    case "unit_opened":
      return hasExactKeys(o, ["editionKey", "unitKey"]) &&
        isStr(o.editionKey) &&
        isStr(o.unitKey)
        ? { editionKey: o.editionKey, unitKey: o.unitKey }
        : null;
    case "unit_completed":
      return hasExactKeys(o, ["editionKey", "unitKey", "revisionNumber"]) &&
        isStr(o.editionKey) &&
        isStr(o.unitKey) &&
        isInt(o.revisionNumber)
        ? {
            editionKey: o.editionKey,
            unitKey: o.unitKey,
            revisionNumber: o.revisionNumber,
          }
        : null;
    case "concept_explored":
      return hasExactKeys(o, ["conceptKey", "unitKey"]) &&
        isStr(o.conceptKey) &&
        isStr(o.unitKey)
        ? { conceptKey: o.conceptKey, unitKey: o.unitKey }
        : null;
    case "guide_session_started":
      return hasExactKeys(o, ["guideSessionId"]) && isStr(o.guideSessionId)
        ? { guideSessionId: o.guideSessionId }
        : null;
    case "guide_session_completed":
      return hasExactKeys(o, ["guideSessionId", "stepsCompleted"]) &&
        isStr(o.guideSessionId) &&
        isInt(o.stepsCompleted)
        ? { guideSessionId: o.guideSessionId, stepsCompleted: o.stepsCompleted }
        : null;
    case "active_recall_attempted": {
      // CC-7.3 union — exact keys for BOTH variants; the variant-specific
      // constraints are enforced by the evaluationSource branch below.
      if (
        !hasExactKeys(o, [
          "unitKey",
          "itemKey",
          "conceptKey",
          "evaluationSource",
          "selectedOptionKey",
          "result",
        ]) ||
        !isStr(o.unitKey) ||
        !isStr(o.itemKey) ||
        !(o.conceptKey === null || isStr(o.conceptKey))
      ) {
        return null;
      }
      if (o.evaluationSource === "server") {
        return isStr(o.selectedOptionKey) &&
          (o.result === "correct" || o.result === "incorrect")
          ? {
              unitKey: o.unitKey,
              itemKey: o.itemKey,
              conceptKey: o.conceptKey as string | null,
              evaluationSource: "server",
              selectedOptionKey: o.selectedOptionKey,
              result: o.result,
            }
          : null;
      }
      if (o.evaluationSource === "self_assessed") {
        return o.selectedOptionKey === null &&
          (RECALL_RESULTS as readonly unknown[]).includes(o.result)
          ? {
              unitKey: o.unitKey,
              itemKey: o.itemKey,
              conceptKey: o.conceptKey as string | null,
              evaluationSource: "self_assessed",
              selectedOptionKey: null,
              result: o.result as (typeof RECALL_RESULTS)[number],
            }
          : null;
      }
      return null;
    }
    case "practice_completed":
      return hasExactKeys(o, ["exerciseKey", "unitKey"]) &&
        isStr(o.exerciseKey) &&
        isStr(o.unitKey)
        ? { exerciseKey: o.exerciseKey, unitKey: o.unitKey }
        : null;
  }
}

// ─── semantic comparator (idempotency path) ─────────────────────────────────

/** The stored columns the comparator inspects (a subset of the Prisma row). */
export interface StoredLearningEventSemantics {
  kind: string;
  payload: unknown;
  editionId: string | null;
  unitId: string | null;
  conceptId: string | null;
  guideSessionId: string | null;
  blockKey: string | null;
  schemaVersion: number | null;
}

/** `undefined` and `null` mean the same absent reference on the input side. */
const ref = (v: string | null | undefined): string | null => v ?? null;

/**
 * Exhaustive semantic equality between a stored row and a validated input
 * sharing its `(userId, idempotencyKey)`. Compares type, the exact payload
 * (via the per-type exact parse — never JSON strings, so property order can
 * never fake a difference or an equality), every resolved reference, blockKey
 * and schemaVersion. Ignores `id` and `createdAt` (server-assigned identity
 * and clock are not semantics).
 */
export function isSemanticallyEquivalent(
  row: StoredLearningEventSemantics,
  input: ValidatedLearningEvent,
): boolean {
  if (row.kind !== TYPE_TO_KIND[input.type]) return false;
  if (row.schemaVersion !== 1) return false;
  if (row.editionId !== ref(input.editionId)) return false;
  if (row.unitId !== ref(input.unitId)) return false;
  if (row.conceptId !== ref(input.conceptId)) return false;
  if (row.guideSessionId !== ref(input.guideSessionId)) return false;
  if (row.blockKey !== ref(input.blockKey)) return false;

  const stored = readStoredPayload(input.type, row.payload);
  if (stored === null) return false;
  return payloadEquals(input, stored);
}

/** Field-by-field payload equality, per type — no generic deep-equal. */
function payloadEquals(
  input: ValidatedLearningEvent,
  stored: LearningEventPayload,
): boolean {
  switch (input.type) {
    case "unit_opened": {
      const s = stored as LearningEventPayloadByType["unit_opened"];
      return (
        s.editionKey === input.payload.editionKey &&
        s.unitKey === input.payload.unitKey
      );
    }
    case "unit_completed": {
      const s = stored as LearningEventPayloadByType["unit_completed"];
      return (
        s.editionKey === input.payload.editionKey &&
        s.unitKey === input.payload.unitKey &&
        s.revisionNumber === input.payload.revisionNumber
      );
    }
    case "concept_explored": {
      const s = stored as LearningEventPayloadByType["concept_explored"];
      return (
        s.conceptKey === input.payload.conceptKey &&
        s.unitKey === input.payload.unitKey
      );
    }
    case "guide_session_started": {
      const s = stored as LearningEventPayloadByType["guide_session_started"];
      return s.guideSessionId === input.payload.guideSessionId;
    }
    case "guide_session_completed": {
      const s = stored as LearningEventPayloadByType["guide_session_completed"];
      return (
        s.guideSessionId === input.payload.guideSessionId &&
        s.stepsCompleted === input.payload.stepsCompleted
      );
    }
    case "active_recall_attempted": {
      const s = stored as LearningEventPayloadByType["active_recall_attempted"];
      // All six fields compared — notably selectedOptionKey: two objective
      // attempts with different options are DIFFERENT events even when the
      // derived result matches (same idempotencyKey ⇒ conflict).
      return (
        s.unitKey === input.payload.unitKey &&
        s.itemKey === input.payload.itemKey &&
        s.conceptKey === input.payload.conceptKey &&
        s.evaluationSource === input.payload.evaluationSource &&
        s.selectedOptionKey === input.payload.selectedOptionKey &&
        s.result === input.payload.result
      );
    }
    case "practice_completed": {
      const s = stored as LearningEventPayloadByType["practice_completed"];
      return (
        s.exerciseKey === input.payload.exerciseKey &&
        s.unitKey === input.payload.unitKey
      );
    }
  }
}

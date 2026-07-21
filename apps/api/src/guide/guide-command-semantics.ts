/**
 * CC-7.4B — the V1 semantic contracts + fingerprint of a Guide command
 * (ADR 0019 §7, hardened per the PR #590 closure):
 *
 *   - SEMANTICS and RESULT LINKAGE are separate: `ValidatedGuideStartSemantics`
 *     carries NO sessionId (the server has not created it yet at inspection
 *     time — it is structurally impossible to leak a placeholder in);
 *     the sessionId a START stores is the `resultSessionId` of the WRITE,
 *     i.e. the session the server actually created;
 *   - STEP_COMPLETE is a CLOSED DISCRIMINATED UNION: each kind carries its
 *     exact target field — a kind/target mismatch is inexpressible in types
 *     and rejected pre-DB at runtime;
 *   - the fingerprint is a DETERMINISTIC, length-prefixed encoding over
 *     already-validated ASCII values (no JSON, no opaque hashes, no bare
 *     delimiters), and NEVER replaces the structural column comparison.
 */

export const SEMANTIC_FINGERPRINT_VERSION = 1;

/** One unambiguous segment. Exported for the self-tests. */
export function part(name: string, value: string | null): string {
  return value === null ? `${name};n` : `${name};s${value.length};${value}`;
}

// ─── Semantics — what the CLIENT's command means (never server results) ─────

export interface ValidatedGuideStartSemantics {
  commandType: "START";
  userId: string;
  idempotencyKey: string;
  guideKey: string;
  guideVersion: number;
  editionId: string | null;
  unitId: string | null;
}

/** STEP_COMPLETE — three exact variants; the target field IS the kind's. */
export type ValidatedGuideStepCompleteSemantics =
  | {
      commandType: "STEP_COMPLETE";
      userId: string;
      idempotencyKey: string;
      sessionId: string;
      stepKey: string;
      kind: "CONCEPT_EXPLORATION";
      conceptKey: string;
    }
  | {
      commandType: "STEP_COMPLETE";
      userId: string;
      idempotencyKey: string;
      sessionId: string;
      stepKey: string;
      kind: "CATALOG_PRACTICE";
      exerciseKey: string;
    }
  | {
      commandType: "STEP_COMPLETE";
      userId: string;
      idempotencyKey: string;
      sessionId: string;
      stepKey: string;
      kind: "EXPLICIT_CONFIRMATION";
      confirmationKey: string;
    };

export interface ValidatedGuideStepRecallSemantics {
  commandType: "STEP_RECALL";
  userId: string;
  idempotencyKey: string;
  sessionId: string;
  stepKey: string;
  itemKey: string;
  selectedOptionKey: string;
}

export interface ValidatedGuideCancelSemantics {
  commandType: "CANCEL";
  userId: string;
  idempotencyKey: string;
  sessionId: string;
}

export interface ValidatedGuideSessionCompleteSemantics {
  commandType: "SESSION_COMPLETE";
  userId: string;
  idempotencyKey: string;
  sessionId: string;
}

export type ValidatedGuideCommandSemantics =
  | ValidatedGuideStartSemantics
  | ValidatedGuideStepCompleteSemantics
  | ValidatedGuideStepRecallSemantics
  | ValidatedGuideCancelSemantics
  | ValidatedGuideSessionCompleteSemantics;

export type GuideCommandType = ValidatedGuideCommandSemantics["commandType"];

/**
 * What gets PERSISTED: the semantics, plus — for START only — the id of the
 * session the server just created (result linkage, server-owned, never part
 * of START's input semantics or fingerprint).
 *
 * The union is CLOSED both ways: a START write REQUIRES `resultSessionId`,
 * and a non-START write FORBIDS it — `resultSessionId?: never` makes even an
 * `undefined` result-linkage on a non-START command a type error, so the
 * envelope cannot silently carry a linkage where none may exist.
 */
export type GuideCommandReceiptWrite =
  | { semantics: ValidatedGuideStartSemantics; resultSessionId: string }
  | {
      semantics: Exclude<
        ValidatedGuideCommandSemantics,
        ValidatedGuideStartSemantics
      >;
      resultSessionId?: never;
    };

/** The exact target key of a STEP_COMPLETE variant. */
export function stepCompleteTargetKey(
  semantics: ValidatedGuideStepCompleteSemantics,
): string {
  switch (semantics.kind) {
    case "CONCEPT_EXPLORATION":
      return semantics.conceptKey;
    case "CATALOG_PRACTICE":
      return semantics.exerciseKey;
    case "EXPLICIT_CONFIRMATION":
      return semantics.confirmationKey;
  }
}

/**
 * V1 formula, per command type (ADR 0019 §7):
 *
 *   START            → commandType · guideKey · guideVersion · editionId|null · unitId|null
 *   STEP_COMPLETE    → commandType · sessionId · stepKey · kind · exact target key
 *   STEP_RECALL      → commandType · sessionId · stepKey · itemKey · selectedOptionKey
 *   CANCEL           → commandType · sessionId
 *   SESSION_COMPLETE → commandType · sessionId
 *
 * START's formula CANNOT include a sessionId — the semantics type has none.
 */
export function computeSemanticFingerprint(
  semantics: ValidatedGuideCommandSemantics,
): string {
  const parts: string[] = [`v${SEMANTIC_FINGERPRINT_VERSION}`];
  switch (semantics.commandType) {
    case "START":
      parts.push(
        part("commandType", semantics.commandType),
        part("guideKey", semantics.guideKey),
        part("guideVersion", String(semantics.guideVersion)),
        part("editionId", semantics.editionId),
        part("unitId", semantics.unitId),
      );
      break;
    case "STEP_COMPLETE":
      parts.push(
        part("commandType", semantics.commandType),
        part("sessionId", semantics.sessionId),
        part("stepKey", semantics.stepKey),
        part("kind", semantics.kind),
        part("targetKey", stepCompleteTargetKey(semantics)),
      );
      break;
    case "STEP_RECALL":
      parts.push(
        part("commandType", semantics.commandType),
        part("sessionId", semantics.sessionId),
        part("stepKey", semantics.stepKey),
        part("itemKey", semantics.itemKey),
        part("selectedOptionKey", semantics.selectedOptionKey),
      );
      break;
    case "CANCEL":
    case "SESSION_COMPLETE":
      parts.push(
        part("commandType", semantics.commandType),
        part("sessionId", semantics.sessionId),
      );
      break;
  }
  return parts.join("|");
}

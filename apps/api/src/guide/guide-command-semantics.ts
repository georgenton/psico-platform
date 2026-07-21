import type { GuideStepKind } from "@psico/types";

/**
 * CC-7.4B — the V1 semantic fingerprint of a Guide command (ADR 0019 §7,
 * hardened per the CC-7.4B instruction §6): a DETERMINISTIC, length-prefixed
 * encoding over ALREADY-VALIDATED ASCII values. No JSON (property order
 * ambiguity), no opaque hashes (undefined derivation), no bare-delimiter
 * concatenation (a value containing the delimiter could collide).
 *
 * Encoding: `v1` + one `part(name, value)` per semantic component, joined
 * with `|`. Each part is `name;n` for null or `name;s<len>;<value>` for a
 * string — the LENGTH pins exactly how many characters belong to the value,
 * so null vs empty-string vs delimiter-bearing values are all unambiguous
 * even though the key grammar rejects empties.
 *
 * The fingerprint NEVER replaces the structural column-by-column comparison
 * in the receipt repository — it is an indexable summary, compared IN
 * ADDITION to the exact semantic columns.
 */

export const SEMANTIC_FINGERPRINT_VERSION = 1;

/** One unambiguous segment. Exported for the self-tests. */
export function part(name: string, value: string | null): string {
  return value === null ? `${name};n` : `${name};s${value.length};${value}`;
}

/**
 * The internal, server-validated command union the receipt layer persists.
 * `sessionId` on START is the CREATED session (result linkage) and is
 * deliberately NOT part of START's semantics — the fingerprint formula
 * excludes it (GUIDE_START_FINGERPRINT_EXCLUDES_SERVER_SESSION_ID).
 */
export type ValidatedGuideCommand =
  | {
      commandType: "START";
      userId: string;
      idempotencyKey: string;
      /** The session this start CREATED — linkage only, never semantics. */
      sessionId: string;
      guideKey: string;
      guideVersion: number;
      editionId: string | null;
      unitId: string | null;
    }
  | {
      commandType: "STEP_COMPLETE";
      userId: string;
      idempotencyKey: string;
      sessionId: string;
      stepKey: string;
      kind: Exclude<GuideStepKind, "ACTIVE_RECALL">;
      /** Exactly one target, coupled to `kind` by the union below. */
      target:
        | { conceptKey: string }
        | { exerciseKey: string }
        | { confirmationKey: string };
    }
  | {
      commandType: "STEP_RECALL";
      userId: string;
      idempotencyKey: string;
      sessionId: string;
      stepKey: string;
      itemKey: string;
      selectedOptionKey: string;
    }
  | {
      commandType: "CANCEL";
      userId: string;
      idempotencyKey: string;
      sessionId: string;
    }
  | {
      commandType: "SESSION_COMPLETE";
      userId: string;
      idempotencyKey: string;
      sessionId: string;
    };

export type GuideCommandType = ValidatedGuideCommand["commandType"];

/** The exact target key of a STEP_COMPLETE, whichever variant it carries. */
export function stepCompleteTargetKey(
  target: Extract<
    ValidatedGuideCommand,
    { commandType: "STEP_COMPLETE" }
  >["target"],
): string {
  if ("conceptKey" in target) return target.conceptKey;
  if ("exerciseKey" in target) return target.exerciseKey;
  return target.confirmationKey;
}

/**
 * V1 formula, per command type (ADR 0019 §7 / instruction §6):
 *
 *   START            → commandType · guideKey · guideVersion · editionId|null · unitId|null
 *   STEP_COMPLETE    → commandType · sessionId · stepKey · kind · exact target key
 *   STEP_RECALL      → commandType · sessionId · stepKey · itemKey · selectedOptionKey
 *   CANCEL           → commandType · sessionId
 *   SESSION_COMPLETE → commandType · sessionId
 */
export function computeSemanticFingerprint(
  command: ValidatedGuideCommand,
): string {
  const parts: string[] = [`v${SEMANTIC_FINGERPRINT_VERSION}`];
  switch (command.commandType) {
    case "START":
      parts.push(
        part("commandType", command.commandType),
        part("guideKey", command.guideKey),
        part("guideVersion", String(command.guideVersion)),
        part("editionId", command.editionId),
        part("unitId", command.unitId),
      );
      break;
    case "STEP_COMPLETE":
      parts.push(
        part("commandType", command.commandType),
        part("sessionId", command.sessionId),
        part("stepKey", command.stepKey),
        part("kind", command.kind),
        part("targetKey", stepCompleteTargetKey(command.target)),
      );
      break;
    case "STEP_RECALL":
      parts.push(
        part("commandType", command.commandType),
        part("sessionId", command.sessionId),
        part("stepKey", command.stepKey),
        part("itemKey", command.itemKey),
        part("selectedOptionKey", command.selectedOptionKey),
      );
      break;
    case "CANCEL":
    case "SESSION_COMPLETE":
      parts.push(
        part("commandType", command.commandType),
        part("sessionId", command.sessionId),
      );
      break;
  }
  return parts.join("|");
}

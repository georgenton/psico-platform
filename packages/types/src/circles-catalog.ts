/**
 * FeelVerse Círculos — the template validator and the production catalog.
 *
 * Same shape as `guide-catalog.ts`, and for the same reason: the type system
 * makes an invalid literal unwriteable, but definitions can also arrive as
 * `unknown` — from a future authoring surface, a fixture, a mis-typed constant.
 * This validator is the runtime authority. It reconstructs field by field from
 * a closed key grammar, refuses anything it was not told to accept, and returns
 * a DEEPLY FROZEN structure without ever mutating its input.
 *
 * ── The catalog is empty, and that is the deliverable ──────────────────────
 *
 * `PRODUCTION_CIRCLE_TEMPLATES` ships with zero entries. The architecture
 * names two candidates — «Lo que necesito que puedas escuchar» and «Cómo
 * prefiero ser acompañado cuando algo me sobrepasa» — and permits adding them
 * as DRAFT *if verifiable approved copy is available*. It is not: that copy
 * lives in Notion, which this cut must not read, and inventing it would be
 * writing editorial content nobody approved. So the engine ships provably
 * ready and provably carrying nothing.
 *
 * The nine `DUO_CANDIDATES` already sitting in the Parejas chapter modules are
 * NOT imported here. They say so themselves — «PRODUCT DRAFT ONLY. No runtime,
 * no tables, no endpoints» — and PQP C07 ships an empty list on purpose,
 * because a bilateral activity is the wrong instrument where coercion may
 * exist. Promoting any of them is an editorial decision, not a wiring one.
 *
 * ── What the validator refuses that a reviewer might not ───────────────────
 *
 * Two invariants here are STRONGER than the prose they come from, and both are
 * deliberate. They are called out in the ADR so an auditor can reject them:
 *
 *   1. Every template must offer a way NOT to share (`KEEP_PRIVATE` or
 *      `WITHDRAW`). The spec lists these among the allowed modes; requiring at
 *      least one makes it impossible to author an activity whose only exit is
 *      to disclose.
 *   2. `safety.level: "REINFORCED"` requires `privateGateRequired: true`. The
 *      spec asks for a private gate «en actividades relacionalmente sensibles»;
 *      this is that sentence with an enforceable boundary.
 */

import type {
  CircleActivityDefinition,
  CircleAudience,
  CircleTemplatePreview,
  CircleOutcomeKind,
  CirclePreparationField,
  CirclePreparationFieldKind,
  CircleSafetyLevel,
  CircleSharingMode,
  CircleTemplateStatus,
} from "./circles";
import { CIRCLE_OPT_OUT_SHARING_MODES, CIRCLE_SHARING_MODES } from "./circles";

export type CircleCatalogErrorCode =
  | "CIRCLE_CATALOG_INVALID_DEFINITION"
  | "CIRCLE_CATALOG_DUPLICATE_DEFINITION"
  | "CIRCLE_CATALOG_UNKNOWN_DEFINITION"
  | "CIRCLE_CATALOG_NOT_PUBLISHED";

/** Carries a CODE and never the value it rejected. */
export class CircleCatalogError extends Error {
  constructor(readonly code: CircleCatalogErrorCode) {
    super(code);
    this.name = "CircleCatalogError";
  }
}

const fail = (): never => {
  throw new CircleCatalogError("CIRCLE_CATALOG_INVALID_DEFINITION");
};

// ─── Grammars and bounds ─────────────────────────────────────────────────────

/** Lowercase ASCII, catalog-compatible. No whitespace, no uppercase, no empties. */
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;
/** Book slugs are kebab-case, as everywhere else in this repo. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const LIMITS = {
  title: 120,
  summary: 400,
  label: 160,
  turn: 400,
  turns: 12,
  fields: 8,
  doNotSuggestWhen: 12,
  doNotSuggestWhenEntry: 300,
  estimatedMinutes: 240,
  fieldMaxLength: 4000,
  /** A year. A follow-up further out than that is not a follow-up. */
  followUpHours: 8760,
} as const;

const STATUSES: readonly CircleTemplateStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
];
const AUDIENCES: readonly CircleAudience[] = ["DUO_ADULT"];
const FIELD_KINDS: readonly CirclePreparationFieldKind[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "CHOICE",
];
const OUTCOMES: readonly CircleOutcomeKind[] = [
  "AGREEMENT",
  "REQUEST",
  "RECOGNITION",
  "NONE",
];
const SAFETY_LEVELS: readonly CircleSafetyLevel[] = ["LOW", "REINFORCED"];

/** Dúo is two adults. Pinned here so the audience cannot drift from the shape. */
const AUDIENCE_PARTICIPANTS: Readonly<
  Record<CircleAudience, { min: number; max: number; required: number }>
> = {
  DUO_ADULT: { min: 2, max: 2, required: 2 },
};

// ─── Structural helpers ──────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Any own key outside the allowlist is invalid — extra keys are never ignored. */
function assertExactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key !== "string" || !allowed.includes(key)) fail();
  }
}

function requireKey(value: unknown): string {
  if (typeof value !== "string" || !KEY_RE.test(value)) fail();
  return value as string;
}

function requireText(value: unknown, max: number): string {
  if (typeof value !== "string") fail();
  const text = value as string;
  if (text.trim().length === 0 || text.length > max) fail();
  return text;
}

function requirePositiveInt(value: unknown, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  ) {
    fail();
  }
  return value as number;
}

function requireArray(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    fail();
  }
  return value as readonly unknown[];
}

// ─── Field reconstruction ────────────────────────────────────────────────────

function rebuildPreparationField(value: unknown): CirclePreparationField {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, ["fieldKey", "label", "kind", "maxLength"]);

  const kind = obj.kind;
  if (!FIELD_KINDS.includes(kind as CirclePreparationFieldKind)) fail();

  const field: CirclePreparationField = {
    fieldKey: requireKey(obj.fieldKey),
    label: requireText(obj.label, LIMITS.label),
    kind: kind as CirclePreparationFieldKind,
    ...(Object.prototype.hasOwnProperty.call(obj, "maxLength")
      ? { maxLength: requirePositiveInt(obj.maxLength, LIMITS.fieldMaxLength) }
      : {}),
  };
  return Object.freeze(field);
}

function rebuildSource(value: unknown): CircleActivityDefinition["source"] {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  // `contentUnitId` is NOT in this list, so a definition carrying one is
  // rejected rather than silently stripped. Content Core identity is resolved
  // server-side and never travels.
  assertExactKeys(obj, ["bookSlug", "chapterOrder", "experiencePin"]);

  const bookSlug = obj.bookSlug;
  if (typeof bookSlug !== "string" || !SLUG_RE.test(bookSlug)) fail();

  let experiencePin: CircleActivityDefinition["source"]["experiencePin"];
  if (Object.prototype.hasOwnProperty.call(obj, "experiencePin")) {
    if (!isPlainObject(obj.experiencePin)) fail();
    const pin = obj.experiencePin as Record<string, unknown>;
    assertExactKeys(pin, ["experienceKey", "experienceVersion"]);
    experiencePin = Object.freeze({
      experienceKey: requireKey(pin.experienceKey),
      experienceVersion: requirePositiveInt(pin.experienceVersion, 1_000),
    });
  }

  return Object.freeze({
    bookSlug: bookSlug as string,
    // Platform order, which is not always the book's printed number.
    chapterOrder: requirePositiveInt(obj.chapterOrder, 1_000),
    ...(experiencePin ? { experiencePin } : {}),
  });
}

function rebuildSharing(value: unknown): CircleActivityDefinition["sharing"] {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, ["allowedModes"]);

  const raw = requireArray(obj.allowedModes, CIRCLE_SHARING_MODES.length);
  const modes: CircleSharingMode[] = [];
  for (const mode of raw) {
    if (!CIRCLE_SHARING_MODES.includes(mode as CircleSharingMode)) fail();
    if (modes.includes(mode as CircleSharingMode)) fail();
    modes.push(mode as CircleSharingMode);
  }
  // Stronger than the prose, on purpose: a person must always be able to answer
  // "nothing". See the header.
  if (!modes.some((m) => CIRCLE_OPT_OUT_SHARING_MODES.includes(m))) fail();

  return Object.freeze({ allowedModes: Object.freeze(modes) });
}

function rebuildSafety(value: unknown): CircleActivityDefinition["safety"] {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, ["level", "privateGateRequired", "doNotSuggestWhen"]);

  const level = obj.level;
  if (!SAFETY_LEVELS.includes(level as CircleSafetyLevel)) fail();
  if (typeof obj.privateGateRequired !== "boolean") fail();
  // Stronger than the prose, on purpose: REINFORCED without a private gate
  // would be a label with no mechanism behind it.
  if (level === "REINFORCED" && obj.privateGateRequired !== true) fail();

  if (!Array.isArray(obj.doNotSuggestWhen)) fail();
  const reasons = obj.doNotSuggestWhen as readonly unknown[];
  if (reasons.length > LIMITS.doNotSuggestWhen) fail();
  const frozen = reasons.map((r) =>
    requireText(r, LIMITS.doNotSuggestWhenEntry),
  );

  return Object.freeze({
    level: level as CircleSafetyLevel,
    privateGateRequired: obj.privateGateRequired as boolean,
    doNotSuggestWhen: Object.freeze(frozen),
  });
}

// ─── Definition reconstruction ───────────────────────────────────────────────

const DEFINITION_KEYS = [
  "templateKey",
  "templateVersion",
  "status",
  "audience",
  "title",
  "summary",
  "estimatedMinutes",
  "source",
  "participants",
  "privatePreparation",
  "sharing",
  "reveal",
  "conversation",
  "outcome",
  "followUp",
  "safety",
  "ecoMode",
] as const;

/**
 * Validate an unknown value as a `CircleActivityDefinition`.
 *
 * Returns a NEW, deeply frozen structure. The input is never mutated and never
 * aliased, so a caller cannot keep a handle and edit a "validated" template
 * afterwards.
 */
export function validateCircleActivityDefinition(
  value: unknown,
): CircleActivityDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, DEFINITION_KEYS);

  const status = obj.status;
  if (!STATUSES.includes(status as CircleTemplateStatus)) fail();
  const audience = obj.audience;
  if (!AUDIENCES.includes(audience as CircleAudience)) fail();

  // Participants must match the audience exactly. Dúo is two adults, and a
  // template claiming DUO_ADULT with three required participants is a bug the
  // engine must not be asked to reconcile at runtime.
  if (!isPlainObject(obj.participants)) fail();
  const participants = obj.participants as Record<string, unknown>;
  assertExactKeys(participants, ["min", "max", "required"]);
  const expected = AUDIENCE_PARTICIPANTS[audience as CircleAudience];
  if (
    participants.min !== expected.min ||
    participants.max !== expected.max ||
    participants.required !== expected.required
  ) {
    fail();
  }

  const rawFields = requireArray(obj.privatePreparation, LIMITS.fields);
  const fields = rawFields.map(rebuildPreparationField);
  if (new Set(fields.map((f) => f.fieldKey)).size !== fields.length) fail();

  if (!isPlainObject(obj.reveal)) fail();
  const reveal = obj.reveal as Record<string, unknown>;
  assertExactKeys(reveal, ["strategy"]);
  // ALL_CONFIRMED is the only strategy v1 accepts. A second strategy is a new
  // reveal barrier, and that is an ADR, not a config value.
  if (reveal.strategy !== "ALL_CONFIRMED") fail();

  if (!isPlainObject(obj.conversation)) fail();
  const conversation = obj.conversation as Record<string, unknown>;
  assertExactKeys(conversation, ["turns"]);
  const turns = requireArray(conversation.turns, LIMITS.turns).map((t) =>
    requireText(t, LIMITS.turn),
  );

  if (!isPlainObject(obj.outcome)) fail();
  const outcome = obj.outcome as Record<string, unknown>;
  assertExactKeys(outcome, ["kind"]);
  if (!OUTCOMES.includes(outcome.kind as CircleOutcomeKind)) fail();

  let followUp: CircleActivityDefinition["followUp"];
  if (Object.prototype.hasOwnProperty.call(obj, "followUp")) {
    if (!isPlainObject(obj.followUp)) fail();
    const raw = obj.followUp as Record<string, unknown>;
    assertExactKeys(raw, ["afterHours"]);
    followUp = Object.freeze({
      afterHours: requirePositiveInt(raw.afterHours, LIMITS.followUpHours),
    });
  }

  const ecoMode = obj.ecoMode;
  if (ecoMode !== "NONE" && ecoMode !== "SHARED_ONLY") fail();

  const definition: CircleActivityDefinition = {
    templateKey: requireKey(obj.templateKey),
    templateVersion: requirePositiveInt(obj.templateVersion, 1_000),
    status: status as CircleTemplateStatus,
    audience: audience as CircleAudience,
    title: requireText(obj.title, LIMITS.title),
    summary: requireText(obj.summary, LIMITS.summary),
    estimatedMinutes: requirePositiveInt(
      obj.estimatedMinutes,
      LIMITS.estimatedMinutes,
    ),
    source: rebuildSource(obj.source),
    participants: Object.freeze({
      min: expected.min,
      max: expected.max,
      required: expected.required,
    }),
    privatePreparation: Object.freeze(fields),
    sharing: rebuildSharing(obj.sharing),
    reveal: Object.freeze({ strategy: "ALL_CONFIRMED" as const }),
    conversation: Object.freeze({ turns: Object.freeze(turns) }),
    outcome: Object.freeze({ kind: outcome.kind as CircleOutcomeKind }),
    ...(followUp ? { followUp } : {}),
    safety: rebuildSafety(obj.safety),
    ecoMode: ecoMode as CircleActivityDefinition["ecoMode"],
  };
  return Object.freeze(definition);
}

// ─── Registry ────────────────────────────────────────────────────────────────

const pinKey = (templateKey: string, templateVersion: number) =>
  `${templateKey}@${templateVersion}`;

/**
 * Templates addressed by EXACT key and version.
 *
 * No "latest", no fallback to a neighbouring version, no partial match. A
 * PUBLISHED template is immutable: a correction is a new version, which is why
 * a duplicate `key@version` is a construction-time failure rather than a
 * last-one-wins overwrite.
 */
export class CircleTemplateRegistry {
  private readonly byPin = new Map<string, CircleActivityDefinition>();

  constructor(definitions: readonly unknown[]) {
    for (const raw of definitions) {
      const definition = validateCircleActivityDefinition(raw);
      const pin = pinKey(definition.templateKey, definition.templateVersion);
      if (this.byPin.has(pin)) {
        throw new CircleCatalogError("CIRCLE_CATALOG_DUPLICATE_DEFINITION");
      }
      this.byPin.set(pin, definition);
    }
  }

  get size(): number {
    return this.byPin.size;
  }

  /** Every definition, whatever its status. For tooling, never for the product. */
  all(): readonly CircleActivityDefinition[] {
    return Object.freeze([...this.byPin.values()]);
  }

  /** The exact definition, whatever its status. Throws when unknown. */
  getExact(
    templateKey: string,
    templateVersion: number,
  ): CircleActivityDefinition {
    const found = this.byPin.get(pinKey(templateKey, templateVersion));
    if (!found) {
      throw new CircleCatalogError("CIRCLE_CATALOG_UNKNOWN_DEFINITION");
    }
    return found;
  }

  /**
   * The definition the product may show or instantiate.
   *
   * DRAFT and ARCHIVED resolve by exact pin above — an activity already running
   * on an archived template must keep working — but neither can be previewed
   * or instantiated. The two refusals are distinct codes so an operator can
   * tell "no such template" from "not published yet".
   */
  getPublished(
    templateKey: string,
    templateVersion: number,
  ): CircleActivityDefinition {
    const found = this.getExact(templateKey, templateVersion);
    if (found.status !== "PUBLISHED") {
      throw new CircleCatalogError("CIRCLE_CATALOG_NOT_PUBLISHED");
    }
    return found;
  }

  /** Only PUBLISHED templates are listable. */
  listPublished(): readonly CircleActivityDefinition[] {
    return Object.freeze(
      [...this.byPin.values()].filter((d) => d.status === "PUBLISHED"),
    );
  }
}

// ─── The public boundary ─────────────────────────────────────────────────────

/**
 * Project a definition to exactly what the public may see — and refuse to
 * project one the public may not see at all.
 *
 * The status check lives HERE rather than at the call site on purpose. A
 * projector that trusts its caller to have gone through `getPublished()` is
 * one forgetful `map()` away from putting an unreviewed DRAFT — or a template
 * withdrawn as ARCHIVED — in front of a stranger. Two guards that must agree
 * are weaker than one that cannot be bypassed, so the boundary fails closed by
 * itself:
 *
 *   PUBLISHED → preview
 *   DRAFT     → CIRCLE_CATALOG_NOT_PUBLISHED
 *   ARCHIVED  → CIRCLE_CATALOG_NOT_PUBLISHED
 *
 * This does NOT change internal resolution: `getExact` still returns DRAFT and
 * ARCHIVED definitions by pin, because an activity already running on one has
 * to keep working. What it removes is the path from those definitions to a
 * public surface. The refusal carries a code and never any editorial copy.
 */
export function toCircleTemplatePreview(
  definition: CircleActivityDefinition,
): CircleTemplatePreview {
  if (definition.status !== "PUBLISHED") {
    throw new CircleCatalogError("CIRCLE_CATALOG_NOT_PUBLISHED");
  }
  return Object.freeze({
    templateKey: definition.templateKey,
    templateVersion: definition.templateVersion,
    title: definition.title,
    summary: definition.summary,
    estimatedMinutes: definition.estimatedMinutes,
    audience: definition.audience,
    participants: Object.freeze({
      required: definition.participants.required,
    }),
    outcomeKind: definition.outcome.kind,
    safetyLevel: definition.safety.level,
    conversationTurns: Object.freeze([...definition.conversation.turns]),
  });
}

/**
 * The production catalog — EMPTY at PR1, deliberately.
 *
 * See the header for why the two named candidates are not here. Adding one is
 * an editorial act with its own approval, not a side effect of building the
 * engine; and until then `listPublished()` returning nothing is the honest
 * state of the product.
 */
export const PRODUCTION_CIRCLE_TEMPLATES: readonly CircleActivityDefinition[] =
  [];

export const productionCircleTemplateRegistry = new CircleTemplateRegistry(
  PRODUCTION_CIRCLE_TEMPLATES,
);

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
 * ── The catalog carries exactly one template ───────────────────────────────
 *
 * `PRODUCTION_CIRCLE_TEMPLATES` shipped empty for as long as no approved copy
 * existed. «Lo que me ayuda cuando estoy así» now has it — approved text,
 * approved conditions, approved source — so it is here, and nothing else is.
 *
 * The two candidates the architecture names — «Lo que necesito que puedas
 * escuchar» and «Cómo prefiero ser acompañado cuando algo me sobrepasa» — are
 * still absent, because their copy still lives in Notion, which this cut must
 * not read. The nine `DUO_CANDIDATES` in the Parejas chapter modules are still
 * NOT imported; they say so themselves — «PRODUCT DRAFT ONLY. No runtime, no
 * tables, no endpoints» — and PQP C07 still ships an empty list on purpose,
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
  CircleFieldHelp,
  CircleIntro,
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
  /** Prepared help. Two short pieces, not an article. */
  helpText: 700,
  introBody: 900,
  rationaleTitle: 120,
  rationaleBody: 1400,
  /** Editorial labels. A closed handful, not a taxonomy. */
  topics: 6,
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

/**
 * The two prepared pieces, or nothing.
 *
 * Exactly two keys, both required when `help` is present at all. "An
 * explanation and no example" is not a lighter version of this — it is a
 * half-authored help, and the screen would offer a button with nothing behind
 * it.
 */
function rebuildFieldHelp(value: unknown): CircleFieldHelp {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, ["explanation", "example"]);
  return Object.freeze({
    explanation: requireText(obj.explanation, LIMITS.helpText),
    example: requireText(obj.example, LIMITS.helpText),
  });
}

function rebuildPreparationField(value: unknown): CirclePreparationField {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, [
    "fieldKey",
    "label",
    "kind",
    "maxLength",
    "optional",
    "help",
  ]);

  const kind = obj.kind;
  if (!FIELD_KINDS.includes(kind as CirclePreparationFieldKind)) fail();

  if (
    Object.prototype.hasOwnProperty.call(obj, "optional") &&
    typeof obj.optional !== "boolean"
  ) {
    fail();
  }

  const field: CirclePreparationField = {
    fieldKey: requireKey(obj.fieldKey),
    label: requireText(obj.label, LIMITS.label),
    kind: kind as CirclePreparationFieldKind,
    ...(Object.prototype.hasOwnProperty.call(obj, "maxLength")
      ? { maxLength: requirePositiveInt(obj.maxLength, LIMITS.fieldMaxLength) }
      : {}),
    ...(obj.optional === true ? { optional: true as const } : {}),
    ...(Object.prototype.hasOwnProperty.call(obj, "help")
      ? { help: rebuildFieldHelp(obj.help) }
      : {}),
  };
  return Object.freeze(field);
}

function rebuildIntro(value: unknown): CircleIntro {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, ["body", "rationale"]);

  let rationale: CircleIntro["rationale"];
  if (Object.prototype.hasOwnProperty.call(obj, "rationale")) {
    if (!isPlainObject(obj.rationale)) fail();
    const raw = obj.rationale as Record<string, unknown>;
    assertExactKeys(raw, ["title", "body"]);
    rationale = Object.freeze({
      title: requireText(raw.title, LIMITS.rationaleTitle),
      body: requireText(raw.body, LIMITS.rationaleBody),
    });
  }

  return Object.freeze({
    body: requireText(obj.body, LIMITS.introBody),
    ...(rationale ? { rationale } : {}),
  });
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
  "intro",
  "topics",
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

  // Closed keys, not free text: a label somebody can type is a label somebody
  // can put an answer in, and these are aggregated.
  let topics: readonly string[] | undefined;
  if (Object.prototype.hasOwnProperty.call(obj, "topics")) {
    const raw = requireArray(obj.topics, LIMITS.topics).map(requireKey);
    if (new Set(raw).size !== raw.length) fail();
    topics = Object.freeze(raw);
  }

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
    ...(Object.prototype.hasOwnProperty.call(obj, "intro")
      ? { intro: rebuildIntro(obj.intro) }
      : {}),
    ...(topics ? { topics } : {}),
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
 * The production catalog — ONE template, approved by Jorge.
 *
 * ── What changed, and what did not ─────────────────────────────────────────
 *
 * The catalog was empty because no approved copy existed to put in it. That is
 * no longer true for exactly one activity: «Lo que me ayuda cuando estoy así»,
 * whose full text — title, summary, both field labels, both conversation
 * turns, the six exclusion conditions and the source it hangs from — was
 * proposed in `docs/operations/circles-pilot-activation-decision.md` and
 * approved as it stands. The text below is that text, transcribed rather than
 * rewritten.
 *
 * Nothing else moved. The nine `DUO_CANDIDATES` in the Parejas chapter modules
 * are still not imported and still say «PRODUCT DRAFT ONLY»; PQP C07 still
 * ships an empty list on purpose, because a bilateral activity is the wrong
 * instrument where coercion may exist. One approval is one template — it is not
 * a licence for the next one.
 *
 * ── The exclusions are copy, not a check ───────────────────────────────────
 *
 * `doNotSuggestWhen` is text for whoever decides to offer this, and the engine
 * never evaluates it. Violence, dependence, an authority relationship — none of
 * those are things a program can detect, and pretending otherwise would be
 * worse than saying nothing. What the product does instead is show them to each
 * person, before they write anything, behind the private gate, so the decision
 * is theirs and is taken alone. Their answer to that screen is a decision to
 * take part; it is never a verdict about their relationship, it is never scored
 * and it is never shown to the other person.
 *
 * ── Why this source ────────────────────────────────────────────────────────
 *
 * `eec-c1-cuerpo-antes-que-mente@1` is the single published Guide V1 surface.
 * Chapter 1 holds that the body reacts before the mind can name what is
 * happening, and its practice is entirely inward. This activity is the step
 * after it and outward, on the same subject: when that signal shows up, what
 * helps. It asks what works, never what was felt.
 *
 * The pin is the guide the pilot publishes today. It is NOT the EEC-C01 guided
 * suite, which is still `status: DRAFT` with `publishAllowed: false`; approving
 * this template approves no part of that.
 */
export const PRODUCTION_CIRCLE_TEMPLATES: readonly CircleActivityDefinition[] =
  [
    {
      templateKey: "duo-lo-que-me-ayuda",
      templateVersion: 1,
      status: "PUBLISHED",
      audience: "DUO_ADULT",
      title: "Lo que me ayuda cuando estoy así",
      summary:
        "Cada quien escribe por su lado qué le ayuda —y qué no— cuando algo le " +
        "pesa. Después deciden qué comparten. Nadie ve nada del otro hasta que " +
        "ambos confirman.",
      estimatedMinutes: 15,
      source: {
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        experiencePin: {
          experienceKey: "eec-c1-cuerpo-antes-que-mente",
          experienceVersion: 1,
        },
      },
      participants: { min: 2, max: 2, required: 2 },
      privatePreparation: [
        {
          fieldKey: "que-ayuda",
          label: "Cuando estoy así, me ayuda que…",
          kind: "SHORT_TEXT",
          maxLength: 200,
        },
        {
          fieldKey: "que-no-ayuda",
          label: "Y no me ayuda que…",
          kind: "LONG_TEXT",
          maxLength: 800,
        },
      ],
      // `KEEP_PRIVATE` is one of the three because "nothing" is a complete
      // answer, and the validator would refuse a template without a way out that
      // is not disclosure.
      sharing: {
        allowedModes: ["SELECTED_FIELDS", "EDITED_SUMMARY", "KEEP_PRIVATE"],
      },
      reveal: { strategy: "ALL_CONFIRMED" },
      conversation: {
        turns: [
          "Léelo sin responder todavía. ¿Qué de lo que dijo el otro te resulta fácil de hacer?",
          "¿Y qué te costaría? Decirlo ahora ahorra un malentendido después.",
        ],
      },
      // An agreement is what they MAY write, never what they owe. Closing without
      // one is a complete ending, and the room says so.
      outcome: { kind: "AGREEMENT" },
      followUp: { afterHours: 168 },
      safety: {
        level: "REINFORCED",
        privateGateRequired: true,
        doNotSuggestWhen: [
          "Hay violencia, amenazas o miedo a la reacción de la otra persona.",
          "Una de las dos depende económica, migratoria o legalmente de la otra.",
          "Hay una relación de autoridad entre ambas: jefatura, docencia, terapia o cuidado.",
          "La invitación la pide un tercero, o una de las dos no eligió participar.",
          "Alguna de las dos está en crisis ahora mismo.",
          "Una de las dos es menor de edad.",
        ],
      },
      ecoMode: "NONE",
    },
    // ── @2 · the candidate, DRAFT ────────────────────────────────────────────
    //
    // A new VERSION rather than an edit. @1 above is untouched, byte for byte:
    // activities already running on it — and invitations already sent for it —
    // resolve their exact pin and keep the wording the people in them agreed
    // to. A published template is immutable; a correction is a version.
    //
    // `status: "DRAFT"` is what keeps it out of production while its copy is
    // audited: `listPublished()` skips it, the public preview refuses it, and
    // no mapping points at it. The test environment serves it through the same
    // isolated build patch the synthetic fixture already uses — not through a
    // production flag, and not through an endpoint that would have to exist in
    // production to be useful in testing.
    //
    // What changed, and why:
    //
    //   · Three questions instead of two. The first asks for a situation, not
    //     a feeling: "¿En qué momento estás pensando?" can be answered without
    //     naming an emotion, finding its cause, or having a difficult story to
    //     tell. It is optional, and optional here means the screen does not
    //     treat a blank as unfinished.
    //   · The second and third keep their limits, and the third is reworded
    //     from "no me ayuda" to "preferiría que evitáramos" — a preference
    //     somebody states about themselves rather than a verdict about what
    //     the other person does wrong.
    //   · Prepared help on each question (see `CircleFieldHelp`). Two pieces,
    //     written here, rendered from here.
    //   · Turns that can be read out loud. The old pair asked people to
    //     reflect; these give them the first sentence.
    {
      templateKey: "duo-lo-que-me-ayuda",
      templateVersion: 2,
      status: "DRAFT",
      audience: "DUO_ADULT",
      title: "Lo que me ayuda cuando estoy así",
      summary:
        "Piensen por separado en un momento cotidiano y en qué les ayuda " +
        "cuando ocurre. Después deciden qué comparten. Nadie ve nada del otro " +
        "hasta que ambos confirman.",
      estimatedMinutes: 15,
      source: {
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        experiencePin: {
          experienceKey: "eec-c1-cuerpo-antes-que-mente",
          experienceVersion: 1,
        },
      },
      participants: { min: 2, max: 2, required: 2 },
      intro: {
        body:
          "A veces intentamos ayudar de la manera que nos serviría a nosotros. " +
          "Esta actividad les propone descubrir qué ayuda a cada uno en una " +
          "situación cotidiana. Primero pensarán por separado. Después " +
          "elegirán qué compartir. Al final podrán acordar algo pequeño para " +
          "intentar juntos.",
        rationale: {
          title: "¿Por qué hacemos esta actividad?",
          body:
            "Una misma situación puede sentirse de maneras distintas. En " +
            "nuestra experiencia participan las sensaciones del cuerpo, lo que " +
            "está pasando y lo que hemos aprendido a interpretar. Por eso, " +
            "decir «estoy enojado» no explica por completo lo que alguien vive " +
            "ni cómo quiere ser acompañado. Una persona puede querer espacio; " +
            "otra, que la escuchen. Aquí puedes contar tu experiencia sin " +
            "encontrar una explicación perfecta. La otra persona podrá " +
            "preguntar y comprobar si te entendió. Es una manera de mirarlo " +
            "entre varias, no una explicación clínica.",
        },
      },
      privatePreparation: [
        {
          fieldKey: "momento",
          label: "¿En qué momento estás pensando?",
          kind: "SHORT_TEXT",
          maxLength: 240,
          optional: true,
          help: {
            explanation:
              "Sirve para que las dos respuestas siguientes hablen de lo " +
              "mismo. No hace falta que sea un momento difícil ni que le " +
              "pongas nombre a una emoción: basta con una situación que se " +
              "repite. Si prefieres no escribirlo, puedes seguir sin él.",
            example:
              "Podrías escribir: «Cuando llego preocupado por el trabajo y me " +
              "cuesta conversar». Un momento corriente basta — no tiene que " +
              "ser el más importante, sólo uno que reconozcan los dos.",
          },
        },
        {
          fieldKey: "que-ayuda",
          label: "En ese momento, me ayuda que…",
          kind: "SHORT_TEXT",
          maxLength: 200,
          help: {
            explanation:
              "Puedes empezar por un momento concreto. Piensa en una ocasión " +
              "en que alguien te acompañó y te sentiste un poco más cómodo: " +
              "¿te escuchó, te dio espacio o te ayudó con algo práctico? No " +
              "necesitas una respuesta que sirva siempre. Basta con algo que " +
              "podría ayudarte en la situación que elegiste.",
            example:
              "En vez de «quiero que me entiendas», podrías escribir: «Cuando " +
              "llego preocupado, me ayuda que me preguntes si quiero hablar " +
              "antes de darme consejos». Adáptalo a tu experiencia. También " +
              "está bien decir que todavía no sabes qué te ayudaría.",
          },
        },
        {
          fieldKey: "que-no-ayuda",
          label: "Y preferiría que evitáramos…",
          kind: "LONG_TEXT",
          maxLength: 800,
          help: {
            explanation:
              "Es una preferencia tuya, no una lista de reproches. Piensa en " +
              "qué te deja peor en ese momento aunque la intención sea buena: " +
              "que insistan, que minimicen, que lo resuelvan por ti. Decirlo " +
              "ahora ahorra un malentendido después.",
            example:
              "Podrías escribir: «Preferiría que evitáramos hablarlo apenas " +
              "llego, antes de que me dé tiempo a aterrizar». Si no se te " +
              "ocurre nada, dejarlo en blanco también dice algo.",
          },
        },
      ],
      sharing: {
        allowedModes: ["SELECTED_FIELDS", "EDITED_SUMMARY", "KEEP_PRIVATE"],
      },
      reveal: { strategy: "ALL_CONFIRMED" },
      conversation: {
        turns: [
          "Lo que entiendo que te ayuda es… ¿te entendí bien?",
          "Esto podría intentarlo. Esto otro me cuesta…",
          "La próxima vez podemos probar…",
        ],
      },
      outcome: { kind: "AGREEMENT" },
      followUp: { afterHours: 168 },
      safety: {
        level: "REINFORCED",
        privateGateRequired: true,
        doNotSuggestWhen: [
          "Hay violencia, amenazas o miedo a la reacción de la otra persona.",
          "Una de las dos depende económica, migratoria o legalmente de la otra.",
          "Hay una relación de autoridad entre ambas: jefatura, docencia, terapia o cuidado.",
          "La invitación la pide un tercero, o una de las dos no eligió participar.",
          "Alguna de las dos está en crisis ahora mismo.",
          "Una de las dos es menor de edad.",
        ],
      },
      ecoMode: "NONE",
      // What the ACTIVITY is about, decided when it was written. Never a claim
      // about the two people who did it.
      topics: ["apoyo-cotidiano", "comunicacion"],
    },
  ];

export const productionCircleTemplateRegistry = new CircleTemplateRegistry(
  PRODUCTION_CIRCLE_TEMPLATES,
);

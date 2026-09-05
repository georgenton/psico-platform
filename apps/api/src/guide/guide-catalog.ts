import type {
  GuideConceptStep,
  GuideConfirmationStep,
  GuideDefinition,
  GuidePracticeStep,
  GuideRecallStep,
  GuideStepDefinition,
} from "@psico/types";

/**
 * CC-7.4B — pure (Nest-free, Prisma-free) runtime validator + exact registry
 * for the Guide catalog (ADR 0019 §2).
 *
 * The type system makes invalid kind/policy combinations inexpressible for
 * TYPED literals, but definitions may arrive as `unknown` (a future authoring
 * surface, a mis-typed constant, a test fixture). This validator is the
 * runtime authority: field-by-field reconstruction, closed key grammar,
 * exact kind→policy→target coupling, contiguous 1..n order — and it returns
 * DEEPLY FROZEN structures without ever mutating its input.
 *
 * The PRODUCTION registry holds ONLY expressly approved definitions (guideKey
 * + version + exact steps + real, resolvable targets); inventing content is
 * prohibited. Test-only definitions live in specs and never reach it.
 */

export class GuideCatalogError extends Error {
  constructor(readonly code: GuideCatalogErrorCode) {
    // Codes only — never the received value.
    super(code);
    this.name = "GuideCatalogError";
  }
}

export type GuideCatalogErrorCode =
  | "GUIDE_CATALOG_INVALID_DEFINITION"
  | "GUIDE_CATALOG_DUPLICATE_DEFINITION"
  | "GUIDE_CATALOG_UNKNOWN_DEFINITION";

const fail = (): never => {
  throw new GuideCatalogError("GUIDE_CATALOG_INVALID_DEFINITION");
};

// ─── Key grammar (ADR 0019 §2) ──────────────────────────────────────────────

/**
 * Closed ASCII, catalog-compatible: lowercase alphanumeric start, then
 * `a-z 0-9 . _ : -`, max 200 chars. No whitespace, no controls, no
 * uppercase, no empties — and NO silent case normalization: an uppercase
 * key is rejected, never lowered.
 */
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

export function isValidGuideCatalogKey(value: unknown): value is string {
  return typeof value === "string" && KEY_RE.test(value);
}

// ─── Structural helpers (reject exotic shapes, never mutate) ────────────────

/** A plain object: `Object.prototype` or `null` prototype — nothing else. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Fail on any own key outside the exact allowlist (extra keys = invalid). */
function assertExactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key !== "string" || !allowed.includes(key)) fail();
  }
}

function requireKey(value: unknown): string {
  if (!isValidGuideCatalogKey(value)) fail();
  return value as string;
}

// ─── Step reconstruction — one branch per V1 variant, exact coupling ────────

const STEP_BASE_KEYS = ["stepKey", "order", "required"] as const;

interface RebuiltBase {
  stepKey: string;
  order: number;
  required: true;
}

function rebuildBase(obj: Record<string, unknown>): RebuiltBase {
  const stepKey = requireKey(obj.stepKey);
  const order = obj.order;
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) {
    fail();
  }
  // V1 has NO optional steps: `required` must be the literal true.
  if (obj.required !== true) fail();
  return { stepKey, order: order as number, required: true };
}

function rebuildStep(value: unknown): GuideStepDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  const base = rebuildBase(obj);

  switch (obj.kind) {
    case "CONCEPT_EXPLORATION": {
      assertExactKeys(obj, [
        ...STEP_BASE_KEYS,
        "kind",
        "completionPolicy",
        "conceptKey",
      ]);
      if (obj.completionPolicy !== "explicit_confirmation") fail();
      const step: GuideConceptStep = {
        ...base,
        kind: "CONCEPT_EXPLORATION",
        completionPolicy: "explicit_confirmation",
        conceptKey: requireKey(obj.conceptKey),
      };
      return step;
    }
    case "ACTIVE_RECALL": {
      assertExactKeys(obj, [
        ...STEP_BASE_KEYS,
        "kind",
        "completionPolicy",
        "itemKey",
      ]);
      if (obj.completionPolicy !== "objective_recall") fail();
      const step: GuideRecallStep = {
        ...base,
        kind: "ACTIVE_RECALL",
        completionPolicy: "objective_recall",
        itemKey: requireKey(obj.itemKey),
      };
      return step;
    }
    case "CATALOG_PRACTICE": {
      assertExactKeys(obj, [
        ...STEP_BASE_KEYS,
        "kind",
        "completionPolicy",
        "exerciseKey",
      ]);
      if (obj.completionPolicy !== "catalog_practice_confirmation") fail();
      const step: GuidePracticeStep = {
        ...base,
        kind: "CATALOG_PRACTICE",
        completionPolicy: "catalog_practice_confirmation",
        exerciseKey: requireKey(obj.exerciseKey),
      };
      return step;
    }
    case "EXPLICIT_CONFIRMATION": {
      assertExactKeys(obj, [
        ...STEP_BASE_KEYS,
        "kind",
        "completionPolicy",
        "confirmationKey",
      ]);
      if (obj.completionPolicy !== "explicit_confirmation") fail();
      const step: GuideConfirmationStep = {
        ...base,
        kind: "EXPLICIT_CONFIRMATION",
        completionPolicy: "explicit_confirmation",
        confirmationKey: requireKey(obj.confirmationKey),
      };
      return step;
    }
    default:
      // SERVER_ACTION (deferred out of V1) and anything else land here.
      return fail();
  }
}

// ─── Definition reconstruction ──────────────────────────────────────────────

/**
 * Validate an unknown value as a GuideDefinition and return a NEW, deeply
 * frozen structure (the input is never mutated and never aliased):
 *
 *   - guideVersion: positive integer;
 *   - at least one step; unique stepKeys; unique, CONTIGUOUS 1..n order;
 *   - the stored array is IN order;
 *   - every step passes the exact variant reconstruction above.
 */
export function validateGuideDefinition(value: unknown): GuideDefinition {
  if (!isPlainObject(value)) fail();
  const obj = value as Record<string, unknown>;
  assertExactKeys(obj, ["guideKey", "guideVersion", "steps"]);

  const guideKey = requireKey(obj.guideKey);
  const guideVersion = obj.guideVersion;
  if (
    typeof guideVersion !== "number" ||
    !Number.isInteger(guideVersion) ||
    guideVersion < 1
  ) {
    fail();
  }

  const rawSteps: unknown = obj.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) fail();

  const steps = (rawSteps as unknown[]).map(rebuildStep);

  const seenKeys = new Set<string>();
  for (const step of steps) {
    if (seenKeys.has(step.stepKey)) fail();
    seenKeys.add(step.stepKey);
  }
  // Unique AND contiguous from 1, and the array itself is stored in order.
  steps.forEach((step: GuideStepDefinition, index: number) => {
    if (step.order !== index + 1) fail();
  });

  const definition: GuideDefinition = {
    guideKey,
    guideVersion: guideVersion as number,
    steps,
  };
  for (const step of definition.steps) Object.freeze(step);
  Object.freeze(definition.steps);
  return Object.freeze(definition);
}

// ─── Exact registry (no first-match, no "latest" for sessions) ──────────────

export class GuideCatalogRegistry {
  private readonly byExactVersion = new Map<string, GuideDefinition>();
  private readonly versionsByGuide = new Map<string, number[]>();

  constructor(definitions: readonly unknown[]) {
    for (const raw of definitions) {
      const def = validateGuideDefinition(raw);
      const exact = `${def.guideKey}@${def.guideVersion}`;
      if (this.byExactVersion.has(exact)) {
        throw new GuideCatalogError("GUIDE_CATALOG_DUPLICATE_DEFINITION");
      }
      this.byExactVersion.set(exact, def);
      const versions = this.versionsByGuide.get(def.guideKey) ?? [];
      versions.push(def.guideVersion);
      versions.sort((a, b) => a - b);
      this.versionsByGuide.set(def.guideKey, versions);
    }
  }

  /**
   * EXACT lookup by `guideKey@guideVersion` — a session pins its version at
   * start and always resolves against that pin. No fallback of any kind.
   */
  getExact(guideKey: string, guideVersion: number): GuideDefinition {
    const def = this.byExactVersion.get(`${guideKey}@${guideVersion}`);
    if (!def) throw new GuideCatalogError("GUIDE_CATALOG_UNKNOWN_DEFINITION");
    return def;
  }

  /**
   * Discovery helper for STARTING a new session only (ADR 0019 §2): the
   * highest published version of a guide, or null. NEVER used to resolve an
   * already-created session — those call `getExact` with their pinned pair.
   */
  latestStartableVersion(guideKey: string): number | null {
    const versions = this.versionsByGuide.get(guideKey);
    if (!versions || versions.length === 0) return null;
    return versions[versions.length - 1];
  }

  get size(): number {
    return this.byExactVersion.size;
  }
}

/**
 * CC-7.4B.3 — the FIRST production Guide V1 definition, approved by the
 * content owner on 2026-07-21 (Jorge, self-review). See
 * docs/product/guide-v1-first-definition.md.
 *
 * Its three targets are real, published catalog keys whose editorial content
 * was approved in PR #591 and ingested through the Content Core backfill in
 * PR #592 (merge c1e0ed9):
 *
 *   1. CONCEPT_EXPLORATION → `eec-cuerpo-antes-que-mente` (self-report);
 *   2. CATALOG_PRACTICE    → `eec-c1-practice-escucharte-por-dentro`
 *      (self-report — a completed reflection is not server-verifiable);
 *   3. ACTIVE_RECALL       → `eec-c1-recall-cuerpo-antes-que-mente`
 *      (server-graded against the QUIZ's internal `correctOptionKey`).
 *
 * `guideKey@guideVersion` is IMMUTABLE: changing any step or target means
 * publishing a NEW version, never editing this one.
 *
 * Deliberately absent: editorial context (bookSlug/editionKey/unitKey), DB
 * ids, UI copy, duration, emotion, score, and the correct answer — the server
 * DERIVES the editorial context from the three targets
 * (GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS), and the canonical answer
 * lives ONLY in the server-side QUIZ catalog (CC-7.3).
 */
export const EEC_C1_BODY_BEFORE_MIND_GUIDE = validateGuideDefinition({
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
  steps: [
    {
      stepKey: "explorar-cuerpo-antes-que-mente",
      order: 1,
      required: true,
      kind: "CONCEPT_EXPLORATION",
      completionPolicy: "explicit_confirmation",
      conceptKey: "eec-cuerpo-antes-que-mente",
    },
    {
      stepKey: "practicar-escucharte-por-dentro",
      order: 2,
      required: true,
      kind: "CATALOG_PRACTICE",
      completionPolicy: "catalog_practice_confirmation",
      exerciseKey: "eec-c1-practice-escucharte-por-dentro",
    },
    {
      stepKey: "recordar-cuerpo-antes-que-mente",
      order: 3,
      required: true,
      kind: "ACTIVE_RECALL",
      completionPolicy: "objective_recall",
      itemKey: "eec-c1-recall-cuerpo-antes-que-mente",
    },
  ],
});

/**
 * The SECOND approved guided reading: chapter 1 of "Parejas que perduran"
 * (David Jaramillo, used with the author's authorization). See
 * docs/product/parejas-guide-v1-first-definition.md.
 *
 * Its three targets were materialized in production by the learning activation
 * (`content:book:activate-learning`), not by a backfill: the book entered
 * through the Content Core bootstrap, which deliberately creates the reading
 * surface and stops before any teaching row.
 *
 *   1. CONCEPT_EXPLORATION → `pqp-c1-contacto-sostenido` (self-report);
 *   2. CATALOG_PRACTICE    → `pqp-c1-practice-diez-minutos-de-contacto`
 *      (self-report — doing the exercise is not server-verifiable);
 *   3. ACTIVE_RECALL       → `pqp-c1-recall-contacto-sostenido`
 *      (server-graded against the QUIZ's internal `correctOptionKey`).
 *
 * The editorial chapter 1 lives at PLATFORM chapterOrder 2 — the ingest
 * manifest gave order 1 to the preface. That fact belongs to the discovery
 * catalog, NOT here: a GuideDefinition never carries editorial context
 * (GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS).
 */
export const PQP_C1_SUSTAINED_CONTACT_GUIDE = validateGuideDefinition({
  guideKey: "pqp-c1-contacto-sostenido",
  guideVersion: 1,
  steps: [
    {
      stepKey: "explorar-contacto-sostenido",
      order: 1,
      required: true,
      kind: "CONCEPT_EXPLORATION",
      completionPolicy: "explicit_confirmation",
      conceptKey: "pqp-c1-contacto-sostenido",
    },
    {
      stepKey: "practicar-diez-minutos-de-contacto",
      order: 2,
      required: true,
      kind: "CATALOG_PRACTICE",
      completionPolicy: "catalog_practice_confirmation",
      exerciseKey: "pqp-c1-practice-diez-minutos-de-contacto",
    },
    {
      stepKey: "recordar-contacto-sostenido",
      order: 3,
      required: true,
      kind: "ACTIVE_RECALL",
      completionPolicy: "objective_recall",
      itemKey: "pqp-c1-recall-contacto-sostenido",
    },
  ],
});

/**
 * EEC-C01 · the five-microguide route (author decision, 2026-09-03).
 *
 * One idea per guide, each with the same three obligatory steps: explore the
 * concept, do the catalog practice, answer the objective recall. Independent,
 * optional and resumable — the chapter offers a route, not a 50-minute exam.
 *
 * Every key below is NEW. None of them reuses, renames or shadows the V1 pilot
 * (`eec-c1-cuerpo-antes-que-mente@1`), whose definition, sessions and
 * resonances stay exactly as they are: reusing a key would silently merge two
 * different readings' progress.
 *
 * The editorial content of each target lives where it belongs — the concept in
 * the shared guided-concept catalog, the practice and the recall in the
 * server-side exercise catalog, and the passage in the anchor registry. A
 * definition names them; it never carries copy.
 */

const eecC1Guide = (
  slug: string,
  conceptKey: string,
  practiceSlug: string,
): GuideDefinition =>
  validateGuideDefinition({
    guideKey: `eec-c1-${slug}`,
    guideVersion: 1,
    steps: [
      {
        stepKey: `explorar-${slug}`,
        order: 1,
        required: true,
        kind: "CONCEPT_EXPLORATION",
        completionPolicy: "explicit_confirmation",
        conceptKey,
      },
      {
        stepKey: `practicar-${practiceSlug}`,
        order: 2,
        required: true,
        kind: "CATALOG_PRACTICE",
        completionPolicy: "catalog_practice_confirmation",
        exerciseKey: `eec-c1-practice-${practiceSlug}`,
      },
      {
        stepKey: `recordar-${slug}`,
        order: 3,
        required: true,
        kind: "ACTIVE_RECALL",
        completionPolicy: "objective_recall",
        itemKey: `eec-c1-recall-${slug}`,
      },
    ],
  });

/** MG01 — a theory answers some questions and leaves others out of focus. */
export const EEC_C1_MG01_LENSES_GUIDE = eecC1Guide(
  "teorias-como-lentes",
  "eec-teorias-como-lentes",
  "revisar-un-lente",
);

/** MG02 — a face gives information; it does not hand over a reading. */
export const EEC_C1_MG02_FACE_GUIDE = eecC1Guide(
  "rostro-como-pista",
  "eec-rostro-como-pista",
  "una-sonrisa-varios-contextos",
);

/** MG03 — protection can start before the story does. Reconciles the pilot. */
export const EEC_C1_MG03_ALARM_GUIDE = eecC1Guide(
  "alarma-antes-del-relato",
  "eec-alarma-antes-del-relato",
  "ordenar-alarma-y-relato",
);

/** MG04 — feeling, interpreting, wanting and choosing are four things. */
export const EEC_C1_MG04_INFORMS_GUIDE = eecC1Guide(
  "emocion-informa-no-manda",
  "eec-emocion-informa-no-manda",
  "siento-interpreto-impulso-elijo",
);

/** MG05 — built out of real signals, memory and context. Not invented. */
export const EEC_C1_MG05_CONSTRUCTED_GUIDE = eecC1Guide(
  "construida-no-significa-falsa",
  "eec-construida-no-significa-falsa",
  "senales-y-contextos",
);

/**
 * EEC-C02 · the five-microguide route of «¿Existen realmente las emociones
 * universales?» (author decision, 2026-09-04).
 *
 * Same contract as C01's five — three obligatory steps, one idea each, keys
 * that never reuse another reading's. The chapter differs, so the concepts,
 * practices and recalls do too: nothing here shares a target with chapter 1,
 * and a session on one chapter can never complete a step of the other.
 *
 * The practices deliberately reuse the five interactions C01 shipped rather
 * than inventing kinds. Which one each microguide uses is an editorial fit,
 * not a default: classifying claims into levels is the same interaction as
 * sorting readings into buckets, and accompanying without prescribing is the
 * same four fields as feeling, interpreting, wanting and choosing.
 */
const eecC2Guide = (
  slug: string,
  conceptKey: string,
  practiceSlug: string,
): GuideDefinition =>
  validateGuideDefinition({
    guideKey: `eec-c2-${slug}`,
    guideVersion: 1,
    steps: [
      {
        stepKey: `explorar-${slug}`,
        order: 1,
        required: true,
        kind: "CONCEPT_EXPLORATION",
        completionPolicy: "explicit_confirmation",
        conceptKey,
      },
      {
        stepKey: `practicar-${practiceSlug}`,
        order: 2,
        required: true,
        kind: "CATALOG_PRACTICE",
        completionPolicy: "catalog_practice_confirmation",
        exerciseKey: `eec-c2-practice-${practiceSlug}`,
      },
      {
        stepKey: `recordar-${slug}`,
        order: 3,
        required: true,
        kind: "ACTIVE_RECALL",
        completionPolicy: "objective_recall",
        itemKey: `eec-c2-recall-${slug}`,
      },
    ],
  });

/** MG01 — «universal» nombra varios niveles; uno no demuestra los otros. */
export const EEC_C2_MG01_UNIVERSAL_GUIDE = eecC2Guide(
  "universal-no-significa-uniforme",
  "eec-universal-no-significa-uniforme",
  "seis-cajones",
);

/** MG02 — la cultura ofrece estructuras; no dicta cada frase. */
export const EEC_C2_MG02_CULTURE_GUIDE = eecC2Guide(
  "cultura-gramatica-no-destino",
  "eec-cultura-gramatica-no-destino",
  "de-etiqueta-a-contexto",
);

/** MG03 — del gesto a la pregunta: una hipótesis que se comprueba. */
export const EEC_C2_MG03_GESTURE_GUIDE = eecC2Guide(
  "gesto-necesita-contexto",
  "eec-gesto-necesita-contexto",
  "del-gesto-a-la-pregunta",
);

/** MG04 — la palabra ayuda a diferenciar; su ausencia no niega la experiencia. */
export const EEC_C2_MG04_WORDS_GUIDE = eecC2Guide(
  "palabras-dan-contorno",
  "eec-palabras-dan-contorno",
  "la-palabra-no-basta",
);

/** MG05 — el ritual ofrece marco y testigos; no prescribe cómo sentir. */
export const EEC_C2_MG05_RITUALS_GUIDE = eecC2Guide(
  "rituales-dan-marco-no-guion",
  "eec-rituales-dan-marco-no-guion",
  "acompanar-sin-imponer",
);

/**
 * EEC-C03 → C10 · the forty approved microguides (author decision, 2026-09-04).
 *
 * `eecC1Guide` and `eecC2Guide` are left exactly as they were. This is the same
 * shape with the chapter number as an argument rather than baked into a string,
 * because eight more copies of the same six lines is how two of them end up
 * disagreeing. The three obligatory steps and their completion policies are
 * identical to C01's and C02's — a guide is a guide.
 */
const eecChapterGuide =
  (order: number) =>
  (slug: string, conceptKey: string, practiceSlug: string): GuideDefinition =>
    validateGuideDefinition({
      guideKey: `eec-c${order}-${slug}`,
      guideVersion: 1,
      steps: [
        {
          stepKey: `explorar-${slug}`,
          order: 1,
          required: true,
          kind: "CONCEPT_EXPLORATION",
          completionPolicy: "explicit_confirmation",
          conceptKey,
        },
        {
          stepKey: `practicar-${practiceSlug}`,
          order: 2,
          required: true,
          kind: "CATALOG_PRACTICE",
          completionPolicy: "catalog_practice_confirmation",
          exerciseKey: `eec-c${order}-practice-${practiceSlug}`,
        },
        {
          stepKey: `recordar-${slug}`,
          order: 3,
          required: true,
          kind: "ACTIVE_RECALL",
          completionPolicy: "objective_recall",
          itemKey: `eec-c${order}-recall-${slug}`,
        },
      ],
    });

const eecC3Guide = eecChapterGuide(3);
/** MG01 — Predecir no es adivinar */
export const EEC_C3_MG01_GUIDE = eecC3Guide(
  "predecir-no-es-adivinar",
  "eec-predecir-no-es-adivinar",
  "anticipar-dato-afirmacion",
);
/** MG02 — Una señal corporal no viene con etiqueta */
export const EEC_C3_MG02_GUIDE = eecC3Guide(
  "senal-corporal-sin-etiqueta",
  "eec-senal-corporal-sin-etiqueta",
  "misma-senal-tres-contextos",
);
/** MG03 — El cerebro también necesita contexto para categorizar */
export const EEC_C3_MG03_GUIDE = eecC3Guide(
  "contexto-para-categorizar",
  "eec-contexto-para-categorizar",
  "escena-antes-y-despues",
);
/** MG04 — No hay un botón de miedo */
export const EEC_C3_MG04_GUIDE = eecC3Guide(
  "no-hay-boton-de-miedo",
  "eec-no-hay-boton-de-miedo",
  "region-y-emocion",
);
/** MG05 — Cuando el modelo no encaja, puede actualizarse */
export const EEC_C3_MG05_GUIDE = eecC3Guide(
  "modelo-puede-actualizarse",
  "eec-modelo-puede-actualizarse",
  "de-la-expectativa-al-ajuste",
);

const eecC4Guide = eecChapterGuide(4);
/** MG01 — El cuerpo aporta datos, no veredictos */
export const EEC_C4_MG01_GUIDE = eecC4Guide(
  "cuerpo-datos-no-veredictos",
  "eec-cuerpo-datos-no-veredictos",
  "misma-sensacion-otros-contextos",
);
/** MG02 — Notar, interpretar y nombrar no son lo mismo */
export const EEC_C4_MG02_GUIDE = eecC4Guide(
  "notar-interpretar-nombrar",
  "eec-notar-interpretar-nombrar",
  "senal-atencion-interpretacion-nombre",
);
/** MG03 — Cuerpo y cerebro no hacen fila */
export const EEC_C4_MG03_GUIDE = eecC4Guide(
  "cuerpo-y-cerebro-no-hacen-fila",
  "eec-cuerpo-y-cerebro-no-hacen-fila",
  "la-cadena-que-no-es-fila",
);
/** MG04 — Metáfora, teoría y evidencia no son lo mismo */
export const EEC_C4_MG04_GUIDE = eecC4Guide(
  "metafora-teoria-evidencia",
  "eec-metafora-teoria-evidencia",
  "que-tipo-de-afirmacion-es",
);
/** MG05 — Observar el cuerpo también requiere elección */
export const EEC_C4_MG05_GUIDE = eecC4Guide(
  "observar-requiere-eleccion",
  "eec-observar-requiere-eleccion",
  "elegir-como-observar",
);

const eecC5Guide = eecChapterGuide(5);
/** MG01 — Una emoción no es una historia */
export const EEC_C5_MG01_GUIDE = eecC5Guide(
  "emocion-no-es-historia",
  "eec-emocion-no-es-historia",
  "cambia-la-historia-cambia-la-emocion",
);
/** MG02 — El silencio no viene con subtítulos */
export const EEC_C5_MG02_GUIDE = eecC5Guide(
  "silencio-sin-subtitulos",
  "eec-silencio-sin-subtitulos",
  "escena-subtitulo-historia",
);
/** MG03 — Una historia dominante no es toda tu identidad */
export const EEC_C5_MG03_GUIDE = eecC5Guide(
  "historia-dominante-no-es-identidad",
  "eec-historia-dominante-no-es-identidad",
  "acontecimiento-descripcion-conclusion-excepcion",
);
/** MG04 — Recordar reconstruye; no inventa libremente */
export const EEC_C5_MG04_GUIDE = eecC5Guide(
  "recordar-reconstruye",
  "eec-recordar-reconstruye",
  "dato-interpretacion-informacion-nueva",
);
/** MG05 — Reescribir puede abrir opciones, no garantizar otra emoción */
export const EEC_C5_MG05_GUIDE = eecC5Guide(
  "reescribir-abre-opciones",
  "eec-reescribir-abre-opciones",
  "dos-formulaciones-que-abren",
);

const eecC6Guide = eecChapterGuide(6);
/** MG01 — Sentir también se aprende con otros */
export const EEC_C6_MG01_GUIDE = eecC6Guide(
  "sentir-se-aprende-con-otros",
  "eec-sentir-se-aprende-con-otros",
  "dos-respuestas-relacionales",
);
/** MG02 — Regular juntos no es controlar */
export const EEC_C6_MG02_GUIDE = eecC6Guide(
  "regular-juntos-no-es-controlar",
  "eec-regular-juntos-no-es-controlar",
  "apoyo-validacion-control-escalamiento",
);
/** MG03 — Un ciclo no significa culpa compartida */
export const EEC_C6_MG03_GUIDE = eecC6Guide(
  "ciclo-no-es-culpa-compartida",
  "eec-ciclo-no-es-culpa-compartida",
  "ordenar-el-ciclo",
);
/** MG04 — Parecidos que no son sinónimos */
export const EEC_C6_MG04_GUIDE = eecC6Guide(
  "parecidos-que-no-son-sinonimos",
  "eec-parecidos-que-no-son-sinonimos",
  "empatia-contagio-sincronia",
);
/** MG05 — Influencia no es destino */
export const EEC_C6_MG05_GUIDE = eecC6Guide(
  "influencia-no-es-destino",
  "eec-influencia-no-es-destino",
  "mi-parte-la-otra-el-contexto-el-limite",
);

const eecC7Guide = eecChapterGuide(7);
/** MG01 — Traducir empieza por suspender equivalencias */
export const EEC_C7_MG01_GUIDE = eecC7Guide(
  "suspender-equivalencias",
  "eec-suspender-equivalencias",
  "separar-capas-de-una-escena",
);
/** MG02 — La expectativa cambia cómo lees la señal */
export const EEC_C7_MG02_GUIDE = eecC7Guide(
  "expectativa-cambia-la-lectura",
  "eec-expectativa-cambia-la-lectura",
  "senal-expectativa-interpretacion-dato",
);
/** MG03 — Una diferencia cultural no es una excusa automática */
export const EEC_C7_MG03_GUIDE = eecC7Guide(
  "diferencia-no-es-excusa",
  "eec-diferencia-no-es-excusa",
  "diferencia-falta-contexto-o-limite",
);
/** MG04 — Dentro de una cultura también hay muchos repertorios */
export const EEC_C7_MG04_GUIDE = eecC7Guide(
  "muchos-repertorios-dentro",
  "eec-muchos-repertorios-dentro",
  "un-pais-no-es-una-variable",
);
/** MG05 — Preguntar es parte de traducir */
export const EEC_C7_MG05_GUIDE = eecC7Guide(
  "preguntar-es-traducir",
  "eec-preguntar-es-traducir",
  "de-conclusion-a-pregunta",
);

const eecC8Guide = eecChapterGuide(8);
/** MG01 — Sentirlo no lo vuelve verdad */
export const EEC_C8_MG01_GUIDE = eecC8Guide(
  "sentirlo-no-lo-vuelve-verdad",
  "eec-sentirlo-no-lo-vuelve-verdad",
  "emocion-interpretacion-hechos-falta",
);
/** MG02 — Una emoción puede mostrar lo que importa, no qué hacer */
export const EEC_C8_MG02_GUIDE = eecC8Guide(
  "muestra-lo-que-importa-no-que-hacer",
  "eec-muestra-lo-que-importa-no-que-hacer",
  "que-importa-y-que-esta-justificado",
);
/** MG03 — Pista, evidencia y veredicto son distintos */
export const EEC_C8_MG03_GUIDE = eecC8Guide(
  "pista-evidencia-veredicto",
  "eec-pista-evidencia-veredicto",
  "clasificar-pista-evidencia-veredicto",
);
/** MG04 — Validar no es dar la razón en todo */
export const EEC_C8_MG04_GUIDE = eecC8Guide(
  "validar-no-es-dar-la-razon",
  "eec-validar-no-es-dar-la-razon",
  "experiencia-interpretacion-impulso-conducta",
);
/** MG05 — Antes de actuar, amplía el examen */
export const EEC_C8_MG05_GUIDE = eecC8Guide(
  "antes-de-actuar-amplia-el-examen",
  "eec-antes-de-actuar-amplia-el-examen",
  "que-respuesta-puedo-justificar",
);

const eecC9Guide = eecChapterGuide(9);
/** MG01 — Construido no significa elegido */
export const EEC_C9_MG01_GUIDE = eecC9Guide(
  "construido-no-significa-elegido",
  "eec-construido-no-significa-elegido",
  "influencia-o-voluntarismo",
);
/** MG02 — Una técnica útil no es una técnica universal */
export const EEC_C9_MG02_GUIDE = eecC9Guide(
  "tecnica-util-no-es-universal",
  "eec-tecnica-util-no-es-universal",
  "objetivo-y-herramienta",
);
/** MG03 — Define qué quieres cambiar antes de regular */
export const EEC_C9_MG03_GUIDE = eecC9Guide(
  "define-que-quieres-cambiar",
  "eec-define-que-quieres-cambiar",
  "objetivo-influencia-estrategia-senal",
);
/** MG04 — Cuatro puertas para intervenir */
export const EEC_C9_MG04_GUIDE = eecC9Guide(
  "cuatro-puertas",
  "eec-cuatro-puertas",
  "por-que-puerta-entra",
);
/** MG05 — Repensar también ocurre después */
export const EEC_C9_MG05_GUIDE = eecC9Guide(
  "repensar-ocurre-despues",
  "eec-repensar-ocurre-despues",
  "objetivo-respuesta-consecuencia-ajuste",
);

const eecC10Guide = eecChapterGuide(10);
/** MG01 — Hacer espacio no es confirmar toda la historia */
export const EEC_C10_MG01_GUIDE = eecC10Guide(
  "hacer-espacio-no-es-confirmar",
  "eec-hacer-espacio-no-es-confirmar",
  "de-minimizar-a-hacer-espacio",
);
/** MG02 — No te conviertas demasiado pronto en narrador de la mente ajena */
export const EEC_C10_MG02_GUIDE = eecC10Guide(
  "no-narrador-de-la-mente-ajena",
  "eec-no-narrador-de-la-mente-ajena",
  "observacion-interpretacion-pregunta-falta",
);
/** MG03 — La emoción puede estar; la conducta sigue teniendo límites */
export const EEC_C10_MG03_GUIDE = eecC10Guide(
  "emocion-si-conducta-con-limites",
  "eec-emocion-si-conducta-con-limites",
  "experiencia-impulso-limite-alternativa",
);
/** MG04 — Ayudar sin borrar la agencia */
export const EEC_C10_MG04_GUIDE = eecC10Guide(
  "ayudar-sin-borrar-la-agencia",
  "eec-ayudar-sin-borrar-la-agencia",
  "escuchar-opciones-o-intervenir",
);
/** MG05 — A veces hay que cambiar el escenario */
export const EEC_C10_MG05_GUIDE = eecC10Guide(
  "cambiar-el-escenario",
  "eec-cambiar-el-escenario",
  "habilidad-o-condicion",
);

/**
 * The PRODUCTION registry — exactly the approved definitions. Adding one is a
 * deliberate, reviewed change (editorial approval + real, resolvable targets);
 * content is never invented here.
 *
 * The V1 pilot stays registered even though discovery no longer offers it: a
 * session pinned to `eec-c1-cuerpo-antes-que-mente@1` must keep resolving, and
 * removing the definition would break exactly the readers this change promised
 * not to disturb.
 */
export const PRODUCTION_GUIDE_DEFINITIONS: readonly GuideDefinition[] = [
  EEC_C1_BODY_BEFORE_MIND_GUIDE,
  EEC_C1_MG01_LENSES_GUIDE,
  EEC_C1_MG02_FACE_GUIDE,
  EEC_C1_MG03_ALARM_GUIDE,
  EEC_C1_MG04_INFORMS_GUIDE,
  EEC_C1_MG05_CONSTRUCTED_GUIDE,
  EEC_C2_MG01_UNIVERSAL_GUIDE,
  EEC_C2_MG02_CULTURE_GUIDE,
  EEC_C2_MG03_GESTURE_GUIDE,
  EEC_C2_MG04_WORDS_GUIDE,
  EEC_C2_MG05_RITUALS_GUIDE,
  EEC_C3_MG01_GUIDE,
  EEC_C3_MG02_GUIDE,
  EEC_C3_MG03_GUIDE,
  EEC_C3_MG04_GUIDE,
  EEC_C3_MG05_GUIDE,
  EEC_C4_MG01_GUIDE,
  EEC_C4_MG02_GUIDE,
  EEC_C4_MG03_GUIDE,
  EEC_C4_MG04_GUIDE,
  EEC_C4_MG05_GUIDE,
  EEC_C5_MG01_GUIDE,
  EEC_C5_MG02_GUIDE,
  EEC_C5_MG03_GUIDE,
  EEC_C5_MG04_GUIDE,
  EEC_C5_MG05_GUIDE,
  EEC_C6_MG01_GUIDE,
  EEC_C6_MG02_GUIDE,
  EEC_C6_MG03_GUIDE,
  EEC_C6_MG04_GUIDE,
  EEC_C6_MG05_GUIDE,
  EEC_C7_MG01_GUIDE,
  EEC_C7_MG02_GUIDE,
  EEC_C7_MG03_GUIDE,
  EEC_C7_MG04_GUIDE,
  EEC_C7_MG05_GUIDE,
  EEC_C8_MG01_GUIDE,
  EEC_C8_MG02_GUIDE,
  EEC_C8_MG03_GUIDE,
  EEC_C8_MG04_GUIDE,
  EEC_C8_MG05_GUIDE,
  EEC_C9_MG01_GUIDE,
  EEC_C9_MG02_GUIDE,
  EEC_C9_MG03_GUIDE,
  EEC_C9_MG04_GUIDE,
  EEC_C9_MG05_GUIDE,
  EEC_C10_MG01_GUIDE,
  EEC_C10_MG02_GUIDE,
  EEC_C10_MG03_GUIDE,
  EEC_C10_MG04_GUIDE,
  EEC_C10_MG05_GUIDE,
  PQP_C1_SUSTAINED_CONTACT_GUIDE,
];

export const productionGuideRegistry = new GuideCatalogRegistry(
  PRODUCTION_GUIDE_DEFINITIONS,
);

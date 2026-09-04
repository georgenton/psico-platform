/**
 * CC-7.5 / GR-4 — the web PRESENTATION registry for Guide V1.
 *
 * This file is copy, not domain. It says how a step LOOKS; it never says what
 * a step IS. The kind, the completion policy, the target keys (concept,
 * exercise, item, confirmation), the editorial context and the correct option
 * all live server-side and are derived from the pinned `guideKey@guideVersion`
 * — none of them appear here, and none of them may.
 *
 * The consequence is deliberate: this registry cannot decide a transition. The
 * UI reads `currentStepKey` from the server and looks up the copy for it. If
 * the server ever names a step the pinned presentation does not know, the
 * player fails closed rather than guessing.
 *
 * GR-4 made it a REGISTRY rather than a singleton. There is more than one
 * guide now, and a singleton would force every runtime to answer "which one?"
 * with a default. Lookup is EXACT: an unknown pin returns `null`, and `null`
 * is never a reason to render the other guide.
 */

import { guidePinKey, type GuidePin } from "./guide-pin";
import { EEC_C01_PRESENTATIONS } from "./eec-c01-microguides";

/**
 * Where the reader panel opens inside a checkpoint.
 *
 * Declared per step, never inferred from the step key. The previous build read
 * `stepKey.startsWith("practicar")`, which quietly made the SPANISH WORD part
 * of the contract: a guide whose steps were named differently would have
 * landed on the wrong screen, and nothing would have said so.
 */
export type GuideInitialReaderScene = "cover" | "practice" | "recall";

/** A recall option: the key we send back, and the label we render. */
export interface GuideOptionPresentation {
  optionKey: string;
  label: string;
}

interface GuideStepPresentationBase {
  stepKey: string;
  /** Short label for the progress list. */
  shortLabel: string;
  title: string;
  /** Neutral instructions. No new claims, no inferred understanding. */
  body: string[];
  /** The label of the button that sends the command for this step. */
  actionLabel: string;
  /** Which reader scene this checkpoint opens on. Declared, never inferred. */
  initialReaderScene: GuideInitialReaderScene;
}

/** A step the user simply confirms (concept / practice). */
export interface GuideConfirmStepPresentation extends GuideStepPresentationBase {
  surface: "confirm";
  /** Optional clarification rendered under the action, never a claim. */
  note?: string;
}

/** The recall step: a question and its closed set of options. */
export interface GuideRecallStepPresentation extends GuideStepPresentationBase {
  surface: "recall";
  question: string;
  options: readonly GuideOptionPresentation[];
}

export type GuideStepPresentation =
  | GuideConfirmStepPresentation
  | GuideRecallStepPresentation;

export interface GuidePresentation {
  guideKey: string;
  guideVersion: number;
  /** Editorial title of the guide. */
  title: string;
  /** UI tag that separates this product from a Journey. */
  tag: string;
  /** One-line description for the entry card. */
  summary: string;
  /** Route of the published web experience, when one exists. */
  href?: string;
  steps: readonly GuideStepPresentation[];
  /** Button copy that is not tied to a single step. */
  labels: {
    start: string;
    resume: string;
    restart: string;
    finish: string;
    exit: string;
    back: string;
    retry: string;
  };
}

/** The permanent disclaimer shown on every screen of every guide player. */
export const GUIDE_SCOPE_NOTE =
  "Esta guía registra avance educativo. No interpreta cómo te sientes ni " +
  "modifica automáticamente tu Mapa Emocional.";

// ─── Definitions ─────────────────────────────────────────────────────────────

/**
 * Emociones en Construcción · capítulo 1. Unchanged from CC-7.5 except for the
 * `initialReaderScene` each step now declares explicitly.
 */
const EEC_C1_PRESENTATION: GuidePresentation = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
  title: "El cuerpo sabe antes que la mente",
  tag: "Guía breve",
  summary:
    "Tres pasos cortos sobre el capítulo 1: una idea, una práctica y una " +
    "pregunta para recordar lo leído.",
  href: "/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente",
  steps: [
    {
      surface: "confirm",
      stepKey: "explorar-cuerpo-antes-que-mente",
      initialReaderScene: "cover",
      shortLabel: "Concepto",
      title: "El cuerpo sabe antes que la mente",
      body: [
        "Lee la idea del capítulo 1 con calma y, cuando termines, marca que " +
          "la exploraste.",
      ],
      actionLabel: "He explorado esta idea",
      note: "Marcarlo registra que llegaste hasta aquí; no evalúa lo que entendiste.",
    },
    {
      surface: "confirm",
      stepKey: "practicar-escucharte-por-dentro",
      initialReaderScene: "practice",
      shortLabel: "Práctica",
      title: "Una exploración emocional guiada: escucharte por dentro",
      body: [
        "Haz la práctica del capítulo con el tiempo que necesites y vuelve " +
          "aquí cuando la termines.",
      ],
      actionLabel: "Ya hice esta práctica",
      note: "Este botón registra tu propia confirmación; la app no verifica la práctica.",
    },
    {
      surface: "recall",
      stepKey: "recordar-cuerpo-antes-que-mente",
      initialReaderScene: "recall",
      shortLabel: "Recordar",
      title: "Recordar lo leído",
      body: ["Elige la opción que corresponde a lo que dice el capítulo 1."],
      question:
        "Según el capítulo 1, ¿cómo describe el libro la relación temporal " +
        "entre la reacción del cuerpo y la comprensión consciente de una " +
        "emoción?",
      options: [
        {
          optionKey: "opcion-cuerpo-primero",
          label:
            "El cuerpo puede reaccionar antes de que la mente alcance a " +
            "identificar o nombrar lo que está sintiendo.",
        },
        {
          optionKey: "opcion-mente-primero",
          label:
            "La mente identifica primero la emoción y solamente después el " +
            "cuerpo comienza a reaccionar.",
        },
        {
          optionKey: "opcion-simultanea",
          label:
            "El cuerpo y la mente siempre reaccionan de manera simultánea, " +
            "consciente y perfectamente coordinada.",
        },
      ],
      actionLabel: "Registrar respuesta",
    },
  ],
  labels: {
    start: "Empezar guía",
    resume: "Continuar guía",
    restart: "Empezar de nuevo",
    finish: "Finalizar guía",
    exit: "Salir de la guía",
    back: "Volver a Exploraciones",
    retry: "Reintentar",
  },
};

/**
 * Parejas que perduran · capítulo 1 del libro (PLATFORM order 2).
 *
 * The question and the three option labels are the PUBLIC half of the
 * editorially-approved recall item; the server keeps the correct option and
 * grades against it. Nothing in this file knows which one it is, so nothing
 * here could leak it.
 *
 * No `href`: there is no standalone route for this guide. It is reachable from
 * the reader once discovery wires it up (GR-4, Session C).
 */
const PQP_C1_PRESENTATION: GuidePresentation = {
  guideKey: "pqp-c1-contacto-sostenido",
  guideVersion: 1,
  title: "El contacto sostenido en silencio",
  tag: "Guía breve",
  summary:
    "Tres pasos cortos sobre el capítulo 1: una idea, una práctica de diez " +
    "minutos y una pregunta para recordar lo leído.",
  steps: [
    {
      surface: "confirm",
      stepKey: "explorar-contacto-sostenido",
      initialReaderScene: "cover",
      shortLabel: "Concepto",
      title: "El contacto sostenido en silencio",
      body: [
        "Lee el pasaje del experimento con calma y, cuando termines, marca " +
          "que lo exploraste.",
      ],
      actionLabel: "He explorado esta idea",
      note: "Marcarlo registra que llegaste hasta aquí; no evalúa lo que entendiste.",
    },
    {
      surface: "confirm",
      stepKey: "practicar-diez-minutos-de-contacto",
      initialReaderScene: "practice",
      shortLabel: "Práctica",
      title: "Ejercicio 3: El Mapa de las Miradas",
      body: [
        "Haz el ejercicio del capítulo con el tiempo que necesites y vuelve " +
          "aquí cuando lo termines.",
      ],
      actionLabel: "Ya hice esta práctica",
      note: "Este botón registra tu propia confirmación; la app no verifica la práctica.",
    },
    {
      surface: "recall",
      stepKey: "recordar-contacto-sostenido",
      initialReaderScene: "recall",
      shortLabel: "Recordar",
      title: "Recordar lo leído",
      body: ["Elige la opción que corresponde a lo que dice el capítulo."],
      question:
        "Según el capítulo, ¿qué se les pidió hacer a las parejas durante " +
        "los diez minutos del ejercicio de contacto?",
      options: [
        {
          optionKey: "pqp-opcion-manos-y-mirada",
          label:
            "Sentarse frente a frente, tomarse de las manos y sostener la " +
            "mirada en silencio, sin disculpas y sin buscar soluciones.",
        },
        {
          optionKey: "pqp-opcion-conversar-acuerdos",
          label:
            "Conversar sobre el conflicto hasta llegar a un acuerdo " +
            "explícito antes de que terminara el tiempo.",
        },
        {
          optionKey: "pqp-opcion-turnos-disculpas",
          label:
            "Turnarse para pedir disculpas por lo ocurrido y proponer cada " +
            "uno una solución concreta.",
        },
      ],
      actionLabel: "Registrar respuesta",
    },
  ],
  labels: {
    start: "Empezar guía",
    resume: "Continuar guía",
    restart: "Empezar de nuevo",
    finish: "Finalizar guía",
    exit: "Salir de la guía",
    back: "Volver a la lectura",
    retry: "Reintentar",
  },
};

// ─── Registry ────────────────────────────────────────────────────────────────

export type GuidePresentationErrorCode =
  | "GUIDE_PRESENTATION_INVALID_PIN"
  | "GUIDE_PRESENTATION_DUPLICATE_PIN"
  | "GUIDE_PRESENTATION_NO_STEPS"
  | "GUIDE_PRESENTATION_DUPLICATE_STEP"
  | "GUIDE_PRESENTATION_DUPLICATE_OPTION"
  | "GUIDE_PRESENTATION_EMPTY_RECALL"
  | "GUIDE_PRESENTATION_CONFIRM_WITH_OPTIONS"
  | "GUIDE_PRESENTATION_SCENE_MISMATCH";

/** Value-free registry failure — a stable code and nothing else. */
export class GuidePresentationError extends Error {
  readonly code: GuidePresentationErrorCode;
  constructor(code: GuidePresentationErrorCode) {
    super(code);
    this.name = "GuidePresentationError";
    this.code = code;
  }
}

/**
 * A recall step opens on `recall`; a confirm step opens on `cover` or
 * `practice`. Anything else would render a screen whose action cannot send the
 * command the server expects for that step.
 */
function sceneMatchesSurface(step: GuideStepPresentation): boolean {
  return step.surface === "recall"
    ? step.initialReaderScene === "recall"
    : step.initialReaderScene === "cover" ||
        step.initialReaderScene === "practice";
}

/**
 * Exact `pin → presentation` registry, validated WHOLE at construction. A
 * malformed definition is a module-load failure rather than a surprise on
 * whichever reader happens to open that guide first.
 */
export class GuidePresentationRegistry {
  private readonly byPin = new Map<string, GuidePresentation>();

  constructor(presentations: readonly GuidePresentation[]) {
    for (const p of presentations) {
      const key = guidePinKey({
        guideKey: p.guideKey,
        guideVersion: p.guideVersion,
      });
      if (key === null) {
        throw new GuidePresentationError("GUIDE_PRESENTATION_INVALID_PIN");
      }
      if (this.byPin.has(key)) {
        throw new GuidePresentationError("GUIDE_PRESENTATION_DUPLICATE_PIN");
      }
      if (p.steps.length === 0) {
        throw new GuidePresentationError("GUIDE_PRESENTATION_NO_STEPS");
      }

      const stepKeys = new Set<string>();
      // Option keys are unique WITHIN a pin, not globally: two guides may
      // legitimately reuse a label-like key, and the command that carries it
      // always carries its step too.
      const optionKeys = new Set<string>();

      for (const step of p.steps) {
        if (stepKeys.has(step.stepKey)) {
          throw new GuidePresentationError("GUIDE_PRESENTATION_DUPLICATE_STEP");
        }
        stepKeys.add(step.stepKey);

        if (!sceneMatchesSurface(step)) {
          throw new GuidePresentationError("GUIDE_PRESENTATION_SCENE_MISMATCH");
        }

        if (step.surface === "recall") {
          if (step.options.length === 0) {
            throw new GuidePresentationError("GUIDE_PRESENTATION_EMPTY_RECALL");
          }
          for (const option of step.options) {
            if (optionKeys.has(option.optionKey)) {
              throw new GuidePresentationError(
                "GUIDE_PRESENTATION_DUPLICATE_OPTION",
              );
            }
            optionKeys.add(option.optionKey);
          }
        } else if ("options" in step) {
          // A confirm step carrying options would render a question whose
          // answer no command can send.
          throw new GuidePresentationError(
            "GUIDE_PRESENTATION_CONFIRM_WITH_OPTIONS",
          );
        }
      }

      this.byPin.set(key, p);
    }
  }

  /**
   * EXACT lookup. Never "latest", never first-registered, never a default: an
   * unknown pin returns `null` and the caller reports unavailable.
   */
  getExact(pin: GuidePin): GuidePresentation | null {
    const key = guidePinKey(pin);
    if (key === null) return null;
    return this.byPin.get(key) ?? null;
  }

  get size(): number {
    return this.byPin.size;
  }
}

export const PRODUCTION_GUIDE_PRESENTATIONS: readonly GuidePresentation[] = [
  EEC_C1_PRESENTATION,
  PQP_C1_PRESENTATION,
  // EEC-C01's five microguides, built from the approved manifests.
  ...EEC_C01_PRESENTATIONS,
];

export const guidePresentationRegistry = new GuidePresentationRegistry(
  PRODUCTION_GUIDE_PRESENTATIONS,
);

// ─── Per-presentation lookups ────────────────────────────────────────────────

/** Whether the pinned presentation knows this step key. */
export function isGuideStepKey(
  value: unknown,
  presentation: GuidePresentation,
): value is string {
  return (
    typeof value === "string" &&
    presentation.steps.some((s) => s.stepKey === value)
  );
}

/**
 * Whether the pinned presentation knows this option key ANYWHERE.
 *
 * Deliberately coarse, and therefore not enough on its own. Use
 * `isGuideOptionKeyForStep` for anything that leads to a command: a guide with
 * two recalls would accept the second one's option under the first, and the
 * server would reject it after the browser had already minted an idempotency
 * key and written a recovery record for an attempt that was never valid.
 */
export function isGuideOptionKey(
  value: unknown,
  presentation: GuidePresentation,
): value is string {
  if (typeof value !== "string") return false;
  return presentation.steps.some(
    (s) =>
      s.surface === "recall" && s.options.some((o) => o.optionKey === value),
  );
}

/**
 * Whether `optionKey` belongs to the recall step named by `stepKey` — the
 * EXACT pair a `STEP_RECALL` command carries.
 *
 * Fails closed on every other reading: an unknown step, a confirm step, and an
 * option that lives in a DIFFERENT recall of the same guide. That last case is
 * the one `isGuideOptionKey` cannot see, and it is not hypothetical — the
 * moment a guide has two recall steps, "the option exists somewhere in this
 * guide" stops meaning "the reader could have chosen it here".
 *
 * There is no fallback to another recall. A command whose pair does not line
 * up is not a command the server would accept, so it is not one we send.
 */
export function isGuideOptionKeyForStep(
  stepKey: string,
  optionKey: unknown,
  // A type predicate rather than a bare `boolean`: it is the same value at
  // runtime, and it lets the recovery parser rebuild `selectedOptionKey` as a
  // `string` without a second, redundant `typeof` check that could drift.
  presentation: GuidePresentation,
): optionKey is string {
  if (typeof optionKey !== "string") return false;
  const step = presentation.steps.find((s) => s.stepKey === stepKey);
  if (!step || step.surface !== "recall") return false;
  return step.options.some((o) => o.optionKey === optionKey);
}

/**
 * Copy for a server-named step, or `null` when the PINNED presentation does
 * not know it. `null` is a fail-closed signal, never a reason to fall back to
 * step 1 — or to the other guide's step 1.
 */
export function stepPresentationFor(
  stepKey: string | null,
  presentation: GuidePresentation,
): GuideStepPresentation | null {
  if (stepKey === null) return null;
  return presentation.steps.find((s) => s.stepKey === stepKey) ?? null;
}

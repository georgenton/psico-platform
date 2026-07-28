/**
 * CC-7.5 — the web PRESENTATION catalog for Guide V1.
 *
 * This file is copy, not domain. It says how a step LOOKS; it never says what
 * a step IS. The kind, the completion policy, the target keys (concept,
 * exercise, item, confirmation), the editorial context and the correct option
 * all live server-side and are derived from the pinned `guideKey@guideVersion`
 * — none of them appear here, and none of them may.
 *
 * The consequence is deliberate: this catalog cannot decide a transition. The
 * UI reads `currentStepKey` from the server and looks up the copy for it. If
 * the server ever names a step this file does not know, the player fails
 * closed rather than guessing.
 */

export const GUIDE_KEY = "eec-c1-cuerpo-antes-que-mente" as const;
export const GUIDE_VERSION = 1 as const;

export type GuideStepKeyWeb =
  | "explorar-cuerpo-antes-que-mente"
  | "practicar-escucharte-por-dentro"
  | "recordar-cuerpo-antes-que-mente";

export type GuideOptionKeyWeb =
  | "opcion-cuerpo-primero"
  | "opcion-mente-primero"
  | "opcion-simultanea";

/** A recall option: the key we send back, and the label we render. */
export interface GuideOptionPresentation {
  optionKey: GuideOptionKeyWeb;
  label: string;
}

interface GuideStepPresentationBase {
  stepKey: GuideStepKeyWeb;
  /** Short label for the progress list. */
  shortLabel: string;
  title: string;
  /** Neutral instructions. No new claims, no inferred understanding. */
  body: string[];
  /** The label of the button that sends the command for this step. */
  actionLabel: string;
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
  guideKey: typeof GUIDE_KEY;
  guideVersion: typeof GUIDE_VERSION;
  /** Editorial title of the guide. */
  title: string;
  /** UI tag that separates this product from a Journey. */
  tag: string;
  /** One-line description for the entry card. */
  summary: string;
  /** Route of the published web experience. */
  href: string;
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

export const GUIDE_PRESENTATION: GuidePresentation = {
  guideKey: GUIDE_KEY,
  guideVersion: GUIDE_VERSION,
  title: "El cuerpo sabe antes que la mente",
  tag: "Guía breve",
  summary:
    "Tres pasos cortos sobre el capítulo 1: una idea, una práctica y una " +
    "pregunta para recordar lo leído.",
  href: `/dashboard/exploraciones/${GUIDE_KEY}`,
  steps: [
    {
      surface: "confirm",
      stepKey: "explorar-cuerpo-antes-que-mente",
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

/** The permanent disclaimer shown on every screen of the player. */
export const GUIDE_SCOPE_NOTE =
  "Esta guía registra avance educativo. No interpreta cómo te sientes ni " +
  "modifica automáticamente tu Mapa Emocional.";

const STEP_KEYS: readonly string[] = GUIDE_PRESENTATION.steps.map(
  (s) => s.stepKey,
);

const OPTION_KEYS: readonly string[] = GUIDE_PRESENTATION.steps.flatMap((s) =>
  s.surface === "recall" ? s.options.map((o) => o.optionKey) : [],
);

export function isGuideStepKey(value: unknown): value is GuideStepKeyWeb {
  return typeof value === "string" && STEP_KEYS.includes(value);
}

export function isGuideOptionKey(value: unknown): value is GuideOptionKeyWeb {
  return typeof value === "string" && OPTION_KEYS.includes(value);
}

/**
 * Copy for a server-named step, or `null` when this build does not know it.
 * `null` is a fail-closed signal, never a reason to fall back to step 1.
 */
export function stepPresentationFor(
  stepKey: string | null,
): GuideStepPresentation | null {
  if (stepKey === null) return null;
  return GUIDE_PRESENTATION.steps.find((s) => s.stepKey === stepKey) ?? null;
}

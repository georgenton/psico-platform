/**
 * GR-4 — the pins and bundles the web tests exercise.
 *
 * The EEC constants live here so the regression suites can keep asserting the
 * exact published experience without every file re-deriving it, and so the
 * ratchet that forbids singleton imports in RUNTIME code has one obvious,
 * declared place where test fixtures may name a guide.
 */

import { guidePresentationRegistry } from "./guide-presentation";
import { guideReaderCopyRegistry } from "./guide-reader-copy";
import type { GuidePin } from "./guide-pin";
import type {
  ChapterExperiencePublicView,
  ExperienceScenePayload,
  ExperienceSceneKind,
  ExperienceScenePublicView,
} from "@psico/types";
import { resolveGuideWebBundle, type GuideWebBundle } from "./guide-web-bundle";

export const EEC_PIN: GuidePin = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
};

export const PQP_PIN: GuidePin = {
  guideKey: "pqp-c1-contacto-sostenido",
  guideVersion: 1,
};

function required(pin: GuidePin): GuideWebBundle {
  const bundle = resolveGuideWebBundle(pin);
  // A fixture that silently became `null` would turn every assertion below it
  // into a vacuous pass, so it throws here instead.
  if (!bundle) throw new Error(`missing guide bundle for ${pin.guideKey}`);
  return bundle;
}

export const EEC_BUNDLE: GuideWebBundle = required(EEC_PIN);
export const PQP_BUNDLE: GuideWebBundle = required(PQP_PIN);

export const EEC_PRESENTATION = EEC_BUNDLE.presentation;
export const PQP_PRESENTATION = PQP_BUNDLE.presentation;

export const eecPresentation = () =>
  guidePresentationRegistry.getExact(EEC_PIN);
export const eecCopy = () => guideReaderCopyRegistry.getExact(EEC_PIN);

// ─── GR-6 · experiences, as the API serves them ─────────────────────────────

/**
 * The two published experiences in their PUBLIC shape — exactly what
 * `GET /api/experiences/discovery/:bookSlug/:chapterOrder` returns.
 *
 * They live here, in the fixtures module, and NOT in the player's source: the
 * browser ships no production catalog and a ratchet enforces that. A test still
 * needs something to render, so this is the one place a test may name a real
 * key — the same exemption the guide pins above already have.
 *
 * Note what is NOT here: `correctOptionKey`. The public view never carries it,
 * so a fixture that did would be testing a contract the server does not honour.
 */
const scene = (
  sceneKey: string,
  order: number,
  kind: ExperienceSceneKind,
  payload: ExperienceScenePayload,
  completesGuideStepKey?: string,
): ExperienceScenePublicView => ({
  sceneKey,
  order,
  kind,
  ...(completesGuideStepKey ? { completesGuideStepKey } : {}),
  payload,
});

export const EEC_EXPERIENCE: ChapterExperiencePublicView = {
  experienceKey: "eec-c1-cuerpo-antes-que-mente",
  experienceVersion: 1,
  title: "El cuerpo, antes que la mente",
  summary: "Un recorrido corto.",
  estimatedMinutes: 12,
  guidePin: { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 },
  scenes: [
    scene("intro", 1, "INTRO", {
      title: "Antes de empezar",
      body: ["Son unos minutos."],
    }),
    scene("pasaje", 2, "PASSAGE", {
      title: "El pasaje",
      body: ["Parte de un párrafo concreto."],
      anchorKey: "eec-c1-cuerpo-antes-que-mente",
      actionLabel: "Lo leí",
    }),
    scene(
      "concepto",
      3,
      "CONCEPT",
      {
        title: "El cuerpo sabe antes que la mente",
        body: ["Lee la idea del capítulo 1 con calma."],
        note: "Marcarlo registra que llegaste hasta aquí.",
        actionLabel: "He explorado esta idea",
        conceptKey: "eec-cuerpo-antes-que-mente",
      },
      "explorar-cuerpo-antes-que-mente",
    ),
    scene("ejemplo", 4, "EXAMPLE", {
      title: "Cómo suele aparecer",
      body: ["Un nudo en el estómago."],
    }),
    scene("audio", 5, "AUDIO", {
      title: "Escúchalo",
      body: ["Este capítulo está narrado."],
      mediaKind: "AUDIOBOOK",
    }),
    scene(
      "practica",
      6,
      "PRACTICE",
      {
        title: "Escucharte por dentro",
        body: ["Haz la práctica con el tiempo que necesites."],
        note: "Este botón registra tu propia confirmación.",
        actionLabel: "Ya hice esta práctica",
      },
      "practicar-escucharte-por-dentro",
    ),
    scene(
      "recuerdo",
      7,
      "RECALL",
      {
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde."],
        question: "¿Qué dice el capítulo 1?",
        options: [
          { optionKey: "opcion-cuerpo-primero", label: "El cuerpo primero" },
          { optionKey: "opcion-mente-primero", label: "La mente primero" },
        ],
        actionLabel: "Registrar respuesta",
      },
      "recordar-cuerpo-antes-que-mente",
    ),
    scene("cierre", 8, "SUMMARY", {
      title: "Hasta aquí llega el recorrido",
      body: ["Lo que quede sin marcar sigue esperándote."],
    }),
  ],
};

export const PQP_EXPERIENCE: ChapterExperiencePublicView = {
  experienceKey: "pqp-c1-contacto-sostenido",
  experienceVersion: 1,
  title: "Contacto sostenido",
  summary: "Diez minutos de contacto.",
  estimatedMinutes: 15,
  guidePin: { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 },
  scenes: [
    scene("intro", 1, "INTRO", {
      title: "Antes de empezar",
      body: ["Algo simple de decir."],
    }),
    scene("pasaje", 2, "PASSAGE", {
      title: "El pasaje",
      body: ["Parte de un párrafo concreto."],
      anchorKey: "pqp-c1-contacto-sostenido",
      actionLabel: "Lo leí",
    }),
    scene(
      "concepto",
      3,
      "CONCEPT",
      {
        title: "Contacto sostenido",
        body: ["Lee el pasaje del experimento con calma."],
        actionLabel: "He explorado esta idea",
        conceptKey: "pqp-c1-contacto-sostenido",
      },
      "explorar-contacto-sostenido",
    ),
    scene("pregunta", 4, "QUESTION", {
      title: "¿Cuándo fue la última vez?",
      body: ["No hay respuesta correcta."],
      note: "Nadie califica esto.",
      placeholder: "Si quieres, anótalo aquí.",
      actionLabel: "Seguir",
    }),
    scene(
      "practica",
      5,
      "PRACTICE",
      {
        title: "Diez minutos de contacto",
        body: ["Haz el ejercicio con el tiempo que necesites."],
        actionLabel: "Ya hice esta práctica",
      },
      "practicar-diez-minutos-de-contacto",
    ),
    scene("reflexion", 6, "REFLECTION", {
      title: "¿Qué notaste?",
      body: ["Escríbelo si te sirve para ordenarlo."],
      note: "Este texto se queda en tu dispositivo.",
      placeholder: "Lo que notaste…",
      actionLabel: "Lo reflexioné",
    }),
    scene(
      "recuerdo",
      7,
      "RECALL",
      {
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde."],
        question: "¿Qué dice el capítulo?",
        options: [
          { optionKey: "pqp-opcion-manos-y-mirada", label: "Manos y mirada" },
          { optionKey: "pqp-opcion-resolver", label: "Resolver el problema" },
        ],
        actionLabel: "Registrar respuesta",
      },
      "recordar-contacto-sostenido",
    ),
    scene("cierre", 8, "SUMMARY", {
      title: "Hasta aquí llega el recorrido",
      body: ["Lo que quede sin marcar sigue esperándote."],
    }),
    scene("resonancia", 9, "RESONANCE", {
      title: "¿Te resonó?",
      body: ["Puedes guardarlo como una resonancia tuya."],
      note: "Es opcional.",
      actionLabel: "Sí, me resonó",
      conceptKey: "pqp-c1-contacto-sostenido",
    }),
  ],
};

export const PUBLISHED_EXPERIENCES: readonly ChapterExperiencePublicView[] = [
  EEC_EXPERIENCE,
  PQP_EXPERIENCE,
];

/** What a mocked `experienceApi.listPublishedForChapter` answers. */
export function experiencesForChapter(input: {
  bookSlug: string;
  chapterOrder: number;
}) {
  const byChapter: Record<string, ChapterExperiencePublicView[]> = {
    "emociones-en-construccion#1": [EEC_EXPERIENCE],
    "parejas-que-perduran#2": [PQP_EXPERIENCE],
  };
  return {
    items: byChapter[`${input.bookSlug}#${input.chapterOrder}`] ?? [],
  };
}

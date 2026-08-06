/**
 * The approved production experiences (ADR 0021 §6).
 *
 * They live HERE, behind `CodeOwnedExperienceDefinitionRepository`, and not in
 * `@psico/types`. A brief detour put them in the shared package so the browser
 * could import them directly; that was the wrong boundary, and the reason is
 * the CMS this repository interface exists for.
 *
 * A published experience has to be able to change at RUNTIME:
 *
 * ```
 * CMS publish → API serves the new definition → the web renders it
 * ```
 *
 * A definition compiled into the browser bundle cannot do that. It would make
 * every editorial change a deploy, and it would let a stale client keep
 * rendering a journey the server has already replaced. So the server owns the
 * definitions, validates them at boot, and serves them; the browser asks.
 *
 * These are NOT new editorial content. Each one is the guided reading that
 * already exists, given a shape a person can walk through: the same domain
 * checkpoints, now surrounded by panels that introduce, situate and close
 * them.
 *
 * The scenes reference catalogs (`conceptKey`, `exerciseKey`, `itemKey`,
 * `promptKey`) and approved anchors. No book prose is copied here, and none of
 * the damaged OCR blocks of Parejas is used as an authority — the passage
 * scene points at the anchor CC-7 approved and that the Guide has been
 * resolving in production since GR-3.
 */

import {
  validateExperienceAgainstGuide,
  validateExperienceDefinition,
} from "./experience-catalog";
import {
  EEC_C1_BODY_BEFORE_MIND_GUIDE,
  PQP_C1_SUSTAINED_CONTACT_GUIDE,
} from "../guide/guide-catalog";
import { CodeOwnedExperienceDefinitionRepository } from "./experience-definition.repository";

import type { ChapterExperienceDefinition } from "@psico/types";

/**
 * Emociones en construcción · chapter 1.
 *
 * Eight scenes around three checkpoints. The intro, the example, the audio
 * and the summary carry the journey; only the concept, the practice and the
 * recall can move the record.
 */
export const EEC_C1_EXPERIENCE = validateExperienceDefinition({
  experienceKey: "eec-c1-cuerpo-antes-que-mente",
  experienceVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  title: "El cuerpo, antes que la mente",
  summary:
    "Un recorrido corto por lo que tu cuerpo registra antes de que puedas nombrarlo.",
  estimatedMinutes: 12,
  status: "PUBLISHED",
  guidePin: {
    guideKey: "eec-c1-cuerpo-antes-que-mente",
    guideVersion: 1,
  },
  scenes: [
    {
      sceneKey: "intro",
      order: 1,
      kind: "INTRO",
      copy: {
        title: "Antes de empezar",
        body: [
          "Son unos minutos. Puedes salir cuando quieras y volver donde lo dejaste.",
        ],
      },
    },
    {
      sceneKey: "pasaje",
      order: 2,
      kind: "PASSAGE",
      anchorKey: "eec-c1-cuerpo-antes-que-mente",
      copy: {
        title: "El pasaje",
        body: [
          "Este recorrido parte de un párrafo concreto del capítulo. Puedes leerlo ahí mismo y volver: la guía se queda abierta.",
        ],
        actionLabel: "Lo leí",
      },
    },
    {
      sceneKey: "concepto",
      order: 3,
      kind: "CONCEPT",
      conceptKey: "eec-cuerpo-antes-que-mente",
      completesGuideStepKey: "explorar-cuerpo-antes-que-mente",
      copy: {
        title: "El cuerpo sabe antes que la mente",
        body: [
          "Lee la idea del capítulo 1 con calma y, cuando termines, marca que la exploraste.",
        ],
        note: "Marcarlo registra que llegaste hasta aquí; no evalúa lo que entendiste.",
        actionLabel: "He explorado esta idea",
      },
    },
    {
      sceneKey: "ejemplo",
      order: 4,
      kind: "EXAMPLE",
      copy: {
        title: "Cómo suele aparecer",
        body: [
          "Un nudo en el estómago antes de una conversación difícil. El cuerpo ya sabía.",
        ],
      },
    },
    {
      sceneKey: "audio",
      order: 5,
      kind: "AUDIO",
      mediaKind: "AUDIOBOOK",
      copy: {
        title: "Escúchalo",
        body: [
          "Si prefieres oírlo, este capítulo está narrado. Puedes seguir sin escucharlo — no cambia nada de lo que registres.",
        ],
      },
    },
    {
      sceneKey: "practica",
      order: 6,
      kind: "PRACTICE",
      exerciseKey: "eec-c1-practice-escucharte-por-dentro",
      completesGuideStepKey: "practicar-escucharte-por-dentro",
      copy: {
        title: "Una exploración emocional guiada: escucharte por dentro",
        body: [
          "Haz la práctica del capítulo con el tiempo que necesites y vuelve aquí cuando la termines.",
        ],
        note: "Este botón registra tu propia confirmación; la app no verifica la práctica.",
        actionLabel: "Ya hice esta práctica",
      },
    },
    {
      sceneKey: "recuerdo",
      order: 7,
      kind: "RECALL",
      itemKey: "eec-c1-recall-cuerpo-antes-que-mente",
      completesGuideStepKey: "recordar-cuerpo-antes-que-mente",
      copy: {
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo 1."],
        actionLabel: "Registrar respuesta",
      },
    },
    {
      sceneKey: "cierre",
      order: 8,
      kind: "SUMMARY",
      copy: {
        title: "Hasta aquí llega el recorrido",
        body: ["Lo que quede sin marcar sigue esperándote donde lo dejaste."],
      },
    },
  ],
}) satisfies ChapterExperienceDefinition;

/**
 * Parejas que perduran · editorial chapter 1 (PLATFORM order 2).
 *
 * The reflection and question scenes are presentational writing prompts — the
 * text never leaves the device — and the resonance offer at the end is
 * optional: "Ahora no" finishes the experience just as completely.
 */
export const PQP_C1_EXPERIENCE = validateExperienceDefinition({
  experienceKey: "pqp-c1-contacto-sostenido",
  experienceVersion: 1,
  bookSlug: "parejas-que-perduran",
  chapterOrder: 2,
  title: "Contacto sostenido",
  summary:
    "Diez minutos de contacto y lo que cambia cuando nadie tiene que resolver nada.",
  estimatedMinutes: 15,
  status: "PUBLISHED",
  guidePin: {
    guideKey: "pqp-c1-contacto-sostenido",
    guideVersion: 1,
  },
  scenes: [
    {
      sceneKey: "intro",
      order: 1,
      kind: "INTRO",
      copy: {
        title: "Antes de empezar",
        body: [
          "Este recorrido propone algo simple de decir y difícil de sostener.",
        ],
      },
    },
    {
      sceneKey: "pasaje",
      order: 2,
      kind: "PASSAGE",
      anchorKey: "pqp-c1-contacto-sostenido",
      copy: {
        title: "El pasaje",
        body: [
          "Este recorrido parte de un párrafo concreto del capítulo. Puedes leerlo ahí mismo y volver: la guía se queda abierta.",
        ],
        actionLabel: "Lo leí",
      },
    },
    {
      sceneKey: "concepto",
      order: 3,
      kind: "CONCEPT",
      conceptKey: "pqp-c1-contacto-sostenido",
      completesGuideStepKey: "explorar-contacto-sostenido",
      copy: {
        title: "Contacto sostenido",
        body: [
          "Lee el pasaje del experimento con calma y, cuando termines, marca que lo exploraste.",
        ],
        note: "Marcarlo registra que llegaste hasta aquí; no evalúa lo que entendiste.",
        actionLabel: "He explorado esta idea",
      },
    },
    {
      sceneKey: "pregunta",
      order: 4,
      kind: "QUESTION",
      promptKey: "pqp-c1-question-ultimo-contacto",
      copy: {
        title: "¿Cuándo fue la última vez?",
        body: [
          "Piensa en la última vez que estuviste con alguien sin que ninguno de los dos tuviera que resolver nada. No hay respuesta correcta y nada de esto se guarda.",
        ],
        note: "Nadie califica esto. Tu respuesta se queda en este dispositivo.",
        placeholder: "Si quieres, anótalo aquí. Se queda en este dispositivo.",
        actionLabel: "Seguir",
      },
    },
    {
      sceneKey: "practica",
      order: 5,
      kind: "PRACTICE",
      exerciseKey: "pqp-c1-practice-diez-minutos-de-contacto",
      completesGuideStepKey: "practicar-diez-minutos-de-contacto",
      copy: {
        title: "Diez minutos de contacto",
        body: [
          "Haz el ejercicio del capítulo con el tiempo que necesites y vuelve aquí cuando lo termines.",
        ],
        note: "Este botón registra tu propia confirmación; la app no verifica la práctica.",
        actionLabel: "Ya hice esta práctica",
      },
    },
    {
      sceneKey: "reflexion",
      order: 6,
      kind: "REFLECTION",
      promptKey: "pqp-c1-reflection-que-note",
      copy: {
        title: "¿Qué notaste?",
        body: [
          "Después de los diez minutos, ¿qué apareció? Escríbelo si te sirve para ordenarlo. Este texto no sale de tu dispositivo.",
        ],
        note: "Este texto se queda en tu dispositivo. No se envía ni se guarda con tu avance.",
        placeholder: "Lo que notaste…",
        actionLabel: "Lo reflexioné",
      },
    },
    {
      sceneKey: "recuerdo",
      order: 7,
      kind: "RECALL",
      itemKey: "pqp-c1-recall-contacto-sostenido",
      completesGuideStepKey: "recordar-contacto-sostenido",
      copy: {
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo."],
        actionLabel: "Registrar respuesta",
      },
    },
    {
      sceneKey: "cierre",
      order: 8,
      kind: "SUMMARY",
      copy: {
        title: "Hasta aquí llega el recorrido",
        body: ["Lo que quede sin marcar sigue esperándote donde lo dejaste."],
      },
    },
    {
      sceneKey: "resonancia",
      order: 9,
      kind: "RESONANCE",
      conceptKey: "pqp-c1-contacto-sostenido",
      copy: {
        title: "¿Te resonó?",
        body: [
          "Si algo de esto te tocó, puedes guardarlo como una resonancia tuya.",
        ],
        note: "Es opcional. Si dices que ahora no, no se guarda nada y el recorrido termina igual.",
        actionLabel: "Sí, me resonó",
      },
    },
  ],
}) satisfies ChapterExperienceDefinition;

// Every published experience is checked against the guide it pins AT MODULE
// LOAD. A binding that names a step which does not exist, or a reflection
// claiming to complete a graded recall, fails the process on boot rather than
// surfacing as a dead button in front of a reader.
validateExperienceAgainstGuide(
  EEC_C1_EXPERIENCE,
  EEC_C1_BODY_BEFORE_MIND_GUIDE,
);
validateExperienceAgainstGuide(
  PQP_C1_EXPERIENCE,
  PQP_C1_SUSTAINED_CONTACT_GUIDE,
);

export const PRODUCTION_EXPERIENCE_DEFINITIONS: readonly ChapterExperienceDefinition[] =
  [EEC_C1_EXPERIENCE, PQP_C1_EXPERIENCE];

export const productionExperienceRepository =
  new CodeOwnedExperienceDefinitionRepository(
    PRODUCTION_EXPERIENCE_DEFINITIONS,
  );

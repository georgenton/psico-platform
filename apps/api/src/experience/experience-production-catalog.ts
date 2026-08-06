/**
 * The approved production experiences (ADR 0021 §6).
 *
 * These are NOT new editorial content. Each one is the guided reading that
 * already exists, given a shape a person can walk through: the same three
 * domain checkpoints, now surrounded by panels that introduce, situate and
 * close them.
 *
 * The scenes reference catalogs (`conceptKey`, `exerciseKey`, `itemKey`) and
 * approved anchors. No book prose is copied here, and none of the thirteen
 * damaged OCR blocks of Parejas is used as an authority — the passage scene
 * points at the anchor that CC-7 already approved and that the Guide has been
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
      title: "Antes de empezar",
      body: "Son unos minutos. Puedes salir cuando quieras y volver donde lo dejaste.",
    },
    {
      sceneKey: "pasaje",
      order: 2,
      kind: "PASSAGE",
      anchorKey: "eec-c1-cuerpo-antes-que-mente",
    },
    {
      sceneKey: "concepto",
      order: 3,
      kind: "CONCEPT",
      conceptKey: "eec-cuerpo-antes-que-mente",
      completesGuideStepKey: "explorar-cuerpo-antes-que-mente",
    },
    {
      sceneKey: "ejemplo",
      order: 4,
      kind: "EXAMPLE",
      title: "Cómo suele aparecer",
      body: "Un nudo en el estómago antes de una conversación difícil. El cuerpo ya sabía.",
    },
    {
      sceneKey: "audio",
      order: 5,
      kind: "AUDIO",
      mediaKind: "AUDIOBOOK",
    },
    {
      sceneKey: "practica",
      order: 6,
      kind: "PRACTICE",
      exerciseKey: "eec-c1-practice-escucharte-por-dentro",
      completesGuideStepKey: "practicar-escucharte-por-dentro",
    },
    {
      sceneKey: "recuerdo",
      order: 7,
      kind: "RECALL",
      itemKey: "eec-c1-recall-cuerpo-antes-que-mente",
      completesGuideStepKey: "recordar-cuerpo-antes-que-mente",
    },
    {
      sceneKey: "cierre",
      order: 8,
      kind: "SUMMARY",
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
      title: "Antes de empezar",
      body: "Este recorrido propone algo simple de decir y difícil de sostener.",
    },
    {
      sceneKey: "pasaje",
      order: 2,
      kind: "PASSAGE",
      anchorKey: "pqp-c1-contacto-sostenido",
    },
    {
      sceneKey: "concepto",
      order: 3,
      kind: "CONCEPT",
      conceptKey: "pqp-c1-contacto-sostenido",
      completesGuideStepKey: "explorar-contacto-sostenido",
    },
    {
      sceneKey: "pregunta",
      order: 4,
      kind: "QUESTION",
      promptKey: "pqp-c1-question-ultimo-contacto",
    },
    {
      sceneKey: "practica",
      order: 5,
      kind: "PRACTICE",
      exerciseKey: "pqp-c1-practice-diez-minutos-de-contacto",
      completesGuideStepKey: "practicar-diez-minutos-de-contacto",
    },
    {
      sceneKey: "reflexion",
      order: 6,
      kind: "REFLECTION",
      promptKey: "pqp-c1-reflection-que-note",
    },
    {
      sceneKey: "recuerdo",
      order: 7,
      kind: "RECALL",
      itemKey: "pqp-c1-recall-contacto-sostenido",
      completesGuideStepKey: "recordar-contacto-sostenido",
    },
    {
      sceneKey: "cierre",
      order: 8,
      kind: "SUMMARY",
    },
    {
      sceneKey: "resonancia",
      order: 9,
      kind: "RESONANCE",
      conceptKey: "pqp-c1-contacto-sostenido",
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

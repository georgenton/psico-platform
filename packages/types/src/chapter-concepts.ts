/**
 * Fase E (V2) — curated concept per chapter for the ARC cycle
 * (Anchor → Relate → Confirm).
 *
 * A highlight is NOT a resonance: nothing enters the emotional map silently.
 * When the user marks something, the reader OFFERS the chapter's concept and
 * only an explicit confirmation persists a `Resonance` row — which the user
 * can see (with source + date) and delete from the map.
 *
 * Same shared-catalog pattern as ECO_CHAPTER_PROMPTS / CHAPTER_EXERCISES:
 * one source of truth for web + mobile, no backend table until the content
 * graph (Concept/ContentUnit/BookManifest) is justified by Author B2B.
 *
 * `key` is PERSISTED on Resonance rows — treat it as immutable; add new keys,
 * never rename existing ones.
 */

export interface ChapterConcept {
  /** Stable identifier persisted on the Resonance row. Never rename. */
  key: string;
  /** Short human label shown on the map ("Mis resonancias"). */
  label: string;
}

type BookConcepts = Record<number, ChapterConcept>;

export const CHAPTER_CONCEPTS: Record<string, BookConcepts> = {
  "emociones-en-construccion": {
    1: {
      key: "eec-cuerpo-antes-que-mente",
      label: "El cuerpo sabe antes que la mente",
    },
    2: {
      key: "eec-como-aprendiste-a-sentir",
      label: "Cómo aprendiste a sentir",
    },
    3: {
      key: "eec-mente-que-adelanta",
      label: "Cuando tu mente adelanta la emoción",
    },
  },
  // The book's chapter 1 is PLATFORM order 2: the ingest manifest gave order 1
  // to the preface and introduction. Keying this by 1 would attach the concept
  // to the preface. See docs/product/parejas-guide-v1-first-definition.md.
  "parejas-que-perduran": {
    2: {
      key: "pqp-c1-contacto-sostenido",
      label: "El contacto sostenido en silencio",
    },
  },
};

/**
 * Resolve the chapter's concept. Curated when available, otherwise a stable
 * fallback derived from the chapter identity (so every chapter can resonate,
 * even before curation).
 */
export function chapterConcept(
  bookSlug: string,
  chapterOrder: number,
  chapterTitle: string,
): ChapterConcept {
  const curated = CHAPTER_CONCEPTS[bookSlug]?.[chapterOrder];
  if (curated) return curated;
  return {
    key: `${bookSlug}:cap-${chapterOrder}`,
    label: chapterTitle,
  };
}

// ─── Guided concepts (multi-concept per chapter) ─────────────────────────────

/**
 * A chapter can teach more than one idea.
 *
 * `CHAPTER_CONCEPTS` above holds ONE concept per chapter and its keys are
 * PERSISTED on `Resonance` rows, so it cannot grow a second entry without
 * changing what `chapterConcept()` returns for readers who already resonated.
 * This catalog sits beside it instead: additive, keyed by `conceptKey`, and
 * carrying the context each concept belongs to.
 *
 * Nothing here renames or shadows an existing key. `eec-cuerpo-antes-que-mente`
 * stays exactly where it is and keeps being what `chapterConcept()` answers for
 * chapter 1 — the ARC cycle's default offer is untouched. What changes is that
 * a GUIDE can now name its own concept, and five guides in one chapter name
 * five different ones.
 */
export interface GuidedChapterConcept extends ChapterConcept {
  readonly bookSlug: string;
  /** PLATFORM chapter order, matching the discovery catalog. */
  readonly chapterOrder: number;
  /** The edition this concept was approved against. */
  readonly editionKey: string;
  /** Content Core unit identity — stable across environments, unlike ids. */
  readonly unitKey: string;
}

/**
 * The EEC-C01 route's five concepts (author decision, 2026-09-03).
 *
 * Keys are NEW and immutable from here on: they land on `Resonance` rows the
 * moment a reader confirms one, and renaming a persisted key would orphan the
 * confirmation instead of moving it.
 */
export const GUIDED_CHAPTER_CONCEPTS: readonly GuidedChapterConcept[] = [
  {
    key: "eec-teorias-como-lentes",
    label: "Las teorías son lentes",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "dce92620-2398-5efb-80a4-b90b180a01ae",
  },
  {
    key: "eec-rostro-como-pista",
    label: "El rostro es una pista",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "dce92620-2398-5efb-80a4-b90b180a01ae",
  },
  {
    key: "eec-alarma-antes-del-relato",
    label: "La alarma antes del relato",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "dce92620-2398-5efb-80a4-b90b180a01ae",
  },
  {
    key: "eec-emocion-informa-no-manda",
    label: "La emoción informa; no manda",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "dce92620-2398-5efb-80a4-b90b180a01ae",
  },
  {
    key: "eec-construida-no-significa-falsa",
    label: "Construida no significa falsa",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "dce92620-2398-5efb-80a4-b90b180a01ae",
  },
  // ── EEC-C02 · «¿Existen realmente las emociones universales?» ─────────────
  //
  // Cinco ideas del capítulo 2, aprobadas el 2026-09-04. Mismo contrato que
  // las cinco de C01: claves nuevas, inmutables desde aquí, y el `unitKey` de
  // la unidad publicada en la revisión 11 — no el del capítulo 1.
  {
    key: "eec-universal-no-significa-uniforme",
    label: "Lo universal no significa uniforme",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 2,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f58df2e8-4203-5aa2-83b0-1a8ab79a885a",
  },
  {
    key: "eec-cultura-gramatica-no-destino",
    label: "La cultura es gramática, no destino",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 2,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f58df2e8-4203-5aa2-83b0-1a8ab79a885a",
  },
  {
    key: "eec-gesto-necesita-contexto",
    label: "Un gesto necesita contexto",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 2,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f58df2e8-4203-5aa2-83b0-1a8ab79a885a",
  },
  {
    key: "eec-palabras-dan-contorno",
    label: "Las palabras dan contorno",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 2,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f58df2e8-4203-5aa2-83b0-1a8ab79a885a",
  },
  {
    key: "eec-rituales-dan-marco-no-guion",
    label: "Los rituales dan marco, no guion",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 2,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f58df2e8-4203-5aa2-83b0-1a8ab79a885a",
  },
  // ── EEC-C3 · cinco conceptos guiados (aprobados 2026-09-04) ──────────────
  {
    key: "eec-predecir-no-es-adivinar",
    label: "Predecir no es adivinar",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 3,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f1fd8e4d-39ac-547f-908a-cb97c7f9170b",
  },
  {
    key: "eec-senal-corporal-sin-etiqueta",
    label: "Una señal corporal no viene con etiqueta",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 3,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f1fd8e4d-39ac-547f-908a-cb97c7f9170b",
  },
  {
    key: "eec-contexto-para-categorizar",
    label: "El cerebro también necesita contexto para categorizar",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 3,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f1fd8e4d-39ac-547f-908a-cb97c7f9170b",
  },
  {
    key: "eec-no-hay-boton-de-miedo",
    label: "No hay un botón de miedo",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 3,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f1fd8e4d-39ac-547f-908a-cb97c7f9170b",
  },
  {
    key: "eec-modelo-puede-actualizarse",
    label: "Cuando el modelo no encaja, puede actualizarse",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 3,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "f1fd8e4d-39ac-547f-908a-cb97c7f9170b",
  },
  // ── EEC-C4 · cinco conceptos guiados (aprobados 2026-09-04) ──────────────
  {
    key: "eec-cuerpo-datos-no-veredictos",
    label: "El cuerpo aporta datos, no veredictos",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 4,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "3540539f-72d6-5191-a5e8-447737410922",
  },
  {
    key: "eec-notar-interpretar-nombrar",
    label: "Notar, interpretar y nombrar no son lo mismo",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 4,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "3540539f-72d6-5191-a5e8-447737410922",
  },
  {
    key: "eec-cuerpo-y-cerebro-no-hacen-fila",
    label: "Cuerpo y cerebro no hacen fila",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 4,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "3540539f-72d6-5191-a5e8-447737410922",
  },
  {
    key: "eec-metafora-teoria-evidencia",
    label: "Metáfora, teoría y evidencia no son lo mismo",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 4,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "3540539f-72d6-5191-a5e8-447737410922",
  },
  {
    key: "eec-observar-requiere-eleccion",
    label: "Observar el cuerpo también requiere elección",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 4,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "3540539f-72d6-5191-a5e8-447737410922",
  },
  // ── EEC-C5 · cinco conceptos guiados (aprobados 2026-09-04) ──────────────
  {
    key: "eec-emocion-no-es-historia",
    label: "Una emoción no es una historia",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 5,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "231166b5-f48e-506a-9edc-474a26795e4c",
  },
  {
    key: "eec-silencio-sin-subtitulos",
    label: "El silencio no viene con subtítulos",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 5,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "231166b5-f48e-506a-9edc-474a26795e4c",
  },
  {
    key: "eec-historia-dominante-no-es-identidad",
    label: "Una historia dominante no es toda tu identidad",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 5,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "231166b5-f48e-506a-9edc-474a26795e4c",
  },
  {
    key: "eec-recordar-reconstruye",
    label: "Recordar reconstruye; no inventa libremente",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 5,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "231166b5-f48e-506a-9edc-474a26795e4c",
  },
  {
    key: "eec-reescribir-abre-opciones",
    label: "Reescribir puede abrir opciones, no garantizar otra emoción",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 5,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "231166b5-f48e-506a-9edc-474a26795e4c",
  },
  // ── EEC-C6 · cinco conceptos guiados (aprobados 2026-09-04) ──────────────
  {
    key: "eec-sentir-se-aprende-con-otros",
    label: "Sentir también se aprende con otros",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 6,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "170e6699-0507-5784-8ecc-c9994b8dbf7e",
  },
  {
    key: "eec-regular-juntos-no-es-controlar",
    label: "Regular juntos no es controlar",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 6,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "170e6699-0507-5784-8ecc-c9994b8dbf7e",
  },
  {
    key: "eec-ciclo-no-es-culpa-compartida",
    label: "Un ciclo no significa culpa compartida",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 6,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "170e6699-0507-5784-8ecc-c9994b8dbf7e",
  },
  {
    key: "eec-parecidos-que-no-son-sinonimos",
    label: "Parecidos que no son sinónimos",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 6,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "170e6699-0507-5784-8ecc-c9994b8dbf7e",
  },
  {
    key: "eec-influencia-no-es-destino",
    label: "Influencia no es destino",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 6,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "170e6699-0507-5784-8ecc-c9994b8dbf7e",
  },
  // ── EEC-C7 · cinco conceptos guiados (aprobados 2026-09-04) ──────────────
  {
    key: "eec-suspender-equivalencias",
    label: "Traducir empieza por suspender equivalencias",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 7,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "e98cb79d-5f04-514a-9efd-735254285958",
  },
  {
    key: "eec-expectativa-cambia-la-lectura",
    label: "La expectativa cambia cómo lees la señal",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 7,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "e98cb79d-5f04-514a-9efd-735254285958",
  },
  {
    key: "eec-diferencia-no-es-excusa",
    label: "Una diferencia cultural no es una excusa automática",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 7,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "e98cb79d-5f04-514a-9efd-735254285958",
  },
  {
    key: "eec-muchos-repertorios-dentro",
    label: "Dentro de una cultura también hay muchos repertorios",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 7,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "e98cb79d-5f04-514a-9efd-735254285958",
  },
  {
    key: "eec-preguntar-es-traducir",
    label: "Preguntar es parte de traducir",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 7,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "e98cb79d-5f04-514a-9efd-735254285958",
  },
  // ── EEC-C8 · cinco conceptos guiados (aprobados 2026-09-04) ──────────────
  {
    key: "eec-sentirlo-no-lo-vuelve-verdad",
    label: "Sentirlo no lo vuelve verdad",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 8,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "cd8e1f8e-e19a-5c90-b0f0-5acd5d0a3163",
  },
  {
    key: "eec-muestra-lo-que-importa-no-que-hacer",
    label: "Una emoción puede mostrar lo que importa, no qué hacer",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 8,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "cd8e1f8e-e19a-5c90-b0f0-5acd5d0a3163",
  },
  {
    key: "eec-pista-evidencia-veredicto",
    label: "Pista, evidencia y veredicto son distintos",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 8,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "cd8e1f8e-e19a-5c90-b0f0-5acd5d0a3163",
  },
  {
    key: "eec-validar-no-es-dar-la-razon",
    label: "Validar no es dar la razón en todo",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 8,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "cd8e1f8e-e19a-5c90-b0f0-5acd5d0a3163",
  },
  {
    key: "eec-antes-de-actuar-amplia-el-examen",
    label: "Antes de actuar, amplía el examen",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 8,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "cd8e1f8e-e19a-5c90-b0f0-5acd5d0a3163",
  },
  // ── EEC-C9 · cinco conceptos guiados (aprobados 2026-09-04) ──────────────
  {
    key: "eec-construido-no-significa-elegido",
    label: "Construido no significa elegido",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 9,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "a1c44e40-de0b-5bac-9946-ed7655e4140e",
  },
  {
    key: "eec-tecnica-util-no-es-universal",
    label: "Una técnica útil no es una técnica universal",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 9,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "a1c44e40-de0b-5bac-9946-ed7655e4140e",
  },
  {
    key: "eec-define-que-quieres-cambiar",
    label: "Define qué quieres cambiar antes de regular",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 9,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "a1c44e40-de0b-5bac-9946-ed7655e4140e",
  },
  {
    key: "eec-cuatro-puertas",
    label: "Cuatro puertas para intervenir",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 9,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "a1c44e40-de0b-5bac-9946-ed7655e4140e",
  },
  {
    key: "eec-repensar-ocurre-despues",
    label: "Repensar también ocurre después",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 9,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "a1c44e40-de0b-5bac-9946-ed7655e4140e",
  },
  // ── EEC-C10 · cinco conceptos guiados (aprobados 2026-09-04) ──────────────
  {
    key: "eec-hacer-espacio-no-es-confirmar",
    label: "Hacer espacio no es confirmar toda la historia",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 10,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "1e7704be-0297-5124-90f7-ebff5ef0caeb",
  },
  {
    key: "eec-no-narrador-de-la-mente-ajena",
    label: "No te conviertas demasiado pronto en narrador de la mente ajena",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 10,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "1e7704be-0297-5124-90f7-ebff5ef0caeb",
  },
  {
    key: "eec-emocion-si-conducta-con-limites",
    label: "La emoción puede estar; la conducta sigue teniendo límites",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 10,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "1e7704be-0297-5124-90f7-ebff5ef0caeb",
  },
  {
    key: "eec-ayudar-sin-borrar-la-agencia",
    label: "Ayudar sin borrar la agencia",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 10,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "1e7704be-0297-5124-90f7-ebff5ef0caeb",
  },
  {
    key: "eec-cambiar-el-escenario",
    label: "A veces hay que cambiar el escenario",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 10,
    editionKey: "emociones-en-construccion-1e",
    unitKey: "1e7704be-0297-5124-90f7-ebff5ef0caeb",
  },
];

/** Every guided concept of one chapter, in catalog order. Empty is normal. */
export function guidedChapterConcepts(
  bookSlug: string,
  chapterOrder: number,
): readonly GuidedChapterConcept[] {
  return GUIDED_CHAPTER_CONCEPTS.filter(
    (c) => c.bookSlug === bookSlug && c.chapterOrder === chapterOrder,
  );
}

/** One guided concept by its exact key, or null. Never a nearby one. */
export function guidedConceptByKey(
  conceptKey: string,
): GuidedChapterConcept | null {
  return GUIDED_CHAPTER_CONCEPTS.find((c) => c.key === conceptKey) ?? null;
}

// ─── Resonance wire types ────────────────────────────────────────────────────

/**
 * Where the confirmation happened (provenance, shown on the map).
 *
 * `guide` (GR-3) is its own value rather than a reuse of `highlight` or
 * `exercise`: "Mis resonancias" states where each confirmation came from, and
 * borrowing a value would make that line untrue.
 */
export type ResonanceSource = "highlight" | "eco" | "exercise" | "guide";

export interface ResonanceSummary {
  id: string;
  conceptKey: string;
  conceptLabel: string;
  bookSlug: string;
  chapterOrder: number;
  source: ResonanceSource;
  /** ISO timestamp of the explicit confirmation. */
  confirmedAt: string;
  /**
   * Fase H (ARC-P1) — the user marked this theme as IMPORTANT for them
   * right now. Distinct important themes are the source of the Propósito
   * axis under the V2 contract. Another explicit tap; reversible.
   */
  important: boolean;
}

/** Fase H — body for `PATCH /api/resonances/:id`. */
export interface UpdateResonanceRequest {
  important: boolean;
}

export interface ResonanceListResponse {
  resonances: ResonanceSummary[];
}

export interface ConfirmResonanceRequest {
  conceptKey: string;
  conceptLabel: string;
  bookSlug: string;
  chapterOrder: number;
  source: ResonanceSource;
}

export interface ConfirmResonanceResponse {
  ok: true;
  resonance: ResonanceSummary;
}

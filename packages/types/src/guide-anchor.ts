/**
 * GR-3 — the reader anchor of Guide V1.
 *
 * The passage this guide points at is EDITORIAL identity: a heading and a
 * sentence, both approved by the product owner. It is deliberately NOT a
 * `blockKey`.
 *
 * Content Core derives `blockKey` as a uuidv5 of the legacy `ChapterBlock.id`
 * (CC-1, ADR 0016), so the same paragraph has a DIFFERENT key in every
 * environment where the chapter was ingested. A literal key in this catalog
 * would be true in one database and a lie in the next — it would resolve to
 * nothing, or worse, to somebody else's paragraph.
 *
 * So the catalog says what a human editor can verify by reading the book, and
 * the resolver below turns that into a runtime reference against the blocks the
 * reader was actually served. Fail closed at every step: zero matches or more
 * than one is UNRESOLVED / AMBIGUOUS, never "probably the first one".
 *
 * It lives in the shared package for one reason: the test that ingests the
 * canonical chapter into a real database has to exercise THIS function. A
 * second copy under `apps/api` would prove only that the copy works.
 */

export interface GuideReaderAnchorLocator {
  guideKey: string;
  guideVersion: number;

  bookSlug: string;
  chapterOrder: number;

  /** The section heading, verbatim as the chapter prints it. */
  sourceHeading: string;
  /** The last sentence of the approved passage — its unique fingerprint. */
  passageLastSentence: string;

  /** How many paragraphs may contain the sentence. More than this is a bug. */
  expectedMatchCount: 1;

  /**
   * A SECOND approved passage, when one idea genuinely rests on two sections.
   *
   * MG04 is the case this exists for: Goleman carries the difference between
   * recognising, expressing and acting, and Damasio carries relevance without
   * guarantee. Dropping either would leave the guide teaching half of what it
   * claims to teach, and folding them into one heading would point the reader
   * at a passage that does not say both things.
   *
   * Optional and additive: every anchor written before this field omits it, and
   * the reader still scrolls to `sourceHeading` — the primary is what the
   * runtime resolves. A secondary passage is offered as context, never as the
   * place the guide sends you.
   */
  secondaryPassage?: {
    sourceHeading: string;
    passageLastSentence: string;
  };
}

/**
 * The approved anchor (GR3_ANCHOR_CANDIDATE_1_APPROVED_BY_JORGE=true).
 * `docs/product/guided-reading-v1.md` records the editorial decision.
 */
export const GUIDE_READER_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  sourceHeading: "El cuerpo y la emoción",
  passageLastSentence:
    "Nuestro cuerpo siente antes que nuestra mente entienda.",
  expectedMatchCount: 1,
};

/**
 * The anchor of the Parejas guide — `docs/product/parejas-guide-v1-first-definition.md`.
 *
 * The passage is the paragraph that describes the experiment the guide is
 * about: couples in conflict, ten minutes of silent contact, no apologies and
 * no solutions. That is the CONCEPT, not the practice. The chapter's own
 * activity («Ejercicio 3: El Mapa de las Miradas») is the source of the
 * practice step and is deliberately NOT this anchor: its section contains the
 * numbered instructions and nothing conceptual, so pointing here would scroll
 * the reader to «1. Siéntense frente a frente…» while the panel talked about
 * why sustained contact changes a couple's state.
 *
 * ⚠️  `sourceHeading` is honest about an uncomfortable fact. The edition in
 * production is `OCR_UNFINALIZED` (see the package's own `source-accounting.txt`:
 * ~270 of 1150 blocks land as HEADING because OCR leaves short unpunctuated
 * lines). This chapter has exactly three headings a human would call editorial:
 * two «Ejercicio N» activity titles and one testimony title that OCR printed
 * TWICE. None of them bounds the conceptual passage, so the heading that does
 * is a mangled line — unique, verbatim, and verifiable against the hash-checked
 * package, but not something an editor would recognise from the printed book.
 *
 * It is written down rather than worked around because the alternative is
 * worse: silently anchoring to a practice step, or widening the resolver until
 * it guesses. When the master (non-OCR) edition replaces this one the chapter
 * is re-ingested, and this locator MUST be re-validated — the anchor spec and
 * the pg probe are what will say so, loudly, instead of the guide quietly
 * pointing at the wrong paragraph.
 *
 * Measured against a real PostgreSQL ingestion of the authorised package:
 * `HEADING_MATCH_COUNT=1 · PASSAGE_MATCH_COUNT=1 · STATUS=RESOLVED`.
 */
export const PAREJAS_READER_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "pqp-c1-contacto-sostenido",
  guideVersion: 1,
  bookSlug: "parejas-que-perduran",
  // The book's chapter 1 is PLATFORM order 2 — the ingest manifest gave order 1
  // to the preface. Keying this by 1 would search the preface and fail closed.
  chapterOrder: 2,
  sourceHeading:
    "Suran no solo las o pende xn - Escribió el Poeta Rumi: A lo demás», y a Veces",
  passageLastSentence:
    "La hormona no requería consenso, solo presencia (Scheele et al., 2016).",
  expectedMatchCount: 1,
};

/** The shape a registry lookup is keyed by: one immutable guide definition. */
export interface GuideAnchorPin {
  guideKey: string;
  guideVersion: number;
}

/**
 * GR-4 — one anchor per pin, looked up exactly.
 *
 * The registry exists so a second book cannot be served the first book's
 * passage. Three absences are the whole point:
 *
 *   - no "latest version": a pin this build does not know is `null`, never the
 *     nearest one. A version bump is an editorial change, and answering a v2
 *     request with the v1 passage would scroll the reader somewhere the new
 *     definition never approved;
 *   - no fallback to the first registered anchor. An unknown guide has no
 *     passage, and the reader must refuse to run rather than borrow one;
 *   - no `blockKey`. Content Core derives it per environment (CC-1), so a
 *     literal here would be true in one database and a lie in the next.
 *
 * Registration is validated at construction: a malformed pin, a duplicate pin,
 * an empty heading or sentence is a programming error worth crashing on at
 * import time, not a `null` discovered by a reader mid-chapter.
 */
export class GuideAnchorRegistry {
  private readonly byPin = new Map<string, GuideReaderAnchorLocator>();

  constructor(anchors: readonly GuideReaderAnchorLocator[]) {
    for (const a of anchors) {
      const key = anchorPinKey(a);
      if (!key) {
        throw new Error(
          `GuideAnchorRegistry: malformed pin for "${a.guideKey}"`,
        );
      }
      if (this.byPin.has(key)) {
        throw new Error(`GuideAnchorRegistry: duplicate anchor for ${key}`);
      }
      if (!a.sourceHeading.trim() || !a.passageLastSentence.trim()) {
        throw new Error(`GuideAnchorRegistry: empty locator field in ${key}`);
      }
      if (!a.bookSlug.trim() || !Number.isInteger(a.chapterOrder)) {
        throw new Error(`GuideAnchorRegistry: invalid context in ${key}`);
      }
      this.byPin.set(key, a);
    }
  }

  /** The anchor for EXACTLY this pin, or `null`. Never a nearby one. */
  getExact(pin: GuideAnchorPin): GuideReaderAnchorLocator | null {
    const key = anchorPinKey(pin);
    if (!key) return null;
    return this.byPin.get(key) ?? null;
  }
}

/** Same grammar the web's pin module enforces: kebab-case key, positive int. */
const ANCHOR_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function anchorPinKey(pin: GuideAnchorPin): string | null {
  if (typeof pin?.guideKey !== "string" || !ANCHOR_KEY_RE.test(pin.guideKey)) {
    return null;
  }
  if (!Number.isInteger(pin.guideVersion) || pin.guideVersion <= 0) return null;
  return `${pin.guideKey}@${pin.guideVersion}`;
}

/**
 * EEC-C01 · the five-microguide route (author decision, 2026-09-03).
 *
 * Every heading below is verbatim from `EEC_C01_v1.0_TEXT_LOCKED_2026-08-20`
 * (SHA-256 `e10f42ce…023018`) and every fingerprint was measured against that
 * file: heading present, sentence appearing EXACTLY ONCE. A locator that
 * resolved twice would be ambiguous and one that resolved zero times would send
 * the reader nowhere, so both are failures rather than warnings.
 *
 * Worth recording next to them: the V1 pilot's anchor
 * (`GUIDE_READER_ANCHOR`, heading «El cuerpo y la emoción») no longer resolves
 * against the published chapter — the v1.0 text does not contain that heading.
 * It is left registered untouched so a pinned session still finds its
 * definition, but that is also why discovery stopped offering the pilot: it
 * would scroll a new reader at a passage that is not there.
 */
export const EEC_C1_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c1-teorias-como-lentes",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  sourceHeading: "Distintas lentes para comprender una emoción",
  passageLastSentence:
    "Las teorías sobre las emociones no son simples opiniones",
  expectedMatchCount: 1,
};

export const EEC_C1_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c1-rostro-como-pista",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  sourceHeading: "Paul Ekman: el rostro como pista",
  passageLastSentence:
    "un rostro ofrece pistas; no entrega una lectura completa de la experiencia",
  expectedMatchCount: 1,
};

export const EEC_C1_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c1-alarma-antes-del-relato",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  sourceHeading: "Joseph LeDoux: la alarma antes del relato",
  passageLastSentence:
    "Una respuesta rápida de protección no es exactamente lo mismo que sentir miedo.",
  expectedMatchCount: 1,
};

/** The one guide whose idea rests on two sections — see `secondaryPassage`. */
export const EEC_C1_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c1-emocion-informa-no-manda",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  sourceHeading: "Daniel Goleman: aprender a leer el mundo emocional",
  passageLastSentence: "una emoción no es una conducta",
  expectedMatchCount: 1,
  secondaryPassage: {
    sourceHeading: "Antonio Damasio: la razón necesita relevancia",
    passageLastSentence:
      "Una emoción aporta información; no dicta por sí sola la decisión.",
  },
};

export const EEC_C1_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c1-construida-no-significa-falsa",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  sourceHeading: "Lisa Feldman Barrett: la emoción como construcción",
  passageLastSentence: "construir una emoción no significa inventarla",
  expectedMatchCount: 1,
};

/**
 * EEC-C02 · «¿Existen realmente las emociones universales?» (revisión 11).
 *
 * Las cinco anclas del capítulo 2. Cada `passageLastSentence` está copiada del
 * texto canónico tal como Content Core lo sirve — con su énfasis Markdown
 * incluido, porque el bloque publicado lo lleva: quitar los asteriscos de
 * `*universal*` o de `**hipótesis**` produciría cero coincidencias, y una
 * ancla que no resuelve es una guía sin pasaje.
 */
export const EEC_C2_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c2-universal-no-significa-uniforme",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 2,
  sourceHeading: "¿Qué significa realmente que una emoción sea universal?",
  passageLastSentence:
    "En realidad, la palabra *universal* puede referirse a cosas diferentes.",
  expectedMatchCount: 1,
};

export const EEC_C2_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c2-cultura-gramatica-no-destino",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 2,
  sourceHeading: "La cultura como gramática emocional",
  passageLastSentence:
    "la cultura emocional no determina mecánicamente cada experiencia",
  expectedMatchCount: 1,
};

export const EEC_C2_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c2-gesto-necesita-contexto",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 2,
  sourceHeading: "El rostro no habla solo",
  passageLastSentence:
    "La expresión es una pista; el contexto y la conversación permiten formular **hipótesis**",
  expectedMatchCount: 1,
};

export const EEC_C2_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c2-palabras-dan-contorno",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 2,
  sourceHeading: "Las palabras dan contorno a la experiencia",
  passageLastSentence: "Las palabras funcionan como líneas en un mapa.",
  expectedMatchCount: 1,
};

export const EEC_C2_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c2-rituales-dan-marco-no-guion",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 2,
  sourceHeading: "Rituales: cuando sentir necesita un marco compartido",
  passageLastSentence:
    "Los rituales pueden ofrecer testigos. Pero el testigo no dicta cómo debe sentirse quien está de duelo.",
  expectedMatchCount: 1,
};

/**
 * EEC-C3 — las cinco anclas de «EEC-C03» (aprobación autoral 2026-09-04).
 *
 * Cada `passageLastSentence` es texto REAL del capítulo publicado, verificado
 * 1:1 contra la unidad productiva antes de existir aquí.
 */
export const EEC_C3_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c3-predecir-no-es-adivinar",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 3,
  sourceHeading: "Predecir no es adivinar",
  passageLastSentence:
    "La experiencia previa permite que el sistema nervioso no empiece desde cero en cada instante.",
  expectedMatchCount: 1,
};

export const EEC_C3_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c3-senal-corporal-sin-etiqueta",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 3,
  sourceHeading: "El cuerpo no espera al final de la historia",
  passageLastSentence:
    "las señales del cuerpo son ingredientes; todavía no son la receta completa",
  expectedMatchCount: 1,
};

export const EEC_C3_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c3-contexto-para-categorizar",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 3,
  sourceHeading: "Construcción no significa arbitrariedad",
  passageLastSentence: "ni libertad absoluta ni reacción mecánica",
  expectedMatchCount: 1,
};

export const EEC_C3_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c3-no-hay-boton-de-miedo",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 3,
  sourceHeading: "Patrones sin botones",
  passageLastSentence:
    "sin que haya una huella universal, única e invariable para cada emoción",
  expectedMatchCount: 1,
};

export const EEC_C3_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c3-modelo-puede-actualizarse",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 3,
  sourceHeading: "Cuando la predicción no encaja",
  passageLastSentence:
    "La nueva información obliga a corregir la interpretación inicial.",
  expectedMatchCount: 1,
};

/**
 * EEC-C4 — las cinco anclas de «EEC-C04» (aprobación autoral 2026-09-04).
 *
 * Cada `passageLastSentence` es texto REAL del capítulo publicado, verificado
 * 1:1 contra la unidad productiva antes de existir aquí.
 */
export const EEC_C4_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c4-cuerpo-datos-no-veredictos",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 4,
  sourceHeading: "No existe un diccionario corporal de las emociones",
  passageLastSentence:
    "El problema empieza cuando convertimos esas posibilidades en traducciones rígidas",
  expectedMatchCount: 1,
};

export const EEC_C4_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c4-notar-interpretar-nombrar",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 4,
  sourceHeading: "Interocepción: notar no es lo mismo que interpretar",
  passageLastSentence:
    "notar una señal, detectarla con precisión y comprender qué significa son cosas diferentes",
  expectedMatchCount: 1,
};

export const EEC_C4_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c4-cuerpo-y-cerebro-no-hacen-fila",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 4,
  sourceHeading: "El frenazo antes del nombre",
  passageLastSentence:
    "Que hayas notado primero el corazón acelerado no significa que el corazón haya pronunciado la palabra",
  expectedMatchCount: 1,
};

export const EEC_C4_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c4-metafora-teoria-evidencia",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 4,
  sourceHeading: "Neurocepción: una idea influyente bajo examen",
  passageLastSentence:
    "una explicación puede ser intuitiva, popular y útil para conversar, pero cada uno de sus mecanismos necesita evidencia independiente",
  expectedMatchCount: 1,
};

export const EEC_C4_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c4-observar-requiere-eleccion",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 4,
  sourceHeading:
    "La conciencia corporal puede ayudar; también necesita condiciones",
  passageLastSentence:
    "«útil» no significa «beneficioso para todas las personas en cualquier momento»",
  expectedMatchCount: 1,
};

/**
 * EEC-C5 — las cinco anclas de «EEC-C05» (aprobación autoral 2026-09-04).
 *
 * Cada `passageLastSentence` es texto REAL del capítulo publicado, verificado
 * 1:1 contra la unidad productiva antes de existir aquí.
 */
export const EEC_C5_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c5-emocion-no-es-historia",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 5,
  sourceHeading: "¿Una historia más coherente siempre hace bien?",
  passageLastSentence: "construye una historia coherente y estarás bien",
  expectedMatchCount: 1,
};

export const EEC_C5_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c5-silencio-sin-subtitulos",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 5,
  sourceHeading: "**«¿Qué historia debo inventar para dejar de sentir esto?»**",
  passageLastSentence: "¿Qué subtítulos estoy añadiendo a esta escena",
  expectedMatchCount: 1,
};

export const EEC_C5_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c5-historia-dominante-no-es-identidad",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 5,
  sourceHeading: "Historias dominantes y acontecimientos que no encajan",
  passageLastSentence:
    "Re-autoría no significa inventar capítulos nuevos ni cambiar el pasado",
  expectedMatchCount: 1,
};

export const EEC_C5_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c5-recordar-reconstruye",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 5,
  sourceHeading: "5. La memoria no es una grabación ni una página en blanco",
  passageLastSentence:
    "La memoria autobiográfica selecciona, reconstruye e integra",
  expectedMatchCount: 1,
};

export const EEC_C5_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c5-reescribir-abre-opciones",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 5,
  sourceHeading: "7. Puedes revisar el relato sin borrar la página",
  passageLastSentence:
    "El objetivo no era convencerla de que «seguro todo está bien»",
  expectedMatchCount: 1,
};

/**
 * EEC-C6 — las cinco anclas de «EEC-C06» (aprobación autoral 2026-09-04).
 *
 * Cada `passageLastSentence` es texto REAL del capítulo publicado, verificado
 * 1:1 contra la unidad productiva antes de existir aquí.
 */
export const EEC_C6_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c6-sentir-se-aprende-con-otros",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 6,
  sourceHeading: "2. De lo que pasa en mí a lo que pasa entre nosotros",
  passageLastSentence:
    "añadir el nivel relacional no elimina el nivel individual",
  expectedMatchCount: 1,
};

export const EEC_C6_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c6-regular-juntos-no-es-controlar",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 6,
  sourceHeading: "4. Cuando otra persona ayuda —o empeora— lo que sientes",
  passageLastSentence: "regular no siempre significa reducir una emoción",
  expectedMatchCount: 1,
};

export const EEC_C6_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c6-ciclo-no-es-culpa-compartida",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 6,
  sourceHeading: "5. Cuando una respuesta prepara la siguiente",
  passageLastSentence:
    "Un ciclo no es una criatura invisible que controla a la familia",
  expectedMatchCount: 1,
};

export const EEC_C6_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c6-parecidos-que-no-son-sinonimos",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 6,
  sourceHeading: "Regulación interpersonal",
  passageLastSentence:
    "Es lo que impide que cualquier experiencia de conexión termine descrita con una sola palabra nebulosa",
  expectedMatchCount: 1,
};

export const EEC_C6_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c6-influencia-no-es-destino",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 6,
  sourceHeading: "Influencia no es destino",
  passageLastSentence: "tampoco somos marionetas de nuestras relaciones",
  expectedMatchCount: 1,
};

/**
 * EEC-C7 — las cinco anclas de «EEC-C07» (aprobación autoral 2026-09-04).
 *
 * Cada `passageLastSentence` es texto REAL del capítulo publicado, verificado
 * 1:1 contra la unidad productiva antes de existir aquí.
 */
export const EEC_C7_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c7-suspender-equivalencias",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 7,
  sourceHeading: "Antes de traducir, separar capas",
  passageLastSentence: "Una persona puede sentir tristeza y mostrar irritación",
  expectedMatchCount: 1,
};

export const EEC_C7_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c7-expectativa-cambia-la-lectura",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 7,
  sourceHeading: "La ayuda que no parece ayuda",
  passageLastSentence:
    "dos personas pueden querer cuidar y no coincidir por completo en qué aspecto debería tener el cuidado",
  expectedMatchCount: 1,
};

export const EEC_C7_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c7-diferencia-no-es-excusa",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 7,
  sourceHeading: "**comprender el contexto no significa justificar el daño.**",
  passageLastSentence:
    "¿Tengo razones para pensar que la cultura es relevante aquí",
  expectedMatchCount: 1,
};

export const EEC_C7_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c7-muchos-repertorios-dentro",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 7,
  sourceHeading: "Un país no es una variable mágica",
  passageLastSentence: "La cultura importa. Pero no explica todo por decreto.",
  expectedMatchCount: 1,
};

export const EEC_C7_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c7-preguntar-es-traducir",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 7,
  sourceHeading: "Preguntar antes de interpretar",
  passageLastSentence:
    "Significa reconocer que nuestro mapa puede estar incompleto",
  expectedMatchCount: 1,
};

/**
 * EEC-C8 — las cinco anclas de «EEC-C08» (aprobación autoral 2026-09-04).
 *
 * Cada `passageLastSentence` es texto REAL del capítulo publicado, verificado
 * 1:1 contra la unidad productiva antes de existir aquí.
 */
export const EEC_C8_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c8-sentirlo-no-lo-vuelve-verdad",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 8,
  sourceHeading: "Cuando sentir también es valorar",
  passageLastSentence: "La emoción habla de una relación de importancia.",
  expectedMatchCount: 1,
};

export const EEC_C8_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c8-muestra-lo-que-importa-no-que-hacer",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 8,
  sourceHeading: "La ética empieza cuando aparece el otro",
  passageLastSentence:
    "no otorgan automáticamente derecho a revisar el teléfono de otra persona",
  expectedMatchCount: 1,
};

export const EEC_C8_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c8-pista-evidencia-veredicto",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 8,
  sourceHeading: "Pista, evidencia y veredicto no son lo mismo",
  passageLastSentence:
    "Comprender esa historia explica por qué apareció la emoción",
  expectedMatchCount: 1,
};

export const EEC_C8_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c8-validar-no-es-dar-la-razon",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 8,
  sourceHeading: "**No certifica la interpretación que la acompaña.**",
  passageLastSentence: "Escucha la pista. Después investiga.",
  expectedMatchCount: 1,
};

export const EEC_C8_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c8-antes-de-actuar-amplia-el-examen",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 8,
  sourceHeading: "9. ¿Qué respuesta puedes justificar?",
  passageLastSentence:
    "No pienses únicamente en qué acción reduciría el malestar más rápido.",
  expectedMatchCount: 1,
};

/**
 * EEC-C9 — las cinco anclas de «EEC-C09» (aprobación autoral 2026-09-04).
 *
 * Cada `passageLastSentence` es texto REAL del capítulo publicado, verificado
 * 1:1 contra la unidad productiva antes de existir aquí.
 */
export const EEC_C9_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c9-construido-no-significa-elegido",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 9,
  sourceHeading: "**Construcción no es sinónimo de fabricación consciente.**",
  passageLastSentence:
    "Algunas nunca fueron reglas universales, aunque tu cerebro aprendiera a tratarlas como si lo fueran.",
  expectedMatchCount: 1,
};

export const EEC_C9_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c9-tecnica-util-no-es-universal",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 9,
  sourceHeading: "9. Tomar lo mejor sin convertir una herramienta en religión",
  passageLastSentence:
    "Las escuelas terapéuticas no son enemigas que compiten por explicar toda la vida emocional.",
  expectedMatchCount: 1,
};

export const EEC_C9_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c9-define-que-quieres-cambiar",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 9,
  sourceHeading: "1. No siempre necesitas sentirte mejor para responder mejor",
  passageLastSentence:
    "las personas regulamos nuestras emociones con objetivos distintos",
  expectedMatchCount: 1,
};

export const EEC_C9_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c9-cuatro-puertas",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 9,
  sourceHeading: "Puerta 1: cambiar algo afuera",
  passageLastSentence:
    "La regulación se vuelve injusta cuando enseña a las personas a adaptarse indefinidamente a condiciones que deberían cambiar.",
  expectedMatchCount: 1,
};

export const EEC_C9_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c9-repensar-ocurre-despues",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 9,
  sourceHeading: "15. Repensar también es aprender para la próxima vez",
  passageLastSentence: "La regulación no termina cuando baja la intensidad.",
  expectedMatchCount: 1,
};

/**
 * EEC-C10 — las cinco anclas de «EEC-C10» (aprobación autoral 2026-09-04).
 *
 * Cada `passageLastSentence` es texto REAL del capítulo publicado, verificado
 * 1:1 contra la unidad productiva antes de existir aquí.
 */
export const EEC_C10_MG01_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c10-hacer-espacio-no-es-confirmar",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 10,
  sourceHeading: "1. Hacer espacio a la experiencia",
  passageLastSentence: "Hacer espacio no significa confirmar toda la historia",
  expectedMatchCount: 1,
};

export const EEC_C10_MG02_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c10-no-narrador-de-la-mente-ajena",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 10,
  sourceHeading: "*Mi hijo llora porque intenta manipularme.*",
  passageLastSentence:
    "reconoce la experiencia sin convertirte demasiado pronto en narrador oficial de la mente ajena",
  expectedMatchCount: 1,
};

export const EEC_C10_MG03_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c10-emocion-si-conducta-con-limites",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 10,
  sourceHeading: "3. Poner límites a la conducta sin castigar la emoción",
  passageLastSentence: "Puedes estar furioso. No vamos a enviar amenazas.",
  expectedMatchCount: 1,
};

export const EEC_C10_MG04_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c10-ayudar-sin-borrar-la-agencia",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 10,
  sourceHeading: "4. Ajustar ayuda y agencia",
  passageLastSentence: "La prisa por ayudar también puede quitar algo.",
  expectedMatchCount: 1,
};

export const EEC_C10_MG05_ANCHOR: GuideReaderAnchorLocator = {
  guideKey: "eec-c10-cambiar-el-escenario",
  guideVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 10,
  sourceHeading: "5. Mirar también el escenario",
  passageLastSentence:
    "Es como enseñar equilibrio mientras el suelo continúa mojado.",
  expectedMatchCount: 1,
};

/** The anchors this build ships. Adding a guide means adding a line here. */
export const guideAnchorRegistry = new GuideAnchorRegistry([
  GUIDE_READER_ANCHOR,
  EEC_C1_MG01_ANCHOR,
  EEC_C1_MG02_ANCHOR,
  EEC_C1_MG03_ANCHOR,
  EEC_C1_MG04_ANCHOR,
  EEC_C1_MG05_ANCHOR,
  EEC_C2_MG01_ANCHOR,
  EEC_C2_MG02_ANCHOR,
  EEC_C2_MG03_ANCHOR,
  EEC_C2_MG04_ANCHOR,
  EEC_C2_MG05_ANCHOR,
  EEC_C3_MG01_ANCHOR,
  EEC_C3_MG02_ANCHOR,
  EEC_C3_MG03_ANCHOR,
  EEC_C3_MG04_ANCHOR,
  EEC_C3_MG05_ANCHOR,
  EEC_C4_MG01_ANCHOR,
  EEC_C4_MG02_ANCHOR,
  EEC_C4_MG03_ANCHOR,
  EEC_C4_MG04_ANCHOR,
  EEC_C4_MG05_ANCHOR,
  EEC_C5_MG01_ANCHOR,
  EEC_C5_MG02_ANCHOR,
  EEC_C5_MG03_ANCHOR,
  EEC_C5_MG04_ANCHOR,
  EEC_C5_MG05_ANCHOR,
  EEC_C6_MG01_ANCHOR,
  EEC_C6_MG02_ANCHOR,
  EEC_C6_MG03_ANCHOR,
  EEC_C6_MG04_ANCHOR,
  EEC_C6_MG05_ANCHOR,
  EEC_C7_MG01_ANCHOR,
  EEC_C7_MG02_ANCHOR,
  EEC_C7_MG03_ANCHOR,
  EEC_C7_MG04_ANCHOR,
  EEC_C7_MG05_ANCHOR,
  EEC_C8_MG01_ANCHOR,
  EEC_C8_MG02_ANCHOR,
  EEC_C8_MG03_ANCHOR,
  EEC_C8_MG04_ANCHOR,
  EEC_C8_MG05_ANCHOR,
  EEC_C9_MG01_ANCHOR,
  EEC_C9_MG02_ANCHOR,
  EEC_C9_MG03_ANCHOR,
  EEC_C9_MG04_ANCHOR,
  EEC_C9_MG05_ANCHOR,
  EEC_C10_MG01_ANCHOR,
  EEC_C10_MG02_ANCHOR,
  EEC_C10_MG03_ANCHOR,
  EEC_C10_MG04_ANCHOR,
  EEC_C10_MG05_ANCHOR,
  PAREJAS_READER_ANCHOR,
]);

/** The shape the resolver needs from a reader block. Structural on purpose:
 * it accepts the reader's projected block without importing its whole type. */
export interface AnchorCandidateBlock {
  /** The id the reader renders (`legacyBlockId ?? blockKey`) — the DOM anchor. */
  id: string;
  kind: string;
  content: string;
  /** Content Core identity. Absent on legacy blocks ⇒ UNRESOLVED. */
  blockKey?: string;
  blockVersionId?: string | null;
}

/**
 * The runtime reference, at BLOCK granularity.
 *
 * Deliberately no character offsets. The reader points at the paragraph — it
 * scrolls to it, focuses it and tints the whole block — so offsets would be a
 * field nobody reads, and one that cannot always be computed honestly: the
 * match runs on normalized text (collapsed whitespace, NFC, case-folded) while
 * offsets would have to describe the RAW string. When a line break sits inside
 * the sentence those two disagree, and a contract that says "characters 0 to
 * 57" while meaning "the whole paragraph" is worse than not saying it.
 */
export type GuideAnchorResolution =
  | {
      status: "RESOLVED";
      blockKey: string;
      blockVersionId: string;
      /** The DOM id to scroll to and focus. */
      renderBlockId: string;
    }
  | { status: "UNRESOLVED" | "AMBIGUOUS" };

const UNRESOLVED = { status: "UNRESOLVED" } as const;
const AMBIGUOUS = { status: "AMBIGUOUS" } as const;

/**
 * Compare the way a reader would, not the way a byte stream does: NFC so
 * composed and decomposed accents match, collapsed whitespace so a line break
 * in the source is the same word gap, and case-insensitive so a heading in
 * small caps still matches. Nothing here strips accents — «esta» and «está»
 * are different words and must stay different.
 */
function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

/**
 * Resolve the editorial anchor against the blocks this reader was served.
 *
 * 1. find the heading, exactly (normalized);
 * 2. bound the search at the NEXT heading — a sentence that also appears in a
 *    later section is not this anchor;
 * 3. find exactly one paragraph containing the approved sentence;
 * 4. require the Content Core identity — a legacy block cannot be anchored.
 */
export function resolveGuideAnchor(
  blocks: readonly AnchorCandidateBlock[],
  locator: GuideReaderAnchorLocator = GUIDE_READER_ANCHOR,
): GuideAnchorResolution {
  const heading = normalize(locator.sourceHeading);
  const headingIndex = blocks.findIndex(
    (b) => b.kind === "HEADING" && normalize(b.content) === heading,
  );
  if (headingIndex === -1) return UNRESOLVED;

  const nextHeading = blocks.findIndex(
    (b, i) => i > headingIndex && b.kind === "HEADING",
  );
  const section = blocks.slice(
    headingIndex + 1,
    nextHeading === -1 ? blocks.length : nextHeading,
  );

  const needle = normalize(locator.passageLastSentence);
  const matches = section.filter((b) => normalize(b.content).includes(needle));
  if (matches.length === 0) return UNRESOLVED;
  if (matches.length > locator.expectedMatchCount) return AMBIGUOUS;

  const block = matches[0] as AnchorCandidateBlock;
  // Without the stable identity we cannot say WHICH text this is; anchoring a
  // legacy block would tie the guide to an id that changes when it is edited.
  if (!block.blockKey || !block.blockVersionId) return UNRESOLVED;

  return {
    status: "RESOLVED",
    blockKey: block.blockKey,
    blockVersionId: block.blockVersionId,
    renderBlockId: block.id,
  };
}

/**
 * C.3R (#639) — `anchorAppliesTo` was deleted here, deliberately.
 *
 * It answered "does this guide belong to the chapter on screen?" by comparing
 * the anchor's `(bookSlug, chapterOrder)` with the reader's. That is placement
 * compared against placement: after an editorial reorder the guide followed the
 * NUMBER, so it appeared over whichever unit inherited it and vanished from the
 * unit it is actually about.
 *
 * The question now belongs to the server, which resolves the guide's editorial
 * target and the reader's unit to internal ids inside one snapshot and compares
 * THOSE — see `GuideReaderApplicabilityService`. Neither id crosses the wire;
 * what arrives is a closed word (`APPLIES` | `UNAVAILABLE`).
 *
 * It is deleted rather than deprecated because a positional fallback is exactly
 * what must not be reachable: a caller that could still ask would get a
 * confident wrong answer on a reordered book, and "we also have a server
 * verdict" is no defence if a browser can decide without it.
 *
 * What stays here is `resolveGuideAnchor`, which answers a different question:
 * WHERE in these blocks the approved passage is. That is about the text served,
 * not about which chapter it belongs to.
 */

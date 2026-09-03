import type { PracticeInteraction, PracticeKind } from "@psico/types";

/**
 * CC-7.4B.2 — CLOSED, server-side catalog of the Exercise rows the Content Core
 * backfill materializes for the FIRST Guide V1 unit.
 *
 * This is the executable authority for exactly two editorially-approved
 * definitions (PR #591, merge dc33f7f):
 *
 *   1. a CATALOG_PRACTICE target  → Exercise type REFLECTION;
 *   2. an ACTIVE_RECALL target    → Exercise type QUIZ, objective recall.
 *
 * Pure data + literal types, NO Nest, NO Prisma import — the backfill
 * (`exercise-ingestion.ts`) consumes it. Kept OUT of `@psico/types` on purpose:
 * `correctOptionKey` is an INTERNAL grading datum (CC-7.3) and must never reach
 * a shared package that the web/mobile clients import.
 *
 * Adding/altering a definition is an EDITORIAL act: it requires a new approval
 * doc + a new stable identity/version (never a silent rewrite — the ingestion
 * fails closed on drift). See docs/product/exercise-content-first-guide-unit.md.
 */

/** A recall option — a stable key plus its display label. Nothing else: the
 * strict recall parser (CC-7.3) rejects any option carrying extra fields. */
export interface ObjectiveRecallOption {
  readonly key: string;
  readonly label: string;
}

/**
 * The exact `Exercise.content` JSON of an objective recall QUIZ. The key SET is
 * frozen to what `parseRecallCatalogContent` accepts — `recallMode`,
 * `conceptKey`, `options`, `correctOptionKey` — and nothing else. The question
 * lives in `Exercise.title`, never here.
 */
export interface ObjectiveRecallContent {
  readonly recallMode: "objective";
  readonly conceptKey: string;
  readonly options: readonly ObjectiveRecallOption[];
  readonly correctOptionKey: string;
}

/** CATALOG_PRACTICE definition — resolved to exactly one editorial ChapterBlock
 * at ingestion time; its stored content is closed (`practiceKind` +
 * server-owned `sourceBlockKey`). */
export interface PracticeExerciseDefinition {
  readonly exerciseKey: string;
  readonly bookSlug: string;
  readonly chapterOrder: number;
  readonly order: number;
  readonly type: "REFLECTION";
  readonly title: string;
  /** The exact editorial heading whose ChapterBlock anchors the practice. */
  readonly sourceHeading: string;
  /**
   * `guided_reflection` is the original shape: copy plus a button. The five
   * EEC-C01 microguides declare a real interaction instead, and carry the
   * editorial content for it in `interaction`.
   */
  readonly practiceKind: "guided_reflection" | PracticeKind;
  /**
   * The interaction's own content, stored verbatim in `Exercise.content`.
   * Absent for `guided_reflection`, whose stored bytes must not change: the
   * ingestion fails closed on drift, and the pilot is already in production.
   */
  readonly interaction?: PracticeInteraction;
}

/** ACTIVE_RECALL definition — the editorially-approved objective item. */
export interface ObjectiveRecallDefinition {
  /** Equals the Guide `itemKey`; stored as the Exercise row id. */
  readonly exerciseKey: string;
  readonly bookSlug: string;
  readonly chapterOrder: number;
  readonly order: number;
  readonly type: "QUIZ";
  /** The question stem (Exercise.title). */
  readonly title: string;
  readonly content: ObjectiveRecallContent;
}

/** The pair of targets a single unit contributes to the first GuideDefinition. */
export interface UnitExerciseDefinitions {
  readonly practice: PracticeExerciseDefinition;
  readonly recall: ObjectiveRecallDefinition;
}

/**
 * Keyed by `Book.slug` → the unit-level exercise pairs. A book absent from this
 * map contributes ZERO exercise rows (the backfill simply skips it), so the
 * change is inert for every book except the ones enumerated here.
 */
export const EXERCISE_INGESTION_CATALOG: Readonly<
  Record<string, readonly UnitExerciseDefinitions[]>
> = {
  "emociones-en-construccion": [
    {
      practice: {
        exerciseKey: "eec-c1-practice-escucharte-por-dentro",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 1,
        type: "REFLECTION",
        title: "Una exploración emocional guiada: escucharte por dentro",
        sourceHeading:
          "🌿 Una exploración emocional guiada: escucharte por dentro",
        practiceKind: "guided_reflection",
      },
      recall: {
        exerciseKey: "eec-c1-recall-cuerpo-antes-que-mente",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 2,
        type: "QUIZ",
        title:
          "Según el capítulo 1, ¿cómo describe el libro la relación temporal entre la reacción del cuerpo y la comprensión consciente de una emoción?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-cuerpo-antes-que-mente",
          options: [
            {
              key: "opcion-cuerpo-primero",
              label:
                "El cuerpo puede reaccionar antes de que la mente alcance a identificar o nombrar lo que está sintiendo.",
            },
            {
              key: "opcion-mente-primero",
              label:
                "La mente identifica primero la emoción y solamente después el cuerpo comienza a reaccionar.",
            },
            {
              key: "opcion-simultanea",
              label:
                "El cuerpo y la mente siempre reaccionan de manera simultánea, consciente y perfectamente coordinada.",
            },
          ],
          correctOptionKey: "opcion-cuerpo-primero",
        },
      },
    },
    // ── EEC-C01 · the five-microguide route (author decision, 2026-09-03) ──
    //
    // Ten new rows: one CATALOG_PRACTICE and one ACTIVE_RECALL per microguide.
    // Every `sourceHeading` is verbatim from
    // `EEC_C01_v1.0_TEXT_LOCKED_2026-08-20`, and every recall answer is
    // derived from what that chapter actually says — the distractors are
    // plausible readings the chapter explicitly corrects, not nonsense.
    //
    // The V1 pilot's pair above is untouched and stays first: its Exercise rows
    // are referenced by sessions that already ran.
    {
      practice: {
        exerciseKey: "eec-c1-practice-revisar-un-lente",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 3,
        type: "REFLECTION",
        title: "Revisa una creencia: qué observa, qué supone, qué falta",
        sourceHeading: "Distintas lentes para comprender una emoción",
        practiceKind: "belief_lens",
        interaction: {
          kind: "belief_lens",
          belief: "«Si alguien se enoja, es porque no le importas.»",
          zones: [
            {
              key: "observo",
              label: "Qué observo",
              hint: "Solo lo que se vería en una grabación, sin interpretar.",
              options: [
                { key: "tono", label: "Levantó la voz." },
                { key: "gesto", label: "Frunció el ceño y cruzó los brazos." },
                { key: "salida", label: "Salió de la habitación." },
                { key: "silencio", label: "Se quedó en silencio un rato." },
              ],
            },
            {
              key: "supongo",
              label: "Qué estoy suponiendo",
              hint: "El salto entre lo que se ve y lo que se concluye.",
              options: [
                { key: "no-importa", label: "Que no le importo." },
                { key: "contra-mi", label: "Que el enojo es contra mí." },
                {
                  key: "significado",
                  label: "Que el enojo significa siempre lo mismo.",
                },
                {
                  key: "unica-causa",
                  label: "Que hay una sola causa posible.",
                },
              ],
            },
            {
              key: "falta",
              label: "Qué contexto falta",
              hint: "Lo que habría que saber antes de cerrar la lectura.",
              options: [
                { key: "antes", label: "Qué pasó antes de esa conversación." },
                {
                  key: "historia",
                  label: "Cómo suele expresar el enojo esa persona.",
                },
                {
                  key: "otros",
                  label: "Si hay algo más ocupándole la cabeza.",
                },
                { key: "dicho", label: "Qué diría si le preguntara." },
              ],
            },
          ],
          allowsFreeText: true,
        },
      },
      recall: {
        exerciseKey: "eec-c1-recall-teorias-como-lentes",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 4,
        type: "QUIZ",
        title:
          "Según el capítulo 1, ¿por qué comparar dos teorías de la emoción no consiste en buscar de inmediato una ganadora?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-teorias-como-lentes",
          options: [
            {
              key: "opcion-preguntas-distintas",
              label:
                "Porque cada una se organizó alrededor de preguntas, observaciones y métodos distintos, así que primero hay que entender qué problema intentaba resolver cada una.",
            },
            {
              key: "opcion-todas-igual-validas",
              label:
                "Porque todas las teorías son igualmente válidas y elegir entre ellas es solo cuestión de preferencia personal.",
            },
            {
              key: "opcion-falta-evidencia",
              label:
                "Porque todavía no existe evidencia suficiente sobre las emociones y por eso ninguna teoría puede compararse con otra.",
            },
          ],
          correctOptionKey: "opcion-preguntas-distintas",
        },
      },
    },
    {
      practice: {
        exerciseKey: "eec-c1-practice-una-sonrisa-varios-contextos",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 5,
        type: "REFLECTION",
        title: "Una sonrisa, varios contextos",
        sourceHeading: "Paul Ekman: el rostro como pista",
        practiceKind: "context_plausibility",
        interaction: {
          kind: "context_plausibility",
          situation:
            "Alguien sonríe al terminar una reunión de trabajo que se alargó.",
          observation:
            "Se ven las comisuras elevadas y un movimiento breve de los ojos.",
          availableContext: [
            "La reunión duró el doble de lo previsto.",
            "La persona miró el reloj dos veces.",
            "Al salir se despidió con la mano.",
          ],
          readings: [
            { key: "alivio", label: "Alivio porque la reunión terminó." },
            { key: "cortesia", label: "Cortesía al despedirse." },
            { key: "incomodidad", label: "Incomodidad que se disimula." },
            { key: "alegria", label: "Alegría por algo que se acordó ahí." },
            { key: "otra", label: "Algo que no aparece en esta lista." },
          ],
          buckets: [
            { key: "mas-plausible", label: "Más plausible" },
            { key: "posible", label: "Posible" },
            { key: "falta-info", label: "Falta información" },
          ],
          missingInformationPrompt:
            "¿Qué necesitarías saber para mover alguna lectura de «falta información» a «más plausible»?",
        },
      },
      recall: {
        exerciseKey: "eec-c1-recall-rostro-como-pista",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 6,
        type: "QUIZ",
        title:
          "Según el capítulo 1, ¿qué nos permite y qué no nos permite concluir una expresión facial?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-rostro-como-pista",
          options: [
            {
              key: "opcion-pista-sin-lectura",
              label:
                "Aporta información útil sobre lo que puede estar ocurriendo, pero no entrega por sí sola una lectura completa de la experiencia de esa persona.",
            },
            {
              key: "opcion-diccionario-universal",
              label:
                "Permite identificar la emoción exacta que siente la persona, porque las expresiones significan lo mismo en todas las culturas.",
            },
            {
              key: "opcion-no-informa-nada",
              label:
                "No aporta ninguna información fiable, porque el rostro se controla voluntariamente casi siempre.",
            },
          ],
          correctOptionKey: "opcion-pista-sin-lectura",
        },
      },
    },
    {
      practice: {
        exerciseKey: "eec-c1-practice-ordenar-alarma-y-relato",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 7,
        type: "REFLECTION",
        title: "Ordena la secuencia: señal, reacción, contexto, interpretación",
        sourceHeading: "Joseph LeDoux: la alarma antes del relato",
        practiceKind: "sequence_ordering",
        interaction: {
          kind: "sequence_ordering",
          scenario:
            "Lees tranquilamente en casa y una puerta se cierra de golpe.",
          cards: [
            { key: "senal", label: "Aparece una señal repentina." },
            {
              key: "respuesta",
              label:
                "El organismo inicia una respuesta protectora o de sobresalto.",
            },
            {
              key: "contexto",
              label: "Compruebas el contexto y descubres qué ocurrió.",
            },
            {
              key: "interpretacion",
              label:
                "Interpretas la situación y puedes nombrar la experiencia.",
            },
          ],
          solved: ["senal", "respuesta", "contexto", "interpretacion"],
          solvedLabel: "Prefiero ver el ejemplo resuelto",
          feedback:
            "La señal y la respuesta rápida pueden preceder a una comprensión más completa. El contexto ayuda a decidir si aquello fue peligro, sorpresa, alivio u otra experiencia.",
        },
      },
      recall: {
        exerciseKey: "eec-c1-recall-alarma-antes-del-relato",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 8,
        type: "QUIZ",
        title:
          "Según el capítulo 1, ¿qué diferencia hay entre una respuesta rápida de protección y sentir miedo?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-alarma-antes-del-relato",
          options: [
            {
              key: "opcion-reconocer-esto-me-asusta",
              label:
                "La respuesta de protección puede empezar antes de entender qué pasa; sentir miedo incluye además reconocer de alguna manera «esto me asusta».",
            },
            {
              key: "opcion-amigdala-produce-miedo",
              label:
                "No hay diferencia: la amígdala produce el miedo y la reacción del cuerpo es ese mismo miedo.",
            },
            {
              key: "opcion-miedo-primero",
              label:
                "Primero se siente el miedo de forma consciente y solo después el cuerpo organiza una respuesta de protección.",
            },
          ],
          correctOptionKey: "opcion-reconocer-esto-me-asusta",
        },
      },
    },
    {
      practice: {
        exerciseKey: "eec-c1-practice-siento-interpreto-impulso-elijo",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 9,
        type: "REFLECTION",
        title: "Siento, interpreto, tengo ganas de, elijo hacer",
        sourceHeading: "Daniel Goleman: aprender a leer el mundo emocional",
        practiceKind: "four_part_distinction",
        interaction: {
          kind: "four_part_distinction",
          scenario:
            "Escribes a alguien por la mañana y a la tarde todavía no responde.",
          fields: [
            {
              key: "siento",
              label: "Siento",
              options: [
                { key: "inquietud", label: "Algo de inquietud." },
                { key: "molestia", label: "Una molestia leve." },
                { key: "nada", label: "Casi nada; lo noto y sigo." },
              ],
            },
            {
              key: "interpreto",
              label: "Interpreto",
              options: [
                { key: "ocupado", label: "Que está ocupado." },
                { key: "molesto", label: "Que está molesto conmigo." },
                { key: "no-vio", label: "Que no vio el mensaje." },
              ],
            },
            {
              key: "impulso",
              label: "Tengo ganas de",
              options: [
                { key: "reescribir", label: "Escribir otra vez enseguida." },
                { key: "revisar", label: "Revisar si se conectó." },
                { key: "dejarlo", label: "Dejarlo pasar." },
              ],
            },
            {
              key: "elijo",
              label: "Elijo hacer",
              options: [
                { key: "esperar", label: "Esperar hasta mañana." },
                {
                  key: "preguntar",
                  label: "Preguntar directamente, sin reclamo.",
                },
                { key: "otra-cosa", label: "Ocuparme de otra cosa por ahora." },
              ],
            },
          ],
          allowsFreeText: true,
          disclaimer:
            "Lo que elijas aquí no es un diagnóstico ni una recomendación de conducta: es una forma de ver que sentir, interpretar, querer y elegir son cosas distintas.",
        },
      },
      recall: {
        exerciseKey: "eec-c1-recall-emocion-informa-no-manda",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 10,
        type: "QUIZ",
        title:
          "Según el capítulo 1, ¿qué relación hay entre una emoción y la conducta que sigue?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-emocion-informa-no-manda",
          options: [
            {
              key: "opcion-informa-no-dicta",
              label:
                "La emoción aporta información y señala qué es relevante, pero no dicta por sí sola la decisión: sentir, interpretar, tener un impulso y elegir son procesos distintos.",
            },
            {
              key: "opcion-emocion-determina",
              label:
                "La emoción determina la conducta: si la señal es intensa, la acción que sigue es la única posible.",
            },
            {
              key: "opcion-ignorar-emocion",
              label:
                "Para decidir bien conviene dejar la emoción fuera, porque interfiere con el razonamiento.",
            },
          ],
          correctOptionKey: "opcion-informa-no-dicta",
        },
      },
    },
    {
      practice: {
        exerciseKey: "eec-c1-practice-senales-y-contextos",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 11,
        type: "REFLECTION",
        title: "Las mismas señales, dos contextos",
        sourceHeading: "Lisa Feldman Barrett: la emoción como construcción",
        practiceKind: "signal_context_compare",
        interaction: {
          kind: "signal_context_compare",
          signals: ["Corazón acelerado.", "Estómago revuelto.", "Manos frías."],
          contexts: [
            {
              key: "entrevista",
              label: "Antes de una entrevista",
              description:
                "Esperas en una sala; en unos minutos te van a evaluar.",
            },
            {
              key: "primera-cita",
              label: "Antes de una primera cita",
              description:
                "Esperas en un café; en unos minutos verás a alguien que te gusta.",
            },
          ],
          factors: [
            { key: "situacion", label: "La situación en la que ocurre." },
            {
              key: "aprendizaje",
              label: "Lo que aprendiste a esperar de ella.",
            },
            { key: "expectativa", label: "Lo que anticipas que va a pasar." },
            { key: "recuerdos", label: "Los recuerdos que trae a mano." },
            { key: "nueva-info", label: "Información nueva que aparece." },
          ],
          prompt:
            "Las señales del cuerpo se parecen. ¿Qué información hace que signifiquen cosas distintas?",
        },
      },
      recall: {
        exerciseKey: "eec-c1-recall-construida-no-significa-falsa",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 12,
        type: "QUIZ",
        title:
          "Según el capítulo 1, ¿qué quiere decir que una emoción sea «construida»?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-construida-no-significa-falsa",
          options: [
            {
              key: "opcion-real-y-no-elegida",
              label:
                "Que se forma con señales reales del cuerpo, memoria, conceptos aprendidos y contexto — sigue siendo real y no se elige a voluntad.",
            },
            {
              key: "opcion-inventada",
              label:
                "Que en realidad es imaginaria: si la construimos nosotros, no corresponde a nada que esté ocurriendo de verdad.",
            },
            {
              key: "opcion-controlable",
              label:
                "Que podemos decidir conscientemente qué emoción sentir en cada momento si nos lo proponemos.",
            },
          ],
          correctOptionKey: "opcion-real-y-no-elegida",
        },
      },
    },
  ],
  // Demo Guide for Parejas que perduran (David Jaramillo, used with the
  // author's authorization). The book's chapter 1 is PLATFORM order 2 — the
  // ingest manifest gave order 1 to the preface and introduction, so an entry
  // keyed by 1 would look for the practice heading inside the preface and fail
  // closed. See docs/product/parejas-guide-v1-first-definition.md.
  "parejas-que-perduran": [
    {
      practice: {
        exerciseKey: "pqp-c1-practice-diez-minutos-de-contacto",
        bookSlug: "parejas-que-perduran",
        chapterOrder: 2,
        order: 1,
        type: "REFLECTION",
        // The author's own name for the exercise, not one we coined.
        title: "Ejercicio 3: El Mapa de las Miradas",
        sourceHeading: "Ejercicio 3: El Mapa de las Miradas",
        practiceKind: "guided_reflection",
      },
      recall: {
        exerciseKey: "pqp-c1-recall-contacto-sostenido",
        bookSlug: "parejas-que-perduran",
        chapterOrder: 2,
        order: 2,
        type: "QUIZ",
        title:
          "Según el capítulo, ¿qué se les pidió hacer a las parejas durante los diez minutos del ejercicio de contacto?",
        content: {
          recallMode: "objective",
          conceptKey: "pqp-c1-contacto-sostenido",
          options: [
            {
              key: "pqp-opcion-manos-y-mirada",
              label:
                "Sentarse frente a frente, tomarse de las manos y sostener la mirada en silencio, sin disculpas y sin buscar soluciones.",
            },
            {
              key: "pqp-opcion-conversar-acuerdos",
              label:
                "Conversar sobre el conflicto hasta llegar a un acuerdo explícito antes de que terminara el tiempo.",
            },
            {
              key: "pqp-opcion-turnos-disculpas",
              label:
                "Turnarse para pedir disculpas por lo ocurrido y proponer cada uno una solución concreta.",
            },
          ],
          correctOptionKey: "pqp-opcion-manos-y-mirada",
        },
      },
    },
  ],
};

/**
 * Every editorial heading the catalog's practices anchor to, for one book.
 *
 * Derived from the catalog rather than written next to it, so a fixture that
 * seeds "the headings this book needs" cannot fall behind when a pair is
 * added — which is exactly how a suite ends up reporting SOURCE_MISSING for
 * content that is perfectly fine in production.
 */
export function practiceSourceHeadings(bookSlug: string): readonly string[] {
  return (EXERCISE_INGESTION_CATALOG[bookSlug] ?? []).map(
    (p) => p.practice.sourceHeading,
  );
}

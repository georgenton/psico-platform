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

/**
 * What a person is told after answering, per outcome.
 *
 * Editorial copy, and server-owned: the browser never receives both branches,
 * only the one that matches the outcome the ledger recorded.
 *
 * It lives on the DEFINITION and not in `Exercise.content` on purpose. The
 * ingestion compares stored bytes and throws `EXERCISE_INGEST_DRIFT_DETECTED`
 * on any difference — it never updates — so adding a field to the stored shape
 * would make the next `apply-targets` refuse every recall already in
 * production. The copy is catalog data either way; this is the half of the
 * catalog that does not need a row to be true.
 */
export interface ObjectiveRecallFeedback {
  /** Shown when the ledger graded the attempt CORRECT. */
  readonly correct: string;
  /** Shown when it graded INCORRECT. The public word for that is REVIEW. */
  readonly review: string;
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
  /** Required. `assertBookExerciseCatalogValid` refuses a recall without it. */
  readonly feedback: ObjectiveRecallFeedback;
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
        feedback: {
          correct:
            "Exacto. El cuerpo puede reaccionar antes de que alcances a identificar la emoción; reconocerla y nombrarla llega después.",
          review:
            "Revisa la idea central: el capítulo describe que la reacción corporal puede adelantarse a la identificación consciente, no que ocurran siempre a la vez.",
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
        feedback: {
          correct:
            "Exacto. Comparar dos teorías empieza por entender a qué pregunta responde cada una; eso no las vuelve equivalentes, las vuelve comparables.",
          review:
            "Revisa la diferencia central: comparar teorías no consiste en elegir una ganadora de entrada, sino en ver qué problema intentaba resolver cada una.",
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
        feedback: {
          correct:
            "Exacto. Una expresión aporta información valiosa, y su significado sigue dependiendo de la persona, la situación y lo ocurrido antes.",
          review:
            "Revisa la diferencia central: un rostro ofrece pistas, no una lectura completa de lo que alguien está sintiendo.",
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
        feedback: {
          correct:
            "Exacto. Una defensa puede comenzar antes de comprender lo ocurrido, pero el sentimiento consciente integra más información que esa primera respuesta.",
          review:
            "Revisa la diferencia central: reaccionar ante una señal no demuestra todavía qué emoción consciente existe ni que haya un peligro real.",
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
        feedback: {
          correct:
            "Exacto. La emoción informa y señala qué es relevante; entre ese impulso y la conducta queda un espacio donde se decide.",
          review:
            "Revisa la diferencia central: sentir algo orienta la decisión, pero no la dicta ni garantiza la conducta que sigue.",
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
        feedback: {
          correct:
            "Exacto. Que una emoción se construya con señales, contexto, memoria y conceptos no la vuelve menos real ni elegible a voluntad.",
          review:
            "Revisa la diferencia central: «construida» no es lo contrario de «real»; describe cómo se forma la experiencia, no que sea inventada.",
        },
      },
    },
    // ── EEC-C02 · the five-microguide route (author decision, 2026-09-04) ──
    //
    // Ten more rows for chapter 2. Every `sourceHeading` is verbatim from
    // `EEC_C02_v1.0_TEXT_LOCKED_2026-08-21`, and every recall answer is what
    // that chapter says — the distractors are the readings it explicitly
    // corrects (uniformity from one level, culture as destiny, expression as
    // subtitle, the word as the experience, the ritual as a prescription).
    //
    // The interactions reuse the five kinds C01 shipped. `context_plausibility`
    // appears twice on purpose: sorting claims into levels and sorting readings
    // of a gesture into how well they fit are the same interaction with
    // different buckets, and inventing a sixth kind for that would add a
    // renderer nobody needs.
    {
      practice: {
        exerciseKey: "eec-c2-practice-seis-cajones",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 13,
        type: "REFLECTION",
        title: "Seis cajones: de qué nivel habla cada afirmación",
        sourceHeading:
          "¿Qué significa realmente que una emoción sea universal?",
        practiceKind: "context_plausibility",
        interaction: {
          kind: "context_plausibility",
          situation:
            "Alguien afirma que «el miedo es universal». Antes de responder sí o no, conviene preguntar de qué nivel está hablando.",
          observation:
            "El capítulo separa seis preguntas distintas que suelen discutirse como si fueran una sola.",
          availableContext: [
            "Compartir una capacidad corporal no obliga a compartir una categoría.",
            "Reconocer una expresión en una tarea de laboratorio no equivale a interpretarla igual en la vida diaria.",
            "Una regla social sobre cuándo mostrar algo no dice nada sobre si se siente.",
          ],
          readings: [
            {
              key: "activacion",
              label:
                "«Ante un peligro, el cuerpo de cualquier persona puede activarse.»",
            },
            {
              key: "palabra",
              label:
                "«Una lengua puede reunir bajo una palabra lo que otra separa en dos.»",
            },
            {
              key: "gesto",
              label:
                "«Los movimientos del rostro se parecen bastante entre poblaciones distintas.»",
            },
            {
              key: "eleccion",
              label:
                "«En una tarea con opciones dadas, la mayoría elige la misma etiqueta.»",
            },
            {
              key: "velorio",
              label:
                "«En este grupo se espera contener el llanto delante de visitas.»",
            },
          ],
          buckets: [
            { key: "capacidad", label: "Capacidad corporal" },
            { key: "acontecimiento", label: "Acontecimiento relevante" },
            { key: "categoria", label: "Categoría" },
            { key: "expresion", label: "Expresión" },
            { key: "reconocimiento", label: "Reconocimiento" },
            { key: "regla", label: "Regla social" },
          ],
          missingInformationPrompt:
            "Mira lo que clasificaste: ¿qué conclusión permite cada nivel, y cuál NO permite? Encontrar una semejanza en uno no demuestra uniformidad en los demás.",
        },
      },
      recall: {
        exerciseKey: "eec-c2-recall-universal-no-significa-uniforme",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 14,
        type: "QUIZ",
        title:
          "Según el capítulo 2, si un estudio encuentra que cierta expresión facial se reconoce de forma parecida en varios países, ¿qué queda demostrado?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-universal-no-significa-uniforme",
          options: [
            {
              key: "opcion-solo-ese-nivel",
              label:
                "Solo una semejanza en ese nivel: no demuestra que las categorías, el significado, la interpretación ni las reglas sociales sean iguales.",
            },
            {
              key: "opcion-todo-uniforme",
              label:
                "Que esa emoción se vive, se nombra y se expresa de la misma manera en todas esas culturas.",
            },
            {
              key: "opcion-nada",
              label:
                "Que las expresiones faciales no aportan ninguna información sobre lo que siente una persona.",
            },
          ],
          correctOptionKey: "opcion-solo-ese-nivel",
        },
        feedback: {
          correct:
            "Exacto. «Universal» nombra varios niveles distintos; una semejanza en uno de ellos no se extiende automáticamente a los otros.",
          review:
            "Revisa la idea central: el capítulo separa capacidades, acontecimientos, categorías, expresión, reconocimiento y reglas sociales. Encontrar una regularidad en un nivel no demuestra uniformidad en los demás.",
        },
      },
    },
    {
      practice: {
        exerciseKey: "eec-c2-practice-de-etiqueta-a-contexto",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 15,
        type: "REFLECTION",
        title: "De etiqueta a contexto: qué afirma, qué supone, qué falta",
        sourceHeading: "La cultura como gramática emocional",
        practiceKind: "belief_lens",
        interaction: {
          kind: "belief_lens",
          belief: "«En esta familia nadie habla de lo que siente.»",
          zones: [
            {
              key: "observo",
              label: "Qué afirma la frase",
              hint: "Lo dicho, sin ampliarlo: a quiénes incluye y con qué alcance.",
              options: [
                { key: "todos", label: "Que aplica a todas las personas." },
                {
                  key: "siempre",
                  label: "Que ocurre siempre, en cualquier situación.",
                },
                { key: "tendencia", label: "Que hay una tendencia aprendida." },
                {
                  key: "algunas",
                  label: "Que algunas conversaciones son difíciles.",
                },
              ],
            },
            {
              key: "supongo",
              label: "Qué está suponiendo",
              hint: "El salto de una costumbre observada a un rasgo fijo.",
              options: [
                { key: "destino", label: "Que la costumbre no puede cambiar." },
                { key: "no-siente", label: "Que quien no habla no siente." },
                {
                  key: "uniforme",
                  label: "Que dentro del grupo nadie difiere.",
                },
                {
                  key: "causa-unica",
                  label: "Que hay una sola razón para ese silencio.",
                },
              ],
            },
            {
              key: "falta",
              label: "Qué falta: contexto y persona concreta",
              hint: "Lo que habría que precisar antes de convertirla en regla.",
              options: [
                { key: "quien", label: "De qué persona concreta hablamos." },
                {
                  key: "cuando",
                  label: "En qué situaciones sí ocurre y en cuáles no.",
                },
                {
                  key: "con-quien",
                  label: "Con quién sí se habla de otras cosas.",
                },
                { key: "aprendido", label: "Qué se aprendió y de quién." },
              ],
            },
          ],
          allowsFreeText: true,
        },
      },
      recall: {
        exerciseKey: "eec-c2-recall-cultura-gramatica-no-destino",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 16,
        type: "QUIZ",
        title:
          "Según el capítulo 2, ¿qué quiere decir que la cultura emocional funcione como una gramática?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-cultura-gramatica-no-destino",
          options: [
            {
              key: "opcion-influye-no-determina",
              label:
                "Que ofrece estructuras que vuelven ciertas respuestas familiares y otras extrañas, sin decidir mecánicamente lo que cada persona siente.",
            },
            {
              key: "opcion-determina",
              label:
                "Que fija de antemano qué siente cada integrante del grupo y vuelve homogénea a la sociedad.",
            },
            {
              key: "opcion-irrelevante",
              label:
                "Que la cultura solo afecta modales y costumbres visibles, sin relación con la vida emocional.",
            },
          ],
          correctOptionKey: "opcion-influye-no-determina",
        },
        feedback: {
          correct:
            "Exacto. Una gramática ofrece estructuras y hace unas combinaciones más familiares que otras; no dicta cada frase, y la cultura emocional tampoco dicta cada experiencia.",
          review:
            "Revisa la distinción central del capítulo: influencia no es determinación. La cultura enseña qué suele notarse, decirse y esperarse — y aun así las personas difieren dentro de un mismo grupo.",
        },
      },
    },
    {
      practice: {
        exerciseKey: "eec-c2-practice-del-gesto-a-la-pregunta",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 17,
        type: "REFLECTION",
        title: "Del gesto a la pregunta",
        sourceHeading: "El rostro no habla solo",
        practiceKind: "context_plausibility",
        interaction: {
          kind: "context_plausibility",
          situation:
            "Durante una conversación sobre una cuenta pendiente, una persona sube el volumen de la voz y la otra deja de responder.",
          observation:
            "Se ve un cambio de volumen en una y un silencio sostenido en la otra. Nada más es visible.",
          availableContext: [
            "En una de las dos casas, hablar con intensidad era habitual y no anunciaba ruptura.",
            "En la otra, el silencio era la forma aprendida de evitar el conflicto.",
            "Ninguna de las dos ha dicho todavía qué está sintiendo.",
          ],
          readings: [
            {
              key: "indiferencia",
              label: "«El silencio significa que no le importa.»",
            },
            {
              key: "amenaza",
              label: "«El volumen significa que hay una amenaza.»",
            },
            {
              key: "aprendido",
              label:
                "«Cada quien está usando la forma que aprendió para un momento tenso.»",
            },
          ],
          buckets: [
            { key: "encaja", label: "Encaja con lo que se ve" },
            { key: "falta-contexto", label: "Podría ser: falta contexto" },
            { key: "va-mas-alla", label: "Va más allá de la evidencia" },
          ],
          missingInformationPrompt:
            "Elige la pregunta que harías para comprobar en vez de concluir. Por ejemplo: «Cuando te quedas en silencio, ¿qué está pasando por ti?». Una hipótesis se comprueba; un veredicto se impone.",
        },
      },
      recall: {
        exerciseKey: "eec-c2-recall-gesto-necesita-contexto",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 18,
        type: "QUIZ",
        title:
          "Según el capítulo 2, si alguien suaviza su rostro por una regla de expresión aprendida, ¿qué se puede concluir sobre lo que siente?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-gesto-necesita-contexto",
          options: [
            {
              key: "opcion-regula-no-niega",
              label:
                "Que la regla puede modificar lo que se muestra; no demuestra que la experiencia esté ausente, ni cuál es.",
            },
            {
              key: "opcion-no-siente",
              label:
                "Que no está sintiendo nada: si lo sintiera, se le notaría en la cara.",
            },
            {
              key: "opcion-oculta-tristeza",
              label:
                "Que detrás de esa expresión suave hay tristeza que la persona está reprimiendo.",
            },
          ],
          correctOptionKey: "opcion-regula-no-niega",
        },
        feedback: {
          correct:
            "Exacto. Regular la expresión no equivale a no sentir, y tampoco autoriza a suponer qué se esconde detrás: la expresión es una pista que se comprueba preguntando.",
          review:
            "Revisa el punto del capítulo: no hay que confundir la regulación de la expresión con la inexistencia de la experiencia — ni asumir que toda sonrisa esconde tristeza.",
        },
      },
    },
    {
      practice: {
        exerciseKey: "eec-c2-practice-la-palabra-no-basta",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 19,
        type: "REFLECTION",
        title: "La palabra no basta: la misma palabra, dos escenas",
        sourceHeading: "Las palabras dan contorno a la experiencia",
        practiceKind: "signal_context_compare",
        interaction: {
          kind: "signal_context_compare",
          signals: [
            "«Me da pena preguntar.»",
            "«Le tengo coraje.»",
            "«Estoy sentido.»",
            "«Estoy nervioso.»",
          ],
          contexts: [
            {
              key: "reunion",
              label: "En una reunión con desconocidos",
              description:
                "La persona lo dice antes de levantar la mano para hablar.",
            },
            {
              key: "familia",
              label: "En una conversación de familia",
              description:
                "La persona lo dice después de un desacuerdo con alguien cercano.",
            },
          ],
          factors: [
            { key: "region", label: "La región donde se aprendió la palabra" },
            { key: "quien", label: "Con quién se está hablando" },
            { key: "antes", label: "Qué ocurrió justo antes" },
            { key: "cuerpo", label: "Qué está pasando en el cuerpo" },
            { key: "lengua", label: "En qué lengua se está diciendo" },
          ],
          prompt:
            "Elige qué información adicional ayudaría a interpretar cada frase en cada escena. La palabra da contorno; el contexto termina de dibujarlo.",
        },
      },
      recall: {
        exerciseKey: "eec-c2-recall-palabras-dan-contorno",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 20,
        type: "QUIZ",
        title:
          "Según el capítulo 2, ¿qué papel cumplen las palabras y los conceptos emocionales?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-palabras-dan-contorno",
          options: [
            {
              key: "opcion-ayudan-y-dependen",
              label:
                "Los conceptos y palabras pueden ayudarnos a diferenciar y comunicar experiencias, pero su significado también depende del contexto.",
            },
            {
              key: "opcion-sin-palabra-no-hay",
              label:
                "Sin una palabra precisa no puede existir la experiencia: el lenguaje crea toda emoción.",
            },
            {
              key: "opcion-significado-universal",
              label:
                "Cada palabra emocional tiene un significado universal, igual en cualquier región y en cualquier familia.",
            },
          ],
          correctOptionKey: "opcion-ayudan-y-dependen",
        },
        feedback: {
          correct:
            "Exacto. Las palabras funcionan como líneas en un mapa: ayudan a diferenciar y orientarse, y aun así lo que significan depende de dónde y con quién se digan.",
          review:
            "Revisa la formulación del capítulo: no hace falta una palabra exacta para que exista la experiencia, y tener la palabra no fija su significado — «pena» o «coraje» cambian de territorio según la región y la escena.",
        },
      },
    },
    {
      practice: {
        exerciseKey: "eec-c2-practice-acompanar-sin-imponer",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 21,
        type: "REFLECTION",
        title: "Acompañar sin imponer",
        sourceHeading: "Rituales: cuando sentir necesita un marco compartido",
        practiceKind: "four_part_distinction",
        interaction: {
          kind: "four_part_distinction",
          scenario:
            "Una compañera de trabajo vuelve después de una ausencia por una pérdida familiar. Saluda, se sienta y sigue con lo suyo. No sabes qué decir.",
          fields: [
            {
              key: "siento",
              label: "Qué observo en la escena",
              options: [
                { key: "saludo", label: "Saludó y siguió con su trabajo." },
                { key: "breve", label: "Respondió con frases cortas." },
                { key: "sin-tema", label: "No mencionó lo que pasó." },
              ],
            },
            {
              key: "interpreto",
              label: "Qué estoy suponiendo que necesita",
              options: [
                { key: "hablar", label: "Que necesita hablar de ello." },
                { key: "distraerse", label: "Que prefiere no tocar el tema." },
                { key: "no-se", label: "Que todavía no lo sé." },
              ],
            },
            {
              key: "impulso",
              label: "Lo que me sale decir",
              options: [
                { key: "deberias", label: "«Deberías desahogarte.»" },
                { key: "tienes-que", label: "«Tienes que ir a la misa.»" },
                { key: "fuerte", label: "«Hay que ser fuerte.»" },
              ],
            },
            {
              key: "elijo",
              label: "Lo que puedo ofrecer o preguntar",
              options: [
                {
                  key: "que-seria-util",
                  label: "«¿Qué sería útil para ti en este momento?»",
                },
                {
                  key: "disponible",
                  label: "«Estoy por aquí si quieres hablar, y también si no.»",
                },
                {
                  key: "practico",
                  label: "«¿Te ayudo con algo concreto esta semana?»",
                },
              ],
            },
          ],
          allowsFreeText: true,
          disclaimer:
            "Esto no es una viñeta clínica ni una guía sobre tu propia pérdida: es una escena hipotética para practicar. Puedes salir cuando quieras y nada de lo que escribas sale de tu dispositivo.",
        },
      },
      recall: {
        exerciseKey: "eec-c2-recall-rituales-dan-marco-no-guion",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 2,
        order: 22,
        type: "QUIZ",
        title:
          "Según el capítulo 2, ¿qué se puede concluir del hecho de que alguien participe o no participe en un ritual de duelo?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-rituales-dan-marco-no-guion",
          options: [
            {
              key: "opcion-no-demuestra",
              label:
                "Por sí solo no demuestra amor, negación, intensidad del duelo ni recuperación: el ritual ofrece marco y testigos, no un guion de cómo sentir.",
            },
            {
              key: "opcion-participar-sana",
              label:
                "Que participar garantiza alivio y que no participar indica que la persona está negando la pérdida.",
            },
            {
              key: "opcion-ritual-irrelevante",
              label:
                "Que los rituales no cumplen ninguna función y son una formalidad social sin efecto.",
            },
          ],
          correctOptionKey: "opcion-no-demuestra",
        },
        feedback: {
          correct:
            "Exacto. Un ritual puede organizar tiempo, acciones y testigos; su efecto depende del sentido que tenga para quien lo vive, y participar o no no mide el duelo.",
          review:
            "Revisa lo que dice el capítulo: participar no garantiza alivio y no participar tampoco demuestra negación. Llorar mucho no demuestra amar más; retomar actividades no demuestra olvido.",
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
        feedback: {
          correct:
            "Exacto. El contacto sostenido se describe como una práctica breve y repetida, no como un gesto extraordinario.",
          review:
            "Revisa la idea central del capítulo: lo que sostiene el vínculo es la repetición de momentos breves de contacto, no su intensidad.",
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

import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * PQP-C06 — the three practice/recall pairs behind the chapter's guided route.
 *
 * `correctOptionKey` lives ONLY here; `order` is globally unique inside the
 * book (pilot 1–2, C01 3–10, C02 11–20, C03 21–28, C04 29–36, C05 37–44, so
 * this runs 45–50); and every `sourceHeading` is verbatim from the printed
 * edition, measured against published revision #10 as present exactly once.
 *
 * Three pairs, not five: the chapter is short and carries three ideas that can
 * each be practised on their own. See `scripts/pqp/chapters/c06.mjs` for why
 * flexibility and communicating-in-the-storm stay in reading.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * `GROWTH_IS_POSSIBLE_NEVER_OBLIGATORY`. A chapter titled «De crisis a
 * oportunidad» invites a derived layer to promise that hardship pays off. It
 * does not, and this file says so where a reader will actually meet it.
 *
 * `que-dejo-esta-crisis` classifies four invented OUTCOMES — deliberately
 * including one where nothing improved and one that is still open — and its
 * prompt states that none of them is a verdict on anyone. The recall's two
 * distractors are the exact claims this route refuses to make: that every
 * crisis strengthens a couple, and that crises happen in order to teach
 * something. Both are marked wrong on purpose.
 *
 * No item here asks anyone to describe a crisis of their own, and the author's
 * personal account is referenced as a section to read, never retold.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 6 is unit 7; unit 1 is the front matter. */
const CHAPTER = 7;

export const EXERCISE_CATALOG_PQP_C06: readonly UnitExerciseDefinitions[] = [
  // ── MG01 · Las señales tempranas ─────────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c6-practice-una-senal-en-dos-momentos",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 45,
      type: "REFLECTION",
      title: "Una señal en dos momentos",
      sourceHeading: "Detectar las señales de una crisis",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Una pareja inventada para este ejercicio habla menos que antes.",
          "Hace semanas que no hacen planes juntos.",
          "Los gestos de afecto se han vuelto escasos.",
        ],
        contexts: [
          {
            key: "temporada-dificil",
            label: "Una temporada concreta y acotada",
            description:
              "Uno de los dos cierra un proyecto que le ocupa todo; los dos saben que termina en tres semanas.",
          },
          {
            key: "sin-fecha",
            label: "Meses sin que ninguno lo mencione",
            description:
              "Empezó sin que nadie sepa cuándo, y ninguno de los dos lo ha nombrado en voz alta.",
          },
        ],
        factors: [
          {
            key: "duracion",
            label: "Cuánto lleva ocurriendo.",
          },
          {
            key: "nombrado",
            label: "Si alguno de los dos lo ha dicho en voz alta.",
          },
          {
            key: "causa-conocida",
            label: "Si hay algo que lo explique y que ambos conozcan.",
          },
          {
            key: "hay-fecha",
            label: "Si se espera que cambie en algún momento.",
          },
        ],
        prompt:
          "Las señales son las mismas en los dos casos. ¿Qué haría falta saber para interpretarlas? Este ejercicio no evalúa relaciones ni predice nada: solo muestra que una señal, sola, no dice lo suficiente.",
      },
    },
    recall: {
      exerciseKey: "pqp-c6-recall-senales-de-crisis",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 46,
      type: "QUIZ",
      title: "Según el capítulo, ¿cómo se manifiestan muchas crisis de pareja?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c6-senales-de-crisis",
        options: [
          {
            key: "pqp-c6-opcion-instalan-despacio",
            label:
              "Se instalan despacio, con señales discretas que se normalizan antes de que nadie las nombre.",
          },
          {
            key: "pqp-c6-opcion-siempre-estallan",
            label:
              "Estallan siempre en un episodio claro que ambos identifican en el momento.",
          },
          {
            key: "pqp-c6-opcion-solo-graves",
            label:
              "Solo aparecen cuando ocurre algo grave, como una pérdida o una infidelidad.",
          },
        ],
        correctOptionKey: "pqp-c6-opcion-instalan-despacio",
      },
      feedback: {
        correct:
          "Eso describe el capítulo: señales pequeñas que se sostienen y se normalizan. Reconocerlas en una lista no equivale a tener una crisis.",
        review:
          "Vuelve a la sección de señales. No todas las crisis estallan ni esperan a que ocurra algo grave: muchas se instalan sin ruido, y eso es justo lo que las vuelve difíciles de ver.",
      },
    },
  },

  // ── MG02 · Pedir ayuda no es debilidad ───────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c6-practice-de-la-idea-a-la-consulta",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 47,
      type: "REFLECTION",
      title: "De la idea a la consulta",
      sourceHeading: "Buscar ayuda no es debilidad, es sabiduría",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio, Iris y Tomás, lleva meses dando vueltas al mismo tema. Ordena los pasos desde que a uno se le ocurre pedir ayuda hasta que ocurre.",
        cards: [
          {
            key: "se-le-ocurre",
            label:
              "A uno se le pasa por la cabeza que quizá les vendría bien hablar con alguien.",
          },
          {
            key: "lo-dice",
            label:
              "Lo dice en voz alta, sin plantearlo como que algo está roto.",
          },
          {
            key: "lo-hablan",
            label:
              "Lo hablan: qué esperarían de eso y qué le preocupa a cada uno.",
          },
          {
            key: "consulta",
            label:
              "Buscan a alguien y piden una primera cita, sin decidir de antemano cuántas serán.",
          },
        ],
        solved: ["se-le-ocurre", "lo-dice", "lo-hablan", "consulta"],
        solvedLabel: "Un orden posible",
        feedback:
          "El paso que más suele faltar es el segundo: decirlo. Y no hace falta que ambos lleguen igual de convencidos para pedir una primera cita.",
      },
    },
    recall: {
      exerciseKey: "pqp-c6-recall-pedir-ayuda-no-es-debilidad",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 48,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué lugar tiene la ayuda externa en una crisis de pareja?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c6-pedir-ayuda-no-es-debilidad",
        options: [
          {
            key: "pqp-c6-opcion-hay-crisis-que-la-necesitan",
            label:
              "Hay crisis que necesitan intervención externa, y buscarla es una decisión sensata y no una derrota.",
          },
          {
            key: "pqp-c6-opcion-ultimo-recurso",
            label:
              "Conviene reservarla como último recurso, cuando ya se han agotado los intentos entre los dos.",
          },
          {
            key: "pqp-c6-opcion-solo-si-ambos",
            label:
              "Solo tiene sentido si ambos están igual de convencidos desde el principio.",
          },
        ],
        correctOptionKey: "pqp-c6-opcion-hay-crisis-que-la-necesitan",
      },
      feedback: {
        correct:
          "Eso sostiene el capítulo. Y vale la pena recordar que pedir ayuda es una opción disponible ahora, no solo cuando ya no queda nada.",
        review:
          "Relee esa sección. El capítulo no la sitúa como último recurso ni la condiciona a que ambos lleguen igual de convencidos: la presenta como una decisión sensata.",
      },
    },
  },

  // ── MG03 · A veces se aprende, y a veces se pierde ───────────────────────
  {
    practice: {
      exerciseKey: "pqp-c6-practice-que-dejo-esta-crisis",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 49,
      type: "REFLECTION",
      title: "¿Qué dejó esta crisis?",
      sourceHeading: "La crisis como umbral de crecimiento",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cuatro desenlaces inventados para este ejercicio, de cuatro parejas distintas que atravesaron algo difícil.",
        observation:
          "En las cuatro pasó un tiempo y la situación cambió de alguna manera.",
        availableContext: [
          "Lo que una escena muestra es lo que se puede leer en ella.",
          "Lo que dejó una crisis solo lo saben quienes la vivieron, y a veces ni ellos todavía.",
        ],
        readings: [
          {
            key: "hablan-distinto",
            label:
              "Un año después dicen que hoy se hablan de un modo que antes no sabían.",
          },
          {
            key: "sigue-abierto",
            label:
              "Siguen dándole vueltas y ninguno sabría decir todavía en qué quedó.",
          },
          {
            key: "se-separaron",
            label:
              "Terminaron separándose y cada uno cuenta la historia de otra manera.",
          },
          {
            key: "nada-mejoro",
            label:
              "Siguen juntos y dicen que nada mejoró: aquello simplemente dejó de doler tanto.",
          },
        ],
        buckets: [
          { key: "muestra", label: "La escena lo muestra" },
          { key: "supondriamos", label: "Lo estaríamos suponiendo" },
        ],
        missingInformationPrompt:
          "Ninguno de estos desenlaces es un modelo ni un pronóstico, y ninguno dice nada sobre lo que valen las personas que lo vivieron. Una crisis puede dejar aprendizaje, puede dejar pérdida y puede seguir abierta mucho tiempo — las tres cosas ocurren.",
      },
    },
    recall: {
      exerciseKey: "pqp-c6-recall-crecimiento-posible-no-obligatorio",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 50,
      type: "QUIZ",
      title:
        "Según la idea trabajada en esta guía, ¿qué se puede decir del aprendizaje después de una crisis?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c6-crecimiento-posible-no-obligatorio",
        options: [
          {
            key: "pqp-c6-opcion-puede-ocurrir",
            label:
              "Que puede ocurrir cuando hay apertura y trabajo, pero no está garantizado ni es obligatorio.",
          },
          {
            key: "pqp-c6-opcion-toda-crisis-fortalece",
            label:
              "Que toda crisis fortalece a la pareja que la atraviesa unida.",
          },
          {
            key: "pqp-c6-opcion-sucede-por-algo",
            label:
              "Que las crisis ocurren para enseñar algo que la pareja necesitaba aprender.",
          },
        ],
        correctOptionKey: "pqp-c6-opcion-puede-ocurrir",
      },
      feedback: {
        correct:
          "Eso es. El capítulo describe una posibilidad real, y no haberla encontrado no es una tarea pendiente de nadie.",
        review:
          "El capítulo describe lo que una crisis PUEDE dejar cuando hay apertura y trabajo. No dice que toda crisis fortalezca, ni que ocurra para enseñar algo: hay crisis que dejan pérdida y crisis que siguen abiertas.",
      },
    },
  },
];

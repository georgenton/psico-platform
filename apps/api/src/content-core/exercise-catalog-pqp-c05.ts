import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * PQP-C05 — the four practice/recall pairs behind the chapter's guided route.
 *
 * `correctOptionKey` lives ONLY here; `order` is globally unique inside the
 * book (pilot 1–2, C01 3–10, C02 11–20, C03 21–28, C04 29–36, so this runs
 * 37–44); and every `sourceHeading` is verbatim from the printed edition,
 * measured against published revision #10 as present exactly once.
 *
 * ── Safety — reinforced gate ───────────────────────────────────────────────
 *
 * `CONFLICT_IS_NOT_CONTROL`. The chapter's first named cause of conflict is
 * power and dominance, so the route's first item teaches the distinction
 * between a disagreement and a pattern of control. That is the safest thing to
 * do with this material: a route about conflict that skipped it would be
 * handing negotiation techniques to someone who needs something else.
 *
 * `desacuerdo-o-senales-de-control` classifies SCENES, never people. Its four
 * readings are invented, its prompt states that recognising control in a scene
 * says nothing about anyone the reader knows, and its feedback says plainly
 * that the answer to control is support rather than a conversation technique.
 * No item anywhere in this file asks a reader to describe being controlled or
 * hurt, and nothing of the sort is stored.
 *
 * The recall's correct option is deliberately the one about WHO CAN REFUSE,
 * not about intensity or subject matter — because frequency and topic are the
 * two things people most often mistake for the difference.
 *
 * «Asume tu responsabilidad» has no pair here on purpose: in a chapter that
 * also names dominance, an exercise teaching «take your share» risks landing as
 * symmetric responsibility on someone being harmed.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 5 is unit 6; unit 1 is the front matter. */
const CHAPTER = 6;

export const EXERCISE_CATALOG_PQP_C05: readonly UnitExerciseDefinitions[] = [
  // ── MG01 · Un desacuerdo no es una dinámica de control ───────────────────
  {
    practice: {
      exerciseKey: "pqp-c5-practice-desacuerdo-o-senales-de-control",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 37,
      type: "REFLECTION",
      title: "¿Desacuerdo o señales de control?",
      sourceHeading: "1. Poder y dominio",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cuatro escenas inventadas para este ejercicio, de cuatro parejas distintas.",
        observation:
          "En las cuatro hay algo que uno de los dos quiere y el otro no.",
        availableContext: [
          "Un desacuerdo admite que las dos personas sostengan su postura.",
          "En una dinámica de control, una de las dos no puede negarse sin que haya consecuencias.",
        ],
        readings: [
          {
            key: "discuten-y-siguen",
            label:
              "Discuten con ganas sobre dónde pasar las fiestas, no se ponen de acuerdo y lo dejan para otro día.",
          },
          {
            key: "revisa-el-telefono",
            label:
              "Uno revisa el teléfono del otro con regularidad y se molesta si no puede hacerlo.",
          },
          {
            key: "opiniones-distintas",
            label:
              "Tienen ideas opuestas sobre el colegio de su hija y cada uno defiende la suya durante semanas.",
          },
          {
            key: "silencio-castigo",
            label:
              "Cada vez que uno propone un plan sin el otro, sigue una semana de silencio y frialdad.",
          },
        ],
        buckets: [
          { key: "desacuerdo", label: "Se describe un desacuerdo entre dos" },
          { key: "control", label: "Se describen señales de control" },
        ],
        missingInformationPrompt:
          "Este ejercicio clasifica escenas, no personas: reconocer señales de control en una escena inventada no dice nada sobre nadie que conozcas. Y si alguna se pareciera a algo que estás viviendo, lo que corresponde no es una técnica de conversación sino apoyo — alguien de confianza, un profesional o un servicio especializado de tu país.",
      },
    },
    recall: {
      exerciseKey: "pqp-c5-recall-conflicto-no-es-control",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 38,
      type: "QUIZ",
      title:
        "Según la idea trabajada en esta guía, ¿qué distingue un desacuerdo de una dinámica de control?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c5-conflicto-no-es-control",
        options: [
          {
            key: "pqp-c5-opcion-quien-puede-negarse",
            label:
              "Que en un desacuerdo las dos personas pueden sostener su postura y negarse; en una dinámica de control, una no puede hacerlo sin consecuencias.",
          },
          {
            key: "pqp-c5-opcion-intensidad",
            label:
              "Que las discusiones son más intensas y frecuentes cuando hay control.",
          },
          {
            key: "pqp-c5-opcion-tema",
            label:
              "Que el control aparece siempre en temas de dinero o de familia, y el desacuerdo en temas cotidianos.",
          },
        ],
        correctOptionKey: "pqp-c5-opcion-quien-puede-negarse",
      },
      feedback: {
        correct:
          "Eso es lo que marca la diferencia: si las dos personas pueden negarse y seguir estando. Ni la intensidad ni el tema lo distinguen — una dinámica de control puede ser muy silenciosa y ocurrir en cualquier asunto.",
        review:
          "Fíjate en quién puede decir que no. No lo distingue lo fuerte que se discuta ni sobre qué: lo distingue si una de las dos personas no puede sostener su postura sin que haya consecuencias. Y esa situación no se trabaja con técnicas de conversación, sino con apoyo.",
      },
    },
  },

  // ── MG02 · Una cosa a la vez ─────────────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c5-practice-hoy-o-el-historial",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 39,
      type: "REFLECTION",
      title: "¿Hoy o el historial?",
      sourceHeading: "4. Enfócate en el presente",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Una escena inventada para este ejercicio: alguien quiere hablar de que esta mañana no se avisó de un cambio de planes.",
        observation: "El asunto de hoy es concreto y reciente.",
        availableContext: [
          "Ha pasado otras veces, pero hoy hay un hecho puntual.",
          "Las dos personas pueden hablar con libertad.",
        ],
        readings: [
          {
            key: "solo-hoy",
            label:
              "«Esta mañana cambiaste el plan y no me avisaste; me dejó descolocada.»",
          },
          {
            key: "siempre",
            label: "«Siempre haces lo mismo, desde que nos conocemos.»",
          },
          {
            key: "lista",
            label:
              "«Como en tu cumpleaños, como en el viaje del año pasado, como cuando lo de tu hermana…»",
          },
          {
            key: "hoy-y-peticion",
            label:
              "«Lo de esta mañana me dejó descolocada; ¿podemos avisarnos cuando cambie algo?»",
          },
        ],
        buckets: [
          { key: "hoy", label: "Se queda en el asunto de hoy" },
          { key: "historial", label: "Abre el archivo" },
        ],
        missingInformationPrompt:
          "Ninguna frase está prohibida y el pasado no deja de importar. El ejercicio solo cuenta cuántos temas quedan abiertos después de cada una.",
      },
    },
    recall: {
      exerciseKey: "pqp-c5-recall-una-cosa-a-la-vez",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 40,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué ocurre al traer discusiones pasadas a una conversación sobre algo de hoy?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c5-una-cosa-a-la-vez",
        options: [
          {
            key: "pqp-c5-opcion-satura",
            label:
              "Que la conversación se satura y se vuelve más difícil resolver lo que se quería tratar.",
          },
          {
            key: "pqp-c5-opcion-contexto",
            label:
              "Que aporta el contexto necesario para que el otro entienda la magnitud del problema.",
          },
          {
            key: "pqp-c5-opcion-igual",
            label:
              "Que da igual: lo que decide el resultado es el tono con que se diga.",
          },
        ],
        correctOptionKey: "pqp-c5-opcion-satura",
      },
      feedback: {
        correct:
          "Eso señala el capítulo: el historial multiplica los temas abiertos y deja el de hoy sin tratar.",
        review:
          "Relee esa sección. No es cuestión de tono, y traer el pasado no funciona como contexto: satura la conversación.",
      },
    },
  },

  // ── MG03 · El momento importa ────────────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c5-practice-cuando-abrir-la-conversacion",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 41,
      type: "REFLECTION",
      title: "Cuándo abrir la conversación",
      sourceHeading: "9. Elige bien el momento",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Una persona inventada quiere hablar de cómo se reparten los gastos.",
          "Lo plantea con calma y en una sola frase.",
          "Pide hablarlo, no lo resuelve en el momento.",
        ],
        contexts: [
          {
            key: "mal-momento",
            label: "Nada más entrar por la puerta",
            description:
              "Los dos vienen de un día largo y todavía no han soltado las cosas.",
          },
          {
            key: "momento-elegido",
            label: "Una noche acordada de antemano",
            description:
              "Habían quedado en hablarlo y ninguno tiene otra cosa pendiente.",
          },
        ],
        factors: [
          {
            key: "cansancio",
            label: "Cuánto le queda a cada uno para sostener una conversación.",
          },
          {
            key: "hay-terceros",
            label: "Si hay otras personas delante.",
          },
          {
            key: "aviso",
            label: "Si el otro sabía que ese tema iba a aparecer.",
          },
          {
            key: "tiempo",
            label: "Si hay tiempo o algo lo interrumpirá enseguida.",
          },
        ],
        prompt:
          "La frase es idéntica en los dos casos. ¿Qué podría cambiar en lo que ocurre después? No existe un momento perfecto, y elegirlo no es evitar el tema.",
      },
    },
    recall: {
      exerciseKey: "pqp-c5-recall-el-momento-importa",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 42,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿por qué muchas discusiones se agravan sin que el tema haya cambiado?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c5-el-momento-importa",
        options: [
          {
            key: "pqp-c5-opcion-mal-momento",
            label:
              "Porque se abren en un momento o un lugar en que ninguno de los dos puede sostener la conversación.",
          },
          {
            key: "pqp-c5-opcion-postergar",
            label:
              "Porque conviene aplazar los temas difíciles hasta que dejen de doler.",
          },
          {
            key: "pqp-c5-opcion-caracter",
            label:
              "Porque hay personas que no están hechas para hablar de temas difíciles.",
          },
        ],
        correctOptionKey: "pqp-c5-opcion-mal-momento",
      },
      feedback: {
        correct:
          "Eso dice el capítulo: muchas discusiones se agravan por el momento, no por el contenido.",
        review:
          "Vuelve a esa sección. No propone aplazar los temas ni habla de tipos de persona: habla de cuándo y dónde se abre la conversación.",
      },
    },
  },

  // ── MG04 · Un acuerdo no es una victoria ─────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c5-practice-de-la-postura-al-acuerdo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 43,
      type: "REFLECTION",
      title: "De la postura al acuerdo",
      sourceHeading: "10. Lleguen a acuerdos",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio, Lena y Omar, discute cada mes por cuánto gastan en salir. Ordena los pasos hasta llegar a algo comprobable.",
        cards: [
          {
            key: "posturas",
            label: "Cada uno defiende una cifra y ninguno se mueve.",
          },
          {
            key: "que-necesita",
            label:
              "Dicen qué necesitan de verdad: uno previsibilidad, el otro no sentirse vigilado.",
          },
          {
            key: "propuesta",
            label:
              "Proponen algo que atiende las dos cosas y que no era la cifra de ninguno.",
          },
          {
            key: "comprobable",
            label:
              "Lo dejan concreto y con fecha para revisarlo, de modo que se sabrá si funcionó.",
          },
        ],
        solved: ["posturas", "que-necesita", "propuesta", "comprobable"],
        solvedLabel: "El orden que describe el capítulo",
        feedback:
          "El último paso es el que distingue un acuerdo del final de una discusión: si nadie sabría decir después si se cumplió, no era un acuerdo.",
      },
    },
    recall: {
      exerciseKey: "pqp-c5-recall-acuerdo-no-es-victoria",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 44,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿cuándo se considera resuelto un conflicto de pareja?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c5-acuerdo-no-es-victoria",
        options: [
          {
            key: "pqp-c5-opcion-acuerdo-concreto",
            label:
              "Cuando llegan a un acuerdo concreto que ambos pueden sostener, no cuando uno gana.",
          },
          {
            key: "pqp-c5-opcion-convencer",
            label:
              "Cuando uno de los dos logra explicar su postura lo bastante bien como para convencer al otro.",
          },
          {
            key: "pqp-c5-opcion-dejar-pasar",
            label:
              "Cuando el malestar se disipa solo y el tema deja de aparecer.",
          },
        ],
        correctOptionKey: "pqp-c5-opcion-acuerdo-concreto",
      },
      feedback: {
        correct:
          "Eso es. El capítulo lo dice sin rodeos: un conflicto no se resuelve cuando uno gana y otro pierde.",
        review:
          "Vuelve al final de las claves. Ni convencer al otro ni esperar a que se disipe: el capítulo describe un acuerdo que ambos puedan sostener.",
      },
    },
  },
];

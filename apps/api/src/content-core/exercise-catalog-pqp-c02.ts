import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * PQP-C02 — the five practice/recall pairs behind the chapter's guided route.
 *
 * Same rules as C01's file: `correctOptionKey` lives ONLY here and never
 * reaches a manifest, a web bundle or the DOM; `order` is globally unique
 * inside the book (the pilot holds 1–2, C01 holds 3–10, so this runs 11–20);
 * and every `sourceHeading` is verbatim from the printed edition, each measured
 * against published revision #10 as present exactly once in the unit.
 *
 * ── Safety of this chapter in particular ──────────────────────────────────
 *
 * The chapter names four patterns that erode a bond. Every item here treats
 * them as DESCRIPTIVE LANGUAGE for noticing what is happening in a
 * conversation — never as a diagnosis of a person and never as a forecast for
 * a relationship. No recall asks a reader to label anybody, and no feedback
 * says a relationship is failing.
 *
 * The chapter also cites a proportion for how many disagreements never get
 * solved. `resoluble-o-recurrente` teaches the distinction without repeating a
 * figure in FeelVerse's own voice: a population statistic is not a prediction
 * about the person reading it.
 *
 * `una-decision-tomada-entre-dos` carries this chapter's load-bearing caution.
 * Sharing influence describes two people who can both say no. Where someone
 * cannot refuse safely, that is not a problem of influence and it is not
 * improved by giving more ground — so the scenario is written between two
 * people who are plainly free to disagree, and the guide's copy says the rest.
 *
 * Every scenario is invented for the exercise. None asks a reader to classify
 * their own partner, their own words or their own relationship.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 2 is unit 3; unit 1 is the front matter. */
const CHAPTER = 3;

export const EXERCISE_CATALOG_PQP_C02: readonly UnitExerciseDefinitions[] = [
  // ── MG01 · Una queja no es una crítica ───────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c2-practice-sobre-el-hecho-o-sobre-la-persona",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 11,
      type: "REFLECTION",
      title: "¿Sobre el hecho o sobre la persona?",
      sourceHeading: "Primer Jinete: La Crítica",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Una escena inventada para este ejercicio. Nadia contaba con que Tomás pasara por la farmacia camino a casa y no ocurrió.",
        observation: "El encargo quedó sin hacer.",
        availableContext: [
          "Es la segunda vez este mes.",
          "Ninguno de los dos ha hablado todavía del asunto.",
          "Nadia quiere decir algo esta noche.",
        ],
        readings: [
          {
            key: "hecho-y-necesidad",
            label:
              "«Hoy no pasaste por la farmacia y me quedé sin la receta; necesito que me avises si no vas a poder.»",
          },
          {
            key: "nunca-siempre",
            label: "«Nunca te acuerdas de nada de lo que te pido.»",
          },
          {
            key: "rasgo",
            label: "«Eres una persona descuidada.»",
          },
          {
            key: "hecho-simple",
            label: "«Me quedé sin la receta.»",
          },
        ],
        buckets: [
          { key: "sobre-el-hecho", label: "Habla de algo que ocurrió" },
          { key: "sobre-la-persona", label: "Habla de cómo es la persona" },
        ],
        missingInformationPrompt:
          "Fíjate en qué deja hacer cada frase. Ante un hecho concreto hay algo que se puede acordar; ante una definición de quién es alguien, casi solo queda defenderse. Ninguna frase está prohibida: el ejercicio es notar hacia dónde apunta.",
      },
    },
    recall: {
      exerciseKey: "pqp-c2-recall-queja-no-es-critica",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 12,
      type: "QUIZ",
      title: "Según el capítulo, ¿qué distingue una queja de una crítica?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c2-queja-no-es-critica",
        options: [
          {
            key: "pqp-c2-opcion-hecho-vs-caracter",
            label:
              "La queja habla de algo concreto que ocurrió; la crítica lo convierte en un rasgo de cómo es la otra persona.",
          },
          {
            key: "pqp-c2-opcion-tono",
            label:
              "La queja se dice con buen tono y la crítica se dice enfadado.",
          },
          {
            key: "pqp-c2-opcion-callar",
            label:
              "La queja es expresar una molestia y la crítica es cualquier molestia que se calla.",
          },
        ],
        correctOptionKey: "pqp-c2-opcion-hecho-vs-caracter",
      },
      feedback: {
        correct:
          "Eso es. No es cuestión de tono ni de volumen: es la diferencia entre nombrar algo que pasó y definir a alguien. Lo primero deja algo que se puede acordar.",
        review:
          "Vuelve a la sección sobre la crítica. La distinción del capítulo no está en cómo se dice, sino en de qué habla la frase: de un hecho o de cómo es la persona.",
      },
    },
  },

  // ── MG02 · Lo pequeño es grande ──────────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c2-practice-una-invitacion-y-tres-respuestas",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 13,
      type: "REFLECTION",
      title: "Una invitación, dos momentos",
      sourceHeading: "Principio 3: Acercarse en lugar de alejarse",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Alguien comenta en voz alta algo que acaba de leer.",
          "La otra persona responde «ajá» sin levantar la vista.",
          "La conversación no continúa.",
        ],
        contexts: [
          {
            key: "aislado",
            label: "Ocurre una vez",
            description:
              "Es una tarde cualquiera y el resto del día han hablado con normalidad.",
          },
          {
            key: "repetido",
            label: "Ocurre casi siempre",
            description:
              "Lleva semanas pasando con casi todos los comentarios de ese tipo.",
          },
        ],
        factors: [
          {
            key: "frecuencia",
            label: "Si es una vez o si se ha vuelto la respuesta habitual.",
          },
          {
            key: "reparacion",
            label: "Si más tarde alguien retoma el tema.",
          },
          {
            key: "reciprocidad",
            label: "Si en otros momentos las invitaciones sí se responden.",
          },
          {
            key: "contexto-del-dia",
            label: "Lo que estaba ocurriendo alrededor en ese momento.",
          },
        ],
        prompt:
          "Las señales son idénticas en los dos casos. ¿Qué podría cambiar en lo que la primera persona alcanza a entender? Nada se marca como correcto: el ejercicio es notar que una misma respuesta no significa lo mismo aislada que repetida.",
      },
    },
    recall: {
      exerciseKey: "pqp-c2-recall-lo-pequeno-es-grande",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 14,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué papel tienen las pequeñas invitaciones a conectar?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c2-lo-pequeno-es-grande",
        options: [
          {
            key: "pqp-c2-opcion-acumulacion",
            label:
              "Son intercambios breves y frecuentes cuya acumulación va dando forma al clima entre dos personas.",
          },
          {
            key: "pqp-c2-opcion-detalle-menor",
            label:
              "Son detalles agradables, pero lo que de verdad sostiene una relación son las conversaciones importantes.",
          },
          {
            key: "pqp-c2-opcion-cada-una-decide",
            label:
              "Cada invitación no respondida marca un daño difícil de reparar.",
          },
        ],
        correctOptionKey: "pqp-c2-opcion-acumulacion",
      },
      feedback: {
        correct:
          "Exacto: lo que el capítulo sitúa en el centro no es ningún gesto en particular, sino la suma de muchos.",
        review:
          "Relee esa sección. Ni son un detalle menor ni una sola decide algo: lo que pesa es cuántas veces se responden a lo largo del tiempo.",
      },
    },
  },

  // ── MG03 · Aceptar influencia no es ceder ────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c2-practice-una-decision-tomada-entre-dos",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 15,
      type: "REFLECTION",
      title: "Una decisión tomada entre dos",
      sourceHeading: "Principio 4: Aceptar la influencia de tu pareja",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio, Julia y Ander, decide dónde pasar unas vacaciones cortas. Los dos pueden decir que no sin consecuencias. Ordena los pasos y fíjate en dónde entra de verdad la opinión del otro.",
        cards: [
          {
            key: "postura",
            label: "Cada uno llega con una preferencia distinta y la dice.",
          },
          {
            key: "razon",
            label:
              "Se preguntan por qué esa opción le importa al otro, antes de discutirla.",
          },
          {
            key: "cambia",
            label:
              "Ander se da cuenta de que parte de lo que pide Julia también le sirve a él.",
          },
          {
            key: "decision",
            label:
              "Eligen una opción que ninguno de los dos había traído al principio.",
          },
        ],
        solved: ["postura", "razon", "cambia", "decision"],
        solvedLabel: "El orden que describe el capítulo",
        feedback:
          "El paso que suele saltarse es el segundo. Sin preguntar por qué le importa al otro, la conversación se convierte en dos posturas compitiendo, y entonces alguien tiene que perder. Aceptar influencia describe una decisión que pudo cambiar de forma, no una en la que uno deja de opinar.",
      },
    },
    recall: {
      exerciseKey: "pqp-c2-recall-aceptar-influencia",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 16,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué significa aceptar la influencia de la otra persona?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c2-aceptar-influencia",
        options: [
          {
            key: "pqp-c2-opcion-cuenta-de-verdad",
            label:
              "Que lo que la otra persona piensa cuente de verdad en la decisión, de modo que pueda cambiar de forma.",
          },
          {
            key: "pqp-c2-opcion-ceder-siempre",
            label:
              "Ceder en la mayoría de las decisiones para evitar el desgaste de discutir.",
          },
          {
            key: "pqp-c2-opcion-turnarse",
            label:
              "Turnarse: cada uno decide sin discusión en las áreas que le corresponden.",
          },
        ],
        correctOptionKey: "pqp-c2-opcion-cuenta-de-verdad",
      },
      feedback: {
        correct:
          "Eso es. No es ceder ni repartirse territorios: es que la decisión pueda cambiar porque la pensaron dos. Y describe a dos personas que pueden decir que no.",
        review:
          "Vuelve a esa sección. Aceptar influencia no es ceder siempre ni renunciar al propio criterio; es que la opinión del otro tenga peso real en lo que se decide.",
      },
    },
  },

  // ── MG04 · Desacuerdos que no se resuelven ───────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c2-practice-resoluble-o-recurrente",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 17,
      type: "REFLECTION",
      title: "¿Resoluble o recurrente?",
      sourceHeading: "Principio 5: Resolver los conflictos de manera efectiva",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cuatro desacuerdos inventados para este ejercicio, tomados de parejas distintas.",
        observation: "Todos han aparecido más de una vez en los últimos meses.",
        availableContext: [
          "Ninguno se ha resuelto todavía.",
          "En los cuatro casos las dos personas pueden hablar del tema con libertad.",
        ],
        readings: [
          {
            key: "quien-recoge",
            label: "Quién recoge la cocina los días entre semana.",
          },
          {
            key: "ritmo-social",
            label:
              "Uno necesita ver gente casi cada fin de semana; el otro necesita quedarse en casa para reponerse.",
          },
          {
            key: "hora-cena",
            label: "A qué hora cenan cuando ambos llegan tarde.",
          },
          {
            key: "cercania-familia",
            label:
              "Cuánta presencia tiene la familia de origen en su vida cotidiana.",
          },
        ],
        buckets: [
          {
            key: "resoluble",
            label: "Admite un acuerdo concreto",
          },
          {
            key: "recurrente",
            label: "Viene de una diferencia estable y probablemente vuelva",
          },
        ],
        missingInformationPrompt:
          "La pregunta no es cuál es más grave, sino qué tipo de conversación pide cada uno. Un desacuerdo que vuelve no señala que algo vaya mal: señala que el objetivo no era cerrarlo.",
      },
    },
    recall: {
      exerciseKey: "pqp-c2-recall-desacuerdos-perpetuos",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 18,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué conviene hacer con un desacuerdo que reaparece una y otra vez?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c2-desacuerdos-perpetuos",
        options: [
          {
            key: "pqp-c2-opcion-poder-hablarlo",
            label:
              "Cambiar el objetivo: en vez de cerrarlo, poder hablarlo sin empezar de cero cada vez.",
          },
          {
            key: "pqp-c2-opcion-insistir",
            label:
              "Insistir hasta encontrar la solución definitiva que todavía no han visto.",
          },
          {
            key: "pqp-c2-opcion-evitarlo",
            label: "Dejar de sacarlo, porque hablarlo solo reabre el malestar.",
          },
        ],
        correctOptionKey: "pqp-c2-opcion-poder-hablarlo",
      },
      feedback: {
        correct:
          "Eso propone el capítulo: cuando un desacuerdo viene de una diferencia estable, el objetivo deja de ser cerrarlo y pasa a ser poder sostener la conversación.",
        review:
          "Relee el cierre de esa sección. Ni insistir hasta resolverlo ni dejar de hablarlo: lo que cambia es qué se busca en la conversación.",
      },
    },
  },

  // ── MG05 · El sueño detrás del desacuerdo ────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c2-practice-lo-que-hay-debajo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 19,
      type: "REFLECTION",
      title: "Lo que hay debajo",
      sourceHeading: "Principio 6: Superar los obstáculos",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio, Rosa y Kim, discute desde hace dos años sobre mudarse o quedarse. Ordena los pasos del caso.",
        cards: [
          {
            key: "postura-repetida",
            label:
              "La discusión vuelve con los mismos argumentos y termina igual.",
          },
          {
            key: "pregunta",
            label:
              "Alguien pregunta qué es lo que de verdad está en juego para cada uno.",
          },
          {
            key: "aparece",
            label:
              "Aparece algo que no se había dicho: lo que cada uno quiere para su vida detrás de esa postura.",
          },
          {
            key: "sigue-abierto",
            label:
              "El desacuerdo sigue sin resolverse, pero ahora hablan de otra cosa.",
          },
        ],
        solved: ["postura-repetida", "pregunta", "aparece", "sigue-abierto"],
        solvedLabel: "El orden que describe el capítulo",
        feedback:
          "El último paso es el que suele sorprender: nombrar lo que hay debajo no cierra el desacuerdo. Lo que cambia es de qué están hablando, y eso suele ser lo que estaba bloqueado.",
      },
    },
    recall: {
      exerciseKey: "pqp-c2-recall-sueno-detras-del-desacuerdo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 20,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué suele haber detrás de un desacuerdo que se enquista durante años?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c2-sueno-detras-del-desacuerdo",
        options: [
          {
            key: "pqp-c2-opcion-algo-que-importa",
            label:
              "Algo que cada persona valora y no siempre ha dicho en voz alta: una necesidad o algo que quiere para su vida.",
          },
          {
            key: "pqp-c2-opcion-falta-de-tecnica",
            label:
              "Falta de técnica para negociar: con el método adecuado se resolvería.",
          },
          {
            key: "pqp-c2-opcion-incompatibilidad",
            label:
              "Una incompatibilidad de fondo que indica que la relación no encaja.",
          },
        ],
        correctOptionKey: "pqp-c2-opcion-algo-que-importa",
      },
      feedback: {
        correct:
          "Eso es lo que propone el capítulo: debajo de una postura sostenida suele haber algo que importa y que no se ha nombrado.",
        review:
          "Vuelve a esa sección. No lo plantea como falta de técnica ni como señal de incompatibilidad, sino como algo valioso que todavía no se ha dicho.",
      },
    },
  },
];

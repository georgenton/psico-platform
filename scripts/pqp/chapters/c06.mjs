/**
 * PQP-C06 — «De crisis a oportunidad».
 *
 * Chapter map (published revision #10, platform order 7): 72 blocks, 13
 * headings, 0 duplicated, 13 min. A short chapter: the transformative power of
 * crisis, flexibility, facing pain, spotting early signs, communicating during
 * a storm, asking for help, and crisis as a threshold for growth — plus three
 * closing exercises.
 *
 * ── Why three, not five ────────────────────────────────────────────────────
 *
 * Seventy-two blocks and three defensible ideas. Forcing five would mean
 * splitting one idea into pieces that cannot be practised on their own.
 *
 *   · Spotting early signs is concrete, teachable and useful before anything
 *     has gone badly wrong.
 *   · Asking for help is the chapter's most protective claim and the one this
 *     collection most wants to carry.
 *   · Growth after a crisis is the chapter's thesis, and it is the one that
 *     needs the most careful handling — which is why it gets its own guide
 *     rather than being folded in somewhere.
 *
 * «Flexibilidad» is deliberately NOT a microguide: it is very close to C01's
 * «cuando el amor se reinventa», and the collection does not need the same idea
 * twice. «La comunicación en medio de la tormenta» is likewise close to C04's
 * route. Both stay in reading.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * `GROWTH_IS_POSSIBLE_NEVER_OBLIGATORY`. This is the chapter that most invites
 * a derived layer to overreach. The title promises opportunity; the closing
 * section calls crisis a threshold for growth; the author tells a hard personal
 * story that ended well. None of that licenses FeelVerse to tell a reader that
 * their crisis will make them stronger, that it happened for a reason, or that
 * they should be growing.
 *
 * So MG03 says the opposite out loud: some crises leave learning, some leave
 * loss, some are still open, and none of those outcomes is a verdict on the
 * people involved. Its practice classifies what a scene shows rather than
 * predicting what a crisis will produce, and it deliberately includes an
 * outcome where nothing improved.
 *
 * The author's personal account is referred to as a section to read, never
 * retold here. And nothing in this route asks anyone to describe a crisis of
 * their own; every practice runs on invented material.
 */

const SAFE_EXIT =
  "Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.";

export const CHAPTER = {
  code: "C06",
  chapterOrder: 7,
  unitKey: "a5bd7c6b-666f-58f8-b96e-abca82405a7c",
  keyPrefix: "pqp-c6",
  media: { authorVideoPending: false },
  approvalReferences: [
    "PQP-C06 — Inventario editorial y selección de microguías (2026-09-08)",
  ],
};

/** Dúo candidates — PRODUCT DRAFT ONLY. No runtime, no tables, no endpoints. */
export const DUO_CANDIDATES = [
  {
    title: "¿Qué necesitaríamos si esto se complica?",
    from: "MG02 · Pedir ayuda no es debilidad",
    purpose:
      "Decidir de antemano, en calma, a quién acudirían si algo se pusiera difícil.",
    privatePreparation:
      "Cada persona anota en privado a quién acudiría y qué le costaría pedirlo.",
    visibility: "SELECTIVE_SHARE",
    revelation:
      "Privado → ambos confirman → se comparte solo lo que cada uno elija.",
    conversation:
      "Corta y en un momento tranquilo, no durante una dificultad. Pausa y retirada disponibles.",
    sharedOutcome:
      "Una lista breve de a quién acudir. Sin compromisos sobre cuándo ni obligación de usarla.",
    followUp: "Revisarla dentro de unos meses; no antes.",
    exit: "Cualquiera puede cerrar la actividad sin explicar por qué.",
    doNotSuggestWhen:
      "Durante una crisis activa, si hay un duelo reciente, o ante cualquier señal de control o violencia — en ese caso la conversación relevante es con apoyo especializado, no entre dos.",
  },
];

export const MICROGUIDES = [
  {
    slug: "senales-de-crisis",
    title: "Las señales tempranas",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿cómo se manifiestan muchas crisis de pareja?",
      options: [
        {
          optionKey: "pqp-c6-opcion-instalan-despacio",
          label:
            "Se instalan despacio, con señales discretas que se normalizan antes de que nadie las nombre.",
        },
        {
          optionKey: "pqp-c6-opcion-siempre-estallan",
          label:
            "Estallan siempre en un episodio claro que ambos identifican en el momento.",
        },
        {
          optionKey: "pqp-c6-opcion-solo-graves",
          label:
            "Solo aparecen cuando ocurre algo grave, como una pérdida o una infidelidad.",
        },
      ],
    },
    practiceSlug: "una-senal-en-dos-momentos",
    practiceKind: "signal_context_compare",
    anchor: {
      heading: "Detectar las señales de una crisis",
      fingerprint: "Reconocer estas señales tempranas",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Las señales tempranas",
        body: [
          "No todas las crisis llegan de golpe. El capítulo describe las que se instalan sin ruido, y por qué cuesta tanto verlas a tiempo.",
        ],
        note: `Trabajaremos con una escena inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Detectar las señales de una crisis",
        body: [
          "Lee la sección donde el capítulo enumera señales tempranas, y fíjate en cuáles no parecen graves vistas de una en una.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Lo que se normaliza deja de verse",
        body: [
          "Muchas de las señales que describe el capítulo son discretas: menos conversación de la que había, menos gestos de afecto, planes que dejan de compartirse, una sensación difusa de que algo falta.",
          "Cada una por separado puede no significar nada. Lo que las vuelve significativas es que se sostengan y que nadie las nombre, porque a lo que dura mucho tiempo se le deja de prestar atención.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa tu relación ni concluye nada sobre ella. Reconocer una señal en una lista no es un diagnóstico.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Una señal en dos momentos",
        body: [
          "Las mismas señales de una pareja inventada, en dos situaciones distintas. Observa qué haría falta saber para interpretarlas.",
        ],
        note: "Es un caso editorial, no tu relación. Nada se marca como correcto: el ejercicio es notar qué información falta.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Hay algo que antes hacían y que hace tiempo dejó de ocurrir, sin que nadie lo mencionara? Basta con pensarlo.",
        ],
        note: "Privado y opcional. No se guarda, no puntúa nada y no viaja con tu progreso.",
        optional: true,
      },
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Nombrarlo antes",
        body: [
          "Las señales que describe el capítulo casi nunca son dramáticas. Lo que las vuelve importantes es que duren y que nadie las diga en voz alta.",
        ],
      },
    ],
  },
  {
    slug: "pedir-ayuda-no-es-debilidad",
    title: "Pedir ayuda no es debilidad",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué lugar tiene la ayuda externa en una crisis de pareja?",
      options: [
        {
          optionKey: "pqp-c6-opcion-hay-crisis-que-la-necesitan",
          label:
            "Hay crisis que necesitan intervención externa, y buscarla es una decisión sensata y no una derrota.",
        },
        {
          optionKey: "pqp-c6-opcion-ultimo-recurso",
          label:
            "Conviene reservarla como último recurso, cuando ya se han agotado los intentos entre los dos.",
        },
        {
          optionKey: "pqp-c6-opcion-solo-si-ambos",
          label:
            "Solo tiene sentido si ambos están igual de convencidos desde el principio.",
        },
      ],
    },
    practiceSlug: "de-la-idea-a-la-consulta",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "Buscar ayuda no es debilidad, es sabiduría",
      fingerprint: "necesitan intervención externa",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Pedir ayuda no es debilidad",
        body: [
          "Muchas parejas llegan a terapia tarde, y no por falta de dificultades. El capítulo se detiene en por qué.",
        ],
        note: `Trabajaremos con un caso inventado para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Buscar ayuda no es debilidad, es sabiduría",
        body: [
          "Lee la sección sobre la ayuda externa y fíjate en cómo la sitúa el capítulo: no como un último recurso.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Antes, no cuando ya no queda nada",
        body: [
          "El capítulo sostiene que hay dificultades que no se resuelven solo entre dos, y que buscar acompañamiento es una decisión razonable y no la señal de que algo fracasó.",
          "Situarla como último recurso tiene un coste concreto: se llega con más desgaste acumulado y con menos margen para trabajar.",
        ],
        note: "Si algo de lo que lees te resuena, pedir ayuda es una opción disponible ahora, no dentro de un tiempo. Marcar la escena no evalúa tu situación ni saca conclusiones sobre ella.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "De la idea a la consulta",
        body: [
          "Ordena los pasos de un caso inventado, desde que alguien piensa que quizá les vendría bien hasta que ocurre.",
        ],
        note: "Es un caso editorial, no tu historia.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Si quisieras hablar con alguien —dentro o fuera de la pareja—, ¿quién sería? No hace falta que hagas nada con la respuesta.",
        ],
        note: "Privado y opcional. No se guarda ni viaja con tu progreso.",
        optional: true,
      },
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Una opción, no una rendición",
        body: [
          "Buscar ayuda es una decisión disponible en cualquier momento, y llegar antes suele dejar más margen que llegar al final.",
        ],
      },
    ],
  },
  {
    slug: "crecimiento-posible-no-obligatorio",
    title: "A veces se aprende, y a veces se pierde",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según la idea trabajada en esta guía, ¿qué se puede decir del aprendizaje después de una crisis?",
      options: [
        {
          optionKey: "pqp-c6-opcion-puede-ocurrir",
          label:
            "Que puede ocurrir cuando hay apertura y trabajo, pero no está garantizado ni es obligatorio.",
        },
        {
          optionKey: "pqp-c6-opcion-toda-crisis-fortalece",
          label:
            "Que toda crisis fortalece a la pareja que la atraviesa unida.",
        },
        {
          optionKey: "pqp-c6-opcion-sucede-por-algo",
          label:
            "Que las crisis ocurren para enseñar algo que la pareja necesitaba aprender.",
        },
      ],
    },
    practiceSlug: "que-dejo-esta-crisis",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "La crisis como umbral de crecimiento",
      fingerprint: "con apertura, humildad",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "A veces se aprende, y a veces se pierde",
        body: [
          "El capítulo cuenta cómo una crisis puede dejar algo valioso. Esta guía se detiene también en lo que eso no significa.",
        ],
        note: `Puede tocar recuerdos difíciles; todas las preguntas son opcionales. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "La crisis como umbral de crecimiento",
        body: [
          "Lee la sección final, donde el autor describe lo que una dificultad dejó en su propia historia.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Posible, no obligatorio",
        body: [
          "El capítulo describe que una pareja que atraviesa una crisis con apertura y trabajo puede salir de ella con algo que antes no tenía. Es una posibilidad real, y vale la pena conocerla.",
          "Conviene decir con la misma claridad lo que no se sigue de ahí. Hay crisis que dejan aprendizaje, otras que dejan pérdida, y otras que siguen abiertas mucho tiempo. Ninguna de esas salidas dice nada sobre lo que valen las personas que la atraviesan, y nadie está obligado a encontrarle un sentido a lo que le dolió.",
        ],
        note: "Esta precisión es de FeelVerse: una crisis no ocurre para enseñar nada, y no crecer no es un fallo. Marcar la escena no evalúa tu situación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Qué dejó esta crisis?",
        body: [
          "Cuatro desenlaces inventados de cuatro parejas distintas. Distingue lo que cada escena muestra de lo que estaríamos suponiendo.",
        ],
        note: "Son casos editoriales. Ninguno es un modelo a seguir ni un pronóstico: incluyen desenlaces en los que nada mejoró, porque también ocurren.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti, si quieres",
        body: [
          "Si has atravesado algo difícil, ¿hay algo que hoy sepas y antes no? Y si la respuesta es que no, o que todavía no toca, también está bien.",
        ],
        note: "Privado, opcional y saltable entero. No se guarda, no se interpreta y no viaja con tu progreso.",
        optional: true,
      },
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a la idea trabajada."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Sin deberes",
        body: [
          "Una crisis puede dejar aprendizaje. No tiene que hacerlo, y no haberlo encontrado no es una tarea pendiente.",
        ],
      },
    ],
  },
];

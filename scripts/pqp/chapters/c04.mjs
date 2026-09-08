/**
 * PQP-C04 — «Puentes que nos acercan: cómo comunicarnos para conectar».
 *
 * Chapter map (published revision #10, platform order 5): 173 blocks, 23
 * headings, 0 duplicated, 16 min. Five levels of communication, eight keys for
 * improving it, the author's own story and three closing exercises.
 *
 * ── Why these four ─────────────────────────────────────────────────────────
 *
 *   · «Hablar no es comunicarse» is the chapter's own opening move and the
 *     frame the rest hangs from, so it leads.
 *   · «No pelear no es lo mismo que estar conectados» is the most
 *     counterintuitive thing here: the chapter names living at the level of
 *     logistics as a trap precisely because it looks like harmony.
 *   · «Pensar distinto no divide» and «validar no es dar la razón» each teach a
 *     separate move, and neither repeats anything C01–C03 already carry.
 *   · «Habla desde ti» is deliberately NOT a microguide: it is very close to
 *     C02's «una queja no es una crítica», and the collection does not need the
 *     same distinction twice. It stays in reading, with the other seven keys.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * `BETTER_COMMUNICATION_IS_NOT_A_REMEDY_FOR_HARM`. A chapter about
 * communication carries a specific risk: that a reader in a relationship where
 * someone intimidates, coerces or hurts them concludes the problem is how they
 * are expressing themselves. MG01 states the limit in FeelVerse's own voice —
 * poor communication and coercion are different problems, and the second one
 * does not improve with better phrasing — and MG04 repeats it where it matters
 * most, because «validate the other» must never be read as an instruction to
 * accommodate someone who is causing harm.
 *
 * Nothing here asks a reader to rate how well they communicate, and no practice
 * uses their own conversations. All four run on invented scenes.
 */

const SAFE_EXIT =
  "Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.";

const HARM_LIMIT =
  "Un límite importante: hablar mejor ayuda con los malentendidos, no con el daño. Si alguien intimida, amenaza, controla o agrede, eso no es un problema de comunicación y no se resuelve eligiendo mejor las palabras — ahí lo que hace falta es protección y apoyo, no una técnica.";

export const CHAPTER = {
  code: "C04",
  chapterOrder: 5,
  unitKey: "39d09b0d-98a0-5b53-9844-364eaae4d0dc",
  keyPrefix: "pqp-c4",
  media: { authorVideoPending: false },
  approvalReferences: [
    "PQP-C04 — Inventario editorial y selección de microguías (2026-09-08)",
  ],
};

/** Dúo candidates — PRODUCT DRAFT ONLY. No runtime, no tables, no endpoints. */
export const DUO_CANDIDATES = [
  {
    title: "Subir un nivel",
    from: "MG02 · No pelear no es lo mismo que estar conectados",
    purpose:
      "Llevar UNA conversación de la logística a algo que a cada uno le importe, sin resolver nada.",
    privatePreparation:
      "Cada persona elige en privado un tema del que últimamente solo hablan en clave práctica.",
    visibility: "SELECTIVE_SHARE",
    revelation: "Privado → ambos confirman → cada uno comparte solo su tema.",
    conversation:
      "Turnos de escucha, con una regla: no proponer soluciones durante la actividad. Pausa y retirada disponibles.",
    sharedOutcome: "Nada que acordar; a lo sumo, una frase que cada uno quiera recordar.",
    followUp: "En dos semanas: ¿volvieron a hablar de ello? mantener / ajustar / abandonar.",
    exit: "Cualquiera puede cerrar sin explicar por qué.",
    doNotSuggestWhen:
      "Si abrir temas personales con esa persona ha tenido consecuencias antes, o ante cualquier señal de intimidación, control o violencia.",
  },
  {
    title: "Te escucho sin arreglarlo",
    from: "MG04 · Validar no es dar la razón",
    purpose:
      "Practicar escuchar y devolver lo entendido, sin corregir ni resolver.",
    privatePreparation:
      "Cada persona elige algo suyo de la última semana, deliberadamente pequeño.",
    visibility: "SELECTIVE_SHARE",
    revelation: "Privado → ambos confirman → empieza el primer turno.",
    conversation:
      "Cinco minutos por persona. Quien escucha solo devuelve lo que entendió. Pausa y retirada disponibles.",
    sharedOutcome: "Ninguno. La actividad es el intercambio.",
    followUp: "Repetirlo una vez más antes de decidir si les sirve.",
    exit: "Se puede parar en cualquier momento.",
    doNotSuggestWhen:
      "Si lo compartido puede usarse después como reproche, o ante cualquier señal de coerción o violencia. Validar nunca debe proponerse como forma de acomodarse a quien hace daño.",
  },
];

export const MICROGUIDES = [
  {
    slug: "hablar-no-es-comunicarse",
    title: "Hablar no es comunicarse",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué distingue hablar de comunicarse en una pareja?",
      options: [
        {
          optionKey: "pqp-c4-opcion-niveles",
          label:
            "Que se puede hablar mucho quedándose en niveles superficiales y no llegar nunca a lo que a cada uno le importa.",
        },
        {
          optionKey: "pqp-c4-opcion-cantidad",
          label:
            "Que comunicarse exige dedicar más tiempo del que la mayoría de las parejas dedica a hablar.",
        },
        {
          optionKey: "pqp-c4-opcion-tecnica",
          label:
            "Que comunicarse requiere una técnica concreta y hablar es lo que se hace sin ella.",
        },
      ],
    },
    practiceSlug: "en-que-nivel-ocurre",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "Los niveles de la comunicación",
      fingerprint: "El silencio no siempre es ausencia de palabras",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Hablar no es comunicarse",
        body: [
          "Dos personas pueden hablarse todos los días y llevar años sin contarse nada. El capítulo empieza por ahí.",
        ],
        note: `Trabajaremos con intercambios inventados para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Los niveles de la comunicación",
        body: [
          "Lee la sección donde el capítulo distingue distintos niveles de conversación, del más rutinario al más personal.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "No todo lo que se dice llega al mismo sitio",
        body: [
          "El capítulo describe la conversación por capas: lo rutinario, lo informativo, lo que se piensa, lo que se siente. Ninguna sobra —la logística también hace falta—, pero quedarse solo en las primeras puede convivir con años de distancia.",
          "Por eso la cantidad de palabras no dice mucho por sí sola. Lo que cambia es a qué nivel llega la conversación.",
        ],
        note: HARM_LIMIT,
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿En qué nivel ocurre?",
        body: [
          "Varios intercambios inventados. Distingue los que se quedan en lo práctico de los que abren algo personal.",
        ],
        note: "Son intercambios editoriales, no los tuyos. Ningún nivel es mejor que otro: el ejercicio es notar dónde ocurre cada uno.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "En un día normal, ¿en qué nivel ocurre casi toda tu conversación con la persona más cercana? Basta con pensarlo.",
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
        title: "La capa, no la cantidad",
        body: [
          "Lo que distingue hablar de comunicarse no es cuánto se habla, sino a qué capa llega la conversación.",
          "Y conviene recordar el límite: esto sirve para entenderse mejor, no para reparar un daño.",
        ],
      },
    ],
  },
  {
    slug: "armonia-no-es-salud",
    title: "No pelear no es lo mismo que estar conectados",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué riesgo tiene una pareja que casi nunca discute?",
      options: [
        {
          optionKey: "pqp-c4-opcion-ausencia-no-es-conexion",
          label:
            "Que la ausencia de discusiones se confunda con conexión, cuando puede convivir con no hablar de nada personal.",
        },
        {
          optionKey: "pqp-c4-opcion-explotara",
          label:
            "Que lo no hablado se acumule hasta estallar en una discusión mucho mayor.",
        },
        {
          optionKey: "pqp-c4-opcion-ninguno",
          label:
            "Ninguno: no discutir es el mejor indicador de que una relación funciona.",
        },
      ],
    },
    practiceSlug: "armonia-o-distancia",
    practiceKind: "signal_context_compare",
    anchor: {
      heading: "2. Comunicación de hechos: la crónica del día",
      fingerprint: "la armonía es sinónimo de salud",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "No pelear no es lo mismo que estar conectados",
        body: [
          "«Nosotros nunca discutimos» suele decirse con orgullo. El capítulo propone mirarlo dos veces.",
        ],
        note: `Trabajaremos con una escena inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "2. Comunicación de hechos: la crónica del día",
        body: [
          "Lee la sección sobre las parejas que organizan bien la vida práctica, y fíjate en qué llama el capítulo «la trampa».",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Ausencia de conflicto no es presencia de vínculo",
        body: [
          "Una pareja puede coordinarse perfectamente y no hablar de nada que le importe a ninguno de los dos. No discuten porque no se exponen.",
          "El capítulo no dice que discutir sea bueno ni que la calma sea sospechosa. Dice que la ausencia de conflicto, por sí sola, no informa de si hay conexión.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa cuánto discuten ustedes ni infiere nada sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Armonía o distancia?",
        body: [
          "Las mismas señales de una semana tranquila, en dos situaciones distintas. Observa qué podría cambiar lo que significan.",
        ],
        note: "Es un caso editorial. Nada se marca como correcto o incorrecto.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Hay algún tema que lleves tiempo sin sacar, no porque duela, sino porque nunca aparece el momento?",
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
        title: "La calma no es un diagnóstico",
        body: [
          "No discutir no dice, por sí solo, si una pareja está conectada o distante. Es una señal que necesita contexto.",
        ],
      },
    ],
  },
  {
    slug: "pensar-distinto-sin-dividirse",
    title: "Pensar distinto no divide",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué suele ocurrir cuando una pareja se muestra sus opiniones distintas sobre algo importante?",
      options: [
        {
          optionKey: "pqp-c4-opcion-se-conocen-mas",
          label:
            "Que llegan a conocerse mejor, en lugar de dividirse como a veces temen.",
        },
        {
          optionKey: "pqp-c4-opcion-mejor-evitar",
          label:
            "Que conviene evitarlo en los temas de fondo, para no abrir distancias innecesarias.",
        },
        {
          optionKey: "pqp-c4-opcion-hay-que-convencer",
          label:
            "Que uno de los dos acabará convenciendo al otro si expone bien sus razones.",
        },
      ],
    },
    practiceSlug: "el-miedo-debajo-de-la-opinion",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "3. Comunicación de ideas: pensar distinto sin dividirse",
      fingerprint: "no los dividió",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Pensar distinto no divide",
        body: [
          "Hay opiniones que no se dicen por miedo a lo que revelarían. El capítulo cuenta qué pasó cuando se dijeron.",
        ],
        note: `Trabajaremos con un caso inventado para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "3. Comunicación de ideas: pensar distinto sin dividirse",
        body: [
          "Lee la sección sobre mostrar las propias ideas, y fíjate en qué temía cada uno antes de hacerlo.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "El miedo suele estar debajo",
        body: [
          "Cuando dos personas evitan un tema de fondo, muchas veces no es el tema lo que evitan: es lo que temen que su postura diga de ellas.",
          "El capítulo describe que nombrar ese temor cambió la conversación, y que mostrar la diferencia no separó a la pareja sino que les permitió conocerse mejor.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no interpreta tus silencios ni te atribuye ningún miedo.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "El miedo debajo de la opinión",
        body: [
          "Ordena los pasos de un caso inventado, desde el tema que no se saca hasta lo que aparece cuando sí se saca.",
        ],
        note: "Es un caso editorial, no tu historia.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Si hay una opinión tuya que no has compartido, ¿qué temes que se entienda si la dices?",
        ],
        note: "Privado y opcional. No se guarda, no se interpreta y no viaja con tu progreso.",
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
        title: "Mostrar la diferencia",
        body: [
          "Mostrar una opinión distinta no separó a la pareja del capítulo: les permitió conocerse mejor.",
          "El objetivo no era convencer a nadie.",
        ],
      },
    ],
  },
  {
    slug: "validar-no-es-dar-la-razon",
    title: "Validar no es dar la razón",
    duration: "8–10 minutos",
    recall: {
      question: "Según el capítulo, ¿qué significa validar a la otra persona?",
      options: [
        {
          optionKey: "pqp-c4-opcion-reconocer-sentir",
          label:
            "Reconocer que lo que siente tiene sentido para ella, aunque no se comparta su punto de vista.",
        },
        {
          optionKey: "pqp-c4-opcion-darle-razon",
          label:
            "Aceptar que tiene razón para que la conversación no escale.",
        },
        {
          optionKey: "pqp-c4-opcion-callar",
          label:
            "Guardarse la propia opinión mientras la otra persona está alterada.",
        },
      ],
    },
    practiceSlug: "validar-o-ceder",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "7. Valida al otro",
      fingerprint: "Validar no es lo mismo que estar de acuerdo",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Validar no es dar la razón",
        body: [
          "Reconocer lo que alguien siente suele confundirse con aceptar que tiene razón. Son cosas distintas, y el capítulo las separa.",
        ],
        note: `Trabajaremos con respuestas inventadas para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "7. Valida al otro",
        body: [
          "Lee la sección sobre validar, y fíjate en la primera frase: dice explícitamente qué NO es.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Reconocer sin renunciar",
        body: [
          "Validar es decirle a alguien que lo que siente tiene sentido desde donde está. No exige compartir su interpretación, ni retirar la propia, ni aceptar lo que pide.",
          "Es una distinción útil porque hace posible acercarse sin ceder: se puede reconocer lo que el otro siente y seguir sosteniendo una postura distinta.",
        ],
        note: `${HARM_LIMIT} Validar no es una forma de acomodarse a quien hace daño, y esta guía no lo propone para eso.`,
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Validar o ceder?",
        body: [
          "Varias respuestas inventadas a una misma escena. Distingue las que reconocen lo que el otro siente de las que renuncian a la propia postura.",
        ],
        note: "Son respuestas editoriales, no las tuyas. Ninguna está prohibida: el ejercicio es notar qué hace cada una.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Reconoces la diferencia entre las veces que has reconocido lo que alguien sentía y las veces que simplemente cediste?",
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
        title: "Acercarse sin ceder",
        body: [
          "Validar reconoce lo que el otro siente y deja intacta la propia postura. No es dar la razón ni callarse.",
          "Y no es una herramienta para sostener una situación que hace daño.",
        ],
      },
    ],
  },
];

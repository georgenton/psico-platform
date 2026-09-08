/**
 * PQP-C02 — «Amenazas silenciosas en la relación».
 *
 * Chapter map (published revision #10, platform order 3): 179 blocks, 30
 * headings, 22 min. Two big models sit side by side — four patterns that erode
 * a bond, and seven principles that build one — plus the author's own story and
 * seven closing exercises.
 *
 * ── Why these five ─────────────────────────────────────────────────────────
 *
 * Eleven candidate ideas, five selected. The test each had to pass: can it be
 * understood, practised and recalled on its own?
 *
 *   · The four patterns are ONE idea with four instances, and the sharpest
 *     version of it is the distinction the chapter draws first — a complaint
 *     is about something that happened, a criticism is about who someone is.
 *     That is MG01; the other three patterns are its EXAMPLE, not three more
 *     microguides with the same shape.
 *   · Bids for connection (P3), accepting influence (P4), perpetual
 *     disagreements (P5) and the dream behind the gridlock (P6) each teach a
 *     different cognitive move, so each is its own.
 *   · Love maps (P1), fondness (P2) and shared meaning (P7) stay in reading.
 *     They are true and worth reading; they are also the most conventional of
 *     the seven, and stretching them into microguides would pad the route
 *     rather than teach anything the other five do not.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * The four patterns are presented as DESCRIPTIVE LANGUAGE for noticing what is
 * happening — never as a diagnosis of a person, never as a prognosis for a
 * relationship. The chapter cites a ratio for how many disagreements never get
 * solved; MG04 teaches the idea without repeating a figure in FeelVerse's own
 * voice, because a population statistic is not a prediction about the person
 * reading it.
 *
 * MG03 carries the load-bearing caution of this chapter: sharing influence is
 * not the same as always yielding, and it describes two people who can both say
 * no. Where someone cannot refuse safely, that is not a matter of influence and
 * the guide says so rather than implying the reader should give more ground.
 */

const SAFE_EXIT =
  "Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.";

export const CHAPTER = {
  code: "C02",
  chapterOrder: 3,
  unitKey: "9f291999-9a47-5fec-b791-0d17aa5a8c74",
  keyPrefix: "pqp-c2",
  media: { authorVideoPending: false },
  approvalReferences: [
    "PQP-C02 — Inventario editorial y selección de microguías (2026-09-08)",
  ],
};

/**
 * Dúo candidates — PRODUCT DRAFT ONLY. No runtime, no tables, no endpoints.
 * Recorded here because the design belongs next to the chapter it came from.
 */
export const DUO_CANDIDATES = [
  {
    title: "Una decisión, pensada por dos",
    from: "MG03 · Aceptar influencia no es ceder",
    purpose:
      "Tomar UNA decisión pequeña y real de forma que la opinión del otro pueda cambiarle la forma.",
    privatePreparation:
      "Cada persona escribe en privado su preferencia y, sobre todo, POR QUÉ le importa. Nadie ve lo del otro todavía.",
    visibility: "SELECTIVE_SHARE",
    revelation:
      "Privado → ambos confirman → se revelan solo las razones que cada uno marcó como compartibles.",
    conversation:
      "Turnos alternos, empezando por las razones y no por las posturas. Pausa y retirada disponibles en cualquier momento.",
    sharedOutcome: "La decisión y, si la hubo, en qué cambió respecto a lo que cada uno traía.",
    followUp: "A las dos semanas: ¿la decisión se sostuvo? mantener / ajustar / abandonar.",
    exit: "Cualquiera puede cerrar la actividad sin explicar por qué.",
    doNotSuggestWhen:
      "Cuando una de las dos personas no pueda negarse con libertad: si hay control, presión, vigilancia o miedo, esto no es un problema de influencia y la actividad podría empeorarlo.",
  },
  {
    title: "Lo que hay debajo",
    from: "MG05 · El sueño detrás del desacuerdo",
    purpose:
      "Nombrar qué le importa a cada uno debajo de un desacuerdo que vuelve, sin intentar resolverlo en esa conversación.",
    privatePreparation:
      "Cada persona escribe en privado qué valora en ese tema. El objetivo explícito NO es acordar nada hoy.",
    visibility: "SELECTIVE_SHARE",
    revelation:
      "Privado → ambos confirman → se comparte solo lo que cada uno elija.",
    conversation:
      "Una regla única: escuchar sin proponer soluciones ni rebatir. Pausa y retirada disponibles.",
    sharedOutcome:
      "Una frase por persona sobre lo que le importa. Sin acuerdo, sin plan, sin compromiso.",
    followUp: "Volver en un mes y ver si la conversación se puede sostener mejor.",
    exit: "Se puede parar en cualquier momento; lo escrito en privado no se comparte solo.",
    doNotSuggestWhen:
      "Si el desacuerdo está muy activado ahora mismo, si el tema toca una herida reciente sin acompañamiento, o ante cualquier señal de coerción, control o violencia.",
  },
];

export const MICROGUIDES = [
  {
    slug: "queja-no-es-critica",
    title: "Una queja no es una crítica",
    duration: "8–10 minutos",
    recall: {
      question: "Según el capítulo, ¿qué distingue una queja de una crítica?",
      options: [
        { optionKey: "pqp-c2-opcion-hecho-vs-caracter", label: "La queja habla de algo concreto que ocurrió; la crítica lo convierte en un rasgo de cómo es la otra persona." },
        { optionKey: "pqp-c2-opcion-tono", label: "La queja se dice con buen tono y la crítica se dice enfadado." },
        { optionKey: "pqp-c2-opcion-callar", label: "La queja es expresar una molestia y la crítica es cualquier molestia que se calla." },
      ],
    },
    practiceSlug: "sobre-el-hecho-o-sobre-la-persona",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "Primer Jinete: La Crítica",
      fingerprint: "no es simplemente expresar una molestia",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Una queja no es una crítica",
        body: [
          "Dos frases pueden decir lo mismo y hacer cosas muy distintas. El capítulo empieza por ahí: hay una diferencia entre nombrar algo que pasó y decirle a alguien cómo es.",
        ],
        note: `Trabajaremos con frases inventadas para el ejercicio, no con las tuyas. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Primer Jinete: La Crítica",
        body: [
          "Lee la sección donde el capítulo distingue la crítica de una molestia expresada, y fíjate en qué propone en su lugar.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Sobre el hecho, o sobre la persona",
        body: [
          "Una queja habla de algo concreto que ocurrió y de lo que uno necesita. Una crítica generaliza eso hasta convertirlo en un rasgo del otro: de «esto pasó» a «tú eres así».",
          "La diferencia importa porque cambian las respuestas posibles. Frente a un hecho concreto se puede hacer algo; frente a una definición de quién eres, casi solo queda defenderse.",
        ],
        note: "Es lenguaje para notar lo que ocurre, no una etiqueta para poner a nadie. Marcar esta escena registra que exploraste la idea; no evalúa tu forma de hablar ni infiere nada sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Los otros tres patrones",
        body: [
          "El capítulo describe otros tres movimientos que suelen encadenarse: defenderse en vez de recibir, el desprecio —que el autor señala como el más corrosivo— y retirarse de la conversación.",
          "Cada uno viene acompañado de una alternativa concreta. No son tipos de persona: son cosas que la gente hace, y por eso pueden cambiarse.",
        ],
        optional: true,
      },
      {
        kind: "PRACTICE",
        title: "¿Sobre el hecho o sobre la persona?",
        body: [
          "Una escena inventada y varias formas de decir lo mismo. Clasifica cada una según de qué habla realmente.",
        ],
        note: "Son frases editoriales, no las tuyas. Ninguna se marca como prohibida: el ejercicio es notar hacia dónde apunta cada una.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Recuerdas alguna vez en que quisiste señalar algo concreto y acabó sonando como un reproche general? No hace falta que escribas qué fue.",
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
        title: "Nombrar el hecho deja algo que hacer",
        body: [
          "La distinción no es de cortesía: una queja concreta abre una acción posible, y una crítica al carácter deja poco más que defenderse.",
          "Son patrones, no sentencias. Reconocerlos sirve para elegir de otra manera, no para dictaminar cómo terminará una relación.",
        ],
      },
    ],
  },
  {
    slug: "lo-pequeno-es-grande",
    title: "Lo pequeño es grande",
    duration: "8–10 minutos",
    recall: {
      question: "Según el capítulo, ¿qué papel tienen las pequeñas invitaciones a conectar?",
      options: [
        { optionKey: "pqp-c2-opcion-acumulacion", label: "Son intercambios breves y frecuentes cuya acumulación va dando forma al clima entre dos personas." },
        { optionKey: "pqp-c2-opcion-detalle-menor", label: "Son detalles agradables, pero lo que de verdad sostiene una relación son las conversaciones importantes." },
        { optionKey: "pqp-c2-opcion-cada-una-decide", label: "Cada invitación no respondida marca un daño difícil de reparar." },
      ],
    },
    practiceSlug: "una-invitacion-y-tres-respuestas",
    practiceKind: "signal_context_compare",
    anchor: {
      heading: "Principio 3: Acercarse en lugar de alejarse",
      fingerprint: "Lo pequeño se volvió poderoso",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Lo pequeño es grande",
        body: [
          "Buena parte de lo que sostiene un vínculo no ocurre en las conversaciones importantes, sino en intercambios de tres segundos que casi nadie registra.",
        ],
        note: `Trabajaremos con una escena inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Principio 3: Acercarse en lugar de alejarse",
        body: [
          "Lee la sección sobre las pequeñas invitaciones que dos personas se lanzan a lo largo del día, y qué ocurre cuando se responden o se dejan pasar.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Invitaciones que duran tres segundos",
        body: [
          "Un comentario sobre algo que se vio, una pregunta suelta, un roce al pasar: el capítulo los describe como pequeñas invitaciones a conectar. Casi nunca vienen anunciadas como tales.",
          "Responderlas o dejarlas pasar es una decisión diaria y repetida. No decide nada por sí sola; es su acumulación la que va dando forma al clima entre dos personas.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa cuántas invitaciones respondes ni infiere nada sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Una invitación, tres respuestas",
        body: [
          "La misma invitación breve en dos situaciones distintas. Observa qué podría cambiar en lo que la otra persona alcanza a entender.",
        ],
        note: "Es un caso editorial. Nada se marca como correcto o incorrecto: el ejercicio es notar que la misma respuesta no significa lo mismo en cualquier momento.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Durante el resto del día, ¿qué invitaciones pequeñas podrías notar que normalmente pasarían inadvertidas? Basta con que lo pienses.",
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
        title: "La suma, no el gesto",
        body: [
          "Ninguna invitación aislada decide nada. Lo que el capítulo sitúa en el centro es la acumulación: muchas respuestas pequeñas, repetidas.",
        ],
      },
    ],
  },
  {
    slug: "aceptar-influencia",
    title: "Aceptar influencia no es ceder",
    duration: "8–10 minutos",
    recall: {
      question: "Según el capítulo, ¿qué significa aceptar la influencia de la otra persona?",
      options: [
        { optionKey: "pqp-c2-opcion-cuenta-de-verdad", label: "Que lo que la otra persona piensa cuente de verdad en la decisión, de modo que pueda cambiar de forma." },
        { optionKey: "pqp-c2-opcion-ceder-siempre", label: "Ceder en la mayoría de las decisiones para evitar el desgaste de discutir." },
        { optionKey: "pqp-c2-opcion-turnarse", label: "Turnarse: cada uno decide sin discusión en las áreas que le corresponden." },
      ],
    },
    practiceSlug: "una-decision-tomada-entre-dos",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "Principio 4: Aceptar la influencia de tu pareja",
      fingerprint: "no era perder poder",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Aceptar influencia no es ceder",
        body: [
          "Dejar que la opinión de alguien cambie la tuya suele confundirse con perder. El capítulo propone leerlo al revés.",
        ],
        note: `Trabajaremos con una decisión inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Principio 4: Aceptar la influencia de tu pareja",
        body: [
          "Lee la sección sobre compartir el poder de decidir, y fíjate en la distinción entre aceptar influencia y renunciar a lo propio.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Dejarse afectar, sin desaparecer",
        body: [
          "Aceptar influencia es permitir que lo que el otro piensa cuente de verdad en una decisión. No es ceder siempre, y no es dejar de tener criterio: es que la decisión final pueda cambiar de forma porque hubo dos personas pensándola.",
          "Esto describe una relación entre dos personas que pueden decir que no. Cuando alguien no puede negarse sin temer las consecuencias, lo que está ocurriendo no es un problema de influencia y no se arregla cediendo más terreno.",
        ],
        note: "Esa última distinción es importante: esta guía no propone ceder ante presión, control o miedo. Marcar la escena registra que exploraste la idea; no evalúa cómo deciden ustedes.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Una decisión tomada entre dos",
        body: [
          "Ordena los pasos de una decisión inventada y fíjate en dónde entra realmente la opinión del otro.",
        ],
        note: "Es un caso editorial, no una decisión tuya.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Recuerdas alguna decisión que cambiara de forma porque otra persona la pensó contigo? Solo si te apetece recordarla.",
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
        title: "Dos criterios, una decisión",
        body: [
          "Aceptar influencia describe una decisión que pudo cambiar de forma porque la pensaron dos, no una en la que uno de los dos deja de opinar.",
          "Y solo describe eso cuando ambos pueden decir que no.",
        ],
      },
    ],
  },
  {
    slug: "desacuerdos-perpetuos",
    title: "Desacuerdos que no se resuelven",
    duration: "8–10 minutos",
    recall: {
      question: "Según el capítulo, ¿qué conviene hacer con un desacuerdo que reaparece una y otra vez?",
      options: [
        { optionKey: "pqp-c2-opcion-poder-hablarlo", label: "Cambiar el objetivo: en vez de cerrarlo, poder hablarlo sin empezar de cero cada vez." },
        { optionKey: "pqp-c2-opcion-insistir", label: "Insistir hasta encontrar la solución definitiva que todavía no han visto." },
        { optionKey: "pqp-c2-opcion-evitarlo", label: "Dejar de sacarlo, porque hablarlo solo reabre el malestar." },
      ],
    },
    practiceSlug: "resoluble-o-recurrente",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "Principio 5: Resolver los conflictos de manera efectiva",
      fingerprint: "El objetivo no es eliminar los conflictos",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Desacuerdos que no se resuelven",
        body: [
          "Hay discusiones que vuelven una y otra vez con el mismo argumento. El capítulo propone que muchas de ellas no están esperando una solución.",
        ],
        note: `Trabajaremos con desacuerdos inventados para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Principio 5: Resolver los conflictos de manera efectiva",
        body: [
          "Lee la sección sobre los desacuerdos que reaparecen, y fíjate en qué propone el capítulo como objetivo en lugar de resolverlos.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Manejar, no cerrar",
        body: [
          "Algunos desacuerdos vienen de diferencias estables entre dos personas —de temperamento, de historia, de lo que cada uno necesita— y por eso reaparecen. El capítulo sostiene que buena parte de los desacuerdos de pareja son de este tipo.",
          "Que reaparezca no significa que algo vaya mal. Cambia el objetivo: en vez de cerrarlo de una vez, se trata de poder hablarlo sin que cada conversación empiece de cero.",
        ],
        note: "«Buena parte» es todo lo que esta guía afirma: el capítulo cita una proporción, y una cifra de población no describe a ninguna pareja en particular. Marcar la escena registra que exploraste la idea.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Resoluble o recurrente?",
        body: [
          "Varios desacuerdos inventados. Distingue cuáles admiten una solución concreta y cuáles vienen de una diferencia estable que probablemente vuelva.",
        ],
        note: "Son casos editoriales. La clasificación no juzga a nadie: describe qué tipo de conversación pide cada uno.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Si piensas en un desacuerdo que vuelve, ¿qué cambiaría si el objetivo fuera poder hablarlo mejor en vez de terminarlo?",
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
        title: "Que vuelva no significa que falle",
        body: [
          "Un desacuerdo recurrente no es señal de fracaso: cambia el objetivo de la conversación, de cerrarla a poder sostenerla.",
        ],
      },
    ],
  },
  {
    slug: "sueno-detras-del-desacuerdo",
    title: "El sueño detrás del desacuerdo",
    duration: "8–10 minutos",
    recall: {
      question: "Según el capítulo, ¿qué suele haber detrás de un desacuerdo que se enquista durante años?",
      options: [
        { optionKey: "pqp-c2-opcion-algo-que-importa", label: "Algo que cada persona valora y no siempre ha dicho en voz alta: una necesidad o algo que quiere para su vida." },
        { optionKey: "pqp-c2-opcion-falta-de-tecnica", label: "Falta de técnica para negociar: con el método adecuado se resolvería." },
        { optionKey: "pqp-c2-opcion-incompatibilidad", label: "Una incompatibilidad de fondo que indica que la relación no encaja." },
      ],
    },
    practiceSlug: "lo-que-hay-debajo",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "Principio 6: Superar los obstáculos",
      fingerprint: "más allá del problema aparente",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "El sueño detrás del desacuerdo",
        body: [
          "Cuando una discusión se atasca durante años, el capítulo sugiere que el tema del que se habla rara vez es el tema.",
        ],
        note: `Trabajaremos con un caso inventado para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Principio 6: Superar los obstáculos",
        body: [
          "Lee la sección sobre los desacuerdos que se enquistan, y fíjate en qué aparece cuando se mira debajo del problema aparente.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Debajo de la postura, algo que importa",
        body: [
          "Detrás de una posición sostenida con fuerza suele haber algo que la persona valora y que no siempre ha dicho en voz alta: una necesidad, una historia, algo que quiere para su vida.",
          "Nombrar eso no resuelve el desacuerdo, y el capítulo no promete que lo haga. Cambia de qué se está hablando, que suele ser la condición para poder avanzar.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no interpreta tus desacuerdos ni te atribuye ningún motivo oculto.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Lo que hay debajo",
        body: [
          "Ordena los pasos de un caso inventado, desde la discusión repetida hasta lo que aparece cuando se pregunta por lo que hay detrás.",
        ],
        note: "Es un caso editorial, no tu historia.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Si hay un desacuerdo que vuelve, ¿qué te importa a ti en él que quizá no hayas dicho todavía? Solo para pensarlo.",
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
        title: "Cambiar la pregunta",
        body: [
          "Preguntar qué hay debajo de una postura no cierra el desacuerdo; cambia la conversación, y eso suele ser lo que estaba bloqueado.",
        ],
      },
    ],
  },
];

/**
 * PQP-C08 — «Gestos que transforman: el poder de las manifestaciones de afecto
 * en el amor».
 *
 * Chapter map (published revision #10, platform order 9): 125 blocks, 16
 * headings, 0 duplicated, 24 min. The book's last chapter, and the unit that
 * also carries the back matter — epilogue, about the author, the author's
 * message and the bibliography all live after block 73. The guided route is
 * built only from the chapter body.
 *
 * Dense chapter, five routes: the five love languages, learning the other's,
 * what acceptance does and does not cover, affection as something done rather
 * than only felt, and Sternberg's triangle. The rules allow up to seven here;
 * the remaining material is a personal account, a conclusion, two activities
 * and the back matter, and none of them carries a sixth defensible idea.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * `FRAMEWORKS_ARE_NOT_TAXONOMIES`. Two of the five routes rest on named models,
 * and both are presented as what they are.
 *
 * Chapman's five languages are a POPULAR FRAMEWORK about preferences — not a
 * validated taxonomy, not a diagnosis, and not a fixed identity. MG01 says so
 * out loud, and its practice sorts invented GESTURES rather than people, with
 * no answer key. Nothing in this route invites anyone to decide what they «are»
 * or to assign their partner a type; the chapter's own examples show people
 * whose expression and preference differ, and the copy keeps that door open.
 *
 * Sternberg's triangle is a `THEORETICAL_MODEL` — a way of describing love, not
 * a measurement of one. MG05 names it as a proposal from 1986, its practice
 * classifies invented DESCRIPTIONS rather than diagnosing relationships, and
 * nothing in it treats a combination of vertices as a verdict or a prognosis.
 *
 * MG04's anchor section opens with claims about neurobiology and what the brain
 * does. The book says what it says and is not touched; the DERIVED copy does
 * not repeat mechanism claims — no hormones, no percentages, no «el cerebro
 * hace». What MG04 carries is the behavioural claim the chapter makes right
 * after: loving is also acting, and being present is not the same as being
 * there.
 *
 * MG03 exists partly as a guard. «Aceptación incondicional» is the phrase in
 * this chapter most easily read as «put up with anything», and the book itself
 * refuses that reading — «No es resignarse ni tolerar todo». After C07, this is
 * the right note to land: accepting who someone is never means accepting being
 * harmed.
 */

const SAFE_EXIT =
  "Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.";

export const CHAPTER = {
  code: "C08",
  chapterOrder: 9,
  unitKey: "2220570a-826b-5a90-99be-b8dbe28cf540",
  keyPrefix: "pqp-c8",
  media: { authorVideoPending: false },
  approvalReferences: [
    "PQP-C08 — Inventario editorial y selección de microguías (2026-09-08)",
  ],
};

/** Dúo candidates — PRODUCT DRAFT ONLY. No runtime, no tables, no endpoints. */
export const DUO_CANDIDATES = [
  {
    title: "¿Qué gesto te llega más?",
    from: "MG02 · Aprender el idioma del otro",
    purpose:
      "Que cada uno diga qué gestos le llegan, en lugar de suponerlo por el otro.",
    privatePreparation:
      "Cada persona elige en privado dos o tres gestos de una lista editorial.",
    visibility: "SELECTIVE_SHARE",
    revelation:
      "Privado → ambos confirman → se comparte solo lo que cada uno elija.",
    conversation:
      "Corta y en un momento tranquilo. Pausa y retirada disponibles en cualquier punto.",
    sharedOutcome:
      "Cada uno sabe algo que al otro le llega. Sin listas de tareas ni promesas.",
    followUp: "Ninguno obligatorio.",
    exit: "Cualquiera puede cerrar la actividad sin explicar por qué.",
    doNotSuggestWhen:
      "Si uno de los dos no puede decir que no sin consecuencias — en ese caso lo que hace falta no es una lista de gestos. Ver C07.",
  },
];

export const MICROGUIDES = [
  {
    slug: "cinco-lenguajes-como-mapa",
    title: "Un mapa de preferencias, no una etiqueta",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué describen los cinco lenguajes del amor de Chapman?",
      options: [
        {
          optionKey: "pqp-c8-opcion-formas-de-dar-y-recibir",
          label:
            "Cinco formas principales en que las personas dan y reciben amor, para entender qué le llega a cada quien.",
        },
        {
          optionKey: "pqp-c8-opcion-tipos-de-persona",
          label:
            "Cinco tipos de persona, de modo que cada uno pertenece a uno y no cambia con el tiempo.",
        },
        {
          optionKey: "pqp-c8-opcion-test-de-compatibilidad",
          label:
            "Una prueba validada que permite medir cuánta compatibilidad hay entre dos personas.",
        },
      ],
    },
    practiceSlug: "que-idioma-habla-cada-gesto",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "Los cinco lenguajes del amor",
      fingerprint: "cinco formas principales en que las personas dan y reciben amor",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Un mapa de preferencias, no una etiqueta",
        body: [
          "Palabras, tiempo, detalles, actos y contacto. El capítulo los usa como mapa; esta guía se detiene en para qué sirve un mapa y para qué no.",
        ],
        note: `Trabajaremos con gestos inventados para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Los cinco lenguajes del amor",
        body: [
          "Lee la sección donde el capítulo describe los cinco, con los ejemplos que da de cada uno.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Cinco formas, no cinco tipos de persona",
        body: [
          "El capítulo recoge la propuesta de Gary Chapman: cinco formas principales en que las personas dan y reciben amor —palabras de afirmación, tiempo de calidad, detalles y regalos, actos de servicio y contacto físico.",
          "Conviene decir qué clase de herramienta es. Es un marco divulgativo sobre preferencias, muy útil para nombrar lo que a cada quien le llega, y no una clasificación validada ni un diagnóstico. Nadie «es» un lenguaje: las preferencias conviven, cambian con el tiempo y no encasillan a nadie.",
        ],
        note: "Marcar esta escena registra que exploraste la idea. No te asigna un lenguaje, no clasifica a nadie y no mide compatibilidad.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Qué idioma habla cada gesto?",
        body: [
          "Cinco gestos inventados. Reconoce cuál de los cinco lenguajes habla cada uno.",
        ],
        note: "Se clasifican gestos, no personas. No hay respuesta correcta ni puntaje: un mismo gesto puede hablar más de un idioma, y eso también es información.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Cuál de esas cinco formas te llega más a ti? Y si te llegan varias, también está bien.",
        ],
        note: "Privado y opcional. No se guarda, no te asigna ningún perfil y no viaja con tu progreso.",
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
        title: "Un vocabulario, no una casilla",
        body: [
          "Los cinco lenguajes sirven para poner nombre a lo que a cada quien le llega. Sirven menos como etiqueta, y nadie está obligado a caber en una.",
        ],
      },
    ],
  },
  {
    slug: "aprender-el-idioma-del-otro",
    title: "Aprender el idioma del otro",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿por qué no basta con expresar afecto a la manera de uno?",
      options: [
        {
          optionKey: "pqp-c8-opcion-puede-no-llegar",
          label:
            "Porque lo que a uno le sale naturalmente puede no ser lo que al otro le llega, y entonces el gesto se pierde por el camino.",
        },
        {
          optionKey: "pqp-c8-opcion-hay-que-renunciar",
          label:
            "Porque hay que renunciar a la forma propia de expresarse y adoptar por completo la del otro.",
        },
        {
          optionKey: "pqp-c8-opcion-esfuerzo-basta",
          label:
            "Porque lo que cuenta es el esfuerzo, y el otro debería reconocerlo sea cual sea la forma.",
        },
      ],
    },
    practiceSlug: "el-mismo-gesto-en-dos-manos",
    practiceKind: "signal_context_compare",
    anchor: {
      heading: "Aprender el lenguaje del otro: un puente de ida y vuelta",
      fingerprint: "bilingües emocionales",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Aprender el idioma del otro",
        body: [
          "El capítulo dice algo incómodo y útil: no basta con decir «así soy yo» y esperar que el otro traduzca.",
        ],
        note: `Trabajaremos con una escena inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Aprender el lenguaje del otro: un puente de ida y vuelta",
        body: [
          "Lee esa sección y fíjate en la imagen que propone: ser bilingües emocionales.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Lo que sale fácil y lo que llega",
        body: [
          "El capítulo describe dos pasos: conocer qué necesita uno para sentirse querido, y aprender a expresarlo en la forma en que al otro le llega. Un gesto dado en el idioma propio puede ser sincero y aun así no aterrizar.",
          "Y aclara qué no es esto: no se trata de anular quién eres ni de renunciar a tu forma. La imagen que usa es la de dos personas que hablan su idioma, entienden el del otro y arman algo entre los dos.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa tu relación. Y esto describe a dos personas que quieren acercarse — no es una tarea que le corresponda a uno solo.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "El mismo gesto en dos manos",
        body: [
          "El mismo gesto de una pareja inventada, recibido por dos personas distintas. Observa qué cambia.",
        ],
        note: "Es un caso editorial. Nada se marca como correcto: ningún gesto es mejor que otro, y el ejercicio solo pregunta qué haría falta saber.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Qué gesto de otra persona te ha hecho sentir visto últimamente? Basta con recordarlo.",
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
        title: "Ida y vuelta",
        body: [
          "Hablar el idioma del otro no es dejar de hablar el propio. Es que el gesto llegue a donde iba.",
        ],
      },
    ],
  },
  {
    slug: "aceptar-no-es-aguantar",
    title: "Aceptar no es aguantar",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué NO significa la aceptación incondicional?",
      options: [
        {
          optionKey: "pqp-c8-opcion-no-es-resignarse",
          label:
            "No significa resignarse ni tolerarlo todo: es reconocer que nadie es perfecto, sin pretender moldear al otro a la propia medida.",
        },
        {
          optionKey: "pqp-c8-opcion-aceptar-todo",
          label:
            "Significa aceptar cualquier conducta, porque quien ama de verdad no pone condiciones.",
        },
        {
          optionKey: "pqp-c8-opcion-callar-molestias",
          label:
            "Significa guardarse las molestias para no desgastar la relación con reclamos.",
        },
      ],
    },
    practiceSlug: "lo-que-la-aceptacion-cubre",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "Otras formas esenciales de afecto",
      fingerprint: "No es resignarse ni tolerar todo",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Aceptar no es aguantar",
        body: [
          "«Aceptación incondicional» es de las frases que más fácil se malinterpretan. El capítulo se adelanta a eso.",
        ],
        note: `Trabajaremos con escenas inventadas para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Otras formas esenciales de afecto",
        body: [
          "Lee esa sección y en particular el párrafo sobre la aceptación incondicional.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Dos cosas que se parecen y no lo son",
        body: [
          "El capítulo describe la aceptación incondicional como amar al otro con sus luces y sombras: reconocer que nadie es perfecto y no pretender moldear a la otra persona a la propia medida.",
          "Y añade, con todas las letras, lo que no es: «No es resignarse ni tolerar todo». Aceptar quién es alguien no es lo mismo que aceptar lo que hace. Si algo te hace daño, seguir queriendo a esa persona no te obliga a soportarlo.",
        ],
        note: "Marcar esta escena registra que exploraste la idea. Si lo que hay que aguantar incluye miedo, desprecio o control, eso ya no es una cuestión de aceptación: el capítulo anterior habla de ello.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Lo que la aceptación cubre",
        body: [
          "Cuatro escenas inventadas. Distingue lo que describe una forma de ser de lo que describe un daño.",
        ],
        note: "Son casos editoriales, no tu vida. Nada se marca como correcto: el ejercicio solo separa dos cosas que la misma palabra suele juntar.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Hay algo que has llamado «aceptar» y que quizá se parezca más a aguantar? No hace falta decidir nada hoy.",
        ],
        note: "Privado, opcional y saltable entero. No se guarda, no se interpreta y no viaja con tu progreso.",
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
        title: "Con luces y sombras",
        body: [
          "Aceptar es dejar de querer moldear a alguien. No es una obligación de soportar lo que duele.",
        ],
      },
    ],
  },
  {
    slug: "amar-tambien-es-actuar",
    title: "No basta con estar",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿por qué no basta con sentir el amor sin demostrarlo?",
      options: [
        {
          optionKey: "pqp-c8-opcion-puede-sentirse-sola",
          label:
            "Porque se puede querer profundamente a alguien y, si no se le demuestra, esa persona puede sentirse sola o poco valorada.",
        },
        {
          optionKey: "pqp-c8-opcion-el-sentimiento-desaparece",
          label:
            "Porque el sentimiento se va apagando hasta desaparecer si no se expresa.",
        },
        {
          optionKey: "pqp-c8-opcion-permanecer-basta",
          label:
            "Porque permanecer y cumplir con lo práctico ya es, en sí mismo, la mejor demostración.",
        },
      ],
    },
    practiceSlug: "del-sentir-al-gesto-que-llega",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "¿Por qué es tan importante el afecto?",
      fingerprint: "no basta solo con estar",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "No basta con estar",
        body: [
          "«Pero si ya sabe que la amo». El capítulo recoge esa frase de terapia y le responde.",
        ],
        note: `Trabajaremos con un caso inventado para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "¿Por qué es tan importante el afecto?",
        body: [
          "Lee esa sección completa, incluidos los párrafos donde el autor responde a «yo sigo aquí, ¿acaso eso no basta?».",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Sentirlo y que se note",
        body: [
          "El capítulo sostiene que amar no es solo sentir, sino también actuar: se puede querer mucho a alguien y, si no se le demuestra, esa persona puede sentirse sola o poco valorada aunque el afecto siga intacto.",
          "De ahí su respuesta a «yo sigo aquí»: no basta solo con estar. La permanencia física y la presencia son cosas distintas, y lo que sostiene el vínculo día a día es la segunda.",
        ],
        note: "Marcar esta escena registra que exploraste la idea. Y esto no significa que quien no lo expresa quiera menos: el capítulo distingue lo que se siente de lo que llega.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Del sentir al gesto que llega",
        body: [
          "Ordena los pasos de un caso inventado, desde lo que alguien siente hasta que la otra persona lo nota.",
        ],
        note: "Es un caso editorial, no tu relación. Ordenarlo no es una receta: no existe una secuencia obligatoria para querer a alguien.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Hay algo que sientes por alguien y que hace tiempo no dices en voz alta? Basta con pensarlo.",
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
        title: "Que se note",
        body: [
          "Sentirlo y demostrarlo no son lo mismo. El capítulo insiste en lo segundo porque es lo único que la otra persona puede ver.",
        ],
      },
    ],
  },
  {
    slug: "triangulo-de-sternberg",
    title: "Tres vértices para describir el amor",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué tres elementos componen el triángulo del amor propuesto por Sternberg?",
      options: [
        {
          optionKey: "pqp-c8-opcion-pasion-intimidad-compromiso",
          label: "Pasión, intimidad y compromiso.",
        },
        {
          optionKey: "pqp-c8-opcion-confianza-respeto-comunicacion",
          label: "Confianza, respeto y comunicación.",
        },
        {
          optionKey: "pqp-c8-opcion-atraccion-costumbre-proyecto",
          label: "Atracción, costumbre y proyecto compartido.",
        },
      ],
    },
    practiceSlug: "que-vertice-sostiene-la-escena",
    practiceKind: "context_plausibility",
    anchor: {
      heading:
        "El triángulo del amor de Sternberg: una clave para comprender el afecto",
      fingerprint: "pasión, intimidad y compromiso",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Tres vértices para describir el amor",
        body: [
          "El capítulo cierra con un modelo clásico. Vale la pena saber qué es un modelo antes de usarlo.",
        ],
        note: `Trabajaremos con descripciones inventadas para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "El triángulo del amor de Sternberg",
        body: [
          "Lee la sección final del capítulo, donde describe los tres vértices y qué ocurre cuando uno solo sostiene la relación.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Un modelo, no una medida",
        body: [
          "El capítulo recoge el modelo que Robert Sternberg propuso en 1986: describir el amor como un triángulo de tres componentes —pasión, intimidad y compromiso— y observar que una relación sostenida por uno solo tiende a quedarse corta.",
          "Es un modelo teórico: una manera de describir y conversar sobre el amor, no un instrumento que mida el de nadie. No hay una combinación correcta de los tres, ni un reparto que prediga cómo terminará una relación.",
        ],
        note: "Marcar esta escena registra que exploraste la idea. El modelo describe; no puntúa relaciones ni anticipa lo que va a pasar con la tuya.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Qué vértice sostiene la escena?",
        body: [
          "Tres descripciones inventadas de tres parejas. Reconoce qué vértice describe cada una.",
        ],
        note: "Se clasifican descripciones, no relaciones. No hay respuesta correcta ni puntaje, y ninguna combinación es mejor ni predice nada.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "De esos tres, ¿cuál te resulta hoy más fácil de reconocer en tu vida? No hace falta que sean los tres.",
        ],
        note: "Privado y opcional. No se guarda, no se puntúa y no viaja con tu progreso.",
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
        title: "Para describir, no para calificar",
        body: [
          "Los tres vértices son un vocabulario para hablar del amor. Sirven para nombrar lo que hay, no para calificar lo que falta.",
        ],
      },
    ],
  },
];

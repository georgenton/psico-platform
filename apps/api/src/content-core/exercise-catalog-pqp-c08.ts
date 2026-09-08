import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * PQP-C08 — the five practice/recall pairs behind the chapter's guided route.
 *
 * `correctOptionKey` lives ONLY here; `order` is globally unique inside the
 * book (pilot 1–2, C01 3–10, C02 11–20, C03 21–28, C04 29–36, C05 37–44,
 * C06 45–50, C07 51–58, so this runs 59–68); and every `sourceHeading` is
 * verbatim from the printed edition, measured against published revision #10
 * as present exactly once.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * `FRAMEWORKS_ARE_NOT_TAXONOMIES`. Two pairs rest on named models and both
 * refuse to be used as instruments.
 *
 * `que-idioma-habla-cada-gesto` sorts GESTURES, never people, and its prompt
 * says that a gesture can speak more than one language. Its recall marks as
 * wrong the two readings the chapter does not support: that the five are types
 * of person nobody moves between, and that they measure compatibility. Chapman
 * is a popular framework about preferences — not a validated taxonomy, not a
 * diagnosis, not an identity — and nothing here assigns anyone a language.
 *
 * `que-vertice-sostiene-la-escena` classifies invented DESCRIPTIONS, and its
 * prompt states that no combination of vertices is better than another or
 * predicts anything. Sternberg's triangle is a `THEORETICAL_MODEL` from 1986:
 * a vocabulary for describing love, not a measurement of it.
 *
 * `lo-que-la-aceptacion-cubre` is the chapter's guard, and it is the reason
 * MG03 exists. «Aceptación incondicional» is the phrase here most easily read
 * as «put up with anything»; the book refuses that reading itself, and this
 * practice keeps «a way of being» and «something that harms» in separate piles.
 * Its prompt points at C07 rather than trying to handle that material here.
 *
 * MG04's anchor section opens with claims about neurobiology. The canonical
 * text is untouched and the reader reads it; what this file carries is the
 * behavioural claim the chapter makes right after — loving is also acting.
 * No mechanism claims appear in any derived copy.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 8 is unit 9; unit 1 is the front matter. */
const CHAPTER = 9;

export const EXERCISE_CATALOG_PQP_C08: readonly UnitExerciseDefinitions[] = [
  // ── MG01 · Un mapa de preferencias, no una etiqueta ──────────────────────
  {
    practice: {
      exerciseKey: "pqp-c8-practice-que-idioma-habla-cada-gesto",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 59,
      type: "REFLECTION",
      title: "¿Qué idioma habla cada gesto?",
      sourceHeading: "Los cinco lenguajes del amor",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cinco gestos inventados para este ejercicio, de cinco personas distintas.",
        observation: "En los cinco alguien quiso mostrar afecto.",
        availableContext: [
          "El capítulo describe cinco formas de dar y recibir amor.",
          "Un mismo gesto puede hablar más de una de ellas.",
        ],
        readings: [
          {
            key: "guardo-el-recorte",
            label:
              "Guardó un recorte de una exposición que sabía que a la otra persona le interesaba, y se lo dio semanas después.",
          },
          {
            key: "apago-el-telefono",
            label:
              "Apagó el teléfono y se sentó a escuchar una hora, sin resolver nada ni proponer nada.",
          },
          {
            key: "dijo-que-le-admira",
            label:
              "Le dijo que admira cómo sostuvo una situación difícil en el trabajo.",
          },
          {
            key: "resolvio-el-tramite",
            label:
              "Se encargó de un trámite pendiente que no le tocaba, para quitarle ese peso.",
          },
          {
            key: "mano-en-el-hombro",
            label:
              "Le puso la mano en el hombro al pasar por la cocina, sin decir nada.",
          },
        ],
        buckets: [
          { key: "palabras", label: "Palabras de afirmación" },
          { key: "tiempo", label: "Tiempo de calidad" },
          { key: "detalles", label: "Detalles y regalos" },
          { key: "servicio", label: "Actos de servicio" },
          { key: "contacto", label: "Contacto físico" },
        ],
        missingInformationPrompt:
          "Se clasifican gestos, no personas. No hay respuesta correcta ni puntaje: un mismo gesto puede hablar más de un idioma, y notar eso es parte del ejercicio. Los cinco lenguajes son un marco divulgativo sobre preferencias — no una clasificación validada, ni un diagnóstico, ni un tipo al que alguien pertenezca.",
      },
    },
    recall: {
      exerciseKey: "pqp-c8-recall-cinco-lenguajes-como-mapa",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 60,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué describen los cinco lenguajes del amor de Chapman?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c8-cinco-lenguajes-como-mapa",
        options: [
          {
            key: "pqp-c8-opcion-formas-de-dar-y-recibir",
            label:
              "Cinco formas principales en que las personas dan y reciben amor, para entender qué le llega a cada quien.",
          },
          {
            key: "pqp-c8-opcion-tipos-de-persona",
            label:
              "Cinco tipos de persona, de modo que cada uno pertenece a uno y no cambia con el tiempo.",
          },
          {
            key: "pqp-c8-opcion-test-de-compatibilidad",
            label:
              "Una prueba validada que permite medir cuánta compatibilidad hay entre dos personas.",
          },
        ],
        correctOptionKey: "pqp-c8-opcion-formas-de-dar-y-recibir",
      },
      feedback: {
        correct:
          "Eso describen: formas de dar y recibir. Es un marco para nombrar preferencias, no una clasificación de personas ni una medida de compatibilidad.",
        review:
          "Vuelve a esa sección. El capítulo describe formas de dar y recibir amor — no tipos fijos de persona ni una prueba que mida compatibilidad.",
      },
    },
  },

  // ── MG02 · Aprender el idioma del otro ───────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c8-practice-el-mismo-gesto-en-dos-manos",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 61,
      type: "REFLECTION",
      title: "El mismo gesto en dos manos",
      sourceHeading: "Aprender el lenguaje del otro: un puente de ida y vuelta",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Una persona inventada llega a casa con un regalo pensado y bien elegido.",
          "Lo eligió con tiempo y le hizo ilusión encontrarlo.",
          "Lo entrega apenas entra, entre dos cosas pendientes.",
        ],
        contexts: [
          {
            key: "recibe-detalles",
            label: "Quien lo recibe se conmueve con los detalles",
            description:
              "Guarda las notas y los objetos pequeños que le han regalado a lo largo de los años.",
          },
          {
            key: "recibe-tiempo",
            label: "Quien lo recibe echa de menos tiempo juntos",
            description: "Lleva semanas diciendo que casi no se ven sin prisa.",
          },
        ],
        factors: [
          {
            key: "que-pidio",
            label: "Qué venía pidiendo la otra persona últimamente.",
          },
          {
            key: "como-se-entrega",
            label: "Si el gesto viene con un rato de atención o sin él.",
          },
          {
            key: "se-lo-dijeron",
            label: "Si alguna vez se hablaron de qué le llega a cada uno.",
          },
          {
            key: "es-el-unico",
            label: "Si es el único idioma que se usa o uno entre varios.",
          },
        ],
        prompt:
          "El gesto es idéntico y la intención también. ¿Qué podría cambiar en lo que deja? Ningún idioma es mejor que otro, y nada aquí se marca como correcto.",
      },
    },
    recall: {
      exerciseKey: "pqp-c8-recall-aprender-el-idioma-del-otro",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 62,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿por qué no basta con expresar afecto a la manera de uno?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c8-aprender-el-idioma-del-otro",
        options: [
          {
            key: "pqp-c8-opcion-puede-no-llegar",
            label:
              "Porque lo que a uno le sale naturalmente puede no ser lo que al otro le llega, y entonces el gesto se pierde por el camino.",
          },
          {
            key: "pqp-c8-opcion-hay-que-renunciar",
            label:
              "Porque hay que renunciar a la forma propia de expresarse y adoptar por completo la del otro.",
          },
          {
            key: "pqp-c8-opcion-esfuerzo-basta",
            label:
              "Porque lo que cuenta es el esfuerzo, y el otro debería reconocerlo sea cual sea la forma.",
          },
        ],
        correctOptionKey: "pqp-c8-opcion-puede-no-llegar",
      },
      feedback: {
        correct:
          "Eso señala el capítulo. Y aclara que aprender el idioma del otro no significa anular quién eres ni dejar de hablar el propio.",
        review:
          "Relee esa sección. No propone renunciar a tu forma de expresarte, ni que el esfuerzo baste por sí solo: describe un puente de ida y vuelta.",
      },
    },
  },

  // ── MG03 · Aceptar no es aguantar ────────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c8-practice-lo-que-la-aceptacion-cubre",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 63,
      type: "REFLECTION",
      title: "Lo que la aceptación cubre",
      sourceHeading: "Otras formas esenciales de afecto",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cuatro escenas inventadas para este ejercicio, de cuatro parejas distintas.",
        observation:
          "En las cuatro hay algo que a uno de los dos le cuesta de la otra persona.",
        availableContext: [
          "El capítulo describe la aceptación como amar al otro con sus luces y sombras.",
          "Y dice, con esas palabras, que no es resignarse ni tolerar todo.",
        ],
        readings: [
          {
            key: "desordenado",
            label:
              "Uno es desordenado y probablemente lo seguirá siendo; al otro le irrita y lo sabe.",
          },
          {
            key: "ridiculiza-en-publico",
            label:
              "Uno ridiculiza al otro delante de conocidos cada vez que salen.",
          },
          {
            key: "callado",
            label:
              "Uno tarda días en poner en palabras lo que le pasa; siempre ha sido así.",
          },
          {
            key: "castigo-de-silencio",
            label:
              "Cada vez que uno plantea algo incómodo, siguen dos semanas de frialdad.",
          },
        ],
        buckets: [
          { key: "forma-de-ser", label: "Describe una forma de ser" },
          { key: "dano", label: "Describe algo que hace daño" },
        ],
        missingInformationPrompt:
          "Son casos editoriales, no tu vida, y nada se marca como correcto. La diferencia que separa las dos columnas es simple: aceptar quién es alguien no obliga a aceptar lo que hace. Y si lo que habría que aguantar incluye miedo, desprecio o control, eso no se resuelve aceptando — el capítulo anterior habla de ello.",
      },
    },
    recall: {
      exerciseKey: "pqp-c8-recall-aceptar-no-es-aguantar",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 64,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué NO significa la aceptación incondicional?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c8-aceptar-no-es-aguantar",
        options: [
          {
            key: "pqp-c8-opcion-no-es-resignarse",
            label:
              "No significa resignarse ni tolerarlo todo: es reconocer que nadie es perfecto, sin pretender moldear al otro a la propia medida.",
          },
          {
            key: "pqp-c8-opcion-aceptar-todo",
            label:
              "Significa aceptar cualquier conducta, porque quien ama de verdad no pone condiciones.",
          },
          {
            key: "pqp-c8-opcion-callar-molestias",
            label:
              "Significa guardarse las molestias para no desgastar la relación con reclamos.",
          },
        ],
        correctOptionKey: "pqp-c8-opcion-no-es-resignarse",
      },
      feedback: {
        correct:
          "El capítulo lo dice con esas palabras: no es resignarse ni tolerar todo. Aceptar quién es alguien no obliga a aceptar lo que hace.",
        review:
          "Vuelve a ese párrafo. «Incondicional» se refiere a querer a la persona con sus imperfecciones — no a aceptar cualquier conducta ni a callarse lo que duele.",
      },
    },
  },

  // ── MG04 · No basta con estar ────────────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c8-practice-del-sentir-al-gesto-que-llega",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 65,
      type: "REFLECTION",
      title: "Del sentir al gesto que llega",
      sourceHeading: "¿Por qué es tan importante el afecto?",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio, Nuria y Beltrán. Él la quiere y da por hecho que ella lo sabe. Ordena los pasos hasta que ella lo nota.",
        cards: [
          {
            key: "lo-siente",
            label:
              "Él siente el afecto de siempre y asume que con estar y cumplir es suficiente.",
          },
          {
            key: "ella-lo-dice",
            label:
              "Ella dice que se siente sola, y no está hablando de que él se haya ido.",
          },
          {
            key: "pregunta-que-le-llega",
            label:
              "Él pregunta qué le llega a ella, en vez de repetir lo que a él le saldría.",
          },
          {
            key: "gesto-concreto",
            label:
              "Aparece algo concreto y sostenido en el tiempo, no un gesto grande de una sola vez.",
          },
        ],
        solved: [
          "lo-siente",
          "ella-lo-dice",
          "pregunta-que-le-llega",
          "gesto-concreto",
        ],
        solvedLabel: "Un orden posible",
        feedback:
          "No hay una secuencia obligatoria para querer a alguien, y esto no es una receta. Lo que el capítulo subraya es el tercer paso: preguntar qué le llega al otro suele ahorrar años de gestos que no aterrizan.",
      },
    },
    recall: {
      exerciseKey: "pqp-c8-recall-amar-tambien-es-actuar",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 66,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿por qué no basta con sentir el amor sin demostrarlo?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c8-amar-tambien-es-actuar",
        options: [
          {
            key: "pqp-c8-opcion-puede-sentirse-sola",
            label:
              "Porque se puede querer profundamente a alguien y, si no se le demuestra, esa persona puede sentirse sola o poco valorada.",
          },
          {
            key: "pqp-c8-opcion-el-sentimiento-desaparece",
            label:
              "Porque el sentimiento se va apagando hasta desaparecer si no se expresa.",
          },
          {
            key: "pqp-c8-opcion-permanecer-basta",
            label:
              "Porque permanecer y cumplir con lo práctico ya es, en sí mismo, la mejor demostración.",
          },
        ],
        correctOptionKey: "pqp-c8-opcion-puede-sentirse-sola",
      },
      feedback: {
        correct:
          "Eso dice el capítulo, y la distinción importa: el afecto puede seguir intacto y aun así no llegar. Por eso responde que no basta solo con estar.",
        review:
          "Relee esa sección. El capítulo no dice que el sentimiento desaparezca, ni que permanecer baste: dice que quien no lo recibe puede sentirse solo aunque el otro siga queriéndolo.",
      },
    },
  },

  // ── MG05 · Tres vértices para describir el amor ──────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c8-practice-que-vertice-sostiene-la-escena",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 67,
      type: "REFLECTION",
      title: "¿Qué vértice sostiene la escena?",
      sourceHeading:
        "El triángulo del amor de Sternberg: una clave para comprender el afecto",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Tres descripciones inventadas para este ejercicio, de tres parejas distintas.",
        observation:
          "En las tres hay algo que claramente sostiene la relación y algo que se menciona poco.",
        availableContext: [
          "El modelo describe tres componentes: pasión, intimidad y compromiso.",
          "Describir no es medir: ninguna combinación es la correcta.",
        ],
        readings: [
          {
            key: "confidencias",
            label:
              "Se cuentan casi todo y cada uno sabe qué le preocupa al otro esta semana.",
          },
          {
            key: "siguen-ahi",
            label:
              "Llevan años sosteniendo lo acordado y ninguno se plantea marcharse.",
          },
          {
            key: "atraccion",
            label: "Se buscan, se desean y les cuesta despegarse.",
          },
        ],
        buckets: [
          { key: "pasion", label: "Pasión" },
          { key: "intimidad", label: "Intimidad" },
          { key: "compromiso", label: "Compromiso" },
        ],
        missingInformationPrompt:
          "Se clasifican descripciones inventadas, no relaciones. El triángulo es un modelo teórico propuesto en 1986: un vocabulario para hablar del amor, no un instrumento que mida el de nadie. Ninguna combinación de vértices es mejor que otra ni predice cómo termina una historia.",
      },
    },
    recall: {
      exerciseKey: "pqp-c8-recall-triangulo-de-sternberg",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 68,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué tres elementos componen el triángulo del amor propuesto por Sternberg?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c8-triangulo-de-sternberg",
        options: [
          {
            key: "pqp-c8-opcion-pasion-intimidad-compromiso",
            label: "Pasión, intimidad y compromiso.",
          },
          {
            key: "pqp-c8-opcion-confianza-respeto-comunicacion",
            label: "Confianza, respeto y comunicación.",
          },
          {
            key: "pqp-c8-opcion-atraccion-costumbre-proyecto",
            label: "Atracción, costumbre y proyecto compartido.",
          },
        ],
        correctOptionKey: "pqp-c8-opcion-pasion-intimidad-compromiso",
      },
      feedback: {
        correct:
          "Esos tres. Y conviene recordar qué es: un modelo para describir el amor, no una medida de ninguna relación.",
        review:
          "Vuelve al cierre del capítulo. El modelo de Sternberg describe pasión, intimidad y compromiso; los otros elementos son valiosos pero no son los vértices de este triángulo.",
      },
    },
  },
];

import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * PQP-C03 — the four practice/recall pairs behind the chapter's guided route.
 *
 * Same rules as the other chapters': `correctOptionKey` lives ONLY here;
 * `order` is globally unique inside the book (pilot 1–2, C01 3–10, C02 11–20,
 * so this runs 21–28); and every `sourceHeading` is verbatim from the printed
 * edition, measured against published revision #10 as present exactly once.
 *
 * ── Safety of this chapter in particular ──────────────────────────────────
 *
 * `COMMITMENT_IS_NOT_UNCONDITIONAL_PERMANENCE`. The chapter has a section named
 * «Apoyo incondicional», and a derived layer must not let that be read as «stay
 * whatever happens». MG01's recall makes the distinction load-bearing rather
 * than decorative: its most tempting distractor is exactly the equation of
 * commitment with staying no matter what, and the REVIEW copy names why that is
 * not what the chapter describes.
 *
 * `eleccion-o-inercia` deliberately classifies SITUATIONS, never people, and
 * its feedback says out loud that a relationship continuing is not evidence of
 * anything by itself. No item asks a reader to judge whether their own
 * relationship is committed enough.
 *
 * `diferencia-o-desacuerdo` carries the second caution: accepting a difference
 * of character is not the same as accepting any behaviour, so respecting
 * someone stays compatible with objecting to what they do.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 3 is unit 4; unit 1 is the front matter. */
const CHAPTER = 4;

export const EXERCISE_CATALOG_PQP_C03: readonly UnitExerciseDefinitions[] = [
  // ── MG01 · Elegir, no solo permanecer ────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c3-practice-eleccion-o-inercia",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 21,
      type: "REFLECTION",
      title: "¿Elección o inercia?",
      sourceHeading: "El verdadero significado del compromiso",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cuatro parejas inventadas para este ejercicio. Todas llevan años juntas.",
        observation: "En los cuatro casos la relación continúa.",
        availableContext: [
          "Llevar tiempo juntos no dice, por sí solo, qué sostiene la relación.",
          "En los cuatro casos las dos personas pueden hablar con libertad.",
        ],
        readings: [
          {
            key: "reservan",
            label:
              "Reservan cada domingo una hora para hablar de cómo van, y la sostienen aunque haya planes.",
          },
          {
            key: "coste",
            label:
              "Siguen juntos porque separarse sería complicado y ninguno saca el tema.",
          },
          {
            key: "acompanan",
            label:
              "Cuando uno atraviesa algo difícil, el otro reorganiza lo que puede para acompañarlo.",
          },
          {
            key: "costumbre",
            label:
              "Comparten casa y rutinas, y hace tiempo que no hablan de nada que no sea logística.",
          },
        ],
        buckets: [
          { key: "eleccion", label: "Se describe una elección sostenida" },
          { key: "continuidad", label: "Se describe una continuidad" },
        ],
        missingInformationPrompt:
          "Ninguna de las cuatro parejas es mejor persona que otra, y que una relación continúe no es prueba de nada por sí sola. El ejercicio solo distingue qué se ve descrito en cada escena.",
      },
    },
    recall: {
      exerciseKey: "pqp-c3-recall-elegir-cada-dia",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 22,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué describe mejor el compromiso en una relación?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c3-elegir-cada-dia",
        options: [
          {
            key: "pqp-c3-opcion-eleccion-renovada",
            label:
              "Una elección que se sostiene y se renueva con conductas concretas a lo largo del tiempo.",
          },
          {
            key: "pqp-c3-opcion-permanecer-pase-lo-que-pase",
            label:
              "Permanecer en la relación pase lo que pase, como prueba de que el compromiso es real.",
          },
          {
            key: "pqp-c3-opcion-sentimiento-intenso",
            label:
              "Un sentimiento lo bastante intenso como para que las dificultades no lo afecten.",
          },
        ],
        correctOptionKey: "pqp-c3-opcion-eleccion-renovada",
      },
      feedback: {
        correct:
          "Eso es: el capítulo lo describe como algo que se hace y se vuelve a hacer, no como un estado que se conserva solo.",
        review:
          "Vuelve a la sección donde el capítulo define el compromiso. No lo describe ni como un sentimiento lo bastante fuerte ni como permanecer pase lo que pase: permanecer es una situación, elegirse es algo que se hace.",
      },
    },
  },

  // ── MG02 · Priorizar se ve en la agenda ──────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c3-practice-lo-que-se-mueve-y-lo-que-no",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 23,
      type: "REFLECTION",
      title: "Lo que se mueve y lo que no",
      sourceHeading: "2. Priorizar la relación",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Una pareja inventada aparta el jueves por la noche para estar juntos.",
          "El miércoles surge una reunión de trabajo que podría ocupar ese hueco.",
          "El jueves llega y hay que decidir.",
        ],
        contexts: [
          {
            key: "movible",
            label: "El jueves se considera movible",
            description:
              "Se ocupa el hueco y se deja para cuando haya menos trabajo.",
          },
          {
            key: "no-movible",
            label: "El jueves no se considera movible",
            description:
              "Se busca otro momento para la reunión y el jueves se mantiene.",
          },
        ],
        factors: [
          {
            key: "que-se-repite",
            label: "Si esto ocurre una vez o casi todas las semanas.",
          },
          {
            key: "quien-decide",
            label:
              "Si la decisión la toman los dos o siempre la misma persona.",
          },
          {
            key: "se-recupera",
            label: "Si el tiempo desplazado llega a recuperarse.",
          },
          {
            key: "urgencia-real",
            label: "Si lo que aparece es realmente urgente o solo llega antes.",
          },
        ],
        prompt:
          "Las señales son idénticas. ¿Qué podría cambiar en lo que cada persona entiende sobre el lugar que ocupa ese tiempo? Nada se marca como correcto: no existe una cantidad de horas que haya que cumplir.",
      },
    },
    recall: {
      exerciseKey: "pqp-c3-recall-priorizar-es-agenda",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 24,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿en qué se nota que una pareja prioriza su relación?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c3-priorizar-es-agenda",
        options: [
          {
            key: "pqp-c3-opcion-tiempo-reservado",
            label:
              "En que reservan tiempo y atención de forma deliberada, incluso cuando la agenda está llena.",
          },
          {
            key: "pqp-c3-opcion-cuando-sobra-tiempo",
            label:
              "En que aprovechan bien los ratos que sobran cuando el resto de obligaciones lo permite.",
          },
          {
            key: "pqp-c3-opcion-intensidad",
            label:
              "En que sus momentos juntos son especialmente intensos, aunque sean poco frecuentes.",
          },
        ],
        correctOptionKey: "pqp-c3-opcion-tiempo-reservado",
      },
      feedback: {
        correct:
          "Exacto. La diferencia que señala el capítulo está en reservar antes, no en aprovechar lo que sobra.",
        review:
          "Relee esa sección. Lo que describe no es intensidad ni buen aprovechamiento del tiempo libre: es tiempo apartado a propósito y sostenido cuando aparece lo urgente.",
      },
    },
  },

  // ── MG03 · Aceptar no es coincidir ───────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c3-practice-diferencia-o-desacuerdo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 25,
      type: "REFLECTION",
      title: "¿Diferencia o desacuerdo?",
      sourceHeading: "2. Practiquen la aceptación y el respeto mutuo",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cuatro situaciones inventadas para este ejercicio, tomadas de parejas distintas.",
        observation: "En las cuatro hay algo en lo que no coinciden.",
        availableContext: [
          "Una diferencia describe cómo es cada persona.",
          "Un desacuerdo se refiere a algo concreto que hay que decidir o acordar.",
        ],
        readings: [
          {
            key: "madrugar",
            label:
              "Una rinde por la mañana temprano; el otro se despeja de noche.",
          },
          {
            key: "vacaciones",
            label: "No coinciden en dónde pasar las vacaciones de este año.",
          },
          {
            key: "silencio",
            label:
              "Una necesita silencio para reponerse; al otro le sienta bien la compañía.",
          },
          {
            key: "gasto",
            label: "No coinciden en cuánto dedicar al gasto común de este mes.",
          },
        ],
        buckets: [
          { key: "diferencia", label: "Es una diferencia entre dos personas" },
          { key: "desacuerdo", label: "Es un desacuerdo sobre algo concreto" },
        ],
        missingInformationPrompt:
          "Distinguirlos no dice cuál importa más: dice qué tipo de conversación pide cada uno. Y conviene recordar que respetar cómo es alguien sigue siendo compatible con objetar algo que hace.",
      },
    },
    recall: {
      exerciseKey: "pqp-c3-recall-aceptar-sin-coincidir",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 26,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué significa aceptar a la otra persona tal como es?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c3-aceptar-sin-coincidir",
        options: [
          {
            key: "pqp-c3-opcion-respetar-diferencia",
            label:
              "Respetar su individualidad aunque no se coincida con ella en todo.",
          },
          {
            key: "pqp-c3-opcion-estar-de-acuerdo",
            label:
              "Llegar a estar de acuerdo en lo esencial, para que las diferencias dejen de pesar.",
          },
          {
            key: "pqp-c3-opcion-tolerar-todo",
            label:
              "Tolerar cualquier conducta suya sin plantear objeciones, porque objetar sería no aceptarla.",
          },
        ],
        correctOptionKey: "pqp-c3-opcion-respetar-diferencia",
      },
      feedback: {
        correct:
          "Eso es. Aceptar es respetar que alguien sea distinto, no llegar a pensar igual — y tampoco renunciar a objetar lo que hace.",
        review:
          "Vuelve a esa sección. Aceptar no exige coincidir; y aceptar cómo es una persona no es lo mismo que aceptar cualquier conducta suya.",
      },
    },
  },

  // ── MG04 · Apoyar lo que le hace crecer ──────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c3-practice-acompanar-un-proyecto",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 27,
      type: "REFLECTION",
      title: "Acompañar un proyecto",
      sourceHeading: "6. Sean apoyo para el crecimiento personal del otro",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio: Noa quiere retomar unos estudios que dejó a medias. Ordena los pasos por los que el apoyo pasa de ser una intención a ser algo concreto.",
        cards: [
          {
            key: "aparece",
            label:
              "Noa cuenta que le gustaría retomarlos, sin dar por hecho que podrá.",
          },
          {
            key: "escucha",
            label:
              "Ivo pregunta qué implicaría de verdad, antes de opinar sobre si es viable.",
          },
          {
            key: "cuesta",
            label:
              "Aparece lo incómodo: hay tardes que habría que reorganizar y algún gasto.",
          },
          {
            key: "concreto",
            label:
              "Acuerdan un cambio pequeño y verificable para las próximas semanas.",
          },
        ],
        solved: ["aparece", "escucha", "cuesta", "concreto"],
        solvedLabel: "El orden que describe el capítulo",
        feedback:
          "El paso que suele saltarse es el tercero. Sin nombrar lo que cuesta, el apoyo se queda en no oponerse — que es distinto de acompañar.",
      },
    },
    recall: {
      exerciseKey: "pqp-c3-recall-apoyar-el-crecimiento",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 28,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué papel tiene el crecimiento personal de cada uno dentro de la relación?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c3-apoyar-el-crecimiento",
        options: [
          {
            key: "pqp-c3-opcion-impulsa",
            label:
              "Una relación comprometida acompaña e impulsa los proyectos propios de cada persona.",
          },
          {
            key: "pqp-c3-opcion-postergar",
            label:
              "Los proyectos individuales conviene postergarlos mientras la relación se consolida.",
          },
          {
            key: "pqp-c3-opcion-independiente",
            label:
              "El crecimiento de cada uno es asunto individual y es mejor mantenerlo al margen del vínculo.",
          },
        ],
        correctOptionKey: "pqp-c3-opcion-impulsa",
      },
      feedback: {
        correct:
          "Eso propone el capítulo: un vínculo que acompaña lo que cada uno quiere para su vida, en vez de vivirlo como una pérdida.",
        review:
          "Relee el cierre de esa sección. Ni postergar los proyectos propios ni mantenerlos al margen: el capítulo describe una relación que impulsa.",
      },
    },
  },
];

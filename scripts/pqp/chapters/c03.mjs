/**
 * PQP-C03 — «Elegirse cada día: el compromiso como acto de amor consciente».
 *
 * Chapter map (published revision #10, platform order 4): 113 blocks, 22
 * headings, 0 duplicated, 11 min. The chapter defines commitment, lists three
 * everyday forms of it, argues it lives in small choices, and closes with eight
 * practices for strengthening it.
 *
 * ── Why these four ─────────────────────────────────────────────────────────
 *
 * The chapter offers eleven candidate ideas; four survive the test of being
 * understandable, practisable and recallable on their own.
 *
 *   · «Commitment is a choice that gets renewed» is the thesis, and its sharp
 *     edge is the distinction between CHOOSING and merely STAYING. That edge is
 *     also where this chapter's safety lives, so it leads the route.
 *   · Prioritising, accepting without agreeing, and supporting the other's
 *     growth each teach a different move, and none of them repeats an idea
 *     another chapter already carries.
 *   · «El compromiso vive en lo pequeño» is deliberately NOT a microguide: it
 *     is very close to C01's «el amor se practica», and two routes teaching the
 *     same idea with different words would pad the collection rather than add
 *     to it. It stays in reading.
 *   · The remaining seven closing practices (communication, dreaming together,
 *     empathy, intimacy, romance…) are worth reading and too conventional to
 *     each carry a microguide.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 *
 * `COMMITMENT_IS_NOT_UNCONDITIONAL_PERMANENCE`. The chapter has a section
 * called «Apoyo incondicional», and a derived layer must not let that be read
 * as «stay whatever happens». MG01 states the distinction in FeelVerse's own
 * voice: commitment as described here is something two people keep choosing,
 * and nothing in it argues for remaining where there is violence, coercion,
 * control or fear. That line is carried in the CONCEPT scene, in the practice's
 * feedback and in the recall's distractors — not tucked into a footnote.
 *
 * No microguide asks anyone to evaluate whether their own relationship is
 * committed enough. Every practice runs on invented couples.
 */

const SAFE_EXIT =
  "Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.";

export const CHAPTER = {
  code: "C03",
  chapterOrder: 4,
  unitKey: "83a96f4b-b9af-52a0-8c76-5e0cce6e6455",
  keyPrefix: "pqp-c3",
  media: { authorVideoPending: false },
  approvalReferences: [
    "PQP-C03 — Inventario editorial y selección de microguías (2026-09-08)",
  ],
};

/** Dúo candidates — PRODUCT DRAFT ONLY. No runtime, no tables, no endpoints. */
export const DUO_CANDIDATES = [
  {
    title: "Una hora que no se mueve",
    from: "MG02 · Priorizar se ve en la agenda",
    purpose:
      "Reservar UN espacio concreto y comprobar, dos semanas después, si sobrevivió.",
    privatePreparation:
      "Cada persona propone en privado un momento realista y qué estaría dispuesta a mover por él.",
    visibility: "SELECTIVE_SHARE",
    revelation: "Privado → ambos confirman → se comparan las propuestas.",
    conversation:
      "Corta y concreta: elegir una sola franja. Pausa y retirada disponibles.",
    sharedOutcome: "Una franja de tiempo con día y hora.",
    followUp:
      "A las dos semanas: ¿ocurrió? mantener / ajustar / abandonar. Sin registro de incumplimientos.",
    exit: "Cualquiera puede cerrar la actividad sin dar explicaciones.",
    doNotSuggestWhen:
      "Si el tiempo compartido se usa para controlar o vigilar a la otra persona, o si alguien no puede negarse con libertad.",
  },
  {
    title: "Lo que te veo querer",
    from: "MG04 · Apoyar lo que le hace crecer",
    purpose:
      "Nombrar en voz alta un proyecto propio del otro y qué haría falta para que fuera posible.",
    privatePreparation:
      "Cada persona escribe en privado un proyecto propio y qué apoyo concreto necesitaría.",
    visibility: "SELECTIVE_SHARE",
    revelation:
      "Privado → ambos confirman → se comparte solo lo que cada uno marque.",
    conversation:
      "Turnos: primero escuchar el proyecto entero sin evaluar su viabilidad.",
    sharedOutcome: "Un apoyo concreto por persona, pequeño y verificable.",
    followUp: "Al mes: ¿sirvió? mantener / ajustar / abandonar.",
    exit: "Se puede parar en cualquier momento.",
    doNotSuggestWhen:
      "Si los proyectos personales de una de las dos personas se han usado antes como motivo de reproche o castigo, o ante cualquier señal de control.",
  },
];

export const MICROGUIDES = [
  {
    slug: "elegir-cada-dia",
    title: "Elegir, no solo permanecer",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué describe mejor el compromiso en una relación?",
      options: [
        {
          optionKey: "pqp-c3-opcion-eleccion-renovada",
          label:
            "Una elección que se sostiene y se renueva con conductas concretas a lo largo del tiempo.",
        },
        {
          optionKey: "pqp-c3-opcion-permanecer-pase-lo-que-pase",
          label:
            "Permanecer en la relación pase lo que pase, como prueba de que el compromiso es real.",
        },
        {
          optionKey: "pqp-c3-opcion-sentimiento-intenso",
          label:
            "Un sentimiento lo bastante intenso como para que las dificultades no lo afecten.",
        },
      ],
    },
    practiceSlug: "eleccion-o-inercia",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "El verdadero significado del compromiso",
      fingerprint: "va mucho más allá de sentir amor",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Elegir, no solo permanecer",
        body: [
          "«Seguimos juntos» y «nos elegimos» pueden describir la misma situación y significar cosas distintas. El capítulo empieza por separarlas.",
        ],
        note: `Trabajaremos con casos inventados para el ejercicio, no con tu historia. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "El verdadero significado del compromiso",
        body: [
          "Lee la sección donde el capítulo define el compromiso, y fíjate en qué lo distingue de un sentimiento intenso.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Una elección que se renueva",
        body: [
          "El capítulo describe el compromiso como algo que se sostiene con conductas: cuidar el vínculo, atravesar dificultades juntos, mantener la confianza. No como un estado que, una vez alcanzado, se conserva solo.",
          "De ahí la distinción que da nombre al capítulo: permanecer es una situación; elegirse es algo que se hace, y se puede volver a hacer.",
        ],
        note: "Precisión de FeelVerse: elegir no es quedarse pase lo que pase. Nada aquí sostiene permanecer donde hay violencia, coerción, control o miedo; ahí la pregunta no es cuánto compromiso hay, sino qué protección hace falta. Marcar la escena no evalúa tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Elección o inercia?",
        body: [
          "Cuatro situaciones inventadas. Distingue en cuáles se describe una elección sostenida y en cuáles simplemente una continuidad.",
        ],
        note: "Son casos editoriales. La clasificación no juzga a las parejas descritas: nombra qué se ve en cada escena.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Si pensaras en tu vínculo más cercano, ¿qué cosas concretas dirías que sostienen la elección, más allá de que sigan juntos? Basta con pensarlo.",
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
        title: "Elegirse es un verbo",
        body: [
          "El compromiso, tal como lo describe el capítulo, se parece más a algo que se hace que a algo que se tiene.",
          "Y no equivale a permanecer a cualquier precio: eso es otra cosa, y no es lo que esta guía propone.",
        ],
      },
    ],
  },
  {
    slug: "priorizar-es-agenda",
    title: "Priorizar se ve en la agenda",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿en qué se nota que una pareja prioriza su relación?",
      options: [
        {
          optionKey: "pqp-c3-opcion-tiempo-reservado",
          label:
            "En que reservan tiempo y atención de forma deliberada, incluso cuando la agenda está llena.",
        },
        {
          optionKey: "pqp-c3-opcion-cuando-sobra-tiempo",
          label:
            "En que aprovechan bien los ratos que sobran cuando el resto de obligaciones lo permite.",
        },
        {
          optionKey: "pqp-c3-opcion-intensidad",
          label:
            "En que sus momentos juntos son especialmente intensos, aunque sean poco frecuentes.",
        },
      ],
    },
    practiceSlug: "lo-que-se-mueve-y-lo-que-no",
    practiceKind: "signal_context_compare",
    anchor: {
      heading: "2. Priorizar la relación",
      fingerprint: "tiempo no negociable",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Priorizar se ve en la agenda",
        body: [
          "Casi nadie diría que su relación no es una prioridad. El capítulo propone mirar dónde se nota eso, y no es en la intención.",
        ],
        note: `Trabajaremos con una agenda inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "2. Priorizar la relación",
        body: [
          "Lee la sección sobre reservar tiempo, y fíjate en qué hace que ese tiempo sea distinto del que queda libre.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Lo que no se mueve",
        body: [
          "El capítulo describe la prioridad como algo que se reserva antes, no como lo que queda después. Un tiempo que no se negocia frente a lo urgente es lo que distingue una prioridad de una intención.",
          "No dice cuánto tiene que ser ni con qué frecuencia. Dice que exista y que se sostenga.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa cómo repartes tu tiempo ni infiere nada sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Lo que se mueve y lo que no",
        body: [
          "Una misma semana inventada, en dos versiones. Observa qué cambia según qué se considera movible.",
        ],
        note: "Es una agenda editorial, no la tuya. Nada se marca como correcto o incorrecto.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Qué cosa de tu semana no se mueve nunca? ¿Y qué se mueve siempre que aparece algo urgente?",
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
        title: "Antes, no después",
        body: [
          "Una prioridad se reconoce en lo que se reserva de antemano y en lo que no se mueve cuando aparece lo urgente.",
        ],
      },
    ],
  },
  {
    slug: "aceptar-sin-coincidir",
    title: "Aceptar no es coincidir",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué significa aceptar a la otra persona tal como es?",
      options: [
        {
          optionKey: "pqp-c3-opcion-respetar-diferencia",
          label:
            "Respetar su individualidad aunque no se coincida con ella en todo.",
        },
        {
          optionKey: "pqp-c3-opcion-estar-de-acuerdo",
          label:
            "Llegar a estar de acuerdo en lo esencial, para que las diferencias dejen de pesar.",
        },
        {
          optionKey: "pqp-c3-opcion-tolerar-todo",
          label:
            "Tolerar cualquier conducta suya sin plantear objeciones, porque objetar sería no aceptarla.",
        },
      ],
    },
    practiceSlug: "diferencia-o-desacuerdo",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "2. Practiquen la aceptación y el respeto mutuo",
      fingerprint: "No se trata de estar de acuerdo en todo",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Aceptar no es coincidir",
        body: [
          "Aceptar a alguien suele confundirse con darle la razón. El capítulo separa las dos cosas.",
        ],
        note: `Trabajaremos con ejemplos inventados para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "2. Practiquen la aceptación y el respeto mutuo",
        body: [
          "Lee la sección sobre aceptar las diferencias, y fíjate en qué NO exige.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Diferencia no es desacuerdo",
        body: [
          "Aceptar, tal como lo plantea el capítulo, es respetar que la otra persona sea distinta: en gustos, en ritmo, en forma de ver las cosas. No pide coincidir, y no pide dejar de tener criterio.",
          "Conviene separarlo también de otra cosa: aceptar una diferencia de carácter no es lo mismo que aceptar cualquier conducta. Se puede respetar a alguien y a la vez objetar lo que hace.",
        ],
        note: "Esa segunda distinción es de FeelVerse, no del capítulo, y está aquí a propósito: «aceptación» no significa renunciar a poner límites. Marcar la escena registra que exploraste la idea.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Diferencia o desacuerdo?",
        body: [
          "Varias situaciones inventadas. Distingue lo que es una diferencia entre dos personas de lo que es un desacuerdo sobre algo concreto.",
        ],
        note: "Son casos editoriales. Distinguirlos no dice cuál importa más: dice qué tipo de conversación pide cada uno.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Hay alguna diferencia que hayas estado tratando como si fuera un desacuerdo por resolver?",
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
        title: "Respetar sin coincidir",
        body: [
          "Aceptar es respetar que alguien sea distinto, no llegar a pensar igual.",
          "Y respetar a una persona sigue siendo compatible con objetar algo que hace.",
        ],
      },
    ],
  },
  {
    slug: "apoyar-el-crecimiento",
    title: "Apoyar lo que le hace crecer",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué papel tiene el crecimiento personal de cada uno dentro de la relación?",
      options: [
        {
          optionKey: "pqp-c3-opcion-impulsa",
          label:
            "Una relación comprometida acompaña e impulsa los proyectos propios de cada persona.",
        },
        {
          optionKey: "pqp-c3-opcion-postergar",
          label:
            "Los proyectos individuales conviene postergarlos mientras la relación se consolida.",
        },
        {
          optionKey: "pqp-c3-opcion-independiente",
          label:
            "El crecimiento de cada uno es asunto individual y es mejor mantenerlo al margen del vínculo.",
        },
      ],
    },
    practiceSlug: "acompanar-un-proyecto",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "6. Sean apoyo para el crecimiento personal del otro",
      fingerprint: "no te encierra ni te limita",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Apoyar lo que le hace crecer",
        body: [
          "Que a alguien le vaya bien por su cuenta puede vivirse como una amenaza o como algo compartido. El capítulo propone lo segundo, y explica en qué se nota.",
        ],
        note: `Trabajaremos con un proyecto inventado para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "6. Sean apoyo para el crecimiento personal del otro",
        body: [
          "Lee la sección sobre acompañar los proyectos del otro, y fíjate en la frase con la que cierra.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Un vínculo que no encierra",
        body: [
          "El capítulo describe una relación comprometida como una que acompaña lo que cada uno quiere para su vida, en vez de vivirlo como una pérdida o una competencia.",
          "Apoyar así es concreto: implica tiempo, esfuerzo y a veces incomodidad. No es solo no oponerse.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa cuánto se apoyan ustedes ni infiere nada sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Acompañar un proyecto",
        body: [
          "Ordena los pasos de un caso inventado, desde que aparece el proyecto de una persona hasta que el apoyo se vuelve algo concreto.",
        ],
        note: "Es un caso editorial, no tu historia.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Qué proyecto de alguien cercano podrías acompañar con algo pequeño y concreto esta semana?",
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
        title: "Acompañar cuesta algo",
        body: [
          "Apoyar el crecimiento del otro se nota en lo concreto: tiempo, esfuerzo, a veces incomodidad. No basta con no oponerse.",
        ],
      },
    ],
  },
];

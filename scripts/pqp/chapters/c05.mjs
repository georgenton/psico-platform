/**
 * PQP-C05 — «Conflictos que revelan».
 *
 * Chapter map (published revision #10, platform order 6): 118 blocks, 24
 * headings, 0 duplicated, 14 min. Five common causes of conflict, ten keys for
 * handling it, and three closing exercises.
 *
 * ── Why these four ─────────────────────────────────────────────────────────
 *
 *   · MG01 exists because the chapter's FIRST named cause is power and
 *     dominance. A route about conflict that never distinguishes a disagreement
 *     from a pattern of control would be teaching negotiation to someone who
 *     needs something else entirely. Teaching that distinction is safe; leaving
 *     it out is not.
 *   · Staying in the present, choosing the moment and reaching concrete
 *     agreements are three separate, practicable moves.
 *   · «Define lo que te molesta» and «sé específico» are deliberately NOT
 *     microguides: C02 already teaches that distinction as «una queja no es una
 *     crítica», and the collection does not need it twice.
 *   · «Asume tu responsabilidad» is deliberately NOT a microguide either, and
 *     the reason is safety rather than redundancy. In a chapter that also names
 *     dominance, a guide teaching «take your share» risks landing as symmetric
 *     responsibility on someone who is being harmed. It stays in reading, where
 *     the author's own framing surrounds it.
 *
 * ── Safety — reinforced gate ───────────────────────────────────────────────
 *
 * Situations get classified here, never people. The five categories the design
 * works from — ordinary conflict, recurring conflict, power imbalance,
 * coercive control, violence — are pedagogical descriptions of scenes, and no
 * item asks a reader to place themselves or their partner in one.
 *
 * `CONFLICT_IS_NOT_CONTROL`. Where a scene shows control rather than
 * disagreement, MG01 offers no bilateral technique: not negotiation, not
 * «both give a little», not better phrasing, not a conversation to be had. What
 * it offers is the distinction itself, and the statement that support is the
 * relevant next step. Nothing in this chapter's route asks anyone to describe
 * their own experience of being controlled or hurt, and nothing stores it.
 *
 * `DUO`: one candidate only, attached to the most neutral microguide
 * (agreements), and gated explicitly. The other three carry
 * `DUO_CANDIDATE=false` — for MG01 that is not an omission but the finding.
 */

const SAFE_EXIT =
  "Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.";

export const CHAPTER = {
  code: "C05",
  chapterOrder: 6,
  unitKey: "c96b9981-e319-57de-a290-8214caaa38f4",
  keyPrefix: "pqp-c5",
  media: { authorVideoPending: false },
  approvalReferences: [
    "PQP-C05 — Inventario editorial y selección de microguías (2026-09-08)",
  ],
};

/**
 * Dúo candidates — PRODUCT DRAFT ONLY. No runtime, no tables, no endpoints.
 *
 * ONE, deliberately. MG01 has `DUO_CANDIDATE=false` on purpose: a joint
 * activity is exactly the wrong proposal for a situation that might be one of
 * control, and «the couple should sit down and work it out» is the assumption
 * this chapter's route is built to avoid.
 */
export const DUO_CANDIDATES = [
  {
    title: "Un acuerdo pequeño",
    from: "MG04 · Un acuerdo no es una victoria",
    purpose:
      "Convertir UN desacuerdo concreto y de baja carga en un acuerdo verificable.",
    privatePreparation:
      "Cada persona escribe en privado qué necesitaría para estar conforme, y qué podría aceptar.",
    visibility: "SELECTIVE_SHARE",
    revelation: "Privado → ambos confirman → se comparan las dos propuestas.",
    conversation:
      "Corta y sobre un solo tema. Si sube la tensión, se para. Pausa y retirada disponibles sin explicación.",
    sharedOutcome: "Un acuerdo concreto con fecha de revisión.",
    followUp: "A las tres semanas: ¿se sostuvo? mantener / ajustar / abandonar.",
    exit: "Cualquiera puede cerrar la actividad en cualquier momento.",
    doNotSuggestWhen:
      "Ante cualquier señal de control coercitivo, intimidación, miedo o violencia; si una de las dos personas no puede negarse ni proponer sin consecuencias; si el tema elegido está muy activado; o si acuerdos anteriores se han usado después como reproche o como forma de vigilancia. En cualquiera de esos casos la actividad no se propone, y la razón se registra.",
  },
];

export const MICROGUIDES = [
  {
    slug: "conflicto-no-es-control",
    title: "Un desacuerdo no es una dinámica de control",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según la idea trabajada en esta guía, ¿qué distingue un desacuerdo de una dinámica de control?",
      options: [
        {
          optionKey: "pqp-c5-opcion-quien-puede-negarse",
          label:
            "Que en un desacuerdo las dos personas pueden sostener su postura y negarse; en una dinámica de control, una no puede hacerlo sin consecuencias.",
        },
        {
          optionKey: "pqp-c5-opcion-intensidad",
          label:
            "Que las discusiones son más intensas y frecuentes cuando hay control.",
        },
        {
          optionKey: "pqp-c5-opcion-tema",
          label:
            "Que el control aparece siempre en temas de dinero o de familia, y el desacuerdo en temas cotidianos.",
        },
      ],
    },
    practiceSlug: "desacuerdo-o-senales-de-control",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "1. Poder y dominio",
      fingerprint: "busca controlar decisiones",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Un desacuerdo no es una dinámica de control",
        body: [
          "El capítulo abre su lista de causas de conflicto con el poder y el dominio. Esta guía se detiene ahí, porque no todo lo que parece una discusión lo es.",
        ],
        note: `Trabajaremos solo con escenas inventadas. No se te pedirá describir tu situación, y nada de lo que pienses aquí se guarda. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "1. Poder y dominio",
        body: [
          "Lee la sección donde el capítulo describe lo que ocurre cuando uno de los dos busca imponer, y fíjate en cómo lo distingue de una diferencia de criterio.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Quién puede decir que no",
        body: [
          "En un desacuerdo, las dos personas pueden sostener su postura, negarse y seguir estando. La conversación puede ser incómoda y aun así ninguna de las dos pierde nada por opinar.",
          "Hay situaciones distintas: cuando una persona no puede negarse, opinar o decidir sin que haya consecuencias —enfado sostenido, castigo, vigilancia, aislamiento, miedo—, lo que está ocurriendo no es un desacuerdo mal llevado. Es otra cosa, y tiene otro nombre.",
          "La diferencia importa por lo práctico: las herramientas de este capítulo —elegir el momento, hablar en presente, buscar acuerdos— sirven para desacuerdos. No sirven para el control, y aplicarlas ahí puede dejar a alguien intentando negociar algo que no se negocia.",
        ],
        note: "Si algo de esto se parece a tu situación, lo que corresponde no es una técnica de conversación sino apoyo: alguien de confianza, un profesional o un servicio especializado de tu país. Esta guía no evalúa tu relación ni saca conclusiones sobre ella.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Desacuerdo o señales de control?",
        body: [
          "Cuatro escenas inventadas. Distingue las que describen una diferencia entre dos personas de las que muestran señales de control.",
        ],
        note: "Son escenas editoriales, nunca tu relación, y el ejercicio clasifica situaciones, no personas. Reconocer señales de control en una escena no dice nada sobre nadie que conozcas.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a la distinción trabajada."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Dos cosas distintas, dos respuestas distintas",
        body: [
          "Un desacuerdo se trabaja conversando. Una dinámica de control no se resuelve conversando mejor, y proponerlo así puede dejar a alguien sola con el problema.",
          "Distinguirlas es lo que esta guía enseña. Para lo segundo, lo que ayuda es apoyo.",
        ],
      },
    ],
  },
  {
    slug: "una-cosa-a-la-vez",
    title: "Una cosa a la vez",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué ocurre al traer discusiones pasadas a una conversación sobre algo de hoy?",
      options: [
        {
          optionKey: "pqp-c5-opcion-satura",
          label:
            "Que la conversación se satura y se vuelve más difícil resolver lo que se quería tratar.",
        },
        {
          optionKey: "pqp-c5-opcion-contexto",
          label:
            "Que aporta el contexto necesario para que el otro entienda la magnitud del problema.",
        },
        {
          optionKey: "pqp-c5-opcion-igual",
          label:
            "Que da igual: lo que decide el resultado es el tono con que se diga.",
        },
      ],
    },
    practiceSlug: "hoy-o-el-historial",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "4. Enfócate en el presente",
      fingerprint: "archivo histórico",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Una cosa a la vez",
        body: [
          "Una conversación sobre algo de esta mañana puede acabar siendo sobre los últimos cinco años. El capítulo explica qué se pierde por el camino.",
        ],
        note: `Trabajaremos con frases inventadas para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "4. Enfócate en el presente",
        body: [
          "Lee la sección sobre quedarse en lo que ocurrió hoy, y fíjate en qué nombra el capítulo como la tentación.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "El historial satura la conversación",
        body: [
          "Traer episodios anteriores puede sentirse como aportar contexto, pero suele hacer lo contrario: multiplica los temas abiertos y deja el de hoy sin tratar.",
          "No significa que el pasado no importe. Significa que una conversación puede sostener un asunto a la vez, y que elegir cuál se está tratando es parte de que llegue a alguna parte.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa cómo discutes ni infiere nada sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Hoy o el historial?",
        body: [
          "Varias formas inventadas de abrir la misma conversación. Distingue las que se quedan en lo de hoy de las que abren el archivo.",
        ],
        note: "Son frases editoriales, no las tuyas. Ninguna está prohibida: el ejercicio es notar cuántos temas abre cada una.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Si tuvieras que plantear algo esta semana, ¿cuál sería el asunto de hoy, sin nada más alrededor?",
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
        title: "Un asunto por conversación",
        body: [
          "Una conversación sostiene un tema a la vez. Elegir cuál es no borra el resto: los deja para su momento.",
        ],
      },
    ],
  },
  {
    slug: "el-momento-importa",
    title: "El momento importa",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿por qué muchas discusiones se agravan sin que el tema haya cambiado?",
      options: [
        {
          optionKey: "pqp-c5-opcion-mal-momento",
          label:
            "Porque se abren en un momento o un lugar en que ninguno de los dos puede sostener la conversación.",
        },
        {
          optionKey: "pqp-c5-opcion-postergar",
          label:
            "Porque conviene aplazar los temas difíciles hasta que dejen de doler.",
        },
        {
          optionKey: "pqp-c5-opcion-caracter",
          label:
            "Porque hay personas que no están hechas para hablar de temas difíciles.",
        },
      ],
    },
    practiceSlug: "cuando-abrir-la-conversacion",
    practiceKind: "signal_context_compare",
    anchor: {
      heading: "9. Elige bien el momento",
      fingerprint: "no por el contenido",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "El momento importa",
        body: [
          "La misma frase, dicha en dos momentos distintos, puede abrir una conversación o una discusión. El capítulo se detiene en eso.",
        ],
        note: `Trabajaremos con una escena inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "9. Elige bien el momento",
        body: [
          "Lee la sección sobre cuándo plantear un tema, y fíjate en qué dice el capítulo que agrava muchas discusiones.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Elegir cuándo también es parte",
        body: [
          "El capítulo señala que muchas conversaciones se tuercen no por lo que se dice sino por cuándo se dice: al llegar agotados, delante de otras personas, en mitad de otra cosa.",
          "Elegir el momento no es evitar el tema. Es lo contrario: es darle una oportunidad razonable de que se pueda hablar.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa cuándo hablas ni infiere nada sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Cuándo abrir la conversación",
        body: [
          "El mismo tema planteado en dos momentos distintos. Observa qué cambia en lo que puede ocurrir después.",
        ],
        note: "Es un caso editorial. Nada se marca como correcto: no existe un momento perfecto.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Cuándo sueles plantear las cosas difíciles? ¿Es un momento que elegiste o el primero que aparece?",
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
        title: "Cuándo, no solo qué",
        body: [
          "Elegir el momento no aplaza la conversación: le da una oportunidad de ocurrir.",
        ],
      },
    ],
  },
  {
    slug: "acuerdo-no-es-victoria",
    title: "Un acuerdo no es una victoria",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿cuándo se considera resuelto un conflicto de pareja?",
      options: [
        {
          optionKey: "pqp-c5-opcion-acuerdo-concreto",
          label:
            "Cuando llegan a un acuerdo concreto que ambos pueden sostener, no cuando uno gana.",
        },
        {
          optionKey: "pqp-c5-opcion-convencer",
          label:
            "Cuando uno de los dos logra explicar su postura lo bastante bien como para convencer al otro.",
        },
        {
          optionKey: "pqp-c5-opcion-dejar-pasar",
          label:
            "Cuando el malestar se disipa solo y el tema deja de aparecer.",
        },
      ],
    },
    practiceSlug: "de-la-postura-al-acuerdo",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "10. Lleguen a acuerdos",
      fingerprint: "cuando uno gana y otro pierde",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Un acuerdo no es una victoria",
        body: [
          "Terminar una discusión y resolver un conflicto no son lo mismo. El capítulo cierra sus claves por ahí.",
        ],
        note: `Trabajaremos con un caso inventado para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "10. Lleguen a acuerdos",
        body: [
          "Lee la sección final de las claves, y fíjate en cómo describe el capítulo un conflicto resuelto.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Concreto, y sostenible por los dos",
        body: [
          "Un acuerdo, tal como lo describe el capítulo, no es que alguien acepte la postura del otro: es algo concreto que las dos personas pueden sostener.",
          "Eso lo hace comprobable. Un acuerdo que nadie sabría decir si se cumplió no era un acuerdo, era el final de una discusión.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa vuestros acuerdos.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "De la postura al acuerdo",
        body: [
          "Ordena los pasos de un caso inventado, desde dos posturas enfrentadas hasta algo que ambos pueden sostener.",
        ],
        note: "Es un caso editorial, no tu historia.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "De los acuerdos que recuerdes haber hecho, ¿cuáles eran lo bastante concretos como para saber si se cumplieron?",
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
        title: "Comprobable, no ganado",
        body: [
          "Un acuerdo se reconoce en que ambos pueden sostenerlo y en que se sabría decir si se cumplió.",
        ],
      },
    ],
  },
];

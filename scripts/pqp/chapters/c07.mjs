/**
 * PQP-C07 — «Respetarnos para florecer: el poder del reconocimiento mutuo en
 * la pareja».
 *
 * Chapter map (published revision #10, platform order 8): 70 blocks, 10
 * headings, 0 duplicated, 16 min. Limits, autonomy, communication and care,
 * fidelity, power dynamics (machismo, money, decisions), violence, keys for
 * cultivating respect, a personal account, and the closing exercises.
 *
 * ── Why these four ─────────────────────────────────────────────────────────
 *
 *   · Limits — the chapter's own starting point, and the idea the rest rests
 *     on. Descriptive: what a limit IS, not a technique for enforcing one.
 *   · How you speak about someone who is not there — the chapter names covert
 *     contempt (sarcasm, jokes at the other's expense) and gives it a case.
 *   · Who decides — standing arrangements about money, children, the house.
 *     The chapter names machismo out loud; no other route in this collection
 *     touches it.
 *   · Violence — see below. This one is not optional.
 *
 * «El amor no anula la autonomía» stays in reading: it sits very close to
 * C03's «aceptar sin coincidir» and C04's «pensar distinto sin dividirse», and
 * this collection does not need a third route through the same ground.
 * «Fidelidad y lealtad emocional» stays in reading too — there is no practice
 * this layer could build on it that would not end up moralising.
 *
 * ── Safety — the reinforced gate ───────────────────────────────────────────
 *
 * `VIOLENCE_IS_NOT_A_COMMUNICATION_PROBLEM`. The book is unusually clear here
 * and the derived layer's job is to not blunt it. The chapter says plainly that
 * violence is not «una pérdida momentánea de control» nor «una forma intensa de
 * discutir»; that once that line is crossed the priority is safety and
 * professional help rather than saving the relationship; and that nobody
 * deserves to stay. MG04 carries all three.
 *
 * So MG04 does NOT do any of the following, and the omissions are deliberate:
 * no bilateral negotiation, no «both give a little», no couple communication
 * offered as the solution, no confrontation, no shared commitment, no symmetric
 * responsibility. Its two wrong recall options are exactly those last two
 * framings, marked wrong on purpose. Its practice is `context_plausibility`,
 * which carries NO answer key: it is recognition, never a score, so nothing
 * about violence is gamified. It runs on four invented scenes, asks nobody to
 * describe anything of their own, and has NO reflection scene — the one place
 * in this collection where a private prompt would be an invitation to write
 * down something that should not be stored anywhere.
 *
 * MG03 needs its own guard, because a route about redistributing decisions is
 * the wrong answer when refusing carries a cost. Its practice and its concept
 * note both say so, and both point at MG04.
 *
 * `DUO_CANDIDATES` is EMPTY for this chapter. Reason documented below.
 */

const SAFE_EXIT =
  "Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.";

export const CHAPTER = {
  code: "C07",
  chapterOrder: 8,
  unitKey: "f1bfc773-ee4e-5499-a24b-5a9369fb770c",
  keyPrefix: "pqp-c7",
  media: { authorVideoPending: false },
  approvalReferences: [
    "PQP-C07 — Inventario editorial y selección de microguías (2026-09-08)",
  ],
};

/**
 * Dúo candidates — NONE for this chapter, and that is the decision, not an
 * omission.
 *
 * `DUO=false`. A Dúo activity is a structured conversation between two people
 * who both opt in. This chapter's material is limits, covert contempt, unequal
 * power and violence — every one of them a case where the reason a conversation
 * has not happened may be that one of the two cannot raise it safely. A Dúo
 * here would put the person with less room in the position of naming the
 * problem to the person who benefits from it, inside a product flow that cannot
 * tell which situation it is in.
 *
 * The rest of the collection has Dúo candidates because their material is
 * bilateral by nature. This chapter's is not, so it ships none.
 */
export const DUO_CANDIDATES = [];

export const MICROGUIDES = [
  {
    slug: "limite-no-es-rechazo",
    title: "Un límite no es un rechazo",
    duration: "8–10 minutos",
    recall: {
      question: "Según el capítulo, ¿qué son los límites emocionales?",
      options: [
        {
          optionKey: "pqp-c7-opcion-cercas-que-resguardan",
          label:
            "Cercas invisibles que resguardan la integridad emocional de cada uno, no muros que separan.",
        },
        {
          optionKey: "pqp-c7-opcion-reglas-al-otro",
          label:
            "Reglas que se le ponen al otro para que corrija lo que hace mal.",
        },
        {
          optionKey: "pqp-c7-opcion-senal-de-desconfianza",
          label:
            "Una señal de que todavía falta confianza, y que se van necesitando menos con los años.",
        },
      ],
    },
    practiceSlug: "un-limite-o-un-reproche",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "El respeto empieza con los límites",
      fingerprint: "en la claridad hay seguridad",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Un límite no es un rechazo",
        body: [
          "El capítulo empieza por aquí: lo que un límite protege, y por qué ponerlo no es alejarse.",
        ],
        note: `Trabajaremos con frases inventadas para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "El respeto empieza con los límites",
        body: [
          "Lee la sección sobre los límites y fíjate en la imagen que usa el capítulo: cercas, no muros.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Lo que la cerca guarda dentro",
        body: [
          "El capítulo describe los límites como cercas invisibles que resguardan la integridad emocional: dentro viven los valores, las memorias y las necesidades de cada uno. No están puestas contra el otro.",
          "También nombra lo que ocurre cuando esa frontera se invade una y otra vez: la persona empieza a apagarse, deja de hablar, deja de pedir. Por eso ponerlo en palabras protege algo propio, y no es un rechazo.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa tu relación. Y si nombrar un límite te trajera consecuencias, eso no es un problema de cómo lo dijiste: la última guía de este capítulo habla de eso.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "¿Un límite o un reproche?",
        body: [
          "Cuatro frases inventadas. Fíjate en cuáles nombran algo propio y cuáles califican al otro.",
        ],
        note: "Frases editoriales, no tuyas. Nada se marca como correcto: ninguna frase está prohibida y ordenarlas solo sirve para notar la diferencia.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "¿Hay algo que sueles callar para evitar una discusión? No hace falta que hagas nada con la respuesta.",
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
        title: "Cercas, no muros",
        body: [
          "Un límite dice qué necesitas para seguir siendo tú. Eso protege el vínculo en lugar de amenazarlo.",
        ],
      },
    ],
  },
  {
    slug: "hablar-del-otro-sin-testigos",
    title: "Cómo hablas de tu pareja cuando no está",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿qué pueden ser las bromas a costa de la pareja delante de otros?",
      options: [
        {
          optionKey: "pqp-c7-opcion-desprecio-encubierto",
          label:
            "Una forma encubierta de desprecio, capaz de dañar la autoestima y romper la complicidad.",
        },
        {
          optionKey: "pqp-c7-opcion-muestra-de-confianza",
          label:
            "Una muestra de confianza y complicidad que en general fortalece el vínculo.",
        },
        {
          optionKey: "pqp-c7-opcion-susceptibilidad",
          label:
            "Un asunto de susceptibilidad de quien se molesta, más que del contenido de la broma.",
        },
      ],
    },
    practiceSlug: "la-misma-broma-en-dos-mesas",
    practiceKind: "signal_context_compare",
    anchor: {
      heading: "Comunicación y cuidado como expresión de respeto",
      fingerprint: "cuando no hay testigos",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cómo hablas de tu pareja cuando no está",
        body: [
          "El respeto no se mide solo en la intimidad. El capítulo se detiene en lo que pasa delante de otros.",
        ],
        note: `Trabajaremos con una escena inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Comunicación y cuidado como expresión de respeto",
        body: [
          "Lee esa sección, y en particular la parte sobre cómo hablas del otro cuando no te escucha.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "El chiste que no era solo un chiste",
        body: [
          "El capítulo señala que el sarcasmo puede ser una forma encubierta de desprecio, y que ridiculizar al otro —aunque sea en broma y aunque todos se rían— puede dañar la autoestima y romper la complicidad.",
          "Y añade una pregunta que no depende de estar delante: cómo hablas de tu pareja cuando no está. Hablar bien del otro sin testigos es cuidar el vínculo cuando nadie lo está mirando.",
        ],
        note: "No todo el humor compartido es desprecio, y el capítulo no propone dejar de bromear. Marcar esta escena registra que exploraste la idea; no evalúa tu relación ni la de nadie.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "La misma broma en dos mesas",
        body: [
          "La misma broma de una pareja inventada, en dos situaciones. Observa qué podría cambiar.",
        ],
        note: "Es un caso editorial. Nada se marca como correcto: el ejercicio solo pregunta qué haría falta saber.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Si alguien repitiera mañana algo que dijiste ayer sobre tu pareja, ¿te gustaría que lo escuchara?",
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
        title: "También cuando nadie mira",
        body: [
          "Lo que se dice del otro en su ausencia forma parte del vínculo, aunque el otro no llegue a enterarse.",
        ],
      },
    ],
  },
  {
    slug: "quien-decide-en-casa",
    title: "Quién decide, y sobre qué",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, ¿por qué importa una distribución desigual de las decisiones aunque no haya mala intención?",
      options: [
        {
          optionKey: "pqp-c7-opcion-efectos-reales",
          label:
            "Porque los efectos son reales igualmente: uno se siente solo o invisible, el otro carga un peso excesivo, y aparecen resentimiento o distancia.",
        },
        {
          optionKey: "pqp-c7-opcion-si-funciona-da-igual",
          label:
            "No importa mientras la casa funcione y ninguno de los dos se queje.",
        },
        {
          optionKey: "pqp-c7-opcion-solo-dinero",
          label:
            "Importa solo cuando se trata de dinero; en el resto de los temas es cuestión de eficiencia.",
        },
      ],
    },
    practiceSlug: "de-quien-decide-a-como-decidimos",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "Dinámicas de poder: machismo, dinero y decisiones",
      fingerprint: "distribuye el poder",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Quién decide, y sobre qué",
        body: [
          "El dinero, la casa, los hijos, las vacaciones. El capítulo mira quién decide y qué deja eso.",
        ],
        note: `Trabajaremos con un caso inventado para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Dinámicas de poder: machismo, dinero y decisiones",
        body: [
          "Lee esa sección y fíjate en cómo describe el capítulo lo que parece práctico y no lo es.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Lo que parece práctico",
        body: [
          "El capítulo describe cómo, en muchas parejas y sin que nadie lo note, uno de los dos empieza a decidir casi todo. Puede parecer eficiencia, y aun sin mala intención los efectos son reales: uno se siente solo o infantilizado, el otro carga un peso excesivo.",
          "Nombra también el machismo operando en silencio —«eso es cosa de mujeres», el cuidado como responsabilidad de una sola parte— y dice que cuestionar esos patrones no es un ataque.",
        ],
        note: "Esto describe arreglos que dos personas pueden mirar juntas. Si plantearlo trajera castigo, silencio prolongado o miedo, ya no es un problema de reparto: la última guía de este capítulo habla de eso.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "De «quién decide» a «cómo decidimos»",
        body: [
          "Ordena los pasos de un caso inventado, desde que nadie lo ha nombrado hasta que hay algo concreto.",
        ],
        note: "Es un caso editorial, no tu casa. Y describe un arreglo entre dos personas que pueden hablar con libertad — no toda situación lo es.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "De las decisiones que se toman en tu casa, ¿hay alguna que hace mucho que no se conversa? Basta con pensarlo.",
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
        title: "El reparto se nota tarde",
        body: [
          "Un reparto desigual rara vez se ve a simple vista. Sus efectos aparecen después, y son reales aunque nadie lo haya querido así.",
        ],
      },
    ],
  },
  {
    slug: "reconocer-la-violencia",
    title: "La línea que no se cruza",
    duration: "8–10 minutos",
    recall: {
      question:
        "Según el capítulo, cuando ha aparecido la violencia, ¿cuál es la prioridad?",
      options: [
        {
          optionKey: "pqp-c7-opcion-seguridad-y-ayuda",
          label:
            "Buscar ayuda profesional y garantizar la seguridad, no salvar la relación.",
        },
        {
          optionKey: "pqp-c7-opcion-mejorar-comunicacion",
          label:
            "Trabajar la comunicación de la pareja para que no vuelva a repetirse.",
        },
        {
          optionKey: "pqp-c7-opcion-parte-de-cada-uno",
          label:
            "Que cada uno reconozca la parte que le toca en lo que pasó.",
        },
      ],
    },
    practiceSlug: "las-formas-que-nombra-el-capitulo",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "Violencia: la línea que nunca debe cruzarse",
      fingerprint: "garantizar la seguridad",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "La línea que no se cruza",
        body: [
          "El capítulo dedica una sección entera a esto y no la suaviza. Esta guía tampoco.",
        ],
        note: "Puede ser difícil de leer. No se te pedirá contar nada tuyo en ningún momento, y puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Violencia: la línea que nunca debe cruzarse",
        body: [
          "Lee la sección completa, incluidas las cinco formas que enumera y los dos párrafos que la cierran.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "No empieza con un golpe",
        body: [
          "El capítulo es explícito: la violencia no es «una pérdida momentánea de control» ni «una forma intensa de discutir». Y no siempre empieza con un golpe — puede instalarse en el desprecio, la manipulación, el control del dinero, el aislamiento o las amenazas disfrazadas de preocupación.",
          "Nombra cinco formas: física, verbal, emocional, sexual y económica. Y cierra con dos frases que conviene leer despacio: si esa línea se ha cruzado, la prioridad es buscar ayuda profesional y garantizar la seguridad, no salvar la relación. Nadie merece quedarse donde es maltratado.",
        ],
        note: "Esta guía no evalúa tu situación ni la clasifica. Si algo de esto describe tu vida, tienes derecho a pedir ayuda ahora: alguien de confianza, un profesional o un servicio de atención de tu país.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Las formas que nombra el capítulo",
        body: [
          "Cuatro escenas inventadas, ninguna con un golpe. Reconoce cuál de las formas del capítulo nombra cada una.",
        ],
        note: "No hay respuesta correcta ni puntaje: es un ejercicio de reconocimiento. Ninguna de estas formas es más leve que otra, y no se te pide contar nada tuyo.",
        actionLabel: "Ya hice la práctica",
      },
      // No REFLECTION scene here, and that is deliberate: a private prompt on
      // this material would invite someone to write down an account of being
      // harmed. Nothing in this route asks for that.
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Primero la seguridad",
        body: [
          "El capítulo lo deja dicho sin condiciones: por mucha historia compartida que haya, nadie merece quedarse en una relación donde es maltratado o maltratada.",
          "Si necesitas hablarlo, pedir ayuda es una opción disponible ahora — alguien de confianza, un profesional o un servicio de atención de tu país. No hace falta tener pruebas ni estar seguro para preguntar.",
        ],
      },
    ],
  },
];

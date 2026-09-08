import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * PQP-C07 — the four practice/recall pairs behind the chapter's guided route.
 *
 * `correctOptionKey` lives ONLY here; `order` is globally unique inside the
 * book (pilot 1–2, C01 3–10, C02 11–20, C03 21–28, C04 29–36, C05 37–44,
 * C06 45–50, so this runs 51–58); and every `sourceHeading` is verbatim from
 * the printed edition, measured against published revision #10 as present
 * exactly once.
 *
 * ── Safety — the reinforced gate ───────────────────────────────────────────
 *
 * `VIOLENCE_IS_NOT_A_COMMUNICATION_PROBLEM`. The last pair in this file is the
 * one the chapter could not be shipped without, and it is built to refuse three
 * things a derived layer would otherwise drift into.
 *
 * `las-formas-que-nombra-el-capitulo` is `context_plausibility`, the one shape
 * that carries NO answer key — sorting here is recognition, never a score, so
 * nothing about violence is gamified. Its four scenes are invented and none of
 * them is physical, because the chapter's own claim is that violence does not
 * always start with a blow. Its buckets are the five forms the chapter names,
 * so no scene lands in a «this one is fine» pile. It asks for nothing about the
 * reader, and stores nothing.
 *
 * `recall-linea-que-no-se-cruza` marks as WRONG the two framings this route
 * exists to refuse: working on couple communication so it does not repeat, and
 * each person recognising their share. The correct option is the chapter's own
 * sentence — safety and professional help, not saving the relationship.
 *
 * `de-quien-decide-a-como-decidimos` carries the other guard. A sequence about
 * redistributing decisions is the wrong answer when refusing costs something,
 * so its scenario states that these two can speak freely and its feedback says
 * where that stops being true.
 *
 * «Claves para cultivar el respeto mutuo» has no pair here on purpose: in a
 * chapter that also names violence, an exercise built on «negocia y
 * comprométete» or «aprender a ceder» risks landing as symmetric responsibility
 * on someone being harmed.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 7 is unit 8; unit 1 is the front matter. */
const CHAPTER = 8;

export const EXERCISE_CATALOG_PQP_C07: readonly UnitExerciseDefinitions[] = [
  // ── MG01 · Un límite no es un rechazo ────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c7-practice-un-limite-o-un-reproche",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 51,
      type: "REFLECTION",
      title: "¿Un límite o un reproche?",
      sourceHeading: "El respeto empieza con los límites",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cuatro frases inventadas para este ejercicio, dichas por cuatro personas distintas.",
        observation:
          "En las cuatro hay algo que a quien habla no le está sentando bien.",
        availableContext: [
          "Un límite nombra qué necesita quien lo dice para seguir estando entero.",
          "Un reproche califica a la otra persona.",
        ],
        readings: [
          {
            key: "necesito-avisar",
            label:
              "«Necesito que me avises si vas a llegar tarde; si no, me quedo esperando sin saber.»",
          },
          {
            key: "eres-un-desconsiderado",
            label: "«Eres un desconsiderado, nunca piensas en nadie.»",
          },
          {
            key: "no-delante-de-otros",
            label:
              "«No quiero que hablemos de esto delante de tus padres; prefiero que sea entre nosotros.»",
          },
          {
            key: "como-tu-madre",
            label: "«Estás igual que tu madre, no tienes remedio.»",
          },
        ],
        buckets: [
          { key: "limite", label: "Nombra algo propio" },
          { key: "reproche", label: "Califica al otro" },
        ],
        missingInformationPrompt:
          "Ninguna frase está prohibida y enfadarse no es un defecto. Este ejercicio solo separa lo que dice «esto necesito» de lo que dice «así eres». Y si nombrar un límite trajera consecuencias, eso no es un problema de cómo se dijo: la última guía de este capítulo habla de eso.",
      },
    },
    recall: {
      exerciseKey: "pqp-c7-recall-limite-no-es-rechazo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 52,
      type: "QUIZ",
      title: "Según el capítulo, ¿qué son los límites emocionales?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c7-limite-no-es-rechazo",
        options: [
          {
            key: "pqp-c7-opcion-cercas-que-resguardan",
            label:
              "Cercas invisibles que resguardan la integridad emocional de cada uno, no muros que separan.",
          },
          {
            key: "pqp-c7-opcion-reglas-al-otro",
            label:
              "Reglas que se le ponen al otro para que corrija lo que hace mal.",
          },
          {
            key: "pqp-c7-opcion-senal-de-desconfianza",
            label:
              "Una señal de que todavía falta confianza, y que se van necesitando menos con los años.",
          },
        ],
        correctOptionKey: "pqp-c7-opcion-cercas-que-resguardan",
      },
      feedback: {
        correct:
          "Esa es la imagen del capítulo: cercas, no muros. Dentro viven los valores, las memorias y las necesidades de cada uno.",
        review:
          "Vuelve al principio del capítulo. Los límites no se ponen al otro ni desaparecen con los años: resguardan lo que hace a cada uno ser quien es.",
      },
    },
  },

  // ── MG02 · Cómo hablas de tu pareja cuando no está ───────────────────────
  {
    practice: {
      exerciseKey: "pqp-c7-practice-la-misma-broma-en-dos-mesas",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 53,
      type: "REFLECTION",
      title: "La misma broma en dos mesas",
      sourceHeading: "Comunicación y cuidado como expresión de respeto",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Una persona inventada hace una broma sobre lo despistada que es su pareja.",
          "La cuenta bien y hay risas.",
          "La pareja sonríe y no dice nada.",
        ],
        contexts: [
          {
            key: "entre-los-dos",
            label: "En casa, entre los dos",
            description:
              "Se toman el pelo a menudo y los dos lo hacen por igual.",
          },
          {
            key: "delante-de-amigos",
            label: "En una cena, delante de amigos",
            description:
              "La pareja ya había dicho en privado que ese tema le incomoda.",
          },
        ],
        factors: [
          {
            key: "ya-lo-dijo",
            label: "Si el otro ya había dicho que ese tema le molesta.",
          },
          {
            key: "puede-pararlo",
            label: "Si el otro puede pedir que pare sin quedar mal.",
          },
          {
            key: "va-en-dos-direcciones",
            label: "Si el juego va en las dos direcciones o siempre en una.",
          },
          {
            key: "se-repite",
            label: "Si ocurre una vez o cada vez que hay gente.",
          },
        ],
        prompt:
          "La broma es la misma en los dos casos. ¿Qué podría cambiar en lo que deja? No todo el humor compartido es desprecio, y nada aquí se marca como correcto.",
      },
    },
    recall: {
      exerciseKey: "pqp-c7-recall-hablar-del-otro-sin-testigos",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 54,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué pueden ser las bromas a costa de la pareja delante de otros?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c7-hablar-del-otro-sin-testigos",
        options: [
          {
            key: "pqp-c7-opcion-desprecio-encubierto",
            label:
              "Una forma encubierta de desprecio, capaz de dañar la autoestima y romper la complicidad.",
          },
          {
            key: "pqp-c7-opcion-muestra-de-confianza",
            label:
              "Una muestra de confianza y complicidad que en general fortalece el vínculo.",
          },
          {
            key: "pqp-c7-opcion-susceptibilidad",
            label:
              "Un asunto de susceptibilidad de quien se molesta, más que del contenido de la broma.",
          },
        ],
        correctOptionKey: "pqp-c7-opcion-desprecio-encubierto",
      },
      feedback: {
        correct:
          "Eso señala el capítulo: aunque suene gracioso y todos se rían, ridiculizar al otro puede dañar la autoestima.",
        review:
          "Relee esa sección. El capítulo no lo trata como complicidad ni lo devuelve a quien se molesta: lo describe como una forma encubierta de desprecio.",
      },
    },
  },

  // ── MG03 · Quién decide, y sobre qué ─────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c7-practice-de-quien-decide-a-como-decidimos",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 55,
      type: "REFLECTION",
      title: "De «quién decide» a «cómo decidimos»",
      sourceHeading: "Dinámicas de poder: machismo, dinero y decisiones",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio, Delia y Aníbal, en la que él lleva las cuentas desde siempre. Los dos pueden hablar de esto con libertad. Ordena los pasos hasta que hay algo concreto.",
        cards: [
          {
            key: "nadie-lo-nombra",
            label:
              "Uno lleva las cuentas y el otro no sabe cuánto entra ni cuánto sale. Nunca se decidió así: se fue dando.",
          },
          {
            key: "lo-nombran",
            label:
              "Uno lo dice en voz alta, sin acusar: «no sé en qué estamos, y quiero saberlo».",
          },
          {
            key: "que-necesita-cada-uno",
            label:
              "Cuentan qué necesita cada uno: uno enterarse, el otro no quedarse solo cargando con todo.",
          },
          {
            key: "concreto-y-revisable",
            label:
              "Acuerdan algo concreto —qué se mira juntos y cada cuánto— y ponen fecha para revisarlo.",
          },
        ],
        solved: [
          "nadie-lo-nombra",
          "lo-nombran",
          "que-necesita-cada-uno",
          "concreto-y-revisable",
        ],
        solvedLabel: "Un orden posible",
        feedback:
          "Esta secuencia describe un arreglo entre dos personas que pueden plantearlo. Si nombrarlo trajera castigo, silencio prolongado o miedo, ya no es un problema de reparto y no se resuelve negociando: la última guía de este capítulo habla de eso.",
      },
    },
    recall: {
      exerciseKey: "pqp-c7-recall-quien-decide-en-casa",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 56,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿por qué importa una distribución desigual de las decisiones aunque no haya mala intención?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c7-quien-decide-en-casa",
        options: [
          {
            key: "pqp-c7-opcion-efectos-reales",
            label:
              "Porque los efectos son reales igualmente: uno se siente solo o invisible, el otro carga un peso excesivo, y aparecen resentimiento o distancia.",
          },
          {
            key: "pqp-c7-opcion-si-funciona-da-igual",
            label:
              "No importa mientras la casa funcione y ninguno de los dos se queje.",
          },
          {
            key: "pqp-c7-opcion-solo-dinero",
            label:
              "Importa solo cuando se trata de dinero; en el resto de los temas es cuestión de eficiencia.",
          },
        ],
        correctOptionKey: "pqp-c7-opcion-efectos-reales",
      },
      feedback: {
        correct:
          "Eso dice el capítulo: aunque no siempre haya mala intención, los efectos aparecen igual y no solo en el dinero.",
        review:
          "Vuelve a esa sección. El capítulo dice que el poder mal distribuido no siempre se nota a simple vista, y que sus efectos aparecen tarde o temprano.",
      },
    },
  },

  // ── MG04 · La línea que no se cruza ──────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c7-practice-las-formas-que-nombra-el-capitulo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 57,
      type: "REFLECTION",
      title: "Las formas que nombra el capítulo",
      sourceHeading: "Violencia: la línea que nunca debe cruzarse",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Cuatro escenas inventadas para este ejercicio, de cuatro parejas distintas. En ninguna hay un golpe.",
        observation:
          "El capítulo sostiene que la violencia no siempre empieza con un golpe.",
        availableContext: [
          "El capítulo enumera cinco formas: física, verbal, emocional, sexual y económica.",
          "Ninguna de esas formas es más leve que otra.",
        ],
        readings: [
          {
            key: "sin-acceso-al-dinero",
            label:
              "Uno controla todo el dinero y condiciona lo que el otro necesita para vivir.",
          },
          {
            key: "hacerle-dudar",
            label:
              "Uno le repite al otro que no pasó lo que recuerda, hasta que el otro duda de sí mismo.",
          },
          {
            key: "gritos-e-insultos",
            label: "Gritos, insultos y burlas cada vez que discuten.",
          },
          {
            key: "sin-consentimiento",
            label:
              "Uno insiste en encuentros íntimos que el otro no quiere, o los usa como premio y castigo.",
          },
        ],
        buckets: [
          { key: "fisica", label: "Física" },
          { key: "verbal", label: "Verbal" },
          { key: "emocional", label: "Emocional" },
          { key: "sexual", label: "Sexual" },
          { key: "economica", label: "Económica" },
        ],
        missingInformationPrompt:
          "No hay respuesta correcta ni puntaje: esto es reconocimiento, no una prueba. Las cuatro escenas describen formas que el capítulo nombra, y ninguna es más leve que otra. No se te pide contar nada tuyo, y nada de lo que hagas aquí se guarda. Si alguna se pareciera a tu vida, tienes derecho a pedir ayuda ahora — alguien de confianza, un profesional o un servicio de atención de tu país.",
      },
    },
    recall: {
      exerciseKey: "pqp-c7-recall-reconocer-la-violencia",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 58,
      type: "QUIZ",
      title:
        "Según el capítulo, cuando ha aparecido la violencia, ¿cuál es la prioridad?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c7-reconocer-la-violencia",
        options: [
          {
            key: "pqp-c7-opcion-seguridad-y-ayuda",
            label:
              "Buscar ayuda profesional y garantizar la seguridad, no salvar la relación.",
          },
          {
            key: "pqp-c7-opcion-mejorar-comunicacion",
            label:
              "Trabajar la comunicación de la pareja para que no vuelva a repetirse.",
          },
          {
            key: "pqp-c7-opcion-parte-de-cada-uno",
            label:
              "Que cada uno reconozca la parte que le toca en lo que pasó.",
          },
        ],
        correctOptionKey: "pqp-c7-opcion-seguridad-y-ayuda",
      },
      feedback: {
        correct:
          "Esa es la frase del capítulo, y conviene tenerla clara: la prioridad es la seguridad y la ayuda profesional, no salvar la relación. Nadie merece quedarse donde es maltratado.",
        review:
          "Vuelve al final de esa sección. El capítulo no propone mejorar la comunicación ni repartir la responsabilidad: dice que la violencia rompe por completo la base sobre la que se podría trabajar, y que la prioridad es la seguridad y la ayuda profesional.",
      },
    },
  },
];

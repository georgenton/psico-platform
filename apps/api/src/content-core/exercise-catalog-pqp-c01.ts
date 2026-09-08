import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * PQP-C01 — the four practice/recall pairs behind the chapter's guided route.
 *
 * Content only; the shapes, the validation and the ingestion all live in
 * `exercise-ingestion-catalog.ts`. Split out for the same reason C03–C10 was:
 * four pairs inline would bury the definitions they depend on.
 *
 * Three things are load-bearing here.
 *
 *   · `correctOptionKey` lives ONLY in this file. It is server-side and never
 *     reaches a manifest, a web bundle, the public Experience content or the
 *     DOM.
 *   · `order` is globally unique inside the book. The V1 pilot holds 1–2, so
 *     this file runs 3–10 without gaps and never renumbers the pilot.
 *   · `sourceHeading` is verbatim from the printed edition
 *     (`PQP_PRINTED_v1.0_TEXT_LOCKED_2026-09-07`, SHA-256 `6151a1ca…5b616f`)
 *     and each one was measured against published revision #10: present
 *     exactly once in the unit. MG04's is the COMPLETE printed line — measured
 *     with it truncated, the exact match count is 0.
 *
 * ── Why every practice is fictional ────────────────────────────────────────
 *
 * The five catalog interactions classify EDITORIAL material. None of them
 * collects what two people did, and none of them should: a reader's own
 * relationship is not a thing to be graded. The chapter's couple activities —
 * the mutual-gaze exercise above all — are designed as Dúo drafts instead, and
 * `DUO_IS_NOT_CATALOG_PRACTICE` is the rule that keeps them out of here.
 *
 * ── Why the derived copy is more cautious than the book ────────────────────
 *
 * `DERIVED_COPY_MAY_BE_MORE_CAUTIOUS_THAN_BOOK=true`. The chapter cites
 * hormones, cortisol readings, a longitudinal follow-up and a percentage. The
 * PASSAGE scene shows the author's text as it is printed; what this catalog
 * teaches and grades is the RELATIONAL idea — presence is not resolution,
 * observation contributes to what is learned, a form of care can be
 * reinvented. No item here asserts a physiological mechanism, a biomarker, a
 * causal claim or a figure as a fact of its own. That is not a correction of
 * the book: the book is untouched. It is a limit on what FeelVerse says in its
 * own voice.
 *
 * Editorial authority: «PQP-C01 — Inventario editorial y diseño de experiencia
 * v0.1», approved 2026-09-07. Every derived formulation still needs the
 * author's review before publication.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 1 is unit 2; unit 1 is the front matter. */
const CHAPTER = 2;

export const EXERCISE_CATALOG_PQP_C01: readonly UnitExerciseDefinitions[] = [
  // ── MG01 · El amor se practica ───────────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c1-practice-orden-de-lo-cotidiano",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 3,
      type: "REFLECTION",
      title: "El orden de lo cotidiano",
      sourceHeading: "El Amor como Medicina",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio, Nadia y Tomás, decide cuidar mejor sus tardes. Ordena los pasos según la lógica que el capítulo describe: primero se observa cuándo aparece la tensión, luego se elige un gesto pequeño para ese momento, después se repite, y solo al final se nota el cambio.",
        cards: [
          {
            key: "observar",
            label:
              "Notan que las discusiones aparecen casi siempre en la misma media hora del día.",
          },
          {
            key: "elegir",
            label:
              "Eligen un gesto breve y concreto para esa franja: saludarse antes de contar el día.",
          },
          {
            key: "repetir",
            label: "Lo repiten aunque alguno llegue cansado o de mal humor.",
          },
          {
            key: "notar",
            label:
              "Semanas después notan que esa media hora se siente distinta.",
          },
        ],
        solved: ["observar", "elegir", "repetir", "notar"],
        solvedLabel: "El orden que propone el capítulo",
        feedback:
          "La secuencia empieza por observar y termina por notar el cambio, no al revés. Lo que el capítulo sitúa en el centro es la repetición: un gesto pequeño sostenido en el tiempo, no un gesto extraordinario.",
      },
    },
    recall: {
      exerciseKey: "pqp-c1-recall-amor-como-practica",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 4,
      type: "QUIZ",
      title:
        "Según la idea central de este capítulo, ¿de qué depende principalmente un amor que dura?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c1-amor-como-practica",
        options: [
          {
            key: "pqp-opcion-conductas-repetidas",
            label:
              "De practicar de forma repetida conductas de cuidado y conexión.",
          },
          {
            key: "pqp-opcion-enamoramiento-permanente",
            label:
              "De mantener permanentemente la intensidad del enamoramiento inicial.",
          },
          {
            key: "pqp-opcion-evitar-conflictos",
            label: "De evitar los conflictos para que no dañen el vínculo.",
          },
        ],
        correctOptionKey: "pqp-opcion-conductas-repetidas",
      },
      feedback: {
        correct:
          "Eso es lo que propone el capítulo: el amor no es solo algo que se siente, también es algo que se hace, y se sostiene en conductas cotidianas y repetidas.",
        review:
          "Vuelve al cierre de «El Amor como Medicina». Allí el capítulo describe el amor como un verbo antes que como un sustantivo: algo que se practica, no solo algo que se tiene.",
      },
    },
  },

  // ── MG02 · Presencia sin acuerdo ─────────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c1-practice-lo-que-se-y-lo-que-supongo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 5,
      type: "REFLECTION",
      title: "Lo que sé y lo que supongo",
      sourceHeading: "El Cerebro Enamorado",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Una escena inventada para este ejercicio. Después de un desacuerdo que quedó sin resolver, Iris se sienta al lado de Beto en el sofá y no dice nada.",
        observation: "Iris se sienta cerca y permanece en silencio.",
        availableContext: [
          "El desacuerdo sigue sin resolverse.",
          "Ninguno de los dos ha pedido disculpas.",
          "Iris eligió sentarse cerca en lugar de irse a otra habitación.",
        ],
        readings: [
          {
            key: "sigue-enojada",
            label: "Iris sigue enojada y por eso no habla.",
          },
          {
            key: "ya-no-importa",
            label: "A Iris ya no le importa el desacuerdo.",
          },
          {
            key: "quiere-estar-cerca",
            label:
              "Iris quiere seguir cerca aunque el desacuerdo no esté resuelto.",
          },
          {
            key: "espera-disculpa",
            label: "Iris espera que Beto hable primero.",
          },
        ],
        buckets: [
          { key: "observado", label: "Esto es lo que se observó" },
          { key: "supuesto", label: "Esto lo estoy suponiendo" },
        ],
        missingInformationPrompt:
          "¿Qué haría falta saber para distinguir entre estas lecturas? Fíjate en que ninguna de ellas está escrita en la escena: la escena solo dice que se sentó cerca y no habló.",
      },
    },
    recall: {
      exerciseKey: "pqp-c1-recall-presencia-sin-acuerdo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 6,
      type: "QUIZ",
      title:
        "¿Qué idea describe mejor la relación entre conflicto y seguridad emocional?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c1-presencia-sin-acuerdo",
        options: [
          {
            key: "pqp-opcion-atravesar-conservando",
            label:
              "Una relación puede atravesar un conflicto y, al mismo tiempo, intentar conservar señales de vínculo y respeto.",
          },
          {
            key: "pqp-opcion-sin-conflictos",
            label: "Una relación segura nunca tiene conflictos.",
          },
          {
            key: "pqp-opcion-evitar-hasta-que-pase",
            label:
              "La mejor forma de proteger una relación es evitar las conversaciones difíciles hasta que el malestar desaparezca.",
          },
        ],
        correctOptionKey: "pqp-opcion-atravesar-conservando",
      },
      feedback: {
        correct:
          "El capítulo propone que conflicto y conexión no son necesariamente opuestos: una pareja puede estar en desacuerdo sin renunciar a todas las señales de vínculo.",
        review:
          "Vuelve al pasaje y fíjate en la diferencia entre resolver el problema y permanecer conectados mientras el desacuerdo sigue ahí.",
      },
    },
  },

  // ── MG03 · Lo que aprenden mirando ───────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c1-practice-misma-escena-dos-lecturas",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 7,
      type: "REFLECTION",
      title: "La misma escena, dos contextos",
      sourceHeading: "Los Hijos",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Dos adultos suben el tono al discutir.",
          "Uno de los dos hace una broma en medio de la discusión.",
          "Después de discutir, vuelven a hablarse con normalidad.",
        ],
        contexts: [
          {
            key: "sin-reparacion",
            label: "La escena termina ahí",
            description:
              "La discusión se interrumpe y el asunto no se retoma en los días siguientes.",
          },
          {
            key: "con-reparacion",
            label: "La escena incluye una reparación",
            description:
              "Más tarde los adultos vuelven sobre lo ocurrido y lo nombran en voz alta.",
          },
        ],
        factors: [
          {
            key: "si-se-retoma",
            label: "Si el asunto se retoma después o queda suspendido.",
          },
          {
            key: "que-hacen-despues",
            label: "Lo que hacen los adultos después del desacuerdo.",
          },
          {
            key: "si-la-broma-incluye",
            label: "Si la broma incluye a la otra persona o se ríe de ella.",
          },
          {
            key: "cuantas-veces",
            label: "Si es una escena aislada o algo que se repite.",
          },
        ],
        prompt:
          "Las señales son las mismas en los dos contextos. ¿Qué podría cambiar en lo que alguien que observa la escena alcanza a aprender de ella? Aquí nada se marca como correcto o incorrecto: es un ejercicio para notar que la misma conducta no dice lo mismo en cualquier situación.",
      },
    },
    recall: {
      exerciseKey: "pqp-c1-recall-clima-que-aprenden",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 8,
      type: "QUIZ",
      title:
        "Según la idea trabajada en esta guía, ¿qué puede contribuir a lo que niños y adolescentes aprenden sobre las relaciones?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c1-clima-que-aprenden",
        options: [
          {
            key: "pqp-opcion-tambien-lo-observado",
            label:
              "También lo que observan en cómo las personas cercanas se tratan, atraviesan desacuerdos y reparan.",
          },
          {
            key: "pqp-opcion-solo-explicaciones",
            label:
              "Solo las explicaciones explícitas que reciben sobre el amor.",
          },
          {
            key: "pqp-opcion-una-discusion-define",
            label:
              "Una única discusión familiar define cómo entenderán sus relaciones en el futuro.",
          },
        ],
        correctOptionKey: "pqp-opcion-tambien-lo-observado",
      },
      feedback: {
        correct:
          "La palabra importante es «también»: lo observado se suma a lo que se dice, y ninguna escena aislada decide por sí sola lo que alguien aprenderá sobre las relaciones.",
        review:
          "Vuelve a la sección «Los Hijos». La idea es que lo observado contribuye a lo que se aprende — no que sea la única fuente ni que una escena suelta determine el futuro de nadie.",
      },
    },
  },

  // ── MG04 · Cuando el amor se reinventa ───────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c1-practice-lo-que-dejo-de-funcionar",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 9,
      type: "REFLECTION",
      title: "Cuando una forma deja de ser posible",
      sourceHeading:
        "Un Testimonio Personal: Mireya y Yo – Los Abrazos que Cruzaron el Dolor",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio, Elena y Rubén, se despedía cada mañana tomando café juntos. Un cambio de turno de trabajo lo vuelve imposible. Ordena los pasos de la secuencia que el capítulo describe.",
        cards: [
          {
            key: "forma-antigua",
            label: "Tenían una forma habitual de despedirse cada mañana.",
          },
          {
            key: "cambio",
            label:
              "Un cambio de circunstancias hace que esa forma ya no sea posible.",
          },
          {
            key: "intento",
            label:
              "Prueban algo distinto que al principio no termina de funcionar.",
          },
          {
            key: "forma-nueva",
            label:
              "Encuentran otra manera de despedirse que sí les sirve a los dos.",
          },
        ],
        solved: ["forma-antigua", "cambio", "intento", "forma-nueva"],
        solvedLabel: "La secuencia que describe el capítulo",
        feedback:
          "El paso que suele saltarse es el tercero. El capítulo no describe un cambio inmediato sino un intento que no funciona del todo antes de encontrar otra forma. Buscar una alternativa es una posibilidad que el capítulo ofrece, no una obligación ni una receta que sirva igual en toda situación.",
      },
    },
    recall: {
      exerciseKey: "pqp-c1-recall-reinventar-el-vinculo",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 10,
      type: "QUIZ",
      title:
        "¿Qué ocurre cuando una pareja atraviesa una dificultad que impide mantener una forma habitual de conexión?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c1-reinventar-el-vinculo",
        options: [
          {
            key: "pqp-opcion-otra-manera",
            label:
              "Pueden buscar otra manera de sostener el vínculo mientras esa forma no sea posible.",
          },
          {
            key: "pqp-opcion-deterioro-inevitable",
            label: "Significa que la relación se está deteriorando.",
          },
          {
            key: "pqp-opcion-esperar",
            label:
              "Deben esperar sin hacer nada hasta que las circunstancias vuelvan a permitirlo.",
          },
        ],
        correctOptionKey: "pqp-opcion-otra-manera",
      },
      feedback: {
        correct:
          "Eso es lo que narra el testimonio del capítulo: cuando una forma de cuidarse deja de ser posible, puede aparecer otra. Es una posibilidad, no una obligación ni una garantía.",
        review:
          "Relee el cierre del testimonio personal. La idea no es que una pareja que no se reinventa fracase, sino que buscar otra forma de sostener el vínculo es una opción disponible.",
      },
    },
  },
];

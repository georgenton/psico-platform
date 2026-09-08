import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * PQP-C04 — the four practice/recall pairs behind the chapter's guided route.
 *
 * Same rules as the other chapters': `correctOptionKey` lives ONLY here;
 * `order` is globally unique inside the book (pilot 1–2, C01 3–10, C02 11–20,
 * C03 21–28, so this runs 29–36); and every `sourceHeading` is verbatim from
 * the printed edition, measured against published revision #10 as present
 * exactly once.
 *
 * ── Safety of this chapter in particular ──────────────────────────────────
 *
 * `BETTER_COMMUNICATION_IS_NOT_A_REMEDY_FOR_HARM`. A chapter about
 * communication carries a specific risk: that someone whose partner
 * intimidates, coerces or hurts them concludes the problem is how they phrase
 * things. Two items carry the limit explicitly — `en-que-nivel-ocurre`, which
 * frames the whole route, and `validar-o-ceder`, where the risk is highest,
 * because «validate the other» must never be read as an instruction to
 * accommodate someone causing harm.
 *
 * `validar-o-ceder` is built so that the safe answer is never «give in». Its
 * options include both a validating response that keeps its own position and a
 * capitulating one, and the prompt says out loud that recognising a feeling and
 * conceding a point are different things.
 *
 * No item asks a reader to rate how well they communicate, and no practice uses
 * their own conversations. All four run on invented scenes.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 4 is unit 5; unit 1 is the front matter. */
const CHAPTER = 5;

export const EXERCISE_CATALOG_PQP_C04: readonly UnitExerciseDefinitions[] = [
  // ── MG01 · Hablar no es comunicarse ──────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c4-practice-en-que-nivel-ocurre",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 29,
      type: "REFLECTION",
      title: "¿En qué nivel ocurre?",
      sourceHeading: "Los niveles de la comunicación",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Una tarde inventada para este ejercicio, con cuatro intercambios entre dos personas que conviven.",
        observation: "Los cuatro ocurren el mismo día.",
        availableContext: [
          "Ninguno de los cuatro es una discusión.",
          "Los cuatro son intercambios normales de un día cualquiera.",
        ],
        readings: [
          {
            key: "recogida",
            label: "«¿Recoges tú a los niños o voy yo?»",
          },
          {
            key: "cansancio",
            label:
              "«Llevo semanas levantándome con una sensación rara y no sé de qué es.»",
          },
          {
            key: "seguro",
            label: "«Hay que renovar el seguro antes del viernes.»",
          },
          {
            key: "miedo",
            label:
              "«Me da miedo que si acepto ese puesto acabemos viéndonos menos.»",
          },
        ],
        buckets: [
          { key: "practico", label: "Organiza la vida práctica" },
          { key: "personal", label: "Abre algo personal" },
        ],
        missingInformationPrompt:
          "Ningún nivel es mejor que otro y la logística también hace falta. El ejercicio solo distingue dónde ocurre cada intercambio, porque una conversación puede ser muy frecuente y quedarse siempre en la misma capa.",
      },
    },
    recall: {
      exerciseKey: "pqp-c4-recall-hablar-no-es-comunicarse",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 30,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué distingue hablar de comunicarse en una pareja?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c4-hablar-no-es-comunicarse",
        options: [
          {
            key: "pqp-c4-opcion-niveles",
            label:
              "Que se puede hablar mucho quedándose en niveles superficiales y no llegar nunca a lo que a cada uno le importa.",
          },
          {
            key: "pqp-c4-opcion-cantidad",
            label:
              "Que comunicarse exige dedicar más tiempo del que la mayoría de las parejas dedica a hablar.",
          },
          {
            key: "pqp-c4-opcion-tecnica",
            label:
              "Que comunicarse requiere una técnica concreta y hablar es lo que se hace sin ella.",
          },
        ],
        correctOptionKey: "pqp-c4-opcion-niveles",
      },
      feedback: {
        correct:
          "Eso es. Lo que el capítulo señala no es la cantidad de palabras ni una técnica, sino a qué capa llega la conversación.",
        review:
          "Vuelve a la sección de los niveles. El capítulo describe conversaciones que ocurren todos los días sin llegar nunca a lo que a cada uno le importa.",
      },
    },
  },

  // ── MG02 · No pelear no es lo mismo que estar conectados ─────────────────
  {
    practice: {
      exerciseKey: "pqp-c4-practice-armonia-o-distancia",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 31,
      type: "REFLECTION",
      title: "¿Armonía o distancia?",
      sourceHeading: "2. Comunicación de hechos: la crónica del día",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Una pareja inventada pasa la semana sin ninguna discusión.",
          "Se coordinan bien con la casa y los horarios.",
          "Las conversaciones son breves y prácticas.",
        ],
        contexts: [
          {
            key: "con-espacios",
            label: "Además hay otros momentos",
            description:
              "Alguna noche se quedan hablando de algo que no era logística.",
          },
          {
            key: "sin-espacios",
            label: "No hay otros momentos",
            description:
              "Hace meses que todas sus conversaciones son de organización.",
          },
        ],
        factors: [
          {
            key: "otros-momentos",
            label: "Si existen conversaciones fuera de lo práctico.",
          },
          {
            key: "temas-evitados",
            label: "Si hay temas que ninguno saca.",
          },
          {
            key: "cuanto-lleva",
            label: "Cuánto tiempo lleva siendo así.",
          },
          {
            key: "les-pasa-algo",
            label: "Si a alguno le pesa, o si a ambos les acomoda.",
          },
        ],
        prompt:
          "Las señales son idénticas: una semana tranquila y bien organizada. ¿Qué haría falta saber para distinguir calma de distancia? No discutir no es, por sí solo, ni buena ni mala señal.",
      },
    },
    recall: {
      exerciseKey: "pqp-c4-recall-armonia-no-es-salud",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 32,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué riesgo tiene una pareja que casi nunca discute?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c4-armonia-no-es-salud",
        options: [
          {
            key: "pqp-c4-opcion-ausencia-no-es-conexion",
            label:
              "Que la ausencia de discusiones se confunda con conexión, cuando puede convivir con no hablar de nada personal.",
          },
          {
            key: "pqp-c4-opcion-explotara",
            label:
              "Que lo no hablado se acumule hasta estallar en una discusión mucho mayor.",
          },
          {
            key: "pqp-c4-opcion-ninguno",
            label:
              "Ninguno: no discutir es el mejor indicador de que una relación funciona.",
          },
        ],
        correctOptionKey: "pqp-c4-opcion-ausencia-no-es-conexion",
      },
      feedback: {
        correct:
          "Eso es lo que el capítulo llama la trampa: la calma puede convivir con no exponerse a nada.",
        review:
          "Relee esa sección. El capítulo no anuncia un estallido ni celebra la calma: dice que no discutir, por sí solo, no informa de si hay conexión.",
      },
    },
  },

  // ── MG03 · Pensar distinto no divide ─────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c4-practice-el-miedo-debajo-de-la-opinion",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 33,
      type: "REFLECTION",
      title: "El miedo debajo de la opinión",
      sourceHeading: "3. Comunicación de ideas: pensar distinto sin dividirse",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Una pareja inventada para este ejercicio: Sonia y Pau llevan meses sin hablar de si mudarse cerca de la familia de uno de ellos. Ordena los pasos.",
        cards: [
          {
            key: "evitado",
            label: "El tema aparece y alguno lo desvía, las dos veces.",
          },
          {
            key: "nombra",
            label:
              "Uno dice en voz alta qué teme que se entienda si da su opinión.",
          },
          {
            key: "el-otro",
            label:
              "El otro reconoce que también tenía un temor, distinto del que se imaginaba.",
          },
          {
            key: "siguen-distintos",
            label:
              "Siguen sin coincidir en qué hacer, y la conversación ya no se evita.",
          },
        ],
        solved: ["evitado", "nombra", "el-otro", "siguen-distintos"],
        solvedLabel: "El orden que describe el capítulo",
        feedback:
          "El último paso es el que suele sorprender: siguen pensando distinto. El capítulo no describe una conversación que resuelva el desacuerdo, sino una que deja de evitarse.",
      },
    },
    recall: {
      exerciseKey: "pqp-c4-recall-pensar-distinto-sin-dividirse",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 34,
      type: "QUIZ",
      title:
        "Según el capítulo, ¿qué suele ocurrir cuando una pareja se muestra sus opiniones distintas sobre algo importante?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c4-pensar-distinto-sin-dividirse",
        options: [
          {
            key: "pqp-c4-opcion-se-conocen-mas",
            label:
              "Que llegan a conocerse mejor, en lugar de dividirse como a veces temen.",
          },
          {
            key: "pqp-c4-opcion-mejor-evitar",
            label:
              "Que conviene evitarlo en los temas de fondo, para no abrir distancias innecesarias.",
          },
          {
            key: "pqp-c4-opcion-hay-que-convencer",
            label:
              "Que uno de los dos acabará convenciendo al otro si expone bien sus razones.",
          },
        ],
        correctOptionKey: "pqp-c4-opcion-se-conocen-mas",
      },
      feedback: {
        correct:
          "Eso describe el capítulo: mostrar la diferencia no los separó, y el objetivo no era convencer a nadie.",
        review:
          "Vuelve a esa sección. Ni evitar el tema ni ganar la discusión: lo que el capítulo narra es que al mostrarse las ideas llegaron a conocerse mejor.",
      },
    },
  },

  // ── MG04 · Validar no es dar la razón ────────────────────────────────────
  {
    practice: {
      exerciseKey: "pqp-c4-practice-validar-o-ceder",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 35,
      type: "REFLECTION",
      title: "¿Validar o ceder?",
      sourceHeading: "7. Valida al otro",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Una escena inventada para este ejercicio. Ada le dice a Bruno que se sintió sola en una reunión a la que fueron juntos. Bruno no lo vivió así.",
        observation: "Bruno va a responder algo.",
        availableContext: [
          "Bruno recuerda la reunión de otra manera.",
          "Ada no está pidiendo que le den la razón.",
        ],
        readings: [
          {
            key: "reconoce-mantiene",
            label:
              "«Entiendo que te sintieras sola, aunque yo lo viví distinto. Cuéntame en qué momento.»",
          },
          {
            key: "cede",
            label: "«Tienes razón, estuvo fatal, fue culpa mía.»",
          },
          {
            key: "corrige",
            label:
              "«No estuviste sola, si estuvimos juntos casi toda la noche.»",
          },
          {
            key: "calla",
            label: "«Vale.» Y cambia de tema.",
          },
        ],
        buckets: [
          {
            key: "valida",
            label: "Reconoce lo que siente y mantiene su punto de vista",
          },
          {
            key: "no-valida",
            label: "Corrige, cede o se retira",
          },
        ],
        missingInformationPrompt:
          "Fíjate en que ceder tampoco es validar: dar la razón para cerrar el tema deja a Bruno sin postura y a Ada sin interlocutor. Reconocer un sentimiento y conceder un punto son cosas distintas.",
      },
    },
    recall: {
      exerciseKey: "pqp-c4-recall-validar-no-es-dar-la-razon",
      bookSlug: BOOK,
      chapterOrder: CHAPTER,
      order: 36,
      type: "QUIZ",
      title: "Según el capítulo, ¿qué significa validar a la otra persona?",
      content: {
        recallMode: "objective",
        conceptKey: "pqp-c4-validar-no-es-dar-la-razon",
        options: [
          {
            key: "pqp-c4-opcion-reconocer-sentir",
            label:
              "Reconocer que lo que siente tiene sentido para ella, aunque no se comparta su punto de vista.",
          },
          {
            key: "pqp-c4-opcion-darle-razon",
            label:
              "Aceptar que tiene razón para que la conversación no escale.",
          },
          {
            key: "pqp-c4-opcion-callar",
            label:
              "Guardarse la propia opinión mientras la otra persona está alterada.",
          },
        ],
        correctOptionKey: "pqp-c4-opcion-reconocer-sentir",
      },
      feedback: {
        correct:
          "Eso es. El capítulo lo dice explícitamente: validar no es lo mismo que estar de acuerdo, y permite acercarse sin renunciar a la propia postura.",
        review:
          "Vuelve a esa sección. Ni dar la razón ni callarse: validar es reconocer que lo que el otro siente tiene sentido desde donde está.",
      },
    },
  },
];

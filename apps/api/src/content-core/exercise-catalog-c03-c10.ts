import type { UnitExerciseDefinitions } from "./exercise-ingestion-catalog";

/**
 * EEC-C03 → C10 — the forty practice/recall pairs behind the guided suites.
 *
 * Content only. The shapes, the validation and the ingestion all live in
 * `exercise-ingestion-catalog.ts`; this file is the editorial half, split out
 * because forty pairs inline would bury the ~110 lines that define what a pair
 * IS. Same catalog, same rules, same `practiceKind`s — no renderer is added.
 *
 * Two things are load-bearing and easy to lose in a merge:
 *
 *   · `correctOptionKey` lives ONLY here. It is server-side and never reaches a
 *     manifest, a web bundle, the public Experience content or the DOM. A test
 *     asserts that for all forty.
 *   · `order` is globally unique inside the book. C01 holds 1–12, C02 13–22,
 *     so this file starts at 23 and runs to 102 without gaps.
 *
 * The feedback never says "you are wrong": REVIEW restates the distinction the
 * chapter draws. A missed recall produces no diagnosis, no profile and no
 * inference about the reader — the whole point of the objective format is that
 * it grades an idea, not a person.
 *
 * Editorial authority: «EEC-C03–C10 — Inventario maestro de experiencias v0.1»
 * (https://app.notion.com/p/3d2cbb1031a081149d97ca054012b276), approved
 * 2026-09-04 with `APROBAR ARQUITECTURA C03-C10`.
 */

const BOOK = "emociones-en-construccion";

export const EXERCISE_CATALOG_C03_C10: readonly UnitExerciseDefinitions[] = [
  // ── EEC-C03 · Tu cerebro inventa emociones ───────────────────────────────
  {
    practice: {
      exerciseKey: "eec-c3-practice-anticipar-dato-afirmacion",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 23,
      type: "REFLECTION",
      title: "Anticipación, dato y afirmación de más",
      sourceHeading: "Predecir no es adivinar",
      practiceKind: "belief_lens",
      interaction: {
        kind: "belief_lens",
        belief: "«Sabía que iba a salir mal desde que vi su cara.»",
        zones: [
          {
            key: "observo",
            label: "Lo que se observó",
            hint: "Solo lo que estaba disponible como información.",
            options: [
              { key: "gesto", label: "Su expresión cambió al entrar." },
              { key: "silencio", label: "Hubo un silencio antes de hablar." },
              { key: "resultado", label: "La conversación terminó mal." },
            ],
          },
          {
            key: "supongo",
            label: "Lo que se está anticipando con experiencia previa",
            hint: "La parte que viene de lo aprendido, no de la escena.",
            options: [
              {
                key: "patron",
                label:
                  "Esa cara se parece a otras que antecedieron un problema.",
              },
              {
                key: "intencion",
                label: "Venía con la intención de discutir.",
              },
              {
                key: "certeza",
                label: "El desenlace estaba decidido desde el principio.",
              },
            ],
          },
          {
            key: "falta",
            label: "Lo que faltaría para sostenerlo",
            hint: "El dato que convertiría la anticipación en conclusión.",
            options: [
              { key: "preguntar", label: "Qué le estaba pasando ese día." },
              {
                key: "otras-veces",
                label: "Cuántas veces esa misma cara NO terminó así.",
              },
              { key: "contexto", label: "Qué ocurrió antes de que llegara." },
            ],
          },
        ],
        allowsFreeText: true,
      },
    },
    recall: {
      exerciseKey: "eec-c3-recall-predecir-no-es-adivinar",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 24,
      type: "QUIZ",
      title:
        "Según el capítulo 3, cuando se dice que «el cerebro predice», ¿a qué se refiere?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-predecir-no-es-adivinar",
        options: [
          {
            key: "opcion-anticipar-con-lo-aprendido",
            label:
              "A que usa la experiencia previa para anticipar y no empezar de cero en cada instante.",
          },
          {
            key: "opcion-adivinar",
            label:
              "A que puede anticipar acontecimientos futuros con más acierto del que reconocemos.",
          },
          {
            key: "opcion-decidir",
            label:
              "A que decidimos de antemano, aunque sea sin darnos cuenta, qué vamos a sentir.",
          },
        ],
        correctOptionKey: "opcion-anticipar-con-lo-aprendido",
      },
      feedback: {
        correct:
          "Eso es. El capítulo lo aterriza en lo cotidiano: leer sin detenerse en cada letra, reconocer una voz con ruido, buscar el interruptor a oscuras.",
        review:
          "Vuelve a la distinción central: predecir aquí significa anticipar con lo aprendido, no adivinar el futuro ni decidir por adelantado lo que se va a sentir.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c3-practice-misma-senal-tres-contextos",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 25,
      type: "REFLECTION",
      title: "Misma señal, tres contextos",
      sourceHeading: "El cuerpo no espera al final de la historia",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Corazón acelerado",
          "Respiración más corta",
          "Calor en la cara",
        ],
        contexts: [
          {
            key: "escaleras",
            label: "Después de subir dos pisos",
            description:
              "Acabas de subir corriendo porque el ascensor estaba ocupado.",
          },
          {
            key: "espera",
            label: "Esperando una respuesta importante",
            description:
              "Enviaste un mensaje que te importa y el teléfono está boca arriba.",
          },
        ],
        factors: [
          { key: "contexto", label: "Dónde estoy y qué acaba de pasar" },
          { key: "memoria", label: "Qué me recuerda esta situación" },
          { key: "conceptos", label: "Qué palabras tengo para nombrarlo" },
          { key: "expectativa", label: "Qué estaba esperando que ocurriera" },
        ],
        prompt:
          "Con las mismas señales en las dos situaciones, ¿qué haría falta para nombrar lo que ocurre? Ninguna combinación queda marcada como errónea.",
      },
    },
    recall: {
      exerciseKey: "eec-c3-recall-senal-corporal-sin-etiqueta",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 26,
      type: "QUIZ",
      title:
        "Según el capítulo 3, ¿qué hace falta además de una señal corporal para que haya una emoción situada?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-senal-corporal-sin-etiqueta",
        options: [
          {
            key: "opcion-contexto-y-categoria",
            label:
              "El contexto, la memoria y los conceptos disponibles: la señal es ingrediente, no receta completa.",
          },
          {
            key: "opcion-mas-atencion",
            label:
              "Prestar más atención a la señal, porque con suficiente precisión el cuerpo indica la emoción.",
          },
          {
            key: "opcion-nada",
            label:
              "Nada más: cada señal corporal corresponde a una emoción concreta.",
          },
        ],
        correctOptionKey: "opcion-contexto-y-categoria",
      },
      feedback: {
        correct:
          "Exacto. El mismo pulso acelerado cabe en una carrera, un encuentro esperado o una discusión; lo que lo sitúa es todo lo demás.",
        review:
          "Revisa la imagen del capítulo: las señales del cuerpo son ingredientes y todavía no son la receta completa.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c3-practice-escena-antes-y-despues",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 27,
      type: "REFLECTION",
      title: "La escena, antes y después del contexto",
      sourceHeading: "Construcción no significa arbitrariedad",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "En la habitación de al lado suena un portazo fuerte. No ves lo que ocurrió.",
        observation:
          "Solo tienes el sonido y el momento en que ocurrió. Nada más todavía.",
        availableContext: [
          "Hace un rato alguien mencionó que llegaba tarde a algo.",
          "Las ventanas del pasillo están abiertas y hay viento.",
          "No hubo voces ni discusión antes del ruido.",
        ],
        readings: [
          {
            key: "enojo",
            label: "Alguien cerró de golpe porque está enojado.",
          },
          {
            key: "prisa",
            label: "Alguien salió con prisa y no midió la fuerza.",
          },
          { key: "viento", label: "Una corriente de aire cerró la puerta." },
          {
            key: "manos-ocupadas",
            label: "Alguien empujó la puerta con el codo, cargado de cosas.",
          },
        ],
        buckets: [
          { key: "sostenible", label: "Lo sostiene la información disponible" },
          { key: "posible", label: "Posible, pero sin apoyo todavía" },
          { key: "falta", label: "Necesitaría un dato que no tengo" },
        ],
        missingInformationPrompt:
          "Mira tu clasificación. Si ahora entra alguien con las manos ocupadas pidiendo ayuda, ¿qué lectura gana fuerza y cuál la pierde? La escena no cambió: cambió el contexto.",
      },
    },
    recall: {
      exerciseKey: "eec-c3-recall-contexto-para-categorizar",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 28,
      type: "QUIZ",
      title:
        "Según el capítulo 3, que una experiencia emocional se construya significa que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-contexto-para-categorizar",
        options: [
          {
            key: "opcion-bajo-restricciones",
            label:
              "Se ensambla bajo restricciones reales: la situación, el estado del cuerpo, lo aprendido y los conceptos disponibles.",
          },
          {
            key: "opcion-cualquier-cosa",
            label:
              "Cualquier interpretación es igualmente posible, porque nada la limita.",
          },
          {
            key: "opcion-falsa",
            label:
              "Es inventada, y por eso menos real que una reacción automática.",
          },
        ],
        correctOptionKey: "opcion-bajo-restricciones",
      },
      feedback: {
        correct:
          "Eso es. El capítulo lo sitúa entre dos fronteras: ni libertad absoluta ni reacción mecánica.",
        review:
          "Vuelve al matiz: «inventar» aquí no es fantasear, sino ensamblar con materiales disponibles bajo condiciones concretas.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c3-practice-region-y-emocion",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 29,
      type: "REFLECTION",
      title: "Una región y una emoción",
      sourceHeading: "Patrones sin botones",
      practiceKind: "belief_lens",
      interaction: {
        kind: "belief_lens",
        belief: "«Se activó la amígdala, así que fue miedo.»",
        zones: [
          {
            key: "observo",
            label: "Lo que la observación muestra",
            hint: "Lo que un estudio puede registrar realmente.",
            options: [
              {
                key: "actividad",
                label: "Hubo actividad en esa zona durante la tarea.",
              },
              {
                key: "patron",
                label: "Aparecieron patrones distribuidos en varias zonas.",
              },
            ],
          },
          {
            key: "supongo",
            label: "Lo que se está añadiendo",
            hint: "El salto entre participar y causar.",
            options: [
              {
                key: "causa",
                label: "Esa región produjo por sí sola la emoción.",
              },
              {
                key: "boton",
                label: "Existe un lugar del cerebro dedicado a cada emoción.",
              },
              {
                key: "consciente",
                label: "La actividad equivale a la experiencia consciente.",
              },
            ],
          },
          {
            key: "falta",
            label: "Lo que faltaría",
            hint: "Lo que habría que saber antes de concluir.",
            options: [
              {
                key: "otras-zonas",
                label: "Qué más se activó al mismo tiempo.",
              },
              {
                key: "otras-emociones",
                label: "Si esa zona se activa también en otras situaciones.",
              },
              { key: "reporte", label: "Qué dijo sentir la persona." },
            ],
          },
        ],
        allowsFreeText: true,
      },
    },
    recall: {
      exerciseKey: "eec-c3-recall-no-hay-boton-de-miedo",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 30,
      type: "QUIZ",
      title:
        "Según el capítulo 3, si una región del cerebro se activa durante un episodio emocional, ¿qué queda demostrado?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-no-hay-boton-de-miedo",
        options: [
          {
            key: "opcion-participa",
            label:
              "Que esa región participa; no que produzca por sí sola la emoción ni que sea su botón.",
          },
          {
            key: "opcion-produce",
            label:
              "Que esa región es la responsable de esa emoción en particular.",
          },
          {
            key: "opcion-sin-regularidad",
            label:
              "Que el cerebro no tiene ninguna regularidad reconocible al sentir.",
          },
        ],
        correctOptionKey: "opcion-participa",
      },
      feedback: {
        correct:
          "Exacto. Puede haber patrones distinguibles sin una huella universal e invariable para cada emoción.",
        review:
          "Recuerda la analogía: una canción no está en una sola nota, y señalar esa nota describe mal lo que ocurre aunque realmente suene.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c3-practice-de-la-expectativa-al-ajuste",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 31,
      type: "REFLECTION",
      title: "De la expectativa al ajuste",
      sourceHeading: "Cuando la predicción no encaja",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Llega un mensaje que dice solo «¿Podemos hablar?». Ordena los pasos que el capítulo describe entre la primera interpretación y un aprendizaje posible.",
        cards: [
          {
            key: "expectativa",
            label: "Aparece una primera hipótesis: hice algo mal.",
          },
          {
            key: "cuerpo",
            label: "El cuerpo acompaña esa hipótesis con tensión.",
          },
          {
            key: "informacion",
            label: "Llega información nueva: era una buena noticia.",
          },
          {
            key: "discrepancia",
            label: "Lo que llega no coincide con lo que se esperaba.",
          },
          {
            key: "revision",
            label: "La interpretación inicial puede corregirse.",
          },
          {
            key: "aprendizaje",
            label: "Queda un dato disponible para una próxima vez.",
          },
        ],
        solved: [
          "expectativa",
          "cuerpo",
          "informacion",
          "discrepancia",
          "revision",
          "aprendizaje",
        ],
        solvedLabel: "Ver la secuencia del capítulo",
        feedback:
          "Es la secuencia que el capítulo describe, no una obligación de sentir distinto de inmediato: actualizar es posible y no siempre ocurre.",
      },
    },
    recall: {
      exerciseKey: "eec-c3-recall-modelo-puede-actualizarse",
      bookSlug: BOOK,
      chapterOrder: 3,
      order: 32,
      type: "QUIZ",
      title:
        "Según el capítulo 3, cuando la información nueva no encaja con lo que se esperaba, ¿qué ocurre?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-modelo-puede-actualizarse",
        options: [
          {
            key: "opcion-puede-actualizarse",
            label:
              "Ese desajuste puede favorecer una revisión, sin garantizar que el aprendizaje anterior desaparezca.",
          },
          {
            key: "opcion-reescribe",
            label:
              "El sistema reescribe sus expectativas cada vez que algo lo sorprende.",
          },
          {
            key: "opcion-nada",
            label:
              "No cambia nada: una interpretación emocional no puede corregirse con información.",
          },
        ],
        correctOptionKey: "opcion-puede-actualizarse",
      },
      feedback: {
        correct:
          "Eso es. Y a veces la actualización empieza por actuar para conseguir un dato más: encender la luz es una forma de preguntar.",
        review:
          "Revisa el matiz: algunas expectativas resisten, y el capítulo evita prometer que todo desajuste reescriba lo aprendido.",
      },
    },
  },

  // ── EEC-C04 · Tu cuerpo tiene la primera palabra ─────────────────────────
  {
    practice: {
      exerciseKey: "eec-c4-practice-misma-sensacion-otros-contextos",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 33,
      type: "REFLECTION",
      title: "La misma sensación, otros contextos",
      sourceHeading: "No existe un diccionario corporal de las emociones",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: ["Calor en la cara", "Pulso más rápido", "Manos inquietas"],
        contexts: [
          {
            key: "elogio",
            label: "Al recibir un elogio delante de otros",
            description: "Alguien menciona en voz alta algo que hiciste bien.",
          },
          {
            key: "error",
            label: "Al notar que un error quedó a la vista",
            description: "Te das cuenta de que otros vieron una equivocación.",
          },
        ],
        factors: [
          { key: "situacion", label: "Qué está ocurriendo alrededor" },
          { key: "relacion", label: "Con quién estoy" },
          { key: "historia", label: "Qué me recuerda esta escena" },
          { key: "fisico", label: "Qué explicación física cabe" },
        ],
        prompt:
          "Con las mismas sensaciones, ¿qué permitiría decir en cada caso? No se trata de acertar la emoción, sino de ver qué cambia la conclusión honesta.",
      },
    },
    recall: {
      exerciseKey: "eec-c4-recall-cuerpo-datos-no-veredictos",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 34,
      type: "QUIZ",
      title:
        "Según el capítulo 4, ¿qué aporta por sí sola una sensación corporal?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-cuerpo-datos-no-veredictos",
        options: [
          {
            key: "opcion-informa",
            label:
              "Informa que algo ocurre, sin determinar qué emoción es ni cuál es su causa.",
          },
          {
            key: "opcion-traduce",
            label:
              "Indica la emoción correspondiente, porque cada sensación tiene su equivalente.",
          },
          {
            key: "opcion-nada",
            label:
              "No aporta nada útil: para saber lo que sentimos hay que ignorar el cuerpo.",
          },
        ],
        correctOptionKey: "opcion-informa",
      },
      feedback: {
        correct:
          "Exacto. El capítulo reconoce las asociaciones familiares y rechaza convertirlas en traducciones rígidas.",
        review:
          "Vuelve a la distinción: el cuerpo aporta datos valiosos y no funciona como diccionario. El veredicto necesita más que la sensación.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c4-practice-senal-atencion-interpretacion-nombre",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 35,
      type: "REFLECTION",
      title: "Señal, atención, interpretación y nombre",
      sourceHeading: "Interocepción: notar no es lo mismo que interpretar",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "Diez minutos antes de una reunión corriente, notas una molestia en el estómago.",
        fields: [
          {
            key: "siento",
            label: "La señal que llega",
            options: [
              { key: "estomago", label: "Molestia en el estómago." },
              { key: "respiracion", label: "La respiración más superficial." },
            ],
          },
          {
            key: "interpreto",
            label: "Dónde fue la atención",
            options: [
              { key: "mirarla", label: "Me quedé pendiente de la sensación." },
              { key: "seguir", label: "Seguí con lo que estaba haciendo." },
            ],
          },
          {
            key: "impulso",
            label: "La interpretación que apareció",
            options: [
              { key: "malo", label: "«Esto va a salir mal.»" },
              { key: "comida", label: "«Comí algo que me cayó pesado.»" },
              { key: "no-se", label: "«Todavía no sé qué significa.»" },
            ],
          },
          {
            key: "elijo",
            label: "El nombre provisional",
            options: [
              { key: "ansiedad", label: "Lo llamaría ansiedad." },
              { key: "nervios", label: "Lo llamaría nervios." },
              { key: "sin-nombre", label: "Prefiero no ponerle nombre aún." },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "No se trata de acertar el nombre. Separar los pasos muestra qué añade cada uno, y cualquiera puede revisarse sin negar los otros.",
      },
    },
    recall: {
      exerciseKey: "eec-c4-recall-notar-interpretar-nombrar",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 36,
      type: "QUIZ",
      title:
        "Según el capítulo 4, notar una sensación corporal con mucha intensidad significa que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-notar-interpretar-nombrar",
        options: [
          {
            key: "opcion-notar-no-es-interpretar",
            label:
              "Se notó una señal; notar, medir con precisión e interpretar siguen siendo cosas distintas.",
          },
          {
            key: "opcion-mas-precision",
            label:
              "Se conoce con más exactitud qué emoción es y de dónde viene.",
          },
          {
            key: "opcion-exagera",
            label:
              "La sensación probablemente se está exagerando y conviene ignorarla.",
          },
        ],
        correctOptionKey: "opcion-notar-no-es-interpretar",
      },
      feedback: {
        correct:
          "Eso es. Un termómetro puede indicar fiebre sin diagnosticar la causa, y más atención no siempre significa mejor comprensión.",
        review:
          "Revisa la secuencia: notar no es medir, y medir no es interpretar. La información del cuerpo todavía necesita contexto.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c4-practice-la-cadena-que-no-es-fila",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 37,
      type: "REFLECTION",
      title: "La cadena que no es una fila",
      sourceHeading: "El frenazo antes del nombre",
      practiceKind: "belief_lens",
      interaction: {
        kind: "belief_lens",
        belief: "«Primero habla el cuerpo y después llega la mente.»",
        zones: [
          {
            key: "observo",
            label: "Lo que la escena muestra",
            hint: "Lo que realmente se puede notar en un frenazo.",
            options: [
              {
                key: "cambio",
                label: "El cuerpo cambió antes de que hubiera una frase.",
              },
              {
                key: "orden-percibido",
                label: "Se notó primero el corazón y después el nombre.",
              },
            ],
          },
          {
            key: "supongo",
            label: "Lo que se está suponiendo",
            hint: "El paso de «lo noté antes» a «ocurrió antes».",
            options: [
              {
                key: "fila",
                label: "Existe una fila fija: cuerpo primero, mente después.",
              },
              {
                key: "cuerpo-nombra",
                label: "El cuerpo pronunció la palabra «miedo».",
              },
              {
                key: "brujula",
                label: "El cuerpo apunta siempre en una dirección conocida.",
              },
            ],
          },
          {
            key: "falta",
            label: "Lo que la afirmación deja fuera",
            hint: "Lo que el capítulo añade justo después.",
            options: [
              {
                key: "reciprocidad",
                label: "La coordinación entre cuerpo, cerebro y entorno.",
              },
              {
                key: "casi-a-la-vez",
                label:
                  "Que varias piezas pueden reunirse casi al mismo tiempo.",
              },
              {
                key: "contexto",
                label: "El lugar y la situación en que ocurre.",
              },
            ],
          },
        ],
        allowsFreeText: true,
      },
    },
    recall: {
      exerciseKey: "eec-c4-recall-cuerpo-y-cerebro-no-hacen-fila",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 38,
      type: "QUIZ",
      title:
        "Según el capítulo 4, notar el cambio corporal antes que el nombre demuestra que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-cuerpo-y-cerebro-no-hacen-fila",
        options: [
          {
            key: "opcion-reciprocidad",
            label:
              "El cuerpo cambió antes de que hubiera una frase; no que exista una fila fija cuerpo-primero.",
          },
          {
            key: "opcion-cuerpo-primero",
            label:
              "El cuerpo produce la emoción y la mente solo la nombra después.",
          },
          {
            key: "opcion-mente-primero",
            label:
              "La interpretación siempre ocurre antes de cualquier cambio corporal.",
          },
        ],
        correctOptionKey: "opcion-reciprocidad",
      },
      feedback: {
        correct:
          "Exacto. Que una señal se note primero no establece el orden en que ocurrieron las cosas.",
        review:
          "Vuelve al matiz: el capítulo describe coordinación recíproca, y cambia la pregunta por qué puede aportar la sensación y qué no permite concluir todavía.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c4-practice-que-tipo-de-afirmacion-es",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 39,
      type: "REFLECTION",
      title: "¿Qué tipo de afirmación es esta?",
      sourceHeading: "Neurocepción: una idea influyente bajo examen",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Circulan varias afirmaciones sobre cuerpo y emoción. Todas suenan parecidas en una conversación.",
        observation:
          "Suenan igual de seguras, y no son el mismo tipo de afirmación.",
        availableContext: [
          "Existen procesos no conscientes que detectan información y preparan la acción.",
          "«Neurocepción» es el nombre que una teoría concreta da a un mecanismo propuesto.",
          "Una explicación popular puede tener partes con distinto grado de respaldo.",
        ],
        readings: [
          {
            key: "cuerpo-guarda",
            label: "«El cuerpo guarda lo que la mente olvida.»",
          },
          {
            key: "no-conscientes",
            label:
              "«Hay procesos que evalúan señales sin deliberación consciente.»",
          },
          {
            key: "neurocepcion",
            label:
              "«La neurocepción es el mecanismo por el que detectamos seguridad o peligro.»",
          },
          {
            key: "polivagal",
            label:
              "«La teoría polivagal está confirmada en todas sus afirmaciones.»",
          },
        ],
        buckets: [
          { key: "metafora", label: "Metáfora útil" },
          { key: "teoria", label: "Propuesta teórica" },
          { key: "evidencia", label: "Con respaldo empírico" },
          { key: "necesita", label: "Necesita más evidencia" },
        ],
        missingInformationPrompt:
          "Mira tu clasificación: ¿qué predice cada afirmación y cómo se mediría? Una controversia no se resuelve por la seguridad con que alguien habla.",
      },
    },
    recall: {
      exerciseKey: "eec-c4-recall-metafora-teoria-evidencia",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 40,
      type: "QUIZ",
      title:
        "Según el capítulo 4, que una explicación sobre el cuerpo sea intuitiva y popular demuestra que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-metafora-teoria-evidencia",
        options: [
          {
            key: "opcion-cada-mecanismo",
            label:
              "Nada por sí solo: cada uno de sus mecanismos necesita evidencia independiente.",
          },
          {
            key: "opcion-confirmada",
            label:
              "Que ha sido confirmada, porque de otro modo no se habría extendido tanto.",
          },
          {
            key: "opcion-inutil",
            label:
              "Que es inútil para conversar y conviene descartarla por completo.",
          },
        ],
        correctOptionKey: "opcion-cada-mecanismo",
      },
      feedback: {
        correct:
          "Eso es. Puede ser valiosa como imagen y seguir necesitando evidencia como afirmación causal: son dos usos distintos.",
        review:
          "Revisa las tres preguntas que el capítulo separa: si existen procesos no conscientes, si «neurocepción» los nombra a todos, y si las afirmaciones específicas están confirmadas.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c4-practice-elegir-como-observar",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 41,
      type: "REFLECTION",
      title: "Elegir cómo observar",
      sourceHeading:
        "La conciencia corporal puede ayudar; también necesita condiciones",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Una persona quiere entender mejor lo que le pasa antes de una conversación difícil. Le ofrecen varias maneras de observar.",
        observation:
          "Ninguna de las opciones es obligatoria, y detenerse siempre es una de ellas.",
        availableContext: [
          "El capítulo documenta que estas prácticas ayudan a algunas personas y no a todas.",
          "Quien ya vigila su pulso con preocupación puede aumentar la alarma al mirarlo más.",
          "El capítulo fija tres reglas: nada traumático, nada obligatorio, poder parar.",
        ],
        readings: [
          {
            key: "entorno",
            label: "Mirar alrededor y apoyar los pies en el suelo.",
          },
          {
            key: "corporal-breve",
            label: "Una observación corporal breve, con los ojos abiertos.",
          },
          { key: "pausa", label: "Hacer una pausa y volver más tarde." },
          {
            key: "escaneo-largo",
            label: "Un escaneo corporal largo con los ojos cerrados.",
          },
        ],
        buckets: [
          { key: "segura", label: "Opción segura para empezar" },
          { key: "depende", label: "Depende de la persona y el momento" },
          { key: "no-ahora", label: "Mejor no ahora" },
        ],
        missingInformationPrompt:
          "¿Qué haría falta saber sobre la persona y el momento antes de recomendar una de estas? La meta no es sentir más, sino distinguir mejor y conservar la elección.",
      },
    },
    recall: {
      exerciseKey: "eec-c4-recall-observar-requiere-eleccion",
      bookSlug: BOOK,
      chapterOrder: 4,
      order: 42,
      type: "QUIZ",
      title:
        "Según el capítulo 4, que una práctica de atención corporal ayude a alguien permite concluir que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-observar-requiere-eleccion",
        options: [
          {
            key: "opcion-no-universal",
            label:
              "Le ayudó a esa persona en ese momento: «útil» no significa beneficioso para cualquiera siempre.",
          },
          {
            key: "opcion-universal",
            label:
              "Es una técnica reguladora que conviene recomendar a todo el mundo.",
          },
          {
            key: "opcion-peligrosa",
            label:
              "Es una práctica peligrosa que debería evitarse por precaución.",
          },
        ],
        correctOptionKey: "opcion-no-universal",
      },
      feedback: {
        correct:
          "Exacto. Por eso el capítulo fija reglas: nada deliberadamente intenso, nada obligatorio y poder detenerse.",
        review:
          "Vuelve al matiz: la literatura también documenta efectos no deseados, y la misma indicación puede tranquilizar a una persona y alarmar a otra.",
      },
    },
  },

  // ── EEC-C05 · Las historias que te cuentas ───────────────────────────────
  {
    practice: {
      exerciseKey: "eec-c5-practice-cambia-la-historia-cambia-la-emocion",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 43,
      type: "REFLECTION",
      title: "«Cambia la historia y cambia la emoción»",
      sourceHeading: "¿Una historia más coherente siempre hace bien?",
      practiceKind: "belief_lens",
      interaction: {
        kind: "belief_lens",
        belief:
          "«Cambia la historia que te cuentas y cambiará lo que sientes.»",
        zones: [
          {
            key: "observo",
            label: "En qué acierta",
            hint: "Lo que la investigación sí encuentra.",
            options: [
              {
                key: "relacion",
                label:
                  "La manera de narrarnos puede relacionarse con cómo vivimos.",
              },
              {
                key: "temas",
                label: "Algunos temas del relato se asocian con bienestar.",
              },
            ],
          },
          {
            key: "supongo",
            label: "Qué simplifica",
            hint: "El salto que la frase da sin decirlo.",
            options: [
              {
                key: "causa",
                label:
                  "Que narrar distinto causa directamente sentir distinto.",
              },
              {
                key: "voluntad",
                label: "Que basta con decidirlo para que ocurra.",
              },
              {
                key: "coherencia",
                label: "Que una historia más coherente siempre hace bien.",
              },
            ],
          },
          {
            key: "falta",
            label: "Qué deja fuera",
            hint: "Lo que también participa en la experiencia.",
            options: [
              { key: "cuerpo", label: "El estado del cuerpo." },
              {
                key: "contexto",
                label: "La situación que sigue sin resolverse.",
              },
              { key: "aprendizaje", label: "Lo aprendido y lo no consciente." },
            ],
          },
        ],
        allowsFreeText: true,
      },
    },
    recall: {
      exerciseKey: "eec-c5-recall-emocion-no-es-historia",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 44,
      type: "QUIZ",
      title:
        "Según el capítulo 5, ¿qué relación describe la evidencia entre el relato y lo que sentimos?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-emocion-no-es-historia",
        options: [
          {
            key: "opcion-participa",
            label:
              "El relato participa junto al cuerpo, el contexto y lo aprendido; no equivale por sí solo a la emoción.",
          },
          {
            key: "opcion-determina",
            label:
              "Construir una historia coherente basta para mejorar cómo nos sentimos.",
          },
          {
            key: "opcion-irrelevante",
            label:
              "La forma de narrarnos no guarda ninguna relación con el bienestar.",
          },
        ],
        correctOptionKey: "opcion-participa",
      },
      feedback: {
        correct:
          "Eso es. El capítulo dice algo más modesto que el eslogan: la relación existe y depende de qué se mide, de quién cuenta y del contexto.",
        review:
          "Revisa el matiz: varias relaciones entre identidad narrativa y bienestar se atenúan al controlar el tono emocional del relato.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c5-practice-escena-subtitulo-historia",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 45,
      type: "REFLECTION",
      title: "Escena, subtítulo e historia",
      sourceHeading:
        "**«¿Qué historia debo inventar para dejar de sentir esto?»**",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Enviaste un mensaje importante. Aparece como leído y pasan las horas sin respuesta.",
        observation:
          "Lo observable son dos marcas azules y el tiempo transcurrido.",
        availableContext: [
          "La persona suele responder rápido, aunque no siempre.",
          "No hubo ninguna discusión antes del mensaje.",
          "No sabes qué está haciendo ni si vio el contenido completo.",
        ],
        readings: [
          {
            key: "leido",
            label: "Leyó el mensaje y todavía no ha respondido.",
          },
          { key: "molesto", label: "Está molesto por algo que dije." },
          { key: "ocupado", label: "Está ocupado y responderá más tarde." },
          {
            key: "identidad",
            label: "Cuando necesito claridad, la gente me deja sola.",
          },
        ],
        buckets: [
          { key: "escena", label: "La escena (lo observable)" },
          { key: "subtitulo", label: "El subtítulo que añado" },
          { key: "historia", label: "La historia más amplia" },
        ],
        missingInformationPrompt:
          "Mira lo que clasificaste: ¿en qué momento un dato empezó a convertirse en una conclusión? Separarlos no niega la preocupación.",
      },
    },
    recall: {
      exerciseKey: "eec-c5-recall-silencio-sin-subtitulos",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 46,
      type: "QUIZ",
      title:
        "Según el capítulo 5, un hecho ambiguo como un mensaje leído sin respuesta trae consigo…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-silencio-sin-subtitulos",
        options: [
          {
            key: "opcion-sin-explicacion",
            label:
              "Solo el hecho: la explicación es un subtítulo que añadimos nosotros.",
          },
          {
            key: "opcion-con-significado",
            label:
              "Su significado, si prestamos suficiente atención a los detalles.",
          },
          {
            key: "opcion-nada-que-pensar",
            label:
              "Nada relevante: interpretar un silencio siempre es un error que conviene evitar.",
          },
        ],
        correctOptionKey: "opcion-sin-explicacion",
      },
      feedback: {
        correct:
          "Exacto. El capítulo propone una pregunta más honesta: qué subtítulos estoy añadiendo y cuánto de ellos conozco realmente.",
        review:
          "Vuelve a la distinción mínima: la escena, el subtítulo y la historia más amplia pueden sentirse unidas y no son lo mismo.",
      },
    },
  },
  {
    practice: {
      exerciseKey:
        "eec-c5-practice-acontecimiento-descripcion-conclusion-excepcion",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 47,
      type: "REFLECTION",
      title: "Acontecimiento, descripción, conclusión y excepción",
      sourceHeading: "Historias dominantes y acontecimientos que no encajan",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "Alguien repite que «nunca ha sabido defenderse». Vamos a separar los cuatro planos de esa frase.",
        fields: [
          {
            key: "siento",
            label: "El acontecimiento",
            options: [
              {
                key: "reunion",
                label: "En una reunión no dijo lo que pensaba.",
              },
              { key: "cola", label: "Alguien se coló y no reclamó." },
            ],
          },
          {
            key: "interpreto",
            label: "La descripción que se repite",
            options: [
              { key: "callo", label: "«Otra vez me quedé callado.»" },
              { key: "siempre", label: "«Siempre me pasa lo mismo.»" },
            ],
          },
          {
            key: "impulso",
            label: "La conclusión sobre uno mismo",
            options: [
              { key: "nunca", label: "«Nunca he sabido defenderme.»" },
              {
                key: "soy",
                label: "«Soy una persona que no se hace respetar.»",
              },
            ],
          },
          {
            key: "elijo",
            label: "El detalle que no encaja",
            options: [
              {
                key: "companera",
                label: "Intervino cuando trataron mal a una compañera.",
              },
              {
                key: "limite",
                label: "Una vez pidió que no le hablaran así.",
              },
              { key: "ninguno", label: "Ahora mismo no recuerdo ninguno." },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "El detalle que no encaja no demuestra lo contrario ni borra la dificultad: amplía el cuadro. Esto describe recursos de un modelo terapéutico, no una técnica para aplicarte a solas.",
      },
    },
    recall: {
      exerciseKey: "eec-c5-recall-historia-dominante-no-es-identidad",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 48,
      type: "QUIZ",
      title:
        "Según el capítulo 5, la re-autoría en el enfoque narrativo consiste en…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-historia-dominante-no-es-identidad",
        options: [
          {
            key: "opcion-revisar-indice",
            label:
              "Revisar el índice de un libro ya escrito: incorporar hechos que el relato dominante había dejado fuera.",
          },
          {
            key: "opcion-inventar",
            label:
              "Inventar capítulos nuevos que reemplacen los recuerdos difíciles.",
          },
          {
            key: "opcion-positivo",
            label:
              "Demostrar que la conclusión negativa siempre fue falsa desde el principio.",
          },
        ],
        correctOptionKey: "opcion-revisar-indice",
      },
      feedback: {
        correct:
          "Eso es. Re-autoría no significa inventar capítulos ni cambiar el pasado: algunos hechos estaban ahí y no entraban en el índice.",
        review:
          "Recuerda la imagen del buscador que devuelve siempre los mismos resultados: un episodio que no encaja amplía el cuadro sin borrar los años de dificultad.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c5-practice-dato-interpretacion-informacion-nueva",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 49,
      type: "REFLECTION",
      title: "Dato, interpretación e información nueva",
      sourceHeading:
        "5. La memoria no es una grabación ni una página en blanco",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Dos personas recuerdan la misma cena",
          "Una recuerda risas; la otra, un comentario hiriente",
          "Han pasado quince años",
        ],
        contexts: [
          {
            key: "una",
            label: "El recuerdo de una",
            description:
              "Atendió sobre todo al ambiente general y a lo compartido.",
          },
          {
            key: "otra",
            label: "El recuerdo de la otra",
            description:
              "Atendió sobre todo a un comentario dirigido a ella y a la vergüenza que sintió.",
          },
        ],
        factors: [
          { key: "atencion", label: "A qué prestó atención cada una" },
          { key: "importancia", label: "Qué importancia le dio entonces" },
          {
            key: "conversaciones",
            label: "Qué se habló después sobre esa noche",
          },
          { key: "certeza", label: "Qué se sostiene con razonable certeza" },
        ],
        prompt:
          "Ambos acontecimientos pueden haber ocurrido. ¿Qué se sostiene como dato, qué es lectura actual y qué información cambiaría el significado sin cambiar lo ocurrido?",
      },
    },
    recall: {
      exerciseKey: "eec-c5-recall-recordar-reconstruye",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 50,
      type: "QUIZ",
      title:
        "Según el capítulo 5, que la memoria autobiográfica sea reconstructiva significa que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-recordar-reconstruye",
        options: [
          {
            key: "opcion-selecciona",
            label:
              "Selecciona, reconstruye e integra; eso no autoriza a reescribir los hechos a voluntad.",
          },
          {
            key: "opcion-libre",
            label:
              "Podemos reinterpretar el pasado libremente, porque ningún recuerdo es fiable.",
          },
          {
            key: "opcion-grabacion",
            label:
              "Funciona como una grabación: si el recuerdo es vívido, ocurrió tal cual.",
          },
        ],
        correctOptionKey: "opcion-selecciona",
      },
      feedback: {
        correct:
          "Exacto. Y por eso hace falta una categoría que a veces se olvida: «no lo sé con certeza».",
        review:
          "Revisa el cuidado que pide el capítulo: una narración emocionalmente convincente no convierte una frase recordada en un hecho histórico.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c5-practice-dos-formulaciones-que-abren",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 51,
      type: "REFLECTION",
      title: "Dos formulaciones, qué abre cada una",
      sourceHeading: "7. Puedes revisar el relato sin borrar la página",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "El mensaje sigue leído y sin respuesta",
          "Tensión en el pecho",
          "Ganas de volver a mirar el teléfono",
        ],
        contexts: [
          {
            key: "cerrada",
            label: "«Me dejaron sola otra vez»",
            description:
              "Una formulación que ya contiene su conclusión sobre lo ocurrido.",
          },
          {
            key: "abierta",
            label: "«No tengo respuesta todavía y no sé por qué»",
            description:
              "Una formulación deliberadamente incompleta sobre lo mismo.",
          },
        ],
        factors: [
          { key: "preguntas", label: "Qué preguntas quedan disponibles" },
          { key: "acciones", label: "Qué acciones puedo elegir" },
          { key: "espera", label: "Cuánto puedo esperar sin decidir" },
          { key: "cuerpo", label: "Qué hace el cuerpo mientras tanto" },
        ],
        prompt:
          "No se puntúa qué formulación es mejor ni qué deberías sentir. Observa qué abre cada una.",
      },
    },
    recall: {
      exerciseKey: "eec-c5-recall-reescribir-abre-opciones",
      bookSlug: BOOK,
      chapterOrder: 5,
      order: 52,
      type: "QUIZ",
      title:
        "Según el capítulo 5, ¿qué promete revisar el relato de una situación?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-reescribir-abre-opciones",
        options: [
          {
            key: "opcion-abre-opciones",
            label:
              "Puede ampliar significado, preguntas y acciones posibles; no garantiza otra emoción.",
          },
          {
            key: "opcion-calma",
            label:
              "Que la emoción difícil disminuya si la nueva versión es suficientemente amable.",
          },
          {
            key: "opcion-aprendizaje",
            label:
              "Que el dolor se convierta en aprendizaje si se cuenta de la manera correcta.",
          },
        ],
        correctOptionKey: "opcion-abre-opciones",
      },
      feedback: {
        correct:
          "Eso es. En el ejemplo del capítulo, la persona no se calma necesariamente, y aun así recupera una diferencia útil.",
        review:
          "Vuelve al objetivo declarado: no era convencer de que todo está bien ni reemplazar la historia por una más agradable.",
      },
    },
  },

  // ── EEC-C06 · Sentir también se aprende con otros ────────────────────────
  {
    practice: {
      exerciseKey: "eec-c6-practice-dos-respuestas-relacionales",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 53,
      type: "REFLECTION",
      title: "La misma señal, dos respuestas",
      sourceHeading: "2. De lo que pasa en mí a lo que pasa entre nosotros",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Alguien cuenta que está esperando una noticia importante",
          "Habla poco y mira el teléfono",
        ],
        contexts: [
          {
            key: "acompana",
            label: "«Sea lo que sea, estoy contigo»",
            description: "Una respuesta que ofrece presencia sin pedir nada.",
          },
          {
            key: "silencio",
            label: "Nadie dice nada",
            description: "La conversación sigue por otro lado.",
          },
        ],
        factors: [
          { key: "que-esperaba", label: "Qué esperaba de esa persona" },
          { key: "historia", label: "Qué han vivido antes juntos" },
          { key: "momento", label: "Qué necesitaba en ese momento" },
          { key: "otros", label: "Quién más estaba presente" },
        ],
        prompt:
          "Las respuestas influyen y no determinan: quien recibe apoyo puede irritarse porque no quería consuelo. ¿Qué aprendizaje podría favorecer cada una, sin afirmar destino?",
      },
    },
    recall: {
      exerciseKey: "eec-c6-recall-sentir-se-aprende-con-otros",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 54,
      type: "QUIZ",
      title:
        "Según el capítulo 6, añadir el plano relacional al análisis de una emoción…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-sentir-se-aprende-con-otros",
        options: [
          {
            key: "opcion-no-elimina",
            label:
              "Añade información sin eliminar el plano individual: cuerpo, historia y conceptos siguen participando.",
          },
          {
            key: "opcion-sustituye",
            label:
              "Sustituye al plano individual, porque las emociones ocurren realmente entre personas.",
          },
          {
            key: "opcion-determina",
            label:
              "Demuestra que la relación determina lo que cada persona sentirá.",
          },
        ],
        correctOptionKey: "opcion-no-elimina",
      },
      feedback: {
        correct:
          "Exacto. La relación no es una fuerza por encima de las personas: es parte del contexto donde ocurren sus cuerpos y expectativas.",
        review:
          "Recuerda la imagen de la cámara: acercarla a un jugador y abrirla al campo muestran cosas distintas, y ninguna anula a la otra.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c6-practice-apoyo-validacion-control-escalamiento",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 55,
      type: "REFLECTION",
      title: "Apoyo, validación, control o escalamiento",
      sourceHeading: "4. Cuando otra persona ayuda —o empeora— lo que sientes",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Alguien llama a una persona cercana para contarle que no consiguió un puesto al que aspiraba.",
        observation:
          "Todas las respuestas posibles son sociales; no todas hacen el mismo trabajo.",
        availableContext: [
          "Regular no siempre significa reducir una emoción.",
          "Dos personas pueden calmarse juntas y también desregularse juntas.",
          "No sabemos aún qué necesitaba quien llamó.",
        ],
        readings: [
          {
            key: "escuchar",
            label:
              "«Sé cuánto querías ese trabajo. ¿Quieres contarme qué pasó?»",
          },
          {
            key: "minimizar",
            label: "«Por algo será. Ya aparecerá otra cosa.»",
          },
          {
            key: "preguntar",
            label: "«¿Quieres que solo te escuche o que pensemos qué hacer?»",
          },
          {
            key: "repasar",
            label: "Repasar durante una hora todo lo que pudo salir mal.",
          },
        ],
        buckets: [
          { key: "apoyo", label: "Apoyo" },
          { key: "validacion", label: "Validación" },
          { key: "control", label: "Intento de control" },
          { key: "escalamiento", label: "Escalamiento" },
          { key: "falta", label: "Falta información" },
        ],
        missingInformationPrompt:
          "Compartir no es una técnica única. ¿Qué habría que saber sobre lo que esa persona necesitaba antes de decidir qué respuesta ayuda?",
      },
    },
    recall: {
      exerciseKey: "eec-c6-recall-regular-juntos-no-es-controlar",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 56,
      type: "QUIZ",
      title: "Según el capítulo 6, co-regular con otra persona significa…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-regular-juntos-no-es-controlar",
        options: [
          {
            key: "opcion-ajuste-mutuo",
            label:
              "Un ajuste mutuo que puede estabilizar o intensificar; no lograr que el otro sienta lo que queremos.",
          },
          {
            key: "opcion-prestar-calma",
            label:
              "Prestarle calma a alguien para que su emoción difícil disminuya.",
          },
          {
            key: "opcion-siempre-bueno",
            label:
              "Un proceso que, por definición, mejora el estado emocional de ambas personas.",
          },
        ],
        correctOptionKey: "opcion-ajuste-mutuo",
      },
      feedback: {
        correct:
          "Eso es. El capítulo nombra la co-rumiación: se puede acompañar, sentirse cerca y a la vez mantener el problema encendido.",
        review:
          "Revisa el matiz: regular no siempre significa reducir, y la regulación interpersonal describe un proceso sin garantizar que el objetivo sea saludable.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c6-practice-ordenar-el-ciclo",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 57,
      type: "REFLECTION",
      title: "Ordenar el ciclo",
      sourceHeading: "5. Cuando una respuesta prepara la siguiente",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "En una comida familiar, una madre pregunta por el trabajo de su hija. Ordena el minuto siguiente tal como el capítulo lo describe.",
        cards: [
          { key: "pregunta", label: "La madre pregunta por el trabajo." },
          { key: "presion", label: "La hija escucha presión en la pregunta." },
          { key: "defensiva", label: "Responde a la defensiva." },
          {
            key: "rechazo",
            label: "La madre escucha rechazo en esa respuesta.",
          },
          {
            key: "retirada",
            label: "Dice que ya no puede preguntarle nada.",
          },
        ],
        solved: ["pregunta", "presion", "defensiva", "rechazo", "retirada"],
        solvedLabel: "Ver la secuencia del capítulo",
        feedback:
          "No sabemos quién «empezó» ni qué trae cada una. Lo que la secuencia muestra es cómo cada respuesta cambió lo que la otra tenía delante — no una culpa repartida a medias.",
      },
    },
    recall: {
      exerciseKey: "eec-c6-recall-ciclo-no-es-culpa-compartida",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 58,
      type: "QUIZ",
      title:
        "Según el capítulo 6, describir un ciclo recíproco entre dos personas significa…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-ciclo-no-es-culpa-compartida",
        options: [
          {
            key: "opcion-como-se-sostiene",
            label:
              "Mostrar cómo cada respuesta vuelve más probable la siguiente; no repartir la culpa a medias.",
          },
          {
            key: "opcion-50-50",
            label:
              "Que ambas personas son igualmente responsables de lo que ocurre.",
          },
          {
            key: "opcion-nadie",
            label:
              "Que nadie es responsable, porque el ciclo actúa por encima de las personas.",
          },
        ],
        correctOptionKey: "opcion-como-se-sostiene",
      },
      feedback: {
        correct:
          "Exacto. Un ciclo no es una criatura invisible: es una secuencia que se repite, y verla no borra límites ni responsabilidad por la conducta.",
        review:
          "Vuelve a la distinción: reciprocidad describe cómo se sostiene un patrón; equivalencia moral es otra afirmación distinta.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c6-practice-empatia-contagio-sincronia",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 59,
      type: "REFLECTION",
      title: "Empatía, contagio, sincronía o regulación",
      sourceHeading: "Regulación interpersonal",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Varias escenas cotidianas se describen a menudo con la misma palabra vaga: «conexión».",
        observation: "Son fenómenos vecinos y no el mismo mecanismo.",
        availableContext: [
          "Nombrar con precisión permite preguntar con precisión.",
          "Parecerse emocionalmente no demuestra vínculo sano.",
          "A veces la información disponible no alcanza para decidir.",
        ],
        readings: [
          {
            key: "reir",
            label: "Dos personas ríen a la vez sin saber bien por qué.",
          },
          {
            key: "comprender",
            label:
              "Alguien imagina lo que la otra persona puede estar sintiendo y pregunta.",
          },
          {
            key: "ritmo",
            label: "Dos personas ajustan el ritmo al caminar juntas.",
          },
          {
            key: "ofrecer",
            label: "Alguien ofrece una pausa para ayudar a ordenar opciones.",
          },
        ],
        buckets: [
          { key: "empatia", label: "Empatía" },
          { key: "contagio", label: "Contagio emocional" },
          { key: "sincronia", label: "Sincronía" },
          { key: "regulacion", label: "Regulación interpersonal" },
          { key: "falta", label: "Falta información" },
        ],
        missingInformationPrompt:
          "¿Cuál de estas escenas demuestra por sí sola que hay empatía o un vínculo sano? Distinguir estas palabras no es pedantería.",
      },
    },
    recall: {
      exerciseKey: "eec-c6-recall-parecidos-que-no-son-sinonimos",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 60,
      type: "QUIZ",
      title:
        "Según el capítulo 6, que dos personas sientan algo parecido al mismo tiempo demuestra…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-parecidos-que-no-son-sinonimos",
        options: [
          {
            key: "opcion-solo-coincidencia",
            label:
              "Que hubo coincidencia: no demuestra por sí solo empatía, amor ni salud relacional.",
          },
          {
            key: "opcion-empatia",
            label:
              "Que existe empatía entre ellas, porque sentir lo mismo es comprender al otro.",
          },
          {
            key: "opcion-nada-real",
            label:
              "Que ninguna de las dos siente realmente nada propio en ese momento.",
          },
        ],
        correctOptionKey: "opcion-solo-coincidencia",
      },
      feedback: {
        correct:
          "Eso es. Empatía, contagio, imitación, sincronía y regulación interpersonal no son el mismo mecanismo.",
        review:
          "Recuerda por qué importa la precisión: impide que cualquier experiencia de conexión termine descrita con una sola palabra nebulosa.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c6-practice-mi-parte-la-otra-el-contexto-el-limite",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 61,
      type: "REFLECTION",
      title: "Mi parte, la del otro, el contexto y el límite",
      sourceHeading: "Influencia no es destino",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "En una conversación cotidiana con alguien cercano, la charla sube de tono y ninguno de los dos quería llegar ahí.",
        fields: [
          {
            key: "siento",
            label: "Qué depende de mí",
            options: [
              { key: "tono", label: "El tono con el que respondo." },
              { key: "pausa", label: "Pedir una pausa antes de seguir." },
            ],
          },
          {
            key: "interpreto",
            label: "Qué depende de la otra persona",
            options: [
              { key: "su-respuesta", label: "Cómo decide responder." },
              { key: "su-lectura", label: "Qué entiende de lo que dije." },
            ],
          },
          {
            key: "impulso",
            label: "Qué pertenece al contexto",
            options: [
              { key: "cansancio", label: "El cansancio acumulado del día." },
              { key: "tiempo", label: "Que había prisa por salir." },
              { key: "publico", label: "Que había más gente delante." },
            ],
          },
          {
            key: "elijo",
            label: "Qué límite o seguridad pide la situación",
            options: [
              { key: "ninguno", label: "Ninguno: es un desacuerdo corriente." },
              { key: "parar", label: "Parar la conversación por hoy." },
              { key: "ayuda", label: "Buscar apoyo si esto se repite." },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "Si una situación implica coerción, violencia o asimetría grave, describir un ciclo recíproco deja de ser una descripción justa: la seguridad y el apoyo tienen prioridad.",
      },
    },
    recall: {
      exerciseKey: "eec-c6-recall-influencia-no-es-destino",
      bookSlug: BOOK,
      chapterOrder: 6,
      order: 62,
      type: "QUIZ",
      title:
        "Según el capítulo 6, ¿dónde deja de aplicarse con justicia la idea de circularidad?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-influencia-no-es-destino",
        options: [
          {
            key: "opcion-coercion",
            label:
              "Donde hay coerción, violencia o asimetría grave de poder: ahí no se lee como responsabilidad recíproca.",
          },
          {
            key: "opcion-siempre",
            label:
              "En ningún caso: todo vínculo puede describirse como un ciclo entre iguales.",
          },
          {
            key: "opcion-familia",
            label:
              "Solo dentro de la familia; fuera de ella las relaciones no forman ciclos.",
          },
        ],
        correctOptionKey: "opcion-coercion",
      },
      feedback: {
        correct:
          "Exacto. No somos islas y tampoco marionetas: agencia, poder y seguridad siguen importando.",
        review:
          "Vuelve al límite ético del capítulo: la circularidad describe patrones, y hay situaciones donde aplicarla repartiría responsabilidad donde no corresponde.",
      },
    },
  },

  // ── EEC-C07 · Cuando las emociones necesitan traducción ──────────────────
  {
    practice: {
      exerciseKey: "eec-c7-practice-separar-capas-de-una-escena",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 63,
      type: "REFLECTION",
      title: "Separar las capas de una escena",
      sourceHeading: "Antes de traducir, separar capas",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Alguien deja de hablar en una comida",
          "Mira el plato",
          "Responde con frases cortas",
        ],
        contexts: [
          {
            key: "repertorio-a",
            label: "Leído desde un repertorio",
            description:
              "En su casa, callar en la mesa señalaba molestia con alguien.",
          },
          {
            key: "repertorio-b",
            label: "Leído desde otro",
            description:
              "En su casa, callar mientras otros hablan era una forma de respeto.",
          },
        ],
        factors: [
          { key: "experimenta", label: "Lo que esa persona experimenta" },
          { key: "valora", label: "Cómo valora lo que siente" },
          { key: "expresa", label: "Lo que decide expresar" },
          { key: "regula", label: "Lo que intenta regular" },
          {
            key: "interpreto",
            label: "Lo que yo interpreto, incluida la intención",
          },
        ],
        prompt:
          "Con la misma señal, ¿qué interpretación es posible, cuál requiere comprobación y qué no se puede concluir todavía?",
      },
    },
    recall: {
      exerciseKey: "eec-c7-recall-suspender-equivalencias",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 64,
      type: "QUIZ",
      title:
        "Según el capítulo 7, cuando alguien expresa una emoción de forma distinta a la esperada, lo primero que conviene hacer es…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-suspender-equivalencias",
        options: [
          {
            key: "opcion-suspender",
            label:
              "Suspender la equivalencia automática entre la señal y la emoción, la causa o la intención.",
          },
          {
            key: "opcion-manual",
            label:
              "Consultar qué significa ese gesto en la cultura de esa persona.",
          },
          {
            key: "opcion-ignorar",
            label:
              "Ignorar la señal, porque las expresiones no aportan información fiable.",
          },
        ],
        correctOptionKey: "opcion-suspender",
      },
      feedback: {
        correct:
          "Eso es. Una persona puede sentir tristeza y mostrar irritación: lo que se ve es una capa, y lo que ocurre son varias.",
        review:
          "Vuelve a la distinción: una diferencia de repertorio no es ausencia de emoción ni mala intención, y suspender no es renunciar a entender.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c7-practice-senal-expectativa-interpretacion-dato",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 65,
      type: "REFLECTION",
      title: "Señal, expectativa, interpretación y dato",
      sourceHeading: "La ayuda que no parece ayuda",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "Cuentas una pérdida. La otra persona busca un lado esperanzador y sonríe con suavidad.",
        fields: [
          {
            key: "siento",
            label: "La señal observable",
            options: [
              { key: "sonrisa", label: "Sonrió mientras yo hablaba." },
              { key: "animo", label: "Buscó algo bueno de la situación." },
            ],
          },
          {
            key: "interpreto",
            label: "Mi expectativa de cuidado",
            options: [
              {
                key: "acompanar",
                label: "Esperaba que se quedara en silencio.",
              },
              {
                key: "compartir",
                label: "Esperaba que compartiera mi tristeza.",
              },
            ],
          },
          {
            key: "impulso",
            label: "La interpretación que aparece",
            options: [
              {
                key: "no-le-importa",
                label: "«No le importa lo que me pasa.»",
              },
              { key: "minimiza", label: "«Está minimizando esto.»" },
              { key: "otra-forma", label: "«Cuida de otra manera.»" },
            ],
          },
          {
            key: "elijo",
            label: "El dato que permitiría contrastarlo",
            options: [
              { key: "preguntar", label: "Preguntarle qué quiso decir." },
              { key: "decir", label: "Decir qué me ayudaría ahora." },
              {
                key: "otras-veces",
                label: "Recordar cómo acompañó otras veces.",
              },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "El estudio del capítulo trabajó con muestras concretas y diferencias promedio: no describe a todos los habitantes de un país ni permite deducir la cultura de nadie.",
      },
    },
    recall: {
      exerciseKey: "eec-c7-recall-expectativa-cambia-la-lectura",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 66,
      type: "QUIZ",
      title:
        "Según el capítulo 7, ¿qué papel juega la expectativa propia al leer la conducta de alguien cercano?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-expectativa-cambia-la-lectura",
        options: [
          {
            key: "opcion-influye",
            label:
              "Influye en la interpretación: si la ayuda no se parece a la esperada, es fácil leerla como desinterés.",
          },
          {
            key: "opcion-no-influye",
            label:
              "Ninguno: la conducta observable habla por sí misma y no depende de quien mira.",
          },
          {
            key: "opcion-explica-todo",
            label:
              "Explica por completo el malentendido, sin que haga falta comprobar nada más.",
          },
        ],
        correctOptionKey: "opcion-influye",
      },
      feedback: {
        correct:
          "Exacto. Dos personas pueden querer cuidar y no coincidir en qué aspecto debería tener el cuidado.",
        review:
          "Revisa el matiz: reconocer la influencia de la expectativa no cierra la escena; sigue haciendo falta el dato que confirme o corrija.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c7-practice-diferencia-falta-contexto-o-limite",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 67,
      type: "REFLECTION",
      title: "¿Diferencia, falta de contexto o límite?",
      sourceHeading:
        "**comprender el contexto no significa justificar el daño.**",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Dos compañeros de trabajo discuten por cómo se reparten las tareas. Vienen de ciudades distintas.",
        observation:
          "La diferencia de origen es lo más visible de la escena. No por eso es lo más relevante.",
        availableContext: [
          "Uno de los dos lleva semanas cubriendo turnos extra.",
          "Quien decide el reparto no participa en la conversación.",
          "No ha habido faltas de respeto por ninguna parte.",
        ],
        readings: [
          {
            key: "estilo",
            label: "Tienen maneras distintas de pedir las cosas.",
          },
          { key: "carga", label: "El reparto real es desigual." },
          { key: "poder", label: "Ninguno de los dos decide el reparto." },
          {
            key: "falta-respeto",
            label: "Uno descalifica al otro delante del equipo.",
          },
        ],
        buckets: [
          { key: "diferencia", label: "Diferencia plausible de repertorio" },
          { key: "falta", label: "Falta contexto para decidir" },
          { key: "limite", label: "Hay un límite o un derecho en juego" },
        ],
        missingInformationPrompt:
          "Antes de explicar algo por la cultura: ¿tienes razones para pensar que es relevante aquí, o la estás usando porque es la diferencia más visible?",
      },
    },
    recall: {
      exerciseKey: "eec-c7-recall-diferencia-no-es-excusa",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 68,
      type: "QUIZ",
      title:
        "Según el capítulo 7, ¿qué permite y qué no permite explicar una conducta por el contexto cultural?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-diferencia-no-es-excusa",
        options: [
          {
            key: "opcion-explica-no-justifica",
            label:
              "Puede explicar parte de la conducta; no convierte el daño, la coerción o la discriminación en algo incuestionable.",
          },
          {
            key: "opcion-justifica",
            label:
              "Si una conducta pertenece a la cultura de alguien, cuestionarla sería imponer la propia.",
          },
          {
            key: "opcion-irrelevante",
            label:
              "El contexto cultural nunca aporta nada útil para entender un desacuerdo.",
          },
        ],
        correctOptionKey: "opcion-explica-no-justifica",
      },
      feedback: {
        correct:
          "Eso es. Y no todo desacuerdo entre personas de orígenes distintos es cultural: puede ser personalidad, cansancio o desigualdad de poder.",
        review:
          "Vuelve a la pregunta incómoda del capítulo: ¿hay razones para pensar que la cultura es relevante aquí, o es solo lo más visible?",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c7-practice-un-pais-no-es-una-variable",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 69,
      type: "REFLECTION",
      title: "Un país no es una variable",
      sourceHeading: "Un país no es una variable mágica",
      practiceKind: "belief_lens",
      interaction: {
        kind: "belief_lens",
        belief: "«En el país A la gente es más expresiva que en el país B.»",
        zones: [
          {
            key: "observo",
            label: "Lo que el estudio observó",
            hint: "Lo que un dato comparativo puede mostrar realmente.",
            options: [
              {
                key: "promedio",
                label: "Una diferencia promedio entre dos muestras.",
              },
              {
                key: "medida",
                label: "Puntuaciones en un instrumento concreto.",
              },
            ],
          },
          {
            key: "supongo",
            label: "Lo que la frase añade",
            hint: "El salto del promedio a las personas.",
            options: [
              {
                key: "cada-persona",
                label:
                  "Que cada persona de A es más expresiva que cada una de B.",
              },
              {
                key: "causa",
                label: "Que la causa de la diferencia es «la cultura».",
              },
              {
                key: "homogeneo",
                label: "Que dentro de cada país no hay variación relevante.",
              },
            ],
          },
          {
            key: "falta",
            label: "Lo que faltaría preguntar",
            hint: "Lo que el capítulo enumera antes de leer la diferencia.",
            options: [
              { key: "quienes", label: "Quiénes participaron." },
              { key: "que", label: "Qué se midió y cómo se tradujo." },
              { key: "tamano", label: "Qué tamaño tenía la diferencia." },
              { key: "otras", label: "Qué otras explicaciones caben." },
            ],
          },
        ],
        allowsFreeText: true,
      },
    },
    recall: {
      exerciseKey: "eec-c7-recall-muchos-repertorios-dentro",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 70,
      type: "QUIZ",
      title:
        "Según el capítulo 7, encontrar una diferencia promedio entre dos países demuestra…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-muchos-repertorios-dentro",
        options: [
          {
            key: "opcion-solo-promedio",
            label:
              "Una diferencia entre esas muestras: no que la causa sea la cultura ni que describa a cada persona.",
          },
          {
            key: "opcion-cultura",
            label:
              "Que la cultura de esos países produce esa diferencia emocional.",
          },
          {
            key: "opcion-nada",
            label:
              "Nada en absoluto: las comparaciones entre países no aportan información.",
          },
        ],
        correctOptionKey: "opcion-solo-promedio",
      },
      feedback: {
        correct:
          "Exacto. Región, familia, generación y migración producen variación dentro de un mismo país: la cultura importa y no explica todo por decreto.",
        review:
          "Recuerda la imagen de las dos reglas: antes de interpretar los números conviene saber quién participó y qué se midió.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c7-practice-de-conclusion-a-pregunta",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 71,
      type: "REFLECTION",
      title: "De conclusión a pregunta",
      sourceHeading: "Preguntar antes de interpretar",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Tres frases cierran una escena antes de conocerla. Vamos a ver cuáles dejan lugar a una respuesta.",
        observation:
          "Humildad cultural no es fingir que no sabemos nada: es reconocer que el mapa puede estar incompleto.",
        availableContext: [
          "Preguntar forma parte de traducir.",
          "Se puede preguntar y sostener un límite a la vez.",
          "Alguna diferencia puede permanecer aunque preguntemos.",
        ],
        readings: [
          { key: "cierra", label: "«Si te importara, hablarías ahora.»" },
          {
            key: "abre",
            label: "«¿Prefieres hablarlo ahora o más tarde?»",
          },
          {
            key: "estereotipo",
            label: "«Ustedes siempre evitan los conflictos.»",
          },
          {
            key: "limite",
            label: "«Necesito una respuesta hoy; dime cuándo puedes.»",
          },
        ],
        buckets: [
          { key: "cierra-escena", label: "Cierra la escena" },
          { key: "deja-abierto", label: "Deja lugar a una respuesta" },
          { key: "con-limite", label: "Pregunta y sostiene un límite" },
        ],
        missingInformationPrompt:
          "Memorizar un manual de costumbres por país no evita el malentendido. ¿Cuál de estas formulaciones permite seguir conversando sin renunciar a lo que necesitas?",
      },
    },
    recall: {
      exerciseKey: "eec-c7-recall-preguntar-es-traducir",
      bookSlug: BOOK,
      chapterOrder: 7,
      order: 72,
      type: "QUIZ",
      title: "Según el capítulo 7, la humildad cultural implica…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-preguntar-es-traducir",
        options: [
          {
            key: "opcion-mapa-incompleto",
            label:
              "Reconocer que nuestro mapa puede estar incompleto y atender a la persona concreta, no al estereotipo.",
          },
          {
            key: "opcion-no-saber",
            label:
              "Fingir que no sabemos nada sobre las diferencias culturales para no ofender.",
          },
          {
            key: "opcion-aceptar-todo",
            label:
              "Aceptar cualquier conducta con tal de no imponer la propia manera de sentir.",
          },
        ],
        correctOptionKey: "opcion-mapa-incompleto",
      },
      feedback: {
        correct:
          "Eso es. Mantener la hipótesis abierta y sostener un límite caben en la misma conversación.",
        review:
          "Vuelve a la alternativa que propone el capítulo: no un manual de costumbres por país, sino observar, reconocer desde dónde leemos y preguntar.",
      },
    },
  },

  // ── EEC-C08 · Escuchar no es obedecer ────────────────────────────────────
  {
    practice: {
      exerciseKey: "eec-c8-practice-emocion-interpretacion-hechos-falta",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 73,
      type: "REFLECTION",
      title: "Emoción, interpretación, hechos y lo que falta",
      sourceHeading: "Cuando sentir también es valorar",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "Alguien rechaza un encargo extra que no podía asumir. El resto del día siente culpa.",
        fields: [
          {
            key: "siento",
            label: "La emoción",
            options: [
              { key: "culpa", label: "Culpa." },
              { key: "incomodidad", label: "Incomodidad difusa." },
            ],
          },
          {
            key: "interpreto",
            label: "La interpretación que llega con ella",
            options: [
              { key: "dane", label: "«Hice daño a alguien.»" },
              { key: "egoista", label: "«Fui egoísta.»" },
              { key: "importa", label: "«Esta relación me importa.»" },
            ],
          },
          {
            key: "impulso",
            label: "Los hechos disponibles",
            options: [
              { key: "no-podia", label: "No tenía capacidad para asumirlo." },
              { key: "aviso", label: "Avisó con tiempo." },
              {
                key: "reaccion",
                label: "Nadie ha dicho todavía qué le pareció.",
              },
            ],
          },
          {
            key: "elijo",
            label: "La información que falta",
            options: [
              {
                key: "consecuencia",
                label: "Qué consecuencia tuvo realmente.",
              },
              { key: "otros", label: "Si alguien más podía hacerlo." },
              { key: "expectativa", label: "Qué se esperaba de esa persona." },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "El ejercicio no juzga si la negativa estuvo bien: separa lo que la emoción muestra de lo que los hechos sostienen.",
      },
    },
    recall: {
      exerciseKey: "eec-c8-recall-sentirlo-no-lo-vuelve-verdad",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 74,
      type: "QUIZ",
      title:
        "Según el capítulo 8, sentir culpa después de poner un límite establece que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-sentirlo-no-lo-vuelve-verdad",
        options: [
          {
            key: "opcion-importa",
            label:
              "Algo importa en esa relación; no que se haya hecho daño ni que la negativa fuera injusta.",
          },
          {
            key: "opcion-culpable",
            label:
              "Que probablemente se hizo algo mal, porque la culpa no aparece sin motivo.",
          },
          {
            key: "opcion-irrelevante",
            label:
              "Nada: la culpa es una emoción que conviene descartar al tomar decisiones.",
          },
        ],
        correctOptionKey: "opcion-importa",
      },
      feedback: {
        correct:
          "Exacto. La emoción habla de una relación de importancia; de ahí no se sigue que su primera explicación sea correcta.",
        review:
          "Vuelve a la distinción central: «siento culpa» y «soy culpable» son dos afirmaciones distintas.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c8-practice-que-importa-y-que-esta-justificado",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 75,
      type: "REFLECTION",
      title: "Qué parece importar, qué está justificado",
      sourceHeading: "La ética empieza cuando aparece el otro",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "Aparece una emoción intensa",
          "Con ella llega una conclusión rápida",
          "Y un impulso concreto de hacer algo",
        ],
        contexts: [
          {
            key: "celos",
            label: "Celos ante un cambio de rutina",
            description:
              "La otra persona ha empezado a salir más con gente del trabajo.",
          },
          {
            key: "indignacion",
            label: "Indignación ante una publicación",
            description: "Alguien publica algo que contradice un valor propio.",
          },
        ],
        factors: [
          { key: "importa", label: "Qué parece importar aquí" },
          { key: "evidencia", label: "Qué evidencia hay realmente" },
          {
            key: "derechos",
            label: "Qué derechos de otras personas entran en juego",
          },
          {
            key: "consecuencias",
            label: "Qué consecuencias tendría actuar así",
          },
        ],
        prompt:
          "Compara «qué parece importar» con «qué acción estaría justificada». La intensidad no responde la segunda pregunta.",
      },
    },
    recall: {
      exerciseKey: "eec-c8-recall-muestra-lo-que-importa-no-que-hacer",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 76,
      type: "QUIZ",
      title:
        "Según el capítulo 8, ¿qué autoriza la intensidad de una emoción como los celos?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-muestra-lo-que-importa-no-que-hacer",
        options: [
          {
            key: "opcion-no-autoriza",
            label:
              "Nada por sí sola: puede señalar que algo importa, y no da derecho a revisar el teléfono de alguien ni a controlarlo.",
          },
          {
            key: "opcion-autoriza",
            label:
              "Justifica comprobar lo que ocurre, porque una emoción tan fuerte suele tener razón.",
          },
          {
            key: "opcion-reprimir",
            label:
              "Indica que la emoción debe reprimirse hasta que desaparezca.",
          },
        ],
        correctOptionKey: "opcion-no-autoriza",
      },
      feedback: {
        correct:
          "Eso es. Entre «esto parece importarme» y «esta acción está justificada» hay una distancia donde ocurre el discernimiento.",
        review:
          "Recuerda por qué el capítulo introduce al otro: las decisiones afectan a otras personas, y eso añade preguntas que la intensidad no responde.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c8-practice-clasificar-pista-evidencia-veredicto",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 77,
      type: "REFLECTION",
      title: "¿Pista, evidencia o veredicto?",
      sourceHeading: "Pista, evidencia y veredicto no son lo mismo",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "En una entrevista, quien te recibe mira el reloj mientras hablas. Aparece una punzada de ansiedad.",
        observation:
          "La reacción tiene una historia y una lógica; eso explica su aparición.",
        availableContext: [
          "La reunión anterior terminó tarde.",
          "Quedan otras dos entrevistas después de la tuya.",
          "No ha hecho ningún comentario sobre tus respuestas.",
        ],
        readings: [
          { key: "punzada", label: "Sentiste ansiedad al ver el gesto." },
          { key: "historia", label: "Antes ese gesto anunció desaprobación." },
          { key: "mal", label: "Lo estás haciendo mal." },
          { key: "horario", label: "Va con retraso respecto a su agenda." },
        ],
        buckets: [
          { key: "pista", label: "Pista que merece examen" },
          { key: "evidencia", label: "Evidencia adicional" },
          { key: "veredicto", label: "Veredicto todavía no justificado" },
        ],
        missingInformationPrompt:
          "¿Qué haría falta antes de convertir esa pista en una creencia firme sobre cómo va la entrevista?",
      },
    },
    recall: {
      exerciseKey: "eec-c8-recall-pista-evidencia-veredicto",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 78,
      type: "QUIZ",
      title:
        "Según el capítulo 8, comprender por qué apareció una emoción demuestra que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-pista-evidencia-veredicto",
        options: [
          {
            key: "opcion-explica-no-confirma",
            label:
              "Explica su aparición; no demuestra que la interpretación que la acompaña sea correcta esta vez.",
          },
          {
            key: "opcion-confirma",
            label:
              "Confirma la interpretación, porque una reacción con historia responde a algo real.",
          },
          {
            key: "opcion-invalida",
            label:
              "La invalida: si viene del pasado, la emoción no aporta información sobre el presente.",
          },
        ],
        correctOptionKey: "opcion-explica-no-confirma",
      },
      feedback: {
        correct:
          "Exacto. Las emociones influyen en lo que atendemos y elegimos: a veces ayudan, a veces sesgan. Una pista pide investigación.",
        review:
          "Vuelve a separar los tres planos: la punzada es real, su historia explica el origen, y el veredicto sobre la entrevista sigue pendiente.",
      },
    },
  },
  {
    practice: {
      exerciseKey:
        "eec-c8-practice-experiencia-interpretacion-impulso-conducta",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 79,
      type: "REFLECTION",
      title: "Experiencia, interpretación, impulso y conducta",
      sourceHeading: "**No certifica la interpretación que la acompaña.**",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "Alguien llega furioso y acusa a un compañero de haberlo dejado fuera de una decisión.",
        fields: [
          {
            key: "siento",
            label: "La experiencia",
            options: [
              { key: "furia", label: "Está furioso." },
              { key: "excluido", label: "Se siente excluido." },
            ],
          },
          {
            key: "interpreto",
            label: "La interpretación",
            options: [
              { key: "aposta", label: "«Lo hicieron a propósito.»" },
              { key: "olvido", label: "«Se les pasó avisarme.»" },
            ],
          },
          {
            key: "impulso",
            label: "El impulso",
            options: [
              { key: "encarar", label: "Encararlo delante de todos." },
              { key: "irse", label: "Irse sin decir nada." },
            ],
          },
          {
            key: "elijo",
            label: "La conducta que se elige",
            options: [
              {
                key: "preguntar",
                label: "Preguntar qué pasó antes de concluir.",
              },
              { key: "esperar", label: "Esperar a hablarlo en privado." },
              { key: "portazo", label: "Dar un portazo." },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "Reconocer que alguien está furioso no equivale a aceptar su acusación ni a autorizar cualquier conducta. Son tres decisiones distintas.",
      },
    },
    recall: {
      exerciseKey: "eec-c8-recall-validar-no-es-dar-la-razon",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 80,
      type: "QUIZ",
      title: "Según el capítulo 8, decir «entiendo que estés furioso» valida…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-validar-no-es-dar-la-razon",
        options: [
          {
            key: "opcion-solo-experiencia",
            label:
              "La experiencia de esa persona; no su interpretación de los hechos ni cualquier conducta.",
          },
          {
            key: "opcion-todo",
            label:
              "Su versión completa de lo ocurrido, porque validar implica dar la razón.",
          },
          {
            key: "opcion-nada",
            label:
              "Nada relevante: es una fórmula de cortesía sin efecto real.",
          },
        ],
        correctOptionKey: "opcion-solo-experiencia",
      },
      feedback: {
        correct:
          "Eso es. El capítulo propone algo más exigente que los dos extremos: escuchar la pista y después investigar.",
        review:
          "Revisa las tres decisiones que suelen tomarse como una sola: validar la experiencia, aceptar la interpretación y justificar la conducta.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c8-practice-que-respuesta-puedo-justificar",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 81,
      type: "REFLECTION",
      title: "¿Qué respuesta puedo justificar?",
      sourceHeading: "9. ¿Qué respuesta puedes justificar?",
      practiceKind: "belief_lens",
      interaction: {
        kind: "belief_lens",
        belief: "«Lo mejor es responder ahora mismo y zanjar el asunto.»",
        zones: [
          {
            key: "observo",
            label: "Lo que esta respuesta consigue",
            hint: "Lo que sí resuelve, y conviene reconocer.",
            options: [
              { key: "tension", label: "Baja la tensión enseguida." },
              { key: "claridad", label: "Deja clara mi postura." },
            ],
          },
          {
            key: "supongo",
            label: "Lo que da por sentado",
            hint: "El criterio que está usando sin decirlo.",
            options: [
              {
                key: "malestar",
                label: "Que reducir el malestar rápido es el mejor criterio.",
              },
              {
                key: "evidencia",
                label: "Que ya tengo toda la evidencia relevante.",
              },
              {
                key: "solo-yo",
                label: "Que la decisión solo me afecta a mí.",
              },
            ],
          },
          {
            key: "falta",
            label: "Lo que faltaría considerar",
            hint: "Lo que el capítulo enumera antes de elegir.",
            options: [
              { key: "valores", label: "Los valores que realmente elijo." },
              { key: "derechos", label: "Los derechos propios y ajenos." },
              { key: "consecuencias", label: "Las consecuencias previsibles." },
              { key: "perspectivas", label: "Las perspectivas que faltan." },
            ],
          },
        ],
        allowsFreeText: true,
      },
    },
    recall: {
      exerciseKey: "eec-c8-recall-antes-de-actuar-amplia-el-examen",
      bookSlug: BOOK,
      chapterOrder: 8,
      order: 82,
      type: "QUIZ",
      title:
        "Según el capítulo 8, ¿qué añade el discernimiento antes de elegir una respuesta?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-antes-de-actuar-amplia-el-examen",
        options: [
          {
            key: "opcion-amplia",
            label:
              "Evidencia, valores elegidos, derechos, consecuencias, perspectivas que faltan y responsabilidad.",
          },
          {
            key: "opcion-emocion-correcta",
            label:
              "Una manera de identificar cuál era la emoción correcta en esa situación.",
          },
          {
            key: "opcion-rapidez",
            label:
              "Un criterio para elegir la acción que reduzca el malestar más rápido.",
          },
        ],
        correctOptionKey: "opcion-amplia",
      },
      feedback: {
        correct:
          "Exacto. Escuchar una emoción abre preguntas antes de cerrar una decisión.",
        review:
          "Vuelve al paso del capítulo: pide expresamente no pensar solo en qué acción reduciría el malestar más rápido.",
      },
    },
  },

  // ── EEC-C09 · Repensar lo que sientes ────────────────────────────────────
  {
    practice: {
      exerciseKey: "eec-c9-practice-influencia-o-voluntarismo",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 83,
      type: "REFLECTION",
      title: "¿Influencia posible o voluntarismo?",
      sourceHeading:
        "**Construcción no es sinónimo de fabricación consciente.**",
      practiceKind: "belief_lens",
      interaction: {
        kind: "belief_lens",
        belief:
          "«Si las emociones se construyen, puedo construir la que quiera.»",
        zones: [
          {
            key: "observo",
            label: "Lo que sí sostiene el capítulo",
            hint: "La parte que la frase acierta.",
            options: [
              {
                key: "aprendizaje",
                label: "Lo que sentimos depende en parte de lo aprendido.",
              },
              {
                key: "puede-cambiar",
                label: "Un sistema que aprendió puede seguir aprendiendo.",
              },
            ],
          },
          {
            key: "supongo",
            label: "Lo que la frase supone",
            hint: "El salto de influir a decidir.",
            options: [
              {
                key: "a-voluntad",
                label: "Que se puede fabricar o apagar una emoción a voluntad.",
              },
              {
                key: "consola",
                label:
                  "Que existe una consola interior donde escribir órdenes.",
              },
              {
                key: "rapidez",
                label: "Que el cambio ocurre en cuanto se decide.",
              },
            ],
          },
          {
            key: "falta",
            label: "Lo que deja fuera",
            hint: "Lo aprendido sin que nadie lo eligiera.",
            options: [
              {
                key: "no-recordado",
                label: "Aprendizajes que ya no se recuerdan.",
              },
              {
                key: "contexto",
                label: "El cuerpo, el cansancio y la situación.",
              },
              {
                key: "ritmos",
                label: "Que no todo cambia con la misma facilidad.",
              },
            ],
          },
        ],
        allowsFreeText: true,
      },
    },
    recall: {
      exerciseKey: "eec-c9-recall-construido-no-significa-elegido",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 84,
      type: "QUIZ",
      title:
        "Según el capítulo 9, que una emoción dependa de aprendizaje y construcción significa que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-construido-no-significa-elegido",
        options: [
          {
            key: "opcion-influir",
            label:
              "Se puede influir en ella y seguir aprendiendo; no que se pueda elegir directamente lo que se siente.",
          },
          {
            key: "opcion-elegir",
            label:
              "Se puede decidir qué sentir, si se aprende la técnica adecuada.",
          },
          {
            key: "opcion-fija",
            label:
              "No se puede cambiar nada, porque lo aprendido queda fijado para siempre.",
          },
        ],
        correctOptionKey: "opcion-influir",
      },
      feedback: {
        correct:
          "Eso es. Una lengua es una construcción cultural y nadie eligió conscientemente cada regla que usa al hablar.",
        review:
          "Revisa la distinción: construcción no es sinónimo de fabricación consciente, y no existe una consola interior donde escribir «culpa = false».",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c9-practice-objetivo-y-herramienta",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 85,
      type: "REFLECTION",
      title: "Objetivo y herramienta",
      sourceHeading:
        "9. Tomar lo mejor sin convertir una herramienta en religión",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Varias situaciones cotidianas piden cosas distintas. Las herramientas disponibles no hacen el mismo trabajo.",
        observation:
          "Cada enfoque hace preguntas distintas y sirve a problemas distintos.",
        availableContext: [
          "Reevaluar ayuda cuando caben varias interpretaciones plausibles.",
          "Distraerse puede proteger en una crisis breve y volverse evitación si el problema crece.",
          "A veces lo que necesita cambiar es la situación, no la emoción.",
        ],
        readings: [
          {
            key: "reparto",
            label: "Una responsabilidad familiar está mal repartida.",
          },
          {
            key: "espera",
            label: "Faltan dos horas para una noticia y no hay nada que hacer.",
          },
          {
            key: "suposicion",
            label:
              "La conclusión sobre lo que piensa alguien es una suposición.",
          },
          {
            key: "presentacion",
            label: "Hay que presentar algo aunque los nervios sigan ahí.",
          },
        ],
        buckets: [
          { key: "cambiar-situacion", label: "Cambiar algo de la situación" },
          { key: "bajar-activacion", label: "Bajar la activación un rato" },
          { key: "revisar", label: "Revisar la interpretación" },
          { key: "actuar", label: "Actuar aunque la emoción siga" },
          { key: "falta", label: "Falta información" },
        ],
        missingInformationPrompt:
          "«Funciona en promedio» no significa «sirve para todo». ¿Qué haría falta saber antes de elegir una herramienta aquí?",
      },
    },
    recall: {
      exerciseKey: "eec-c9-recall-tecnica-util-no-es-universal",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 86,
      type: "QUIZ",
      title:
        "Según el capítulo 9, que una técnica de regulación funcione en promedio significa que…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-tecnica-util-no-es-universal",
        options: [
          {
            key: "opcion-segun-problema",
            label:
              "Responde a cierto problema en cierto contexto; no es la respuesta correcta para todo.",
          },
          {
            key: "opcion-universal",
            label:
              "Conviene aplicarla siempre que aparezca una emoción difícil.",
          },
          {
            key: "opcion-inutil",
            label:
              "No sirve realmente, porque los promedios no describen a nadie.",
          },
        ],
        correctOptionKey: "opcion-segun-problema",
      },
      feedback: {
        correct:
          "Exacto. Las escuelas terapéuticas iluminan partes distintas del mapa; se puede tomar lo mejor de una sin exigirle lo que no fue diseñada para resolver.",
        review:
          "Vuelve al criterio del capítulo: la regulación flexible no es la terapia que gana, sino el marco que pregunta qué objetivo hay y qué costo tiene cada opción.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c9-practice-objetivo-influencia-estrategia-senal",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 87,
      type: "REFLECTION",
      title: "Objetivo, influencia, estrategia y señal",
      sourceHeading:
        "1. No siempre necesitas sentirte mejor para responder mejor",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "Hay que sostener una conversación incómoda con alguien del trabajo esta semana.",
        fields: [
          {
            key: "siento",
            label: "Qué necesito lograr",
            options: [
              { key: "acordar", label: "Acordar un reparto distinto." },
              { key: "informar", label: "Dejar clara mi disponibilidad." },
              {
                key: "tolerar",
                label: "Sostener la incomodidad sin evitarla.",
              },
            ],
          },
          {
            key: "interpreto",
            label: "Qué puedo influir",
            options: [
              { key: "momento", label: "Cuándo y dónde hablarlo." },
              { key: "tono", label: "Cómo lo planteo." },
              {
                key: "respuesta",
                label: "No puedo influir en cómo lo reciba.",
              },
            ],
          },
          {
            key: "impulso",
            label: "Estrategia candidata",
            options: [
              { key: "preparar", label: "Escribir antes lo esencial." },
              { key: "pausa", label: "Pedir una pausa si sube el tono." },
              { key: "posponer", label: "Posponerlo una semana más." },
            ],
          },
          {
            key: "elijo",
            label: "Cómo sabré si ayudó",
            options: [
              { key: "dije", label: "Dije lo que necesitaba decir." },
              { key: "acuerdo", label: "Salió algún acuerdo concreto." },
              { key: "menos-mal", label: "Me sentí menos mal después." },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "«¿Me siento menos mal?» es un criterio posible, no el único. Se puede seguir sintiendo incomodidad y haber conseguido lo que importaba.",
      },
    },
    recall: {
      exerciseKey: "eec-c9-recall-define-que-quieres-cambiar",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 88,
      type: "QUIZ",
      title:
        "Según el capítulo 9, ¿contra qué se evalúa una estrategia de regulación?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-define-que-quieres-cambiar",
        options: [
          {
            key: "opcion-objetivo",
            label:
              "Contra el objetivo que se perseguía, que no siempre es sentirse mejor.",
          },
          {
            key: "opcion-intensidad",
            label:
              "Contra cuánto bajó la intensidad de la emoción desagradable.",
          },
          {
            key: "opcion-rapidez",
            label: "Contra la rapidez con que la emoción desapareció.",
          },
        ],
        correctOptionKey: "opcion-objetivo",
      },
      feedback: {
        correct:
          "Eso es. Se puede seguir nervioso y hacer la presentación, o seguir sintiendo culpa y repartir mejor una responsabilidad.",
        review:
          "Revisa las dos preguntas que el capítulo separa: «¿cómo quiero sentirme?» y «¿qué necesito lograr?». A veces coinciden y a veces no.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c9-practice-por-que-puerta-entra",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 89,
      type: "REFLECTION",
      title: "¿Por qué puerta entra esta respuesta?",
      sourceHeading: "Puerta 1: cambiar algo afuera",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "En una comida familiar se propone que una sola persona acompañe todas las citas médicas de alguien.",
        observation:
          "Hay varias respuestas posibles, y cada una entra por una puerta distinta.",
        availableContext: [
          "Ninguna puerta garantiza que la emoción cambie.",
          "Se puede usar más de una, en distinto orden.",
          "A veces lo que hay que cambiar está fuera de la persona.",
        ],
        readings: [
          {
            key: "calendario",
            label: "«Hagamos un calendario y repartamos las citas.»",
          },
          {
            key: "diez-minutos",
            label: "«Necesito diez minutos antes de responder.»",
          },
          {
            key: "suposicion",
            label:
              "«Estoy suponiendo que todos me verán egoísta; puedo preguntar.»",
          },
          {
            key: "decir",
            label: "«Sigo sintiendo culpa y voy a decir qué puedo y qué no.»",
          },
        ],
        buckets: [
          { key: "afuera", label: "Cambiar algo afuera" },
          { key: "espacio", label: "Cambiar cuánto espacio ocupa ahora" },
          { key: "interpretacion", label: "Revisar la interpretación" },
          {
            key: "conducta",
            label: "Elegir la conducta aunque la emoción siga",
          },
        ],
        missingInformationPrompt:
          "Compara el alcance de cada puerta: ¿qué resuelve y qué no resuelve? Y recuerda el límite ético — a veces no hay que tolerar mejor la carretera, sino salir de ella.",
      },
    },
    recall: {
      exerciseKey: "eec-c9-recall-cuatro-puertas",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 90,
      type: "QUIZ",
      title:
        "Según el capítulo 9, elegir una de las cuatro puertas de intervención garantiza…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-cuatro-puertas",
        options: [
          {
            key: "opcion-no-garantiza",
            label:
              "Nada por sí solo: identifica dónde se está interviniendo, sin prometer que la emoción cambie.",
          },
          {
            key: "opcion-resultado",
            label:
              "Que la emoción disminuya, si la puerta elegida es la adecuada.",
          },
          {
            key: "opcion-unica",
            label: "Que ya no hará falta usar ninguna de las otras tres.",
          },
        ],
        correctOptionKey: "opcion-no-garantiza",
      },
      feedback: {
        correct:
          "Exacto. Las puertas no compiten: se puede reducir activación, revisar una suposición y luego proponer un cambio externo.",
        review:
          "Vuelve a la imagen del humo y la ventana: la puerta describe por dónde entras, no el resultado que obtendrás.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c9-practice-objetivo-respuesta-consecuencia-ajuste",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 91,
      type: "REFLECTION",
      title: "Objetivo, respuesta, consecuencia y ajuste",
      sourceHeading: "15. Repensar también es aprender para la próxima vez",
      practiceKind: "sequence_ordering",
      interaction: {
        kind: "sequence_ordering",
        scenario:
          "Alguien decide poner un límite en una conversación familiar. Ordena lo que el capítulo describe después.",
        cards: [
          { key: "objetivo", label: "Define qué necesita lograr." },
          { key: "respuesta", label: "Elige una respuesta y la sostiene." },
          {
            key: "consecuencia",
            label: "Observa lo que ocurrió realmente después.",
          },
          {
            key: "discrepancia",
            label: "Compara lo ocurrido con lo que esperaba.",
          },
          { key: "ajuste", label: "Ajusta qué probará la próxima vez." },
        ],
        solved: [
          "objetivo",
          "respuesta",
          "consecuencia",
          "discrepancia",
          "ajuste",
        ],
        solvedLabel: "Ver la secuencia del capítulo",
        feedback:
          "Es un ciclo de prueba y aprendizaje, no un control remoto: un episodio no reescribe la expectativa, y aprender una respuesta nueva no borra la anterior.",
      },
    },
    recall: {
      exerciseKey: "eec-c9-recall-repensar-ocurre-despues",
      bookSlug: BOOK,
      chapterOrder: 9,
      order: 92,
      type: "QUIZ",
      title: "Según el capítulo 9, la regulación emocional termina…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-repensar-ocurre-despues",
        options: [
          {
            key: "opcion-no-termina",
            label:
              "No termina cuando baja la intensidad: cada episodio deja información que puede alimentar predicciones nuevas.",
          },
          {
            key: "opcion-baja",
            label:
              "Cuando la emoción baja de intensidad y se recupera la calma.",
          },
          {
            key: "opcion-nunca-cambia",
            label:
              "Nunca produce aprendizaje, porque las expectativas antiguas siempre vuelven.",
          },
        ],
        correctOptionKey: "opcion-no-termina",
      },
      feedback: {
        correct:
          "Eso es. Observar consecuencias y discrepancias permite recalcular, aunque no garantice que la próxima emoción sea distinta.",
        review:
          "Recuerda los ejemplos: esperabas que la ansiedad creciera sin fin y subió, se sostuvo y disminuyó. Ese dato queda disponible.",
      },
    },
  },

  // ── EEC-C10 · Lo que enseñamos cuando alguien siente ─────────────────────
  {
    practice: {
      exerciseKey: "eec-c10-practice-de-minimizar-a-hacer-espacio",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 93,
      type: "REFLECTION",
      title: "De minimizar a hacer espacio",
      sourceHeading: "1. Hacer espacio a la experiencia",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Un adolescente cuenta que en el colegio se rieron de él. Aún no sabes qué ocurrió exactamente.",
        observation:
          "Corregir la interpretación demasiado pronto puede dejar intacta la experiencia principal.",
        availableContext: [
          "Algo ocurrió y le dolió.",
          "No sabemos todavía quiénes participaron ni qué se dijo.",
          "Reconocer el impacto puede ocurrir antes de evaluar la interpretación.",
        ],
        readings: [
          { key: "corregir", label: "«Seguro no todos se ríen de ti.»" },
          {
            key: "espacio",
            label: "«Veo que esto te afectó mucho. Quiero entender qué pasó.»",
          },
          {
            key: "escalar",
            label: "«Eso es acoso, voy a llamar al colegio ahora.»",
          },
          {
            key: "minimizar",
            label: "«No le des importancia, ya se les pasará.»",
          },
        ],
        buckets: [
          { key: "hace-espacio", label: "Hace espacio y busca comprender" },
          { key: "minimiza", label: "Minimiza la experiencia" },
          { key: "escala", label: "Escala antes de saber" },
        ],
        missingInformationPrompt:
          "¿Cuál de estas respuestas reconoce el impacto sin cerrar todavía la interpretación de lo ocurrido?",
      },
    },
    recall: {
      exerciseKey: "eec-c10-recall-hacer-espacio-no-es-confirmar",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 94,
      type: "QUIZ",
      title:
        "Según el capítulo 10, hacer espacio a la experiencia de alguien valida…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-hacer-espacio-no-es-confirmar",
        options: [
          {
            key: "opcion-experiencia",
            label:
              "Que algo le afectó; no confirma que su interpretación de lo ocurrido sea correcta.",
          },
          {
            key: "opcion-toda-historia",
            label:
              "Toda su versión de los hechos, porque de otro modo no se sentiría acompañado.",
          },
          {
            key: "opcion-nada",
            label:
              "Nada todavía: primero hay que averiguar si la interpretación es correcta.",
          },
        ],
        correctOptionKey: "opcion-experiencia",
      },
      feedback: {
        correct:
          "Exacto. Reconocer el impacto y examinar la interpretación son dos momentos distintos, y el primero no obliga al segundo.",
        review:
          "Vuelve al ejemplo: «seguro no todos se ríen de ti» puede ser cierto y, dicho demasiado pronto, deja sin atender lo principal.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c10-practice-observacion-interpretacion-pregunta-falta",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 95,
      type: "REFLECTION",
      title: "Observación, interpretación, pregunta y lo que falta",
      sourceHeading: "*Mi hijo llora porque intenta manipularme.*",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "Alguien cuenta que no lo invitaron a una salida del grupo. Acompañas la conversación.",
        fields: [
          {
            key: "siento",
            label: "Lo observable",
            options: [
              { key: "no-invitado", label: "No fue invitado a esa salida." },
              { key: "lo-cuenta", label: "Lo cuenta con la voz apagada." },
            ],
          },
          {
            key: "interpreto",
            label: "Mi interpretación como acompañante",
            options: [
              {
                key: "excluyeron",
                label: "«Te excluyeron porque no te valoran.»",
              },
              { key: "olvido", label: "«Puede que se les haya pasado.»" },
              { key: "dolio", label: "«Te dolió que no te invitaran.»" },
            ],
          },
          {
            key: "impulso",
            label: "La pregunta que puede aclarar",
            options: [
              { key: "que-paso", label: "«¿Sabes cómo se organizó?»" },
              { key: "que-necesitas", label: "«¿Qué necesitas ahora mismo?»" },
            ],
          },
          {
            key: "elijo",
            label: "Lo que todavía falta saber",
            options: [
              { key: "intencion", label: "Qué intención tuvo el grupo." },
              { key: "historia", label: "Si ha pasado otras veces." },
              { key: "quiere", label: "Si quiere hacer algo al respecto." },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "Nombrar el impacto es una cosa; atribuir intenciones a terceros es otra. Acompañar no exige explicar por la otra persona qué siente ni por qué.",
      },
    },
    recall: {
      exerciseKey: "eec-c10-recall-no-narrador-de-la-mente-ajena",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 96,
      type: "QUIZ",
      title:
        "Según el capítulo 10, ¿qué evita quien acompaña sin convertirse en narrador de la mente ajena?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-no-narrador-de-la-mente-ajena",
        options: [
          {
            key: "opcion-no-cierra",
            label:
              "Cerrar la historia antes de conocerla, atribuyendo intenciones a terceros que nadie ha comprobado.",
          },
          {
            key: "opcion-no-nombra",
            label:
              "Nombrar cualquier emoción, porque hacerlo siempre condiciona a la otra persona.",
          },
          {
            key: "opcion-no-pregunta",
            label:
              "Hacer preguntas, ya que preguntar puede parecer una duda sobre su relato.",
          },
        ],
        correctOptionKey: "opcion-no-cierra",
      },
      feedback: {
        correct:
          "Eso es. «Te dolió que no te invitaran» acompaña; «te excluyeron porque no te valoran» añade una intención que nadie comprobó.",
        review:
          "Recuerda la regla del capítulo: reconocer la experiencia sin convertirse demasiado pronto en narrador oficial de la mente ajena.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c10-practice-experiencia-impulso-limite-alternativa",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 97,
      type: "REFLECTION",
      title: "Experiencia, impulso, límite y alternativa",
      sourceHeading: "3. Poner límites a la conducta sin castigar la emoción",
      practiceKind: "four_part_distinction",
      interaction: {
        kind: "four_part_distinction",
        scenario:
          "Un adolescente, furioso por algo que pasó en el colegio, dice que va a responder en el chat del grupo.",
        fields: [
          {
            key: "siento",
            label: "La experiencia",
            options: [
              { key: "furia", label: "Está furioso." },
              { key: "humillacion", label: "Se sintió humillado." },
            ],
          },
          {
            key: "interpreto",
            label: "El impulso",
            options: [
              { key: "responder", label: "Responder ahora mismo en el chat." },
              { key: "exponer", label: "Contar delante de todos lo que pasó." },
            ],
          },
          {
            key: "impulso",
            label: "El límite claro",
            options: [
              { key: "no-amenazas", label: "No vamos a enviar amenazas." },
              { key: "no-ahora", label: "No se responde en caliente." },
            ],
          },
          {
            key: "elijo",
            label: "La alternativa conductual",
            options: [
              { key: "entender", label: "Ver primero qué ocurrió." },
              { key: "necesita", label: "Decidir qué necesita ahora." },
              { key: "hablar", label: "Hablarlo con alguien del colegio." },
            ],
          },
        ],
        allowsFreeText: true,
        disclaimer:
          "Poner un límite a la conducta no exige negar ni castigar la emoción. Son cosas distintas y pueden decirse en la misma frase.",
      },
    },
    recall: {
      exerciseKey: "eec-c10-recall-emocion-si-conducta-con-limites",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 98,
      type: "QUIZ",
      title:
        "Según el capítulo 10, ¿qué relación hay entre validar una emoción y permitir una conducta?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-emocion-si-conducta-con-limites",
        options: [
          {
            key: "opcion-distintas",
            label:
              "Son cosas distintas: la emoción puede estar presente y la conducta seguir teniendo límites.",
          },
          {
            key: "opcion-implica",
            label:
              "Validar la emoción implica aceptar la conducta que viene con ella.",
          },
          {
            key: "opcion-castigar",
            label:
              "Para poner un límite eficaz hay que dejar claro que esa emoción no corresponde.",
          },
        ],
        correctOptionKey: "opcion-distintas",
      },
      feedback: {
        correct:
          "Exacto. «Puedes estar furioso. No vamos a enviar amenazas. Veamos qué ocurrió» sostiene las tres cosas a la vez.",
        review:
          "Vuelve a separar los tres planos: sentir, querer hacer algo y hacerlo. El límite no requiere castigar la emoción.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c10-practice-escuchar-opciones-o-intervenir",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 99,
      type: "REFLECTION",
      title: "¿Escuchar, ofrecer opciones o intervenir?",
      sourceHeading: "4. Ajustar ayuda y agencia",
      practiceKind: "context_plausibility",
      interaction: {
        kind: "context_plausibility",
        situation:
          "Alguien cercano atraviesa un conflicto que puede resolver, aunque le está costando.",
        observation:
          "La prisa por ayudar también puede quitar algo. El nivel adecuado depende del contexto.",
        availableContext: [
          "No hay riesgo para su seguridad.",
          "Ha resuelto situaciones parecidas antes.",
          "Pidió contarlo, no pidió que alguien interviniera.",
        ],
        readings: [
          { key: "escuchar", label: "Escuchar sin proponer nada todavía." },
          {
            key: "opciones",
            label: "«¿Quieres que pensemos opciones juntos?»",
          },
          {
            key: "intervenir",
            label: "Hablar directamente con la otra parte.",
          },
          { key: "decidir", label: "Decirle qué debe hacer." },
        ],
        buckets: [
          { key: "conserva", label: "Conserva su participación" },
          { key: "depende", label: "Depende del riesgo y del contexto" },
          { key: "quita", label: "Le quita la decisión" },
        ],
        missingInformationPrompt:
          "¿Qué cambiaría tu respuesta si hubiera riesgo, o si se tratara de un niño pequeño en vez de un adulto?",
      },
    },
    recall: {
      exerciseKey: "eec-c10-recall-ayudar-sin-borrar-la-agencia",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 100,
      type: "QUIZ",
      title:
        "Según el capítulo 10, ¿de qué depende el nivel de ayuda adecuado al acompañar a alguien?",
      content: {
        recallMode: "objective",
        conceptKey: "eec-ayudar-sin-borrar-la-agencia",
        options: [
          {
            key: "opcion-contexto",
            label:
              "De la edad, el riesgo, el poder y el contexto: escuchar, ofrecer opciones o intervenir no son intercambiables.",
          },
          {
            key: "opcion-maximo",
            label:
              "Conviene siempre el nivel máximo: resolverlo evita sufrimiento innecesario.",
          },
          {
            key: "opcion-minimo",
            label:
              "Conviene siempre escuchar sin intervenir, para no quitar autonomía.",
          },
        ],
        correctOptionKey: "opcion-contexto",
      },
      feedback: {
        correct:
          "Eso es. «¿Quieres que te escuche, que pensemos opciones o que intervenga contigo?» no abandona: ofrece una elección pequeña.",
        review:
          "Recuerda que la escala cambia con la persona: con un niño puede ser elegir dónde sentarse; con un adolescente, decidir si alguien habla con el colegio.",
      },
    },
  },
  {
    practice: {
      exerciseKey: "eec-c10-practice-habilidad-o-condicion",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 101,
      type: "REFLECTION",
      title: "¿Habilidad individual o condición del entorno?",
      sourceHeading: "5. Mirar también el escenario",
      practiceKind: "signal_context_compare",
      interaction: {
        kind: "signal_context_compare",
        signals: [
          "La misma dificultad se repite cada semana",
          "La persona ya aprendió estrategias para manejarla",
          "Aun así vuelve a ocurrir",
        ],
        contexts: [
          {
            key: "habilidad",
            label: "Puerta 1: ampliar la habilidad",
            description:
              "Enseñar o practicar una manera distinta de responder.",
          },
          {
            key: "condicion",
            label: "Puerta 2: cambiar la condición",
            description: "Modificar lo que genera el problema una y otra vez.",
          },
        ],
        factors: [
          { key: "repeticion", label: "Con qué frecuencia se repite" },
          { key: "quien", label: "A cuántas personas les ocurre lo mismo" },
          { key: "costo", label: "Qué costo tiene pedir ayuda aquí" },
          { key: "poder", label: "Quién puede cambiar la condición" },
        ],
        prompt:
          "Es como enseñar equilibrio mientras el suelo continúa mojado. ¿Qué indicaría que hacen falta las dos puertas a la vez?",
      },
    },
    recall: {
      exerciseKey: "eec-c10-recall-cambiar-el-escenario",
      bookSlug: BOOK,
      chapterOrder: 10,
      order: 102,
      type: "QUIZ",
      title:
        "Según el capítulo 10, enseñar a alguien a regularse mejor ante un problema que se repite…",
      content: {
        recallMode: "objective",
        conceptKey: "eec-cambiar-el-escenario",
        options: [
          {
            key: "opcion-no-sustituye",
            label:
              "Puede ayudar y no sustituye modificar la condición que genera el problema una y otra vez.",
          },
          {
            key: "opcion-suficiente",
            label:
              "Es suficiente: con la habilidad adecuada, cualquier entorno se vuelve manejable.",
          },
          {
            key: "opcion-inutil",
            label:
              "Es inútil mientras el entorno no cambie, así que conviene no enseñar nada.",
          },
        ],
        correctOptionKey: "opcion-no-sustituye",
      },
      feedback: {
        correct:
          "Exacto. Aprender equilibrio importa; secar el suelo también. A veces hacen falta las dos cosas.",
        review:
          "Vuelve al ejemplo: una buena estrategia para manejar la ira ayuda, y no sería suficiente si lo que existe es acoso.",
      },
    },
  },
];

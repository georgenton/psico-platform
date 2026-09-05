/**
 * EEC-C03 → C10 — the forty approved microguides, as manifest input.
 *
 * Content only. `build-guide-manifests.mjs` keeps the shape, the checksum and
 * the three obligatory steps; this file holds the eight chapters' `common`
 * blocks and their five microguides each. It lives apart because forty
 * microguides in the generator would bury the ~80 lines that actually build a
 * manifest — not because C03–C10 build differently. They do not.
 *
 * Every claim paraphrases the TEXT_LOCKED chapter it anchors to. The `heading`
 * and `fingerprint` of each anchor are REAL strings from the published unit,
 * verified 1:1 against production before any of this shipped — nothing here
 * was written to make an anchor fit.
 *
 * Editorial authority: «EEC-C03–C10 — Inventario maestro de experiencias v0.1»
 * (https://app.notion.com/p/3d2cbb1031a081149d97ca054012b276), approved by the
 * author on 2026-09-04 with `APROBAR ARQUITECTURA C03-C10`.
 *
 * The chapters' integrative activities (`Detecta tus predicciones emocionales`,
 * `Mapa de una historia emocional`, …) are deliberately NOT here: they stay
 * book activities. Forty microguides, not forty-eight.
 */

const APPROVAL = [
  "https://app.notion.com/p/3d2cbb1031a081149d97ca054012b276",
  "APROBAR ARQUITECTURA C03-C10 — decisión autoral 2026-09-04.",
];

/** Per-chapter identity. Everything else is inherited from COMMON_C01. */
export const COMMON_C03_C10 = {
  C03: {
    chapterCode: "EEC-C03",
    chapterOrder: 3,
    unitKey: "f1fd8e4d-39ac-547f-908a-cb97c7f9170b",
    canonicalVersion: "EEC_C03_v1.0_TEXT_LOCKED_2026-08-25",
    canonicalSha256:
      "79c427f56089ba693e8c836d737ac0b3dd5c5ab54dbfc8746a02799bbe28beb1",
    sourceArtifact: "artifacts/eec/C03/v1.0/feelverse/unit-payload.json",
    approvalReferences: APPROVAL,
  },
  C04: {
    chapterCode: "EEC-C04",
    chapterOrder: 4,
    unitKey: "3540539f-72d6-5191-a5e8-447737410922",
    canonicalVersion: "EEC_C04_v1.0_TEXT_LOCKED_2026-08-25",
    canonicalSha256:
      "7f22cfb9859bc3309d6a410e9b1c80080c6b55ad6109b83d62a0852e8e6fe1ce",
    sourceArtifact: "artifacts/eec/C04/v1.0/feelverse/unit-payload.json",
    approvalReferences: APPROVAL,
  },
  C05: {
    chapterCode: "EEC-C05",
    chapterOrder: 5,
    unitKey: "231166b5-f48e-506a-9edc-474a26795e4c",
    canonicalVersion: "EEC_C05_v1.0_TEXT_LOCKED_2026-08-26",
    canonicalSha256:
      "0f35f0d0f498ef0d6d1970709c1cbfdf939dfd9f3d6ab8f01aecc1bba1a1c956",
    sourceArtifact: "artifacts/eec/C05/v1.0/feelverse/unit-payload.json",
    approvalReferences: APPROVAL,
  },
  C06: {
    chapterCode: "EEC-C06",
    chapterOrder: 6,
    unitKey: "170e6699-0507-5784-8ecc-c9994b8dbf7e",
    canonicalVersion: "EEC_C06_v1.1_TEXT_LOCKED_2026-09-01",
    canonicalSha256:
      "ac963f730925fc347e0ab91b9df09902af05f5febd73c830f099f3b82c7a4d7a",
    sourceArtifact: "artifacts/eec/C06/v1.1/feelverse/unit-payload.json",
    approvalReferences: APPROVAL,
  },
  C07: {
    chapterCode: "EEC-C07",
    chapterOrder: 7,
    unitKey: "e98cb79d-5f04-514a-9efd-735254285958",
    canonicalVersion: "EEC_C07_v1.0_TEXT_LOCKED_2026-08-26",
    canonicalSha256:
      "26a9b18738f0534a8c172bb22827f92e8f3745d70e91ea0a5923733b4bac8bd9",
    sourceArtifact: "artifacts/eec/C07/v1.0/feelverse/unit-payload.json",
    approvalReferences: APPROVAL,
  },
  C08: {
    chapterCode: "EEC-C08",
    chapterOrder: 8,
    unitKey: "cd8e1f8e-e19a-5c90-b0f0-5acd5d0a3163",
    canonicalVersion: "EEC_C08_v1.0_TEXT_LOCKED_2026-08-26",
    canonicalSha256:
      "6b71342e0117f4243022ff66e8af2e3b41caec0f4a978b50c48fbad3e0e336c2",
    sourceArtifact: "artifacts/eec/C08/v1.0/feelverse/unit-payload.json",
    approvalReferences: APPROVAL,
  },
  C09: {
    chapterCode: "EEC-C09",
    chapterOrder: 9,
    unitKey: "a1c44e40-de0b-5bac-9946-ed7655e4140e",
    canonicalVersion: "EEC_C09_v1.0_TEXT_LOCKED_2026-08-27",
    canonicalSha256:
      "02b42dbdeef1136c560207d597b4c010250e19216dcb0e4c0592684914f1a956",
    sourceArtifact: "artifacts/eec/C09/v1.0/feelverse/unit-payload.json",
    approvalReferences: APPROVAL,
  },
  C10: {
    chapterCode: "EEC-C10",
    chapterOrder: 10,
    unitKey: "1e7704be-0297-5124-90f7-ebff5ef0caeb",
    canonicalVersion: "EEC_C10_v1.0_TEXT_LOCKED_2026-08-27",
    canonicalSha256:
      "a732ccb428e46787850b646c75e36a160cafbeb3280ff596d95d6297a0623c9b",
    sourceArtifact: "artifacts/eec/C10/v1.0/feelverse/unit-payload.json",
    approvalReferences: APPROVAL,
  },
};

// ── C03 · Tu cerebro inventa emociones ──────────────────────────────────────

const C03 = [
  {
    id: "EEC-C03-MG01",
    title: "Predecir no es adivinar",
    slug: "predecir-no-es-adivinar",
    conceptKey: "eec-predecir-no-es-adivinar",
    practiceSlug: "anticipar-dato-afirmacion",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c3-predecir-no-es-adivinar",
        heading: "Predecir no es adivinar",
        fingerprint:
          "La experiencia previa permite que el sistema nervioso no empiece desde cero en cada instante.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Predecir, en el sentido del capítulo",
        body: [
          "Cuando se dice que «el cerebro predice», es fácil imaginar un vidente. Vas a separar tres cosas que suelen mezclarse: lo que el capítulo llama anticipación, lo que es dato del presente y lo que ya sería una afirmación de más.",
        ],
        note: "Trabajaremos con frases de ejemplo, no con tu historia personal. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Predecir no es adivinar",
        body: [
          "Lee la sección donde el capítulo aterriza la palabra «predicción»: leer una frase sin detenerse en cada letra, reconocer una voz con ruido, buscar el interruptor a oscuras.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Anticipar con lo aprendido no es ver el futuro",
        body: [
          "En este marco, predecir nombra algo cotidiano: el sistema nervioso usa lo que ya vivió para no empezar de cero en cada instante. No es una decisión consciente tomada de antemano, y tampoco es adivinar lo que va a pasar.",
          "La diferencia importa porque cambia qué se puede concluir. Que una anticipación aparezca rápido y sin esfuerzo no la vuelve verdadera, y que se sienta convincente no la convierte en un dato del presente.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "El escalón que no estaba",
        body: [
          "Al bajar una escalera conocida, el pie se levanta la altura de siempre. Si un escalón es más bajo, el tropiezo llega antes que cualquier pensamiento sobre escaleras.",
          "Ahí no hubo adivinación ni decisión: hubo una anticipación construida con experiencia previa, y una realidad que no encajó con ella.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Anticipación, dato y afirmación de más",
        body: [
          "Toma una frase cotidiana y sepárala en tres: qué parte se apoya en experiencia previa, qué parte es información disponible ahora y qué parte sería concluir de más.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué significa «predecir» en este capítulo?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Predecir, aquí, es usar lo aprendido para no partir de cero. No es adivinar el futuro ni decidir de antemano lo que vas a sentir. Una anticipación puede ser razonable y aun así no ser un hecho.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C03-MG02",
    title: "Una señal corporal no viene con etiqueta",
    slug: "senal-corporal-sin-etiqueta",
    conceptKey: "eec-senal-corporal-sin-etiqueta",
    practiceSlug: "misma-senal-tres-contextos",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c3-cuerpo-no-espera",
        heading: "El cuerpo no espera al final de la historia",
        fingerprint:
          "las señales del cuerpo son ingredientes; todavía no son la receta completa",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "La misma señal, tres situaciones",
        body: [
          "El corazón acelerado no llega con un nombre puesto. Vas a comparar una misma activación corporal en tres situaciones cotidianas y a ver qué cambia —y qué no— en lo que se puede concluir.",
        ],
        note: "No vamos a pedirte que observes tu cuerpo ahora ni que recuerdes un episodio intenso. Trabajaremos con escenas de ejemplo.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "El cuerpo no espera al final de la historia",
        body: [
          "Lee la sección sobre interocepción y estado corporal, donde el capítulo llega a la imagen de los ingredientes y la receta.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Una señal es ingrediente, no receta",
        body: [
          "El pulso, la respiración y la tensión forman parte de lo que ocurre, pero por sí solos no nombran una emoción. La misma aceleración puede acompañar una carrera, un encuentro esperado, una discusión o demasiado café.",
          "El capítulo propone entender la experiencia emocional como una coordinación entre el estado del cuerpo, la situación, la memoria y los conceptos disponibles, no como la lectura directa de una sola señal.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Subir escaleras y esperar una respuesta",
        body: [
          "Después de subir dos pisos, el corazón golpea. Esperando una respuesta importante, el corazón también golpea.",
          "La señal se parece; lo que permite decir es distinto. Sin la situación, la misma información corporal no alcanza para nombrar lo que pasa.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Misma señal, tres contextos",
        body: [
          "Observa un mismo conjunto de señales corporales en tres situaciones y elige qué factores podrían cambiar su significado. Ninguna combinación se marca como incorrecta.",
        ],
        note: "Es un ejercicio de comparación entre ejemplos; no interpreta tus sensaciones ni saca conclusiones sobre ti.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué hace falta además de la señal corporal?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Las señales del cuerpo aportan información real y no vienen etiquetadas. Para que adquieran un significado emocional situado hacen falta el contexto, la memoria y los conceptos con los que cuentas.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C03-MG03",
    title: "El cerebro también necesita contexto para categorizar",
    slug: "contexto-para-categorizar",
    conceptKey: "eec-contexto-para-categorizar",
    practiceSlug: "escena-antes-y-despues",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c3-construccion-no-arbitrariedad",
        heading: "Construcción no significa arbitrariedad",
        fingerprint: "ni libertad absoluta ni reacción mecánica",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuando aparece un dato nuevo",
        body: [
          "Categorizar no es pegar una palabra al azar. Vas a ordenar interpretaciones de una escena ambigua por plausibilidad, y luego a repetirlo cuando aparezca información nueva.",
        ],
        note: "La escena es de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Construcción no significa arbitrariedad",
        body: [
          "Lee la sección donde el capítulo enumera las restricciones bajo las que ocurre la construcción y cierra entre dos fronteras.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Construir no es elegir cualquier cosa",
        body: [
          "Que una experiencia se construya no significa que cualquier interpretación sea igualmente posible. El capítulo enumera restricciones: las propiedades reales de la situación, el estado del organismo, la información disponible, la historia de aprendizaje, los conceptos accesibles, las metas y las normas.",
          "Por eso el trabajo se sitúa entre dos fronteras: ni libertad absoluta para sentir lo que se decida, ni reacción mecánica fijada de antemano.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "La puerta que se cierra fuerte",
        body: [
          "Un portazo en la habitación de al lado admite varias lecturas: enojo, prisa, una corriente de aire. Todas caben mientras la información sea escasa.",
          "Si después aparece alguien con las manos ocupadas pidiendo ayuda, algunas lecturas pierden fuerza y otras la ganan. La escena no cambió; cambió el contexto disponible.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "La escena, antes y después del contexto",
        body: [
          "Ordena las interpretaciones posibles de una escena ambigua y observa qué se mantiene y qué se mueve cuando llega información nueva.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Por qué una misma escena admite lecturas distintas?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Categorizar es dar significado situado con el contexto, la experiencia y los conceptos disponibles. Que haya más de una lectura posible no vuelve falsa la experiencia, y tampoco significa que todas valgan lo mismo.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C03-MG04",
    title: "No hay un botón de miedo",
    slug: "no-hay-boton-de-miedo",
    conceptKey: "eec-no-hay-boton-de-miedo",
    practiceSlug: "region-y-emocion",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c3-patrones-sin-botones",
        heading: "Patrones sin botones",
        fingerprint:
          "sin que haya una huella universal, única e invariable para cada emoción",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "«Se activa una región»",
        body: [
          "«Se encendió la amígdala» suena a explicación completa. Vas a mirar cuatro afirmaciones sobre cerebro y emoción y a separar qué se observó, qué se infiere y qué añadió la divulgación.",
        ],
        note: "Trabajaremos con afirmaciones de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Patrones sin botones",
        body: [
          "Lee la sección donde el capítulo compara el reconocimiento de una canción con la actividad distribuida y matiza qué muestran las técnicas multivariadas.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Que haya patrones no significa que haya botones",
        body: [
          "Que una emoción no viva en un único botón cerebral no convierte al cerebro en un caos sin regularidades. Pueden existir configuraciones distinguibles sin que exista una huella única e invariable para cada emoción.",
          "El salto que conviene no dar es este: que una región participe no demuestra que esa región produzca por sí sola la experiencia. Participar en un patrón y ser su causa completa son afirmaciones distintas.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Reconocer una canción",
        body: [
          "Una canción no está guardada en una sola nota. Se reconoce por un patrón: notas, ritmo, pausas y relaciones entre ellas.",
          "Señalar una nota y decir «ahí está la canción» describe mal lo que ocurre, aunque esa nota realmente suene.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Una región y una emoción",
        body: [
          "Mira una afirmación frecuente sobre el cerebro emocional y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "Si una región se activa, ¿qué queda demostrado?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Los episodios emocionales involucran procesos distribuidos. Puede haber patrones reconocibles sin que exista un botón único, y una región que participa no es por eso la causa completa de lo que sientes.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C03-MG05",
    title: "Cuando el modelo no encaja, puede actualizarse",
    slug: "modelo-puede-actualizarse",
    conceptKey: "eec-modelo-puede-actualizarse",
    practiceSlug: "de-la-expectativa-al-ajuste",
    practiceKind: "sequence_ordering",
    anchors: {
      primary: {
        reference: "eec-c3-cuando-la-prediccion-no-encaja",
        heading: "Cuando la predicción no encaja",
        fingerprint: "La nueva información obliga a corregir la interpretación inicial.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuando llega un dato que no encaja",
        body: [
          "Una interpretación puede sentirse completamente real y aun así estar incompleta. Vas a ordenar los pasos que el capítulo describe entre una expectativa y un ajuste posible.",
        ],
        note: "El orden no es una prueba; puedes verlo resuelto cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Cuando la predicción no encaja",
        body: [
          "Lee la sección del golpe en la cocina, la cuchara en el suelo y la pregunta que reemplaza a «¿por qué reacciono así?».",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Actualizar es posible; no es automático",
        body: [
          "Cuando lo que llega no coincide con lo esperado, ese desajuste puede favorecer una revisión. A veces basta con actuar para conseguir más información: encender la luz es una forma de preguntar.",
          "Pero el capítulo evita prometer de más. No todo desajuste reescribe lo aprendido, algunas expectativas resisten, y el debate técnico sobre los mecanismos sigue abierto. Actualizar es una posibilidad, no una obligación de sentir distinto de inmediato.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "«¿Podemos hablar?»",
        body: [
          "Si la primera hipótesis es «hice algo mal», puede aparecer tensión. Cinco minutos después llega otro mensaje: era una buena noticia.",
          "La emoción no se borra por decreto, y sin embargo algo cambió: apareció información que la primera interpretación no tenía.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "De la expectativa al ajuste",
        body: [
          "Ordena las tarjetas que van de una expectativa previa hasta un aprendizaje posible, pasando por la información nueva y la discrepancia.",
        ],
        note: "Es una secuencia pedagógica del capítulo, no una descripción de lo que debe pasarte a ti.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué permite un desajuste entre lo esperado y lo que llega?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Información nueva puede sostener, corregir o ajustar una interpretación. Actualizar no es control total ni borra lo aprendido antes: es aprendizaje posible, y a veces empieza por buscar un dato más.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

// ── C04 · Tu cuerpo tiene la primera palabra ────────────────────────────────

const C04 = [
  {
    id: "EEC-C04-MG01",
    title: "El cuerpo aporta datos, no veredictos",
    slug: "cuerpo-datos-no-veredictos",
    conceptKey: "eec-cuerpo-datos-no-veredictos",
    practiceSlug: "misma-sensacion-otros-contextos",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c4-no-hay-diccionario-corporal",
        heading: "No existe un diccionario corporal de las emociones",
        fingerprint:
          "El problema empieza cuando convertimos esas posibilidades en traducciones rígidas",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "El cuerpo informa; no dictamina",
        body: [
          "«Corazón acelerado = miedo» es cómodo y engañoso. Vas a comparar una misma sensación en contextos distintos y a ver qué permite decir en cada uno.",
        ],
        note: "No te pediremos observar tu cuerpo ahora, ni respirar de una manera concreta. Trabajaremos con ejemplos.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "No existe un diccionario corporal de las emociones",
        body: [
          "Lee la sección donde el capítulo reconoce las asociaciones familiares y señala dónde empieza el problema.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Asociación frecuente no es traducción fija",
        body: [
          "Hay asociaciones reconocibles: el miedo puede venir con aceleración, la vergüenza con rubor, la ira con tensión. El capítulo no las niega.",
          "Lo que rechaza es convertirlas en traducciones rígidas. Una sensación informa que algo ocurre; no determina por sí sola qué emoción hay ni cuál es su causa.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Calor en la cara",
        body: [
          "El calor en la cara puede aparecer al recibir un elogio inesperado, al discutir, al entrar a un lugar muy caldeado o al notar que un error quedó a la vista.",
          "Con la misma sensación en la mano, la conclusión honesta cambia según lo que rodea a esa sensación.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "La misma sensación, otros contextos",
        body: [
          "Compara un conjunto de señales en dos situaciones y elige qué factores podrían cambiar su significado. Nada se marca como incorrecto.",
        ],
        note: "Es una comparación entre ejemplos; no interpreta tus sensaciones ni concluye nada sobre ti.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué aporta una sensación corporal por sí sola?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "El cuerpo aporta datos valiosos y no funciona como diccionario. Una sensación abre preguntas útiles; el veredicto sobre qué emoción es y por qué necesita más que la sensación.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C04-MG02",
    title: "Notar, interpretar y nombrar no son lo mismo",
    slug: "notar-interpretar-nombrar",
    conceptKey: "eec-notar-interpretar-nombrar",
    practiceSlug: "senal-atencion-interpretacion-nombre",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c4-interocepcion-notar-interpretar",
        heading: "Interocepción: notar no es lo mismo que interpretar",
        fingerprint:
          "notar una señal, detectarla con precisión y comprender qué significa son cosas diferentes",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuatro cosas que suelen ir juntas",
        body: [
          "Notar algo en el cuerpo, prestarle atención, interpretarlo y ponerle nombre ocurren casi a la vez, y no son lo mismo. Vas a separarlos en un caso leve.",
        ],
        note: "Elegiremos una situación cotidiana de baja intensidad. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Interocepción: notar no es lo mismo que interpretar",
        body: [
          "Lee la sección donde el capítulo distingue notar, detectar con precisión y comprender, y explica por qué más atención no siempre significa mejor comprensión.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Notar, medir e interpretar son pasos distintos",
        body: [
          "Un termómetro puede indicar fiebre sin diagnosticar su causa. Con el cuerpo pasa algo parecido: se puede notar con mucha intensidad una señal y aun así no saber qué significa.",
          "Por eso conviene una escucha con curiosidad, contexto y posibilidad de corregirse: en vez de «si siento esto, significa aquello», sostener «noto esto, y todavía no sé qué significa».",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "El estómago antes de una reunión",
        body: [
          "Hay una molestia en el estómago. Notarla es un paso. Decidir mirarla es otro. Pensar «esto va a salir mal» es un tercero. Llamarlo «ansiedad» es un cuarto.",
          "Cada paso añade algo que el anterior no traía, y cualquiera de ellos puede revisarse sin negar los otros.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Señal, atención, interpretación y nombre",
        body: [
          "Separa un caso leve en cuatro campos y observa qué aporta cada uno. No se trata de encontrar el nombre correcto.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Notar una sensación equivale a saber qué significa?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Notar no es medir, y medir no es interpretar. El cuerpo aporta información y esa información todavía necesita contexto. Un síntoma nuevo, intenso o persistente merece consulta, no una explicación emocional automática.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C04-MG03",
    title: "Cuerpo y cerebro no hacen fila",
    slug: "cuerpo-y-cerebro-no-hacen-fila",
    conceptKey: "eec-cuerpo-y-cerebro-no-hacen-fila",
    practiceSlug: "la-cadena-que-no-es-fila",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c4-frenazo-antes-del-nombre",
        heading: "El frenazo antes del nombre",
        fingerprint:
          "Que hayas notado primero el corazón acelerado no significa que el corazón haya pronunciado la palabra",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "«El cuerpo habló antes que tú»",
        body: [
          "La frase describe bien una experiencia y explica mal un mecanismo. Vas a mirarla de cerca: qué observa, qué supone y qué deja fuera.",
        ],
        note: "Trabajaremos con la escena del capítulo, no con un recuerdo tuyo.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "El frenazo antes del nombre",
        body: [
          "Lee la escena del frenazo y el matiz que el capítulo introduce justo después.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Notarlo primero no es que ocurriera primero",
        body: [
          "El cuerpo cambia antes de que exista una frase consciente: eso el capítulo lo sostiene. Lo que no se sigue de ahí es que el cuerpo haya pronunciado la palabra «miedo».",
          "La coordinación entre cuerpo, cerebro y entorno es recíproca. Que una señal se note primero no demuestra que exista una fila donde el cuerpo va delante y la mente detrás.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Una brújula que no lo es",
        body: [
          "Una brújula apunta siempre en una dirección conocida. Las señales del cuerpo no funcionan así: informan sobre el estado del organismo, y ese estado admite varias lecturas.",
          "Por eso el capítulo cambia la pregunta: no «¿qué me está diciendo mi cuerpo?», sino qué puede aportar esta sensación y qué no se puede concluir todavía con ella.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "La cadena que no es una fila",
        body: [
          "Toma la afirmación «primero el cuerpo, después la mente» y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué demuestra notar el cuerpo antes que el nombre?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "El cuerpo puede cambiar antes de que aparezca una palabra, y eso no establece un orden fijo cuerpo-primero. Lo que el capítulo describe es coordinación recíproca, no una fila.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C04-MG04",
    title: "Metáfora, teoría y evidencia no son lo mismo",
    slug: "metafora-teoria-evidencia",
    conceptKey: "eec-metafora-teoria-evidencia",
    practiceSlug: "que-tipo-de-afirmacion-es",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c4-neurocepcion-bajo-examen",
        heading: "Neurocepción: una idea influyente bajo examen",
        fingerprint:
          "una explicación puede ser intuitiva, popular y útil para conversar, pero cada uno de sus mecanismos necesita evidencia independiente",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Tres cosas que suenan igual",
        body: [
          "Una metáfora útil, una propuesta teórica y un hallazgo con evidencia pueden sonar parecido en una conversación. Vas a clasificar afirmaciones sobre cuerpo y emoción según qué tipo de afirmación son.",
        ],
        note: "Se trata de afirmaciones del capítulo, no de opiniones sobre personas o terapias concretas.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Neurocepción: una idea influyente bajo examen",
        body: [
          "Lee la sección donde el capítulo separa tres preguntas que suelen mezclarse al hablar de neurocepción y teoría polivagal.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Popular, útil y demostrado no son lo mismo",
        body: [
          "El capítulo separa tres preguntas: si existen procesos no conscientes que preparan la acción, si «neurocepción» es el nombre científico general de todos ellos, y si las afirmaciones específicas de esa teoría están confirmadas.",
          "Las respuestas no coinciden, y por eso conviene decir de qué tipo es cada afirmación. Una controversia no se resuelve por la seguridad con que alguien habla, sino examinando qué predice cada afirmación y cómo se mide.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "«El cuerpo guarda»",
        body: [
          "«El cuerpo guarda lo que la mente olvida» puede describir bien una experiencia y ayudar a hablar de ella.",
          "Eso no la convierte en un mecanismo establecido. La frase puede ser valiosa como imagen y seguir necesitando evidencia como afirmación causal: son dos usos distintos.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "¿Qué tipo de afirmación es esta?",
        body: [
          "Clasifica varias afirmaciones sobre cuerpo y emoción entre metáfora útil, propuesta teórica, hallazgo con respaldo o afirmación que necesita más evidencia.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "Que una idea sea influyente, ¿qué demuestra?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Una explicación puede ser intuitiva, popular y útil para conversar, y aun así cada uno de sus mecanismos necesita evidencia propia. Distinguir metáfora, teoría y evidencia no le quita valor: le pone lugar.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C04-MG05",
    title: "Observar el cuerpo también requiere elección",
    slug: "observar-requiere-eleccion",
    conceptKey: "eec-observar-requiere-eleccion",
    practiceSlug: "elegir-como-observar",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c4-conciencia-corporal-condiciones",
        heading:
          "La conciencia corporal puede ayudar; también necesita condiciones",
        fingerprint:
          "«útil» no significa «beneficioso para todas las personas en cualquier momento»",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Atender al cuerpo es una opción, no un deber",
        body: [
          "Mirar hacia adentro ayuda a algunas personas en algunos momentos, y no a todas siempre. Vas a elegir entre varias formas seguras de atención para una escena hipotética.",
        ],
        note: "No tendrás que cerrar los ojos ni cambiar la respiración. Puedes detenerte en cualquier momento.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title:
          "La conciencia corporal puede ayudar; también necesita condiciones",
        body: [
          "Lee la sección donde el capítulo revisa mindfulness y body scan, menciona experiencias adversas documentadas y fija las tres reglas de su actividad.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Útil para algunas personas, no universalmente regulador",
        body: [
          "El capítulo reconoce que estas prácticas pueden ser experiencias útiles, y evita el salto siguiente: «útil» no significa beneficioso para cualquier persona en cualquier momento. La literatura sobre meditación también documenta efectos no deseados.",
          "De ahí sus tres reglas: no trabajar deliberadamente con algo traumático o muy intenso, no obligar a cerrar los ojos ni a cambiar la respiración, y poder detenerse en cualquier momento.",
        ],
        note: "Esta microguía no propone una técnica de regulación ni sustituye una consulta cuando hace falta.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos personas, la misma indicación",
        body: [
          "«Cierra los ojos y siente tu pecho» puede resultar tranquilizador para alguien y aumentar la alarma en quien ya vigila su ritmo cardíaco con preocupación.",
          "La indicación no cambió; cambió a quién se le da y en qué momento. Por eso conviene que existan alternativas y que detenerse sea una opción legítima.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Elegir cómo observar",
        body: [
          "Ante una escena hipotética, elige entre atención al entorno, una observación corporal breve o una pausa. Ninguna opción es obligatoria ni mejor que las otras.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué se puede concluir de que una práctica ayude a alguien?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Observar el cuerpo puede ayudar y también necesita condiciones. La meta no es sentir más, sino distinguir mejor y conservar la posibilidad de elegir —incluida la de parar.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

// ── C05 · Las historias que te cuentas ─────────────────────────────────────

const C05 = [
  {
    id: "EEC-C05-MG01",
    title: "Una emoción no es una historia",
    slug: "emocion-no-es-historia",
    conceptKey: "eec-emocion-no-es-historia",
    practiceSlug: "cambia-la-historia-cambia-la-emocion",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c5-historia-coherente",
        heading: "¿Una historia más coherente siempre hace bien?",
        fingerprint: "construye una historia coherente y estarás bien",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Una frase que promete demasiado",
        body: [
          "«Cambia la historia y cambiarás la emoción» circula mucho. Vas a mirarla de cerca: en qué acierta, qué simplifica y qué deja fuera.",
        ],
        note: "Trabajaremos con la afirmación, no con tu historia personal. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "¿Una historia más coherente siempre hace bien?",
        body: [
          "Lee la sección donde el capítulo revisa la investigación sobre identidad narrativa, sus hallazgos y sus matices.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "El relato participa; no es toda la explicación",
        body: [
          "La manera de narrarnos puede relacionarse con cómo vivimos: algunos estudios asocian temas como agencia y comunión con el bienestar. Pero otros resultados obligan a matizar, y varias relaciones se atenúan al controlar el tono emocional del relato.",
          "Por eso el capítulo no concluye «construye una historia coherente y estarás bien». Cuerpo, contexto, aprendizaje y procesos no conscientes también participan en lo que sientes.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos relatos, una noche sin dormir",
        body: [
          "Alguien puede contarse una versión más amable de un conflicto y aun así dormir mal, porque el cuerpo sigue activado y el asunto sigue sin resolverse.",
          "El relato no es irrelevante; simplemente no es el único ingrediente de la experiencia.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "«Cambia la historia y cambia la emoción»",
        body: [
          "Separa esa afirmación en lo que observa, lo que supone y lo que faltaría para sostenerla tal como suena.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué relación describe el capítulo entre relato y emoción?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Una emoción no es una historia. El relato puede organizar, sostener o abrir lo que sentimos, y sigue conviviendo con el cuerpo, el contexto y lo aprendido. Reconocerlo evita prometer un cambio que no depende solo de narrar distinto.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C05-MG02",
    title: "El silencio no viene con subtítulos",
    slug: "silencio-sin-subtitulos",
    conceptKey: "eec-silencio-sin-subtitulos",
    practiceSlug: "escena-subtitulo-historia",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c5-que-subtitulos-anado",
        heading: "**«¿Qué historia debo inventar para dejar de sentir esto?»**",
        fingerprint: "¿Qué subtítulos estoy añadiendo a esta escena",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Lo que sé y lo que estoy añadiendo",
        body: [
          "Un mensaje leído sin respuesta no trae su explicación incorporada. Vas a separar la escena, el subtítulo que le ponemos y la historia más amplia que aparece detrás.",
        ],
        note: "La escena es de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "La pregunta más honesta",
        body: [
          "Lee el punto donde el capítulo cambia «¿qué historia debo inventar?» por una pregunta sobre los subtítulos que añadimos, y muestra la distinción mínima entre escena, subtítulo e historia amplia.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "La escena, el subtítulo y la historia amplia",
        body: [
          "«Mi jefa pidió hablar mañana» es una escena. «Va a despedirme» es un subtítulo. «Cuando confían en mí, termino fallando» es una historia más amplia.",
          "Las tres pueden sentirse como una sola cosa. Separarlas no niega la preocupación: permite ver en qué momento un dato empezó a convertirse en una conclusión.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos marcas azules",
        body: [
          "El mensaje aparece leído y sin respuesta. Eso es lo observable.",
          "«Está molesto», «se cansó de mí», «está ocupado» son subtítulos posibles. Ninguno viene incluido en las dos marcas azules.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Escena, subtítulo e historia",
        body: [
          "Ordena las lecturas posibles de un hecho ambiguo según lo que la información disponible permite sostener, y marca qué falta por saber.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué trae consigo un hecho ambiguo?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "El silencio no viene con subtítulos. Distinguir lo que ocurrió de lo que estamos añadiendo no obliga a dejar de preocuparse: solo muestra dónde termina el dato y dónde empieza la conclusión.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C05-MG03",
    title: "Una historia dominante no es toda tu identidad",
    slug: "historia-dominante-no-es-identidad",
    conceptKey: "eec-historia-dominante-no-es-identidad",
    practiceSlug: "acontecimiento-descripcion-conclusion-excepcion",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c5-historias-dominantes",
        heading: "Historias dominantes y acontecimientos que no encajan",
        fingerprint:
          "Re-autoría no significa inventar capítulos nuevos ni cambiar el pasado",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuando una descripción ocupa demasiado espacio",
        body: [
          "Algunas descripciones repetidas terminan pareciendo toda la biografía. Vas a separar un acontecimiento, la descripción que se repite, la conclusión sobre uno mismo y el detalle que no encaja.",
        ],
        note: "Usaremos un ejemplo del capítulo. No te pediremos revisar un episodio doloroso propio.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Historias dominantes y acontecimientos que no encajan",
        body: [
          "Lee la sección sobre historia dominante, resultados únicos y re-autoría, con la imagen del buscador que devuelve siempre los mismos resultados.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Un relato que ordena no es toda la persona",
        body: [
          "Cuando alguien está convencido de «nunca he sabido defenderme», los episodios compatibles aparecen primero y los demás quedan abajo. El capítulo lo compara con un buscador que devuelve siempre los mismos resultados.",
          "Encontrar un episodio que no encaja no demuestra lo contrario ni borra la dificultad. Es una página que el índice había dejado fuera. Re-autoría, en este enfoque, no es inventar capítulos ni cambiar el pasado: es revisar el índice de un libro ya escrito.",
        ],
        note: "Esto describe recursos de un modelo terapéutico; no es una indicación de tratamiento ni una técnica para aplicarte a solas.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "La vez que sí intervino",
        body: [
          "Quien afirma «nunca sé defenderme» quizá recuerde que habló cuando trataron injustamente a una compañera.",
          "Ese episodio no prueba que «en realidad siempre fue valiente». Convive con los años de dificultad, y por eso amplía el cuadro en vez de reemplazarlo.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Acontecimiento, descripción, conclusión y excepción",
        body: [
          "Separa un caso en cuatro campos y observa qué aporta cada uno. No se trata de sustituir una conclusión por otra más optimista.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué es la re-autoría en este enfoque?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Una historia dominante puede estrechar lo que vemos de nosotros sin ser una mentira. Tratarla como relato permite abrir otras descripciones sin negar hechos ni fabricar un final feliz.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C05-MG04",
    title: "Recordar reconstruye; no inventa libremente",
    slug: "recordar-reconstruye",
    conceptKey: "eec-recordar-reconstruye",
    practiceSlug: "dato-interpretacion-informacion-nueva",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c5-memoria-no-es-grabacion",
        heading: "5. La memoria no es una grabación ni una página en blanco",
        fingerprint: "La memoria autobiográfica selecciona, reconstruye e integra",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Dos hermanas, una cena",
        body: [
          "Que la memoria se reconstruya no significa que podamos reescribir los hechos a voluntad. Vas a comparar qué permanece como dato, qué es interpretación actual y qué podría cambiar el significado.",
        ],
        note: "Usaremos el ejemplo del capítulo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "La memoria no es una grabación ni una página en blanco",
        body: [
          "Lee la sección de las dos hermanas que recuerdan la misma cena y el cuidado que el capítulo pide después.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Reconstruir no es fabricar",
        body: [
          "La memoria autobiográfica selecciona, reconstruye e integra; las conversaciones posteriores también vuelven algunos detalles más accesibles que otros. Dos personas pueden recordar la misma noche de maneras distintas sin que una mienta.",
          "Su maleabilidad exige cuidado en la dirección contraria: si hoy no recuerdas con certeza lo que alguien dijo, una narración convincente no convierte esa frase en un hecho histórico.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "La risa y el comentario",
        body: [
          "Una hermana recuerda una noche divertida; la otra recuerda un comentario sobre su peso y la vergüenza que sintió.",
          "Es posible que ambas cosas hayan ocurrido. Preguntar cuál es «el recuerdo verdadero» puede estar mal planteado desde el principio.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Dato, interpretación e información nueva",
        body: [
          "Compara qué se sostiene como dato, qué es lectura actual y qué información nueva podría cambiar el significado sin cambiar lo ocurrido.",
        ],
        note: "Es una comparación entre ejemplos; nada se marca como incorrecto.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "Si la memoria es reconstructiva, ¿qué se sigue de ahí?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Recordar reconstruye, y eso no autoriza a reescribir los hechos. Conviene sostener una categoría que a veces se olvida: «no lo sé con certeza».",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C05-MG05",
    title: "Reescribir puede abrir opciones, no garantizar otra emoción",
    slug: "reescribir-abre-opciones",
    conceptKey: "eec-reescribir-abre-opciones",
    practiceSlug: "dos-formulaciones-que-abren",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c5-revisar-sin-borrar",
        heading: "7. Puedes revisar el relato sin borrar la página",
        fingerprint:
          "El objetivo no era convencerla de que «seguro todo está bien»",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Abrir opciones, sin prometer calma",
        body: [
          "Revisar un relato puede ampliar lo que se puede hacer y preguntar. No obliga a sentirse mejor. Vas a comparar dos formulaciones sobre una misma situación.",
        ],
        note: "No se puntúa qué emoción «debería» aparecer. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Puedes revisar el relato sin borrar la página",
        body: [
          "Lee el cierre con Valeria: lo que sabe, lo que interpreta, lo que no sabe, y qué se propuso realmente el ejercicio.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Otra perspectiva no es otra emoción garantizada",
        body: [
          "Después de separar lo que sabe de lo que interpreta, Valeria no se calma necesariamente. Puede seguir mirando el teléfono y seguir ansiosa.",
          "El objetivo no era convencerla de que todo está bien ni reemplazar su historia por una más agradable, sino recuperar la diferencia entre lo ocurrido y lo que se añade. Eso amplía opciones y preguntas; no promete un cambio emocional inmediato.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos maneras de decirlo",
        body: [
          "«Me dejaron sola otra vez» y «no tengo respuesta todavía y no sé por qué» describen la misma espera.",
          "La segunda no es más positiva: es más incompleta a propósito, y por eso deja abiertas preguntas que la primera ya había cerrado.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Dos formulaciones, qué abre cada una",
        body: [
          "Compara dos maneras de contar la misma situación y elige qué acciones o preguntas hace posible cada una.",
        ],
        note: "No se evalúa cuál formulación es correcta ni qué deberías sentir.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué promete revisar un relato?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Reescribir puede abrir opciones y no garantiza otra emoción. No hace falta inventar una historia positiva para ampliar lo que puedes preguntar y hacer.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

// ── C06 · Sentir también se aprende con otros ──────────────────────────────

const C06 = [
  {
    id: "EEC-C06-MG01",
    title: "Sentir también se aprende con otros",
    slug: "sentir-se-aprende-con-otros",
    conceptKey: "eec-sentir-se-aprende-con-otros",
    practiceSlug: "dos-respuestas-relacionales",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c6-de-mi-a-nosotros",
        heading: "2. De lo que pasa en mí a lo que pasa entre nosotros",
        fingerprint:
          "añadir el nivel relacional no elimina el nivel individual",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Acercar y alejar la cámara",
        body: [
          "Mirar a una persona y mirar lo que ocurre entre dos personas son dos planos distintos. Vas a comparar una misma expresión emocional frente a dos respuestas relacionales.",
        ],
        note: "Trabajaremos con escenas de ejemplo, no con una relación tuya.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "De lo que pasa en mí a lo que pasa entre nosotros",
        body: [
          "Lee la sección de la cámara en el partido y la precisión que el capítulo añade enseguida.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Sumar el plano relacional no borra el individual",
        body: [
          "Cada persona percibe y actúa, y su conducta pasa a formar parte del mundo que la otra está percibiendo. Ese plano añade información que el plano individual no alcanza.",
          "El capítulo lo dice con cuidado: añadir el nivel relacional no elimina el nivel individual. La relación no es una fuerza por encima de las personas; es parte del contexto donde ocurren sus cuerpos, recuerdos y expectativas.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos mensajes después de una entrevista",
        body: [
          "«Sea lo que sea, estoy contigo» y un silencio no producen mecánicamente lo mismo, y tampoco determinan lo que cada persona sentirá.",
          "Quien recibe apoyo puede irritarse porque no quería consuelo. La respuesta influye; no decide.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "La misma señal, dos respuestas",
        body: [
          "Compara una expresión emocional ante dos respuestas relacionales distintas y elige qué podría cambiar en cada caso.",
        ],
        note: "Es una comparación entre ejemplos; no concluye nada sobre tus relaciones.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué aporta mirar el plano relacional?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Sentir también se aprende con otros: relaciones, modelado y respuestas repetidas participan en el aprendizaje emocional. Participar no es fabricar por completo lo que alguien siente.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C06-MG02",
    title: "Regular juntos no es controlar",
    slug: "regular-juntos-no-es-controlar",
    conceptKey: "eec-regular-juntos-no-es-controlar",
    practiceSlug: "apoyo-validacion-control-escalamiento",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c6-ayuda-o-empeora",
        heading: "4. Cuando otra persona ayuda —o empeora— lo que sientes",
        fingerprint: "regular no siempre significa reducir una emoción",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Acompañar tiene varias formas",
        body: [
          "Escuchar, distraer, ayudar a reinterpretar, acompañar en silencio: todas son respuestas sociales a una emoción, y no hacen lo mismo. Vas a clasificar respuestas a una escena cotidiana.",
        ],
        note: "Trabajaremos con la escena del capítulo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Cuando otra persona ayuda —o empeora— lo que sientes",
        body: [
          "Lee la sección de la llamada tras una mala noticia, la caja de herramientas sociales y lo que el capítulo dice sobre co-regulación y co-rumiación.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Co-regular no es conseguir que el otro sienta lo que queremos",
        body: [
          "Regular no siempre significa reducir una emoción: a veces se trata de sostenerla o de aumentar energía antes de algo importante. El proceso describe qué ocurre; no garantiza que el objetivo sea saludable.",
          "Dos personas pueden calmarse juntas y también desregularse juntas. Dar vueltas al mismo problema puede acercar y a la vez mantener la atención pegada a él. Compartir no es una técnica única.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "«¿Y viste cómo te miró?»",
        body: [
          "Dos amigos repasan una discusión durante una hora. Se sienten acompañados y quizá más cercanos.",
          "La conversación también multiplica interpretaciones y mantiene el problema encendido. Cercanía y alivio no son la misma medida.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Apoyo, validación, control o escalamiento",
        body: [
          "Clasifica varias respuestas a una escena cotidiana y marca cuándo la información disponible no alcanza para decidir.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué significa regular junto a otra persona?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Regular juntos no es controlar. Una respuesta puede ayudar, sostener o intensificar, y una pregunta sencilla sobre qué necesita la otra persona suele servir más que una frase aprendida.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C06-MG03",
    title: "Un ciclo no significa culpa compartida",
    slug: "ciclo-no-es-culpa-compartida",
    conceptKey: "eec-ciclo-no-es-culpa-compartida",
    practiceSlug: "ordenar-el-ciclo",
    practiceKind: "sequence_ordering",
    anchors: {
      primary: {
        reference: "eec-c6-una-respuesta-prepara-la-siguiente",
        heading: "5. Cuando una respuesta prepara la siguiente",
        fingerprint:
          "Un ciclo no es una criatura invisible que controla a la familia",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Un minuto en la mesa",
        body: [
          "Describir un ciclo ayuda a ver cómo cada respuesta prepara la siguiente. Vas a ordenar esa secuencia y a señalar dónde existe una opción propia.",
        ],
        note: "Usaremos la escena del capítulo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Cuando una respuesta prepara la siguiente",
        body: [
          "Lee la escena de la pregunta sobre el trabajo y la secuencia que el capítulo dibuja a partir de ella.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Describir un ciclo no reparte culpas",
        body: [
          "Un ciclo no es una criatura invisible que controla a la familia: es una secuencia que se repite porque cada respuesta vuelve más probable la siguiente.",
          "Ver la reciprocidad no borra la causalidad, los límites ni la responsabilidad por lo que cada quien hace. Describir cómo se sostiene un patrón y repartir la culpa a medias son dos cosas distintas.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Preguntar y sonar a presión",
        body: [
          "La madre pregunta por el trabajo. La hija escucha presión y responde a la defensiva. La madre escucha rechazo y dice que ya no puede preguntar nada.",
          "No sabemos quién «empezó» ni qué trae cada una. Sí podemos ver cómo cada respuesta cambió lo que la otra tenía delante.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Ordenar el ciclo",
        body: [
          "Ordena la secuencia observable de ese minuto y observa en qué punto aparece una opción distinta.",
        ],
        note: "Es una secuencia del capítulo, no una descripción de tu relación ni una asignación de responsabilidades.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué significa describir un ciclo recíproco?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Un ciclo describe cómo se sostiene un patrón, no una culpa 50/50. Reconocer la reciprocidad es compatible con sostener límites y con responder por la propia conducta.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C06-MG04",
    title: "Parecidos que no son sinónimos",
    slug: "parecidos-que-no-son-sinonimos",
    conceptKey: "eec-parecidos-que-no-son-sinonimos",
    practiceSlug: "empatia-contagio-sincronia",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c6-regulacion-interpersonal",
        heading: "Regulación interpersonal",
        fingerprint:
          "Es lo que impide que cualquier experiencia de conexión termine descrita con una sola palabra nebulosa",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Casas del mismo barrio",
        body: [
          "Empatía, contagio, sincronía y regulación interpersonal se parecen y no son lo mismo. Vas a clasificar mini-escenas según el fenómeno que mejor las describe.",
        ],
        note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Regulación interpersonal",
        body: [
          "Lee el cierre de la sección donde el capítulo distingue estas palabras vecinas y explica por qué la precisión importa.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Nombrar con precisión permite preguntar con precisión",
        body: [
          "Distinguir estas palabras no es pedantería: es lo que impide que cualquier experiencia de conexión termine descrita con una sola palabra nebulosa.",
          "Cuando se nombra con precisión se puede preguntar con precisión: si estamos observando una señal o haciendo una inferencia. Y parecerse emocionalmente no demuestra por sí solo empatía, vínculo sano o comprensión.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Reírse a la vez",
        body: [
          "Dos personas ríen al mismo tiempo en una reunión. Puede ser contagio, complicidad, alivio compartido o simple cortesía.",
          "La coincidencia es real; lo que demuestra sobre el vínculo es mucho menos de lo que parece.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Empatía, contagio, sincronía o regulación",
        body: [
          "Clasifica mini-escenas según el fenómeno mejor descrito y marca cuándo falta información para decidir.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué demuestra sentir algo parecido al mismo tiempo?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Empatía, contagio, imitación, sincronía y regulación interpersonal no son el mismo mecanismo. Sincronía o parecido emocional no demuestran amor, empatía ni salud relacional.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C06-MG05",
    title: "Influencia no es destino",
    slug: "influencia-no-es-destino",
    conceptKey: "eec-influencia-no-es-destino",
    practiceSlug: "mi-parte-la-otra-el-contexto-el-limite",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c6-influencia-no-es-destino",
        heading: "Influencia no es destino",
        fingerprint: "tampoco somos marionetas de nuestras relaciones",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Ni islas ni marionetas",
        body: [
          "Las relaciones influyen y no deciden. Vas a separar qué depende de ti, qué de la otra persona, qué del contexto y qué límite pide la situación.",
        ],
        note: "Trabajaremos con un caso cotidiano de baja intensidad, no con una situación de riesgo.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Influencia no es destino",
        body: [
          "Lee el cierre del capítulo, donde reconoce todo lo que aprendemos con otros y marca el límite de esa idea.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Influencia real, agencia real",
        body: [
          "Aprendemos palabras con otros, recibimos señales, interpretamos silencios, nos contagiamos de un ambiente. No somos islas.",
          "Y tampoco somos marionetas de nuestras relaciones. Comprender un ciclo no garantiza que alguien encuentre las palabras perfectas, y hay situaciones —coerción, violencia, asimetría grave— donde hablar de responsabilidad recíproca sería un error.",
        ],
        note: "Si una situación implica violencia o coerción, no es material para este ejercicio: la seguridad y el apoyo tienen prioridad.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "El tono que se hereda",
        body: [
          "Alguien nota que discute como discutían en su casa: subiendo la voz para que lo escuchen.",
          "Reconocer de dónde viene ese aprendizaje explica su origen y no decide lo que hará la próxima vez.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Mi parte, la del otro, el contexto y el límite",
        body: [
          "Separa una situación cotidiana en cuatro campos, incluido el límite o la condición de seguridad que la situación requiere.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Dónde deja de aplicarse la idea de circularidad?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Pertenencia y grupo influyen, y la agencia sigue existiendo. Donde hay coerción o asimetría grave, describir un ciclo recíproco deja de ser una descripción justa.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

// ── C07 · Cuando las emociones necesitan traducción ────────────────────────

const C07 = [
  {
    id: "EEC-C07-MG01",
    title: "Traducir empieza por suspender equivalencias",
    slug: "suspender-equivalencias",
    conceptKey: "eec-suspender-equivalencias",
    practiceSlug: "separar-capas-de-una-escena",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c7-separar-capas",
        heading: "Antes de traducir, separar capas",
        fingerprint:
          "Una persona puede sentir tristeza y mostrar irritación",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Varias pistas de sonido a la vez",
        body: [
          "En una conversación emocional se mezclan cosas distintas: lo que alguien experimenta, cómo lo valora, qué expresa, qué intenta regular y qué interpreta el otro. Vas a separarlas.",
        ],
        note: "Trabajaremos con escenas de ejemplo, no con tu experiencia migratoria o familiar.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Antes de traducir, separar capas",
        body: [
          "Lee la sección donde el capítulo distingue experimentar, valorar, expresar, regular e interpretar, con la imagen de las pistas de sonido.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Una señal no equivale a una emoción segura",
        body: [
          "Una persona puede sentir tristeza y mostrar irritación, o experimentar miedo y sonreír por nervios. Lo que se ve es una capa; lo que ocurre son varias.",
          "Traducir empieza por suspender la equivalencia automática entre la señal observada y la emoción, la causa o la intención. Suspenderla no es renunciar a entender: es no dar por cerrado lo que todavía es hipótesis.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Un silencio en la mesa",
        body: [
          "Alguien deja de hablar en una comida. Puede estar molesto, cansado, concentrado en escuchar o siguiendo una regla aprendida sobre cuándo conviene callar.",
          "La señal es una; los repertorios desde los que se lee pueden ser varios.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Separar las capas de una escena",
        body: [
          "Compara una misma señal leída desde dos repertorios y marca qué interpretación es posible, cuál requiere comprobación y qué no se puede concluir.",
        ],
        note: "Es una comparación entre ejemplos; no infiere nada sobre culturas ni sobre personas concretas.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué significa suspender una equivalencia?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Una palabra, un gesto o una forma de cuidado no tienen por qué corresponder exactamente al repertorio de la otra persona. Una diferencia de repertorio no es ausencia de emoción ni mala intención.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C07-MG02",
    title: "La expectativa cambia cómo lees la señal",
    slug: "expectativa-cambia-la-lectura",
    conceptKey: "eec-expectativa-cambia-la-lectura",
    practiceSlug: "senal-expectativa-interpretacion-dato",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c7-ayuda-que-no-parece-ayuda",
        heading: "La ayuda que no parece ayuda",
        fingerprint:
          "dos personas pueden querer cuidar y no coincidir por completo en qué aspecto debería tener el cuidado",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuidar de maneras distintas",
        body: [
          "Lo que esperamos que haga alguien cercano cambia cómo leemos su conducta. Vas a separar la señal, la expectativa propia, la interpretación y el dato que permitiría contrastarla.",
        ],
        note: "Trabajaremos con el ejemplo del capítulo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "La ayuda que no parece ayuda",
        body: [
          "Lee la sección con el estudio sobre respuestas compasivas en dos muestras y la conclusión que el capítulo extrae de él.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "La expectativa participa en la lectura",
        body: [
          "El estudio no descubrió «la compasión ecuatoriana» ni describió a todos los habitantes de dos países: trabajó con muestras concretas y encontró diferencias promedio.",
          "Lo que sí ilustra es que dos personas pueden querer cuidar y no coincidir por completo en qué aspecto debería tener el cuidado. Cuando la ayuda no se parece a la esperada, es fácil leerla como desinterés.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Animar o acompañar",
        body: [
          "Ante una pérdida, alguien busca una posibilidad esperanzadora y sonríe con suavidad. Otra persona se queda seria y en silencio.",
          "Ambas pueden estar cuidando. La expectativa de quien recibe decide cuál de las dos «parece» ayuda.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Señal, expectativa, interpretación y dato",
        body: [
          "Separa una escena en cuatro campos, incluido el dato que permitiría comprobar la interpretación en vez de sostenerla.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué papel juega la expectativa al leer una señal?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Lo que esperamos de una persona cercana influye en cómo interpretamos su conducta. Reconocer esa influencia no explica toda la escena: sigue haciendo falta el dato que confirme o corrija.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C07-MG03",
    title: "Una diferencia cultural no es una excusa automática",
    slug: "diferencia-no-es-excusa",
    conceptKey: "eec-diferencia-no-es-excusa",
    practiceSlug: "diferencia-falta-contexto-o-limite",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c7-contexto-no-justifica-dano",
        heading: "**comprender el contexto no significa justificar el daño.**",
        fingerprint:
          "¿Tengo razones para pensar que la cultura es relevante aquí",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Explicar no es justificar",
        body: [
          "El contexto puede explicar parte de una conducta sin volverla incuestionable. Vas a ordenar interpretaciones de una escena entre diferencia plausible, falta de contexto y límite en juego.",
        ],
        note: "Trabajaremos con escenas de ejemplo de baja intensidad.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Comprender el contexto no significa justificar el daño",
        body: [
          "Lee el punto donde el capítulo marca el límite y formula la pregunta incómoda que acompaña a la curiosidad intercultural.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "La cultura explica; no absuelve",
        body: [
          "Violencia, control, coerción, humillación o discriminación no se vuelven aceptables porque alguien diga «así es mi cultura».",
          "Y no todo desacuerdo entre personas de orígenes distintos es cultural: puede ser personalidad, cansancio, desigualdad de poder o una relación concreta. De ahí la pregunta que el capítulo propone: ¿tengo razones para pensar que la cultura es relevante aquí, o la estoy usando porque es la diferencia más visible?",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "La diferencia más visible",
        body: [
          "Dos compañeros discuten por un reparto de tareas. Vienen de ciudades distintas, y esa diferencia salta a la vista.",
          "Puede ser relevante. También pueden serlo la carga de trabajo, el turno o quién decide. Elegir la explicación más visible no la vuelve la correcta.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "¿Diferencia, falta de contexto o límite?",
        body: [
          "Ordena las lecturas posibles de una escena y marca cuándo lo que está en juego es un límite y no una diferencia de repertorio.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué permite y qué no permite el contexto cultural?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Comprender el contexto no significa justificar el daño. Y antes de explicar algo por la cultura conviene preguntarse si hay razones para creer que es relevante, o si solo es lo más visible.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C07-MG04",
    title: "Dentro de una cultura también hay muchos repertorios",
    slug: "muchos-repertorios-dentro",
    conceptKey: "eec-muchos-repertorios-dentro",
    practiceSlug: "un-pais-no-es-una-variable",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c7-pais-no-es-variable-magica",
        heading: "Un país no es una variable mágica",
        fingerprint: "La cultura importa. Pero no explica todo por decreto.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Dentro de un país caben muchos repertorios",
        body: [
          "«En el país A pasa más que en el país B» todavía deja preguntas abiertas. Vas a mirar una generalización de ese tipo y separar lo que observa de lo que supone.",
        ],
        note: "No se trata de opinar sobre países ni regiones, sino de mirar qué sostiene una afirmación comparativa.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Un país no es una variable mágica",
        body: [
          "Lee la sección donde el capítulo compara medir con reglas distintas y enumera las preguntas que conviene hacerle a una comparación entre países.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Un promedio no describe a cada persona",
        body: [
          "Las muestras pueden diferir en edad, educación, clase social o experiencia migratoria, y los instrumentos no siempre miden lo mismo al traducirse. Por eso una diferencia entre países no demuestra por sí sola una causa cultural.",
          "Región, familia, generación y migración producen variación dentro de un mismo país. La cultura importa, y no explica todo por decreto.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos mesas, dos reglas",
        body: [
          "Comparar dos mesas midiendo una en centímetros y otra en pulgadas produce números que no se pueden interpretar juntos sin aclarar la escala.",
          "Con los estudios interculturales ocurre algo parecido: antes de leer la diferencia conviene saber quién participó y qué se midió.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Un país no es una variable",
        body: [
          "Toma una generalización sobre una región o un país y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué demuestra una diferencia promedio entre dos países?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Dentro de una cultura hay muchos repertorios, y una diferencia interna puede ser tan relevante como una comparación entre países. Un promedio no define a la persona que tienes delante.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C07-MG05",
    title: "Preguntar es parte de traducir",
    slug: "preguntar-es-traducir",
    conceptKey: "eec-preguntar-es-traducir",
    practiceSlug: "de-conclusion-a-pregunta",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c7-preguntar-antes-de-interpretar",
        heading: "Preguntar antes de interpretar",
        fingerprint:
          "Significa reconocer que nuestro mapa puede estar incompleto",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "De la conclusión a la pregunta",
        body: [
          "No hace falta memorizar un manual de costumbres. Vas a convertir tres conclusiones rápidas en preguntas de verificación que no renuncian a los límites.",
        ],
        note: "Trabajaremos con frases de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Preguntar antes de interpretar",
        body: [
          "Lee la sección sobre humildad cultural y por qué los manuales de costumbres por país no resuelven el malentendido.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Humildad no es fingir que no sabemos nada",
        body: [
          "Humildad cultural significa reconocer que nuestro mapa puede estar incompleto y prestar atención a la persona concreta, no al estereotipo de su origen.",
          "Preguntar forma parte de traducir. Mantener la hipótesis abierta no obliga a aceptar cualquier cosa: se puede preguntar y sostener un límite a la vez.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "«Si te importara, hablarías ahora»",
        body: [
          "La frase cierra la escena antes de conocerla. Convertida en pregunta —«¿prefieres hablarlo ahora o más tarde?»— deja lugar a una respuesta.",
          "La preocupación sigue ahí; lo que cambia es que ahora puede recibir información.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "De conclusión a pregunta",
        body: [
          "Ordena varias formulaciones según cuánto dejan abierta la comprobación, y elige las que permiten seguir conversando sin renunciar a un límite.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué implica la humildad cultural?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Preguntar es parte de traducir: observar la señal, reconocer desde qué repertorio la leemos, preguntar y aceptar que alguna diferencia puede permanecer.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

// ── C08 · Escuchar no es obedecer ──────────────────────────────────────────

const C08 = [
  {
    id: "EEC-C08-MG01",
    title: "Sentirlo no lo vuelve verdad",
    slug: "sentirlo-no-lo-vuelve-verdad",
    conceptKey: "eec-sentirlo-no-lo-vuelve-verdad",
    practiceSlug: "emocion-interpretacion-hechos-falta",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c8-sentir-tambien-es-valorar",
        heading: "Cuando sentir también es valorar",
        fingerprint: "La emoción habla de una relación de importancia.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "«Siento culpa» y «soy culpable»",
        body: [
          "Una experiencia puede ser real y su primera explicación estar equivocada. Vas a separar emoción, interpretación, hechos disponibles e información que falta.",
        ],
        note: "Usaremos una escena de ejemplo de baja intensidad. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Cuando sentir también es valorar",
        body: [
          "Lee la sección donde el capítulo presenta la propuesta de que las emociones involucran evaluaciones sobre lo que consideramos importante, con el ejemplo de las dos llamadas.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "La emoción señala importancia, no veracidad",
        body: [
          "La misma noticia produce reacciones distintas según con quién nos vincule: la emoción habla de una relación de importancia.",
          "De ahí no se sigue que la evaluación que la acompaña sea necesariamente correcta. Sentir culpa después de poner un límite dice que algo importa; no establece que se haya hecho daño.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Decir que no y sentir culpa",
        body: [
          "Alguien rechaza un encargo extra y siente culpa el resto del día.",
          "La culpa muestra que la relación importa. No demuestra por sí sola que la negativa fuera injusta.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Emoción, interpretación, hechos y lo que falta",
        body: [
          "Separa una escena de culpa en cuatro campos y observa cuánta de la conclusión venía de la emoción y cuánta de los hechos disponibles.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué establece sentir una emoción intensa?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "«Siento culpa» y «soy culpable» son dos afirmaciones distintas. La experiencia es real; su primera explicación puede estar incompleta o desactualizada.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C08-MG02",
    title: "Una emoción puede mostrar lo que importa, no qué hacer",
    slug: "muestra-lo-que-importa-no-que-hacer",
    conceptKey: "eec-muestra-lo-que-importa-no-que-hacer",
    practiceSlug: "que-importa-y-que-esta-justificado",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c8-etica-cuando-aparece-el-otro",
        heading: "La ética empieza cuando aparece el otro",
        fingerprint:
          "no otorgan automáticamente derecho a revisar el teléfono de otra persona",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Lo que importa y lo que está justificado",
        body: [
          "Una emoción puede poner algo en primer plano sin decidir qué hacer con ello. Vas a comparar esas dos preguntas en situaciones cotidianas.",
        ],
        note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "La ética empieza cuando aparece el otro",
        body: [
          "Lee la sección donde el capítulo muestra que una ética centrada solo en la autenticidad individual sería insuficiente.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Poner algo en primer plano no es autorizar una acción",
        body: [
          "Los celos pueden señalar que una relación importa. Aun siendo intensos, no otorgan automáticamente derecho a revisar el teléfono de otra persona, aislarla o controlarla.",
          "La distancia entre «esto parece importarme» y «esta acción está justificada» es donde ocurre el discernimiento. Las decisiones afectan a otras personas, y eso añade preguntas que la intensidad no responde.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Indignación ante una publicación",
        body: [
          "La indignación puede señalar un valor real que se siente vulnerado.",
          "Qué hacer con ella —responder, esperar, informarse, no participar— sigue siendo una pregunta abierta que la emoción no cierra.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Qué parece importar, qué está justificado",
        body: [
          "Compara en dos situaciones lo que la emoción hace visible y lo que la acción requeriría para estar justificada.",
        ],
        note: "Es una comparación entre ejemplos; no es un consejo sobre qué hacer en tu caso.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué autoriza la intensidad de una emoción?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Una emoción puede mostrar lo que importa y no dicta qué hacer. Entre lo que sentimos y lo que está justificado aparecen los derechos y las consecuencias para otras personas.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C08-MG03",
    title: "Pista, evidencia y veredicto son distintos",
    slug: "pista-evidencia-veredicto",
    conceptKey: "eec-pista-evidencia-veredicto",
    practiceSlug: "clasificar-pista-evidencia-veredicto",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c8-pista-evidencia-veredicto",
        heading: "Pista, evidencia y veredicto no son lo mismo",
        fingerprint:
          "Comprender esa historia explica por qué apareció la emoción",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Una pista merece examen",
        body: [
          "Que una reacción tenga una historia explica su aparición y no confirma su contenido. Vas a clasificar afirmaciones como pista, evidencia adicional o veredicto todavía no justificado.",
        ],
        note: "Trabajaremos con la escena del capítulo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Pista, evidencia y veredicto no son lo mismo",
        body: [
          "Lee la escena de la entrevista de trabajo y el gesto de mirar el reloj.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Explicar el origen no confirma el contenido",
        body: [
          "Quizá una experiencia anterior enseñó a asociar ese gesto con desaprobación. Comprender esa historia explica por qué apareció la emoción, y no demuestra que la interpretación sea correcta esta vez.",
          "Las emociones influyen en lo que atendemos, recordamos y elegimos: a veces ayudan y a veces sesgan. Por eso una pista pide investigación, no sentencia.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "El reloj en la entrevista",
        body: [
          "Quien entrevista mira el reloj. Aparece ansiedad y una lectura: «lo estoy haciendo mal».",
          "El gesto también cabe en una reunión que empieza tarde. La punzada es real; la conclusión sigue pendiente de comprobación.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "¿Pista, evidencia o veredicto?",
        body: [
          "Clasifica varias afirmaciones y marca qué haría falta antes de convertir una pista en una creencia firme.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "Si una reacción tiene una historia, ¿qué demuestra?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Una emoción funciona como pista evaluativa. Comprender de dónde viene explica su aparición sin certificar su contenido: entre la pista y el veredicto falta la investigación.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C08-MG04",
    title: "Validar no es dar la razón en todo",
    slug: "validar-no-es-dar-la-razon",
    conceptKey: "eec-validar-no-es-dar-la-razon",
    practiceSlug: "experiencia-interpretacion-impulso-conducta",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c8-no-certifica-la-interpretacion",
        heading: "**No certifica la interpretación que la acompaña.**",
        fingerprint: "Escucha la pista. Después investiga.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Entre dos extremos",
        body: [
          "«No le hagas caso a lo que sientes» y «tu emoción ya sabe la verdad» fallan por lados distintos. Vas a separar experiencia, interpretación, impulso y conducta.",
        ],
        note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "No certifica la interpretación que la acompaña",
        body: [
          "Lee el punto donde el capítulo compara la emoción con una pista en una escena y propone su alternativa a los dos extremos.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Validar la experiencia, examinar la interpretación",
        body: [
          "Una pista merece atención y puede cambiar por completo el rumbo de una investigación. Lo que no hace es certificar la interpretación que llega con ella.",
          "Por eso el capítulo propone algo más exigente que cualquiera de los dos extremos: escuchar la pista y después investigar. Reconocer que alguien está furioso no equivale a aceptar su acusación ni a autorizar cualquier conducta.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "«Entiendo que estés furioso»",
        body: [
          "La frase reconoce la experiencia. No dice que la acusación sea cierta ni que dar un portazo esté bien.",
          "Son tres decisiones distintas, y suelen tomarse como si fueran una sola.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Experiencia, interpretación, impulso y conducta",
        body: [
          "Separa una escena en cuatro campos y observa cuál de ellos estabas validando sin darte cuenta.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué valida reconocer una emoción ajena?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Validar la experiencia, aceptar la interpretación y justificar la conducta son decisiones distintas. Escucha la pista; después investiga.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C08-MG05",
    title: "Antes de actuar, amplía el examen",
    slug: "antes-de-actuar-amplia-el-examen",
    conceptKey: "eec-antes-de-actuar-amplia-el-examen",
    practiceSlug: "que-respuesta-puedo-justificar",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c8-que-respuesta-puedes-justificar",
        heading: "9. ¿Qué respuesta puedes justificar?",
        fingerprint:
          "No pienses únicamente en qué acción reduciría el malestar más rápido.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Más preguntas antes de actuar",
        body: [
          "Discernir no es encontrar «la emoción correcta». Vas a revisar una decisión con las preguntas que el capítulo propone.",
        ],
        note: "Trabajaremos con una decisión de ejemplo, no con una tuya.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "¿Qué respuesta puedes justificar?",
        body: [
          "Lee el paso donde el capítulo enumera qué considerar antes de elegir una respuesta.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "La respuesta más rápida no es la más justificada",
        body: [
          "El capítulo pide no pensar únicamente en qué acción reduciría el malestar más rápido, y considerar la evidencia disponible, los valores elegidos, los derechos propios y ajenos, las consecuencias previsibles, las perspectivas que faltan y la propia responsabilidad.",
          "Escuchar una emoción, entonces, abre preguntas antes de cerrar una decisión.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Responder ahora o mañana",
        body: [
          "Contestar de inmediato un mensaje que molestó puede bajar la tensión enseguida.",
          "Es un criterio, y no el único: también cuentan qué evidencia hay, a quién afecta y qué se podrá sostener después.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "¿Qué respuesta puedo justificar?",
        body: [
          "Toma una conclusión rápida sobre qué hacer y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué añade el discernimiento antes de actuar?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Antes de actuar conviene ampliar el examen: evidencia, valores elegidos, derechos, consecuencias, perspectivas que faltan y responsabilidad. Escuchar una emoción pide más preguntas, no menos.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

// ── C09 · Repensar lo que sientes ──────────────────────────────────────────

const C09 = [
  {
    id: "EEC-C09-MG01",
    title: "Construido no significa elegido",
    slug: "construido-no-significa-elegido",
    conceptKey: "eec-construido-no-significa-elegido",
    practiceSlug: "influencia-o-voluntarismo",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c9-construccion-no-es-fabricacion",
        heading: "**Construcción no es sinónimo de fabricación consciente.**",
        fingerprint:
          "Algunas nunca fueron reglas universales, aunque tu cerebro aprendiera a tratarlas como si lo fueran.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Si se construye, ¿puedo elegirla?",
        body: [
          "«Si las emociones se construyen, puedo construir la que quiera» suena esperanzador. Vas a mirar esa afirmación y separar la influencia posible del voluntarismo.",
        ],
        note: "Trabajaremos con afirmaciones de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Construcción no es sinónimo de fabricación consciente",
        body: [
          "Lee el punto donde el capítulo enumera lo que el sistema aprendió sin que lo recordemos con claridad, y lo que ocurre con esas lecciones.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Aprendido no es lo mismo que elegido",
        body: [
          "Buena parte de lo aprendido se adquirió en experiencias que quizá ya no se recuerdan: qué tono anuncia conflicto, qué pasa cuando dices que no, qué emociones se consideran aceptables.",
          "Algunas de esas lecciones siguen sirviendo, otras pertenecen a situaciones terminadas, y algunas nunca fueron reglas universales aunque se aprendieran como si lo fueran. Que algo se construya no significa que puedas fabricarlo o apagarlo a voluntad.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Una lengua y un hábito",
        body: [
          "Una lengua es una construcción cultural y nadie eligió conscientemente cada regla que usa al hablar.",
          "Un hábito fue aprendido y puede ejecutarse antes de recordar que se había decidido cambiarlo. Construido y elegido no son la misma palabra.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "¿Influencia posible o voluntarismo?",
        body: [
          "Toma una afirmación sobre control emocional y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "Si una emoción se construye, ¿qué se sigue de ahí?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Construido no significa elegido. Se puede influir y seguir aprendiendo sin que eso equivalga a decidir directamente lo que se siente.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C09-MG02",
    title: "Una técnica útil no es una técnica universal",
    slug: "tecnica-util-no-es-universal",
    conceptKey: "eec-tecnica-util-no-es-universal",
    practiceSlug: "objetivo-y-herramienta",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c9-tomar-lo-mejor",
        heading: "9. Tomar lo mejor sin convertir una herramienta en religión",
        fingerprint:
          "Las escuelas terapéuticas no son enemigas que compiten por explicar toda la vida emocional.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cada herramienta responde a un problema",
        body: [
          "Respirar, aceptar, reevaluar, distraerse o expresarse no hacen el mismo trabajo. Vas a emparejar situaciones con la herramienta que podría responder a ese objetivo.",
        ],
        note: "No es una recomendación clínica ni una indicación para tu caso.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Tomar lo mejor sin convertir una herramienta en religión",
        body: [
          "Lee la sección donde el capítulo recorre varios enfoques y señala el límite de cada uno.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Sacar una herramienta de contexto puede volverla inútil",
        body: [
          "Las escuelas terapéuticas no son enemigas que compiten por explicar toda la vida emocional: con frecuencia iluminan partes diferentes del mapa.",
          "Cada enfoque hace preguntas distintas y ofrece herramientas para problemas distintos. Se puede tomar lo mejor de una sin exigirle que resuelva aquello para lo que no fue diseñada.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Respirar antes de una conversación difícil",
        body: [
          "Respirar más lento puede abrir un poco de margen antes de responder.",
          "No decide qué decir ni reparte una responsabilidad familiar. Sirve para lo que sirve, y ese límite no la vuelve mala.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Objetivo y herramienta",
        body: [
          "Empareja situaciones con la herramienta que podría responder a ese objetivo y marca cuándo falta información para decidir.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué significa que una técnica «funcione»?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Una técnica útil no es una técnica universal. «Funciona en promedio» no significa «es la respuesta correcta para todo», y la regulación flexible no es la terapia que gana.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C09-MG03",
    title: "Define qué quieres cambiar antes de regular",
    slug: "define-que-quieres-cambiar",
    conceptKey: "eec-define-que-quieres-cambiar",
    practiceSlug: "objetivo-influencia-estrategia-senal",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c9-sentirse-mejor-responder-mejor",
        heading: "1. No siempre necesitas sentirte mejor para responder mejor",
        fingerprint:
          "las personas regulamos nuestras emociones con objetivos distintos",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Antes de elegir una estrategia",
        body: [
          "Una estrategia se evalúa contra un objetivo. Vas a separar el objetivo, lo que puedes influir, la estrategia candidata y cómo sabrías si ayudó.",
        ],
        note: "Trabajaremos con una situación de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "No siempre necesitas sentirte mejor para responder mejor",
        body: [
          "Lee la sección donde el capítulo separa «¿cómo quiero sentirme?» de «¿qué necesito lograr?».",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Sentirse mejor no es el único criterio",
        body: [
          "Solemos imaginar una sola meta: bajar una emoción desagradable. Pero regulamos con objetivos distintos: tolerar algo durante una conversación, prepararnos, no convertir un impulso en conducta, comprender, descansar o pedir ayuda.",
          "A veces la situación que provoca la emoción es lo que necesita cambiar. Se puede seguir sintiendo culpa y aun así conseguir una conversación más honesta.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Nervios y presentación",
        body: [
          "Alguien puede seguir nervioso y hacer la presentación igual.",
          "Si el objetivo era presentar, la estrategia funcionó aunque el nerviosismo no bajara. Medirlo solo por «¿me siento menos mal?» habría dicho lo contrario.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Objetivo, influencia, estrategia y señal",
        body: [
          "Separa una situación en cuatro campos, incluido cómo sabrías si la estrategia ayudó.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Contra qué se evalúa una estrategia de regulación?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Definir qué quieres lograr cambia qué estrategia tiene sentido. «Sentirme mejor ya» es un criterio posible, y no el único.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C09-MG04",
    title: "Cuatro puertas para intervenir",
    slug: "cuatro-puertas",
    conceptKey: "eec-cuatro-puertas",
    practiceSlug: "por-que-puerta-entra",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c9-puerta-cambiar-algo-afuera",
        heading: "Puerta 1: cambiar algo afuera",
        fingerprint:
          "La regulación se vuelve injusta cuando enseña a las personas a adaptarse indefinidamente a condiciones que deberían cambiar.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuatro maneras de entrar",
        body: [
          "El capítulo propone cuatro puertas: la situación, el espacio que ocupa ahora, la interpretación y la conducta. Vas a clasificar respuestas según la puerta que usan.",
        ],
        note: "Son una traducción pedagógica, no las únicas categorías científicas posibles.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Puerta 1: cambiar algo afuera",
        body: [
          "Lee la primera puerta, con la imagen del humo que entra por una ventana abierta.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Ninguna puerta garantiza cambiar la emoción",
        body: [
          "A veces la ruta más directa no pasa por el mundo interior: pasa por preguntar, organizar, poner un límite o pedir apoyo. Si el humo entra por una ventana abierta, se puede practicar respiración veinte minutos o cerrar la ventana.",
          "El capítulo añade un límite ético que conviene no perder: la regulación se vuelve injusta cuando enseña a adaptarse indefinidamente a condiciones que deberían cambiar.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Diez minutos antes de responder",
        body: [
          "Pedir diez minutos antes de contestar no resuelve el asunto ni cambia la situación.",
          "Recupera margen para no responder en automático. Es otra puerta, con otro alcance.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "¿Por qué puerta entra esta respuesta?",
        body: [
          "Clasifica varias respuestas según la puerta que usan y compara qué alcanza y qué no alcanza cada una.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué promete elegir una puerta de intervención?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Hay puertas en la situación, en la activación, en la interpretación y en la conducta. Elegir una no garantiza que la emoción cambie, y a veces lo que hay que cambiar está afuera.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C09-MG05",
    title: "Repensar también ocurre después",
    slug: "repensar-ocurre-despues",
    conceptKey: "eec-repensar-ocurre-despues",
    practiceSlug: "objetivo-respuesta-consecuencia-ajuste",
    practiceKind: "sequence_ordering",
    anchors: {
      primary: {
        reference: "eec-c9-aprender-para-la-proxima-vez",
        heading: "15. Repensar también es aprender para la próxima vez",
        fingerprint: "La regulación no termina cuando baja la intensidad.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Después también se aprende",
        body: [
          "Cada episodio deja información. Vas a ordenar la secuencia que va del objetivo elegido al ajuste futuro.",
        ],
        note: "Es una secuencia del capítulo; puedes verla resuelta cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Repensar también es aprender para la próxima vez",
        body: [
          "Lee la sección donde el capítulo recorre expectativas que no se cumplieron exactamente como se temía.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Observar lo que ocurrió permite recalcular",
        body: [
          "La regulación no termina cuando baja la intensidad. Esperabas que poner un límite destruyera el vínculo y no ocurrió exactamente así; esperabas que la ansiedad creciera sin fin y subió, se sostuvo y disminuyó.",
          "Esas experiencias no garantizan que la próxima emoción sea distinta, y pueden alimentar predicciones nuevas. Aprender una respuesta no borra necesariamente la anterior.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Pedir ayuda y que no sea humillante",
        body: [
          "Alguien esperaba que pedir ayuda fuera humillante, y la otra persona respondió con respeto.",
          "Un episodio no reescribe la expectativa. Sí añade un dato que antes no estaba disponible.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Objetivo, respuesta, consecuencia y ajuste",
        body: [
          "Ordena la secuencia que va del objetivo elegido hasta el ajuste posible para una próxima vez.",
        ],
        note: "Es una secuencia pedagógica, no una descripción de lo que debe pasarte a ti.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Cuándo termina la regulación, según el capítulo?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Repensar también ocurre después: observar consecuencias permite recalcular. Es un ciclo de prueba y aprendizaje, no un control remoto.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

// ── C10 · Lo que enseñamos cuando alguien siente ───────────────────────────

const C10 = [
  {
    id: "EEC-C10-MG01",
    title: "Hacer espacio no es confirmar toda la historia",
    slug: "hacer-espacio-no-es-confirmar",
    conceptKey: "eec-hacer-espacio-no-es-confirmar",
    practiceSlug: "de-minimizar-a-hacer-espacio",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c10-hacer-espacio",
        heading: "1. Hacer espacio a la experiencia",
        fingerprint: "Hacer espacio no significa confirmar toda la historia",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Reconocer antes de corregir",
        body: [
          "Corregir demasiado pronto puede dejar intacta la experiencia principal. Vas a transformar respuestas que minimizan o escalan en respuestas que hacen espacio.",
        ],
        note: "Trabajaremos con la escena del capítulo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Hacer espacio a la experiencia",
        body: [
          "Lee la sección donde el capítulo muestra qué pasa cuando se empieza discutiendo la interpretación.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Validar la experiencia no valida la interpretación",
        body: [
          "«Seguro no todos se ríen de ti» puede ser cierto y, dicho demasiado pronto, deja sin atender lo principal: algo ocurrió y dolió.",
          "Hacer espacio no significa confirmar toda la historia. Reconocer que algo afectó a alguien puede ocurrir antes de decidir si su interpretación es correcta.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "«Quiero entender qué pasó»",
        body: [
          "«Veo que esto te afectó mucho. Quiero entender qué pasó» no confirma que todos se rieran.",
          "Reconoce el impacto y deja abierta la conversación sobre lo ocurrido.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "De minimizar a hacer espacio",
        body: [
          "Ordena varias respuestas según cuánto reconocen la experiencia sin cerrar la interpretación, y marca cuándo falta información.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué valida hacer espacio a la experiencia?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Hacer espacio no es confirmar toda la historia. Reconocer el impacto y examinar la interpretación son dos momentos distintos, y el primero no obliga al segundo.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C10-MG02",
    title: "No te conviertas demasiado pronto en narrador de la mente ajena",
    slug: "no-narrador-de-la-mente-ajena",
    conceptKey: "eec-no-narrador-de-la-mente-ajena",
    practiceSlug: "observacion-interpretacion-pregunta-falta",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c10-narrador-oficial",
        heading: "*Mi hijo llora porque intenta manipularme.*",
        fingerprint:
          "reconoce la experiencia sin convertirte demasiado pronto en narrador oficial de la mente ajena",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Explicar por el otro",
        body: [
          "Acompañar no exige explicar qué siente la otra persona ni por qué. Vas a separar observación, interpretación de quien acompaña, pregunta que aclara e información que falta.",
        ],
        note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "No te conviertas en narrador oficial de la mente ajena",
        body: [
          "Lee el punto donde el capítulo contrasta «te dolió que no te invitaran» con «te excluyeron porque no te valoran».",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Reconocer sin cerrar la historia",
        body: [
          "Sentir algo no convierte automáticamente una interpretación en un hecho, y eso vale también para quien acompaña.",
          "La regla que el capítulo propone es sencilla: reconocer la experiencia sin convertirse demasiado pronto en narrador oficial de la mente ajena. Nombrar el impacto es una cosa; atribuir intenciones a terceros es otra.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos frases parecidas",
        body: [
          "«Te dolió que no te invitaran» describe lo que le pasó a quien está delante.",
          "«Te excluyeron porque no te valoran» añade una intención ajena que nadie ha comprobado. La primera acompaña; la segunda cierra.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Observación, interpretación, pregunta y lo que falta",
        body: [
          "Separa una escena de acompañamiento en cuatro campos y elige una formulación que no cierre la historia antes de conocerla.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué evita quien acompaña sin narrar la mente ajena?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Acompañar no exige explicar por la otra persona qué siente ni qué intención tuvo un tercero. Reconocer el impacto y dejar la historia abierta caben en la misma frase.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C10-MG03",
    title: "La emoción puede estar; la conducta sigue teniendo límites",
    slug: "emocion-si-conducta-con-limites",
    conceptKey: "eec-emocion-si-conducta-con-limites",
    practiceSlug: "experiencia-impulso-limite-alternativa",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c10-limites-sin-castigar",
        heading: "3. Poner límites a la conducta sin castigar la emoción",
        fingerprint: "Puedes estar furioso. No vamos a enviar amenazas.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "La emoción puede estar",
        body: [
          "Poner un límite a una conducta no exige negar la emoción que la acompaña. Vas a separar experiencia, impulso, límite y alternativa.",
        ],
        note: "Trabajaremos con la escena del capítulo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Poner límites a la conducta sin castigar la emoción",
        body: [
          "Lee la respuesta que el capítulo propone ante «voy a destrozarlos en el chat» y las tres cosas que separa.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Validar la experiencia no permite cualquier conducta",
        body: [
          "«Puedes estar furioso. No vamos a enviar amenazas. Veamos primero qué ocurrió y qué necesitas» sostiene tres cosas a la vez: la emoción puede estar presente, la conducta tiene un límite y sigue habiendo algo que entender.",
          "Aquí la escucha no basta por sí sola, y el límite no requiere castigar lo que la persona siente.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Rabia y portazo",
        body: [
          "La rabia puede ser completamente comprensible y el portazo seguir teniendo consecuencias.",
          "Decir las dos cosas juntas no es contradecirse: es separar lo que se siente de lo que se hace.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Experiencia, impulso, límite y alternativa",
        body: [
          "Separa una escena en cuatro campos y elige una alternativa conductual que no niegue la emoción.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué relación hay entre validar y permitir?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Sentir, querer hacer algo y hacerlo son cosas distintas. Validar una experiencia no equivale a permitir una conducta, y poner un límite no exige castigar la emoción.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C10-MG04",
    title: "Ayudar sin borrar la agencia",
    slug: "ayudar-sin-borrar-la-agencia",
    conceptKey: "eec-ayudar-sin-borrar-la-agencia",
    practiceSlug: "escuchar-opciones-o-intervenir",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c10-ajustar-ayuda-y-agencia",
        heading: "4. Ajustar ayuda y agencia",
        fingerprint: "La prisa por ayudar también puede quitar algo.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Ayudar sin decidir por el otro",
        body: [
          "Escuchar, ofrecer opciones o intervenir son niveles distintos de ayuda. Vas a comparar cuál conserva participación sin abandonar a la persona.",
        ],
        note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Ajustar ayuda y agencia",
        body: [
          "Lee la sección donde el capítulo muestra la pregunta que ofrece una elección dentro de una situación difícil.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "El nivel de ayuda depende del contexto",
        body: [
          "La prisa por ayudar también puede quitar algo: hablar por la otra persona, resolver cada conflicto o decidir siempre qué debe hacer. A veces eso es necesario; otras, ayudar mejor significa devolver participación.",
          "«¿Quieres que te escuche, que pensemos opciones o que intervenga contigo?» no abandona: ofrece una elección pequeña. Qué nivel corresponde depende de la edad, el riesgo, el poder y el contexto.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Cuatro años y quince",
        body: [
          "Con un niño pequeño, la agencia puede ser elegir entre sentarse cerca o tener unos minutos de espacio.",
          "Con un adolescente puede ser decidir si quiere que alguien hable con el colegio. El principio es el mismo; la escala cambia.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "¿Escuchar, ofrecer opciones o intervenir?",
        body: [
          "Ordena varias formas de ayuda según cuánta participación conservan y marca cuándo el riesgo cambia la respuesta adecuada.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿De qué depende el nivel de ayuda adecuado?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Ayudar bien puede significar escuchar, ofrecer opciones o intervenir. Conservar la participación de la persona no es abandonarla, y el nivel adecuado depende del riesgo y del contexto.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C10-MG05",
    title: "A veces hay que cambiar el escenario",
    slug: "cambiar-el-escenario",
    conceptKey: "eec-cambiar-el-escenario",
    practiceSlug: "habilidad-o-condicion",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c10-mirar-el-escenario",
        heading: "5. Mirar también el escenario",
        fingerprint: "Es como enseñar equilibrio mientras el suelo continúa mojado.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "La habilidad y el suelo mojado",
        body: [
          "Enseñar una habilidad puede ayudar y no siempre alcanza. Vas a comparar dos puertas: la habilidad individual y la condición del entorno.",
        ],
        note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Mirar también el escenario",
        body: [
          "Lee la sección donde el capítulo compara enseñar equilibrio con secar el suelo.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Aprender equilibrio importa; secar el suelo también",
        body: [
          "Una buena estrategia para manejar la ira puede ayudar y no sería suficiente si existe acoso. Es como enseñar equilibrio mientras el suelo continúa mojado.",
          "Lo mismo ocurre donde alguien debe mantener siempre la calma para evitar la violencia de otra persona, o donde pedir ayuda tiene costo. A veces hace falta ampliar una habilidad, y a veces cambiar la condición que la exige.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Respirar mejor en un aula ruidosa",
        body: [
          "Enseñar a respirar puede ayudar a un grupo a concentrarse.",
          "Si el ruido viene de una obra al lado, la habilidad sigue siendo útil y no resuelve el ruido. Las dos cosas pueden hacer falta a la vez.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "¿Habilidad individual o condición del entorno?",
        body: [
          "Compara dos puertas ante una misma situación y elige qué factores indicarían que hacen falta las dos.",
        ],
        note: "Es una comparación entre ejemplos; no es un diagnóstico de tu entorno.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Basta con enseñar a regularse mejor?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Enseñar habilidades individuales no sustituye cambiar lo que genera el problema una y otra vez. «Regularte mejor» no puede ser la única respuesta a algo estructural.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

export const MICROGUIDES_C03_C10 = { C03, C04, C05, C06, C07, C08, C09, C10 };

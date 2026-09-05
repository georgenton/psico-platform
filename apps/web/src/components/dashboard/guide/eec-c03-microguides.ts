/**
 * EEC-C03's five microguides, as the browser needs them.
 *
 * GENERATED from `artifacts/eec/C03/v1.0/feelverse/guides/*.manifest.json`
 * plus the PUBLIC half of the server-side recall catalog — the same artifacts
 * the production DRAFTs are created from. Regenerate with
 * `node scripts/eec/build-web-microguides.mjs` rather than editing by hand: a
 * table typed twice is a table that drifts, and the web bundle test fails the
 * build if this file and the manifests disagree.
 *
 * The correct option is NOT among the options here, and nothing in this file
 * knows which one it is — so nothing here could leak it.
 */

import type { GuidePresentation } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";
import {
  microguidePresentation,
  microguideReaderCopy,
  type MicroguideChapter,
  type MicroguideEntry,
} from "./guide-microguide-bundle";

const EEC_C03: MicroguideChapter = {
  keyPrefix: "eec-c3",
  chapterLabel: "capítulo 3",
};

export const EEC_C03_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "predecir-no-es-adivinar",
    practiceSlug: "anticipar-dato-afirmacion",
    title: "Predecir no es adivinar",
    summary:
      "Cuando se dice que «el cerebro predice», es fácil imaginar un vidente. Vas a separar tres cosas que suelen mezclarse: lo que el capítulo llama anticipación, lo que es dato del presente y lo que ya sería una afirmación de más.",
    duration: "8–10 minutos",
    intro: {
      title: "Predecir, en el sentido del capítulo",
      body: [
        "Cuando se dice que «el cerebro predice», es fácil imaginar un vidente. Vas a separar tres cosas que suelen mezclarse: lo que el capítulo llama anticipación, lo que es dato del presente y lo que ya sería una afirmación de más.",
      ],
      note: "Trabajaremos con frases de ejemplo, no con tu historia personal. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Predecir no es adivinar",
      body: "Lee la sección donde el capítulo aterriza la palabra «predicción»: leer una frase sin detenerse en cada letra, reconocer una voz con ruido, buscar el interruptor a oscuras.",
    },
    concept: {
      title: "Anticipar con lo aprendido no es ver el futuro",
      body: [
        "En este marco, predecir nombra algo cotidiano: el sistema nervioso usa lo que ya vivió para no empezar de cero en cada instante. No es una decisión consciente tomada de antemano, y tampoco es adivinar lo que va a pasar.",
        "La diferencia importa porque cambia qué se puede concluir. Que una anticipación aparezca rápido y sin esfuerzo no la vuelve verdadera, y que se sienta convincente no la convierte en un dato del presente.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Anticipación, dato y afirmación de más",
      body: [
        "Toma una frase cotidiana y sepárala en tres: qué parte se apoya en experiencia previa, qué parte es información disponible ahora y qué parte sería concluir de más.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
    },
    recall: {
      question:
        "Según el capítulo 3, cuando se dice que «el cerebro predice», ¿a qué se refiere?",
      options: [
        {
          optionKey: "opcion-anticipar-con-lo-aprendido",
          label:
            "A que usa la experiencia previa para anticipar y no empezar de cero en cada instante.",
        },
        {
          optionKey: "opcion-adivinar",
          label:
            "A que puede anticipar acontecimientos futuros con más acierto del que reconocemos.",
        },
        {
          optionKey: "opcion-decidir",
          label:
            "A que decidimos de antemano, aunque sea sin darnos cuenta, qué vamos a sentir.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Predecir, aquí, es usar lo aprendido para no partir de cero. No es adivinar el futuro ni decidir de antemano lo que vas a sentir. Una anticipación puede ser razonable y aun así no ser un hecho.",
      ],
    },
  },
  {
    slug: "senal-corporal-sin-etiqueta",
    practiceSlug: "misma-senal-tres-contextos",
    title: "Una señal corporal no viene con etiqueta",
    summary:
      "El corazón acelerado no llega con un nombre puesto. Vas a comparar una misma activación corporal en tres situaciones cotidianas y a ver qué cambia —y qué no— en lo que se puede concluir.",
    duration: "8–10 minutos",
    intro: {
      title: "La misma señal, tres situaciones",
      body: [
        "El corazón acelerado no llega con un nombre puesto. Vas a comparar una misma activación corporal en tres situaciones cotidianas y a ver qué cambia —y qué no— en lo que se puede concluir.",
      ],
      note: "No vamos a pedirte que observes tu cuerpo ahora ni que recuerdes un episodio intenso. Trabajaremos con escenas de ejemplo.",
    },
    passage: {
      title: "El cuerpo no espera al final de la historia",
      body: "Lee la sección sobre interocepción y estado corporal, donde el capítulo llega a la imagen de los ingredientes y la receta.",
    },
    concept: {
      title: "Una señal es ingrediente, no receta",
      body: [
        "El pulso, la respiración y la tensión forman parte de lo que ocurre, pero por sí solos no nombran una emoción. La misma aceleración puede acompañar una carrera, un encuentro esperado, una discusión o demasiado café.",
        "El capítulo propone entender la experiencia emocional como una coordinación entre el estado del cuerpo, la situación, la memoria y los conceptos disponibles, no como la lectura directa de una sola señal.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Misma señal, tres contextos",
      body: [
        "Observa un mismo conjunto de señales corporales en tres situaciones y elige qué factores podrían cambiar su significado. Ninguna combinación se marca como incorrecta.",
      ],
      note: "Es un ejercicio de comparación entre ejemplos; no interpreta tus sensaciones ni saca conclusiones sobre ti.",
    },
    recall: {
      question:
        "Según el capítulo 3, ¿qué hace falta además de una señal corporal para que haya una emoción situada?",
      options: [
        {
          optionKey: "opcion-contexto-y-categoria",
          label:
            "El contexto, la memoria y los conceptos disponibles: la señal es ingrediente, no receta completa.",
        },
        {
          optionKey: "opcion-mas-atencion",
          label:
            "Prestar más atención a la señal, porque con suficiente precisión el cuerpo indica la emoción.",
        },
        {
          optionKey: "opcion-nada",
          label:
            "Nada más: cada señal corporal corresponde a una emoción concreta.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Las señales del cuerpo aportan información real y no vienen etiquetadas. Para que adquieran un significado emocional situado hacen falta el contexto, la memoria y los conceptos con los que cuentas.",
      ],
    },
  },
  {
    slug: "contexto-para-categorizar",
    practiceSlug: "escena-antes-y-despues",
    title: "El cerebro también necesita contexto para categorizar",
    summary:
      "Categorizar no es pegar una palabra al azar. Vas a ordenar interpretaciones de una escena ambigua por plausibilidad, y luego a repetirlo cuando aparezca información nueva.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuando aparece un dato nuevo",
      body: [
        "Categorizar no es pegar una palabra al azar. Vas a ordenar interpretaciones de una escena ambigua por plausibilidad, y luego a repetirlo cuando aparezca información nueva.",
      ],
      note: "La escena es de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Construcción no significa arbitrariedad",
      body: "Lee la sección donde el capítulo enumera las restricciones bajo las que ocurre la construcción y cierra entre dos fronteras.",
    },
    concept: {
      title: "Construir no es elegir cualquier cosa",
      body: [
        "Que una experiencia se construya no significa que cualquier interpretación sea igualmente posible. El capítulo enumera restricciones: las propiedades reales de la situación, el estado del organismo, la información disponible, la historia de aprendizaje, los conceptos accesibles, las metas y las normas.",
        "Por eso el trabajo se sitúa entre dos fronteras: ni libertad absoluta para sentir lo que se decida, ni reacción mecánica fijada de antemano.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "La escena, antes y después del contexto",
      body: [
        "Ordena las interpretaciones posibles de una escena ambigua y observa qué se mantiene y qué se mueve cuando llega información nueva.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 3, que una experiencia emocional se construya significa que…",
      options: [
        {
          optionKey: "opcion-bajo-restricciones",
          label:
            "Se ensambla bajo restricciones reales: la situación, el estado del cuerpo, lo aprendido y los conceptos disponibles.",
        },
        {
          optionKey: "opcion-cualquier-cosa",
          label:
            "Cualquier interpretación es igualmente posible, porque nada la limita.",
        },
        {
          optionKey: "opcion-falsa",
          label:
            "Es inventada, y por eso menos real que una reacción automática.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Categorizar es dar significado situado con el contexto, la experiencia y los conceptos disponibles. Que haya más de una lectura posible no vuelve falsa la experiencia, y tampoco significa que todas valgan lo mismo.",
      ],
    },
  },
  {
    slug: "no-hay-boton-de-miedo",
    practiceSlug: "region-y-emocion",
    title: "No hay un botón de miedo",
    summary:
      "«Se encendió la amígdala» suena a explicación completa. Vas a mirar cuatro afirmaciones sobre cerebro y emoción y a separar qué se observó, qué se infiere y qué añadió la divulgación.",
    duration: "8–10 minutos",
    intro: {
      title: "«Se activa una región»",
      body: [
        "«Se encendió la amígdala» suena a explicación completa. Vas a mirar cuatro afirmaciones sobre cerebro y emoción y a separar qué se observó, qué se infiere y qué añadió la divulgación.",
      ],
      note: "Trabajaremos con afirmaciones de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Patrones sin botones",
      body: "Lee la sección donde el capítulo compara el reconocimiento de una canción con la actividad distribuida y matiza qué muestran las técnicas multivariadas.",
    },
    concept: {
      title: "Que haya patrones no significa que haya botones",
      body: [
        "Que una emoción no viva en un único botón cerebral no convierte al cerebro en un caos sin regularidades. Pueden existir configuraciones distinguibles sin que exista una huella única e invariable para cada emoción.",
        "El salto que conviene no dar es este: que una región participe no demuestra que esa región produzca por sí sola la experiencia. Participar en un patrón y ser su causa completa son afirmaciones distintas.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Una región y una emoción",
      body: [
        "Mira una afirmación frecuente sobre el cerebro emocional y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 3, si una región del cerebro se activa durante un episodio emocional, ¿qué queda demostrado?",
      options: [
        {
          optionKey: "opcion-participa",
          label:
            "Que esa región participa; no que produzca por sí sola la emoción ni que sea su botón.",
        },
        {
          optionKey: "opcion-produce",
          label:
            "Que esa región es la responsable de esa emoción en particular.",
        },
        {
          optionKey: "opcion-sin-regularidad",
          label:
            "Que el cerebro no tiene ninguna regularidad reconocible al sentir.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Los episodios emocionales involucran procesos distribuidos. Puede haber patrones reconocibles sin que exista un botón único, y una región que participa no es por eso la causa completa de lo que sientes.",
      ],
    },
  },
  {
    slug: "modelo-puede-actualizarse",
    practiceSlug: "de-la-expectativa-al-ajuste",
    title: "Cuando el modelo no encaja, puede actualizarse",
    summary:
      "Una interpretación puede sentirse completamente real y aun así estar incompleta. Vas a ordenar los pasos que el capítulo describe entre una expectativa y un ajuste posible.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuando llega un dato que no encaja",
      body: [
        "Una interpretación puede sentirse completamente real y aun así estar incompleta. Vas a ordenar los pasos que el capítulo describe entre una expectativa y un ajuste posible.",
      ],
      note: "El orden no es una prueba; puedes verlo resuelto cuando quieras.",
    },
    passage: {
      title: "Cuando la predicción no encaja",
      body: "Lee la sección del golpe en la cocina, la cuchara en el suelo y la pregunta que reemplaza a «¿por qué reacciono así?».",
    },
    concept: {
      title: "Actualizar es posible; no es automático",
      body: [
        "Cuando lo que llega no coincide con lo esperado, ese desajuste puede favorecer una revisión. A veces basta con actuar para conseguir más información: encender la luz es una forma de preguntar.",
        "Pero el capítulo evita prometer de más. No todo desajuste reescribe lo aprendido, algunas expectativas resisten, y el debate técnico sobre los mecanismos sigue abierto. Actualizar es una posibilidad, no una obligación de sentir distinto de inmediato.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "De la expectativa al ajuste",
      body: [
        "Ordena las tarjetas que van de una expectativa previa hasta un aprendizaje posible, pasando por la información nueva y la discrepancia.",
      ],
      note: "Es una secuencia pedagógica del capítulo, no una descripción de lo que debe pasarte a ti.",
    },
    recall: {
      question:
        "Según el capítulo 3, cuando la información nueva no encaja con lo que se esperaba, ¿qué ocurre?",
      options: [
        {
          optionKey: "opcion-puede-actualizarse",
          label:
            "Ese desajuste puede favorecer una revisión, sin garantizar que el aprendizaje anterior desaparezca.",
        },
        {
          optionKey: "opcion-reescribe",
          label:
            "El sistema reescribe sus expectativas cada vez que algo lo sorprende.",
        },
        {
          optionKey: "opcion-nada",
          label:
            "No cambia nada: una interpretación emocional no puede corregirse con información.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Información nueva puede sostener, corregir o ajustar una interpretación. Actualizar no es control total ni borra lo aprendido antes: es aprendizaje posible, y a veces empieza por buscar un dato más.",
      ],
    },
  },
];

export const EEC_C03_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C03_MICROGUIDES.map((m) => microguidePresentation(EEC_C03, m));

export const EEC_C03_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C03_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C03, m));

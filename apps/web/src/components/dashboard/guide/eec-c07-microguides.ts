/**
 * EEC-C07's five microguides, as the browser needs them.
 *
 * GENERATED from `artifacts/eec/C07/v1.0/feelverse/guides/*.manifest.json`
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

const EEC_C07: MicroguideChapter = {
  keyPrefix: "eec-c7",
  chapterLabel: "capítulo 7",
};

export const EEC_C07_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "suspender-equivalencias",
    practiceSlug: "separar-capas-de-una-escena",
    title: "Traducir empieza por suspender equivalencias",
    summary:
      "En una conversación emocional se mezclan cosas distintas: lo que alguien experimenta, cómo lo valora, qué expresa, qué intenta regular y qué interpreta el otro. Vas a separarlas.",
    duration: "8–10 minutos",
    intro: {
      title: "Varias pistas de sonido a la vez",
      body: [
        "En una conversación emocional se mezclan cosas distintas: lo que alguien experimenta, cómo lo valora, qué expresa, qué intenta regular y qué interpreta el otro. Vas a separarlas.",
      ],
      note: "Trabajaremos con escenas de ejemplo, no con tu experiencia migratoria o familiar.",
    },
    passage: {
      title: "Antes de traducir, separar capas",
      body: "Lee la sección donde el capítulo distingue experimentar, valorar, expresar, regular e interpretar, con la imagen de las pistas de sonido.",
    },
    concept: {
      title: "Una señal no equivale a una emoción segura",
      body: [
        "Una persona puede sentir tristeza y mostrar irritación, o experimentar miedo y sonreír por nervios. Lo que se ve es una capa; lo que ocurre son varias.",
        "Traducir empieza por suspender la equivalencia automática entre la señal observada y la emoción, la causa o la intención. Suspenderla no es renunciar a entender: es no dar por cerrado lo que todavía es hipótesis.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Separar las capas de una escena",
      body: [
        "Compara una misma señal leída desde dos repertorios y marca qué interpretación es posible, cuál requiere comprobación y qué no se puede concluir.",
      ],
      note: "Es una comparación entre ejemplos; no infiere nada sobre culturas ni sobre personas concretas.",
    },
    recall: {
      question:
        "Según el capítulo 7, cuando alguien expresa una emoción de forma distinta a la esperada, lo primero que conviene hacer es…",
      options: [
        {
          optionKey: "opcion-suspender",
          label:
            "Suspender la equivalencia automática entre la señal y la emoción, la causa o la intención.",
        },
        {
          optionKey: "opcion-manual",
          label:
            "Consultar qué significa ese gesto en la cultura de esa persona.",
        },
        {
          optionKey: "opcion-ignorar",
          label:
            "Ignorar la señal, porque las expresiones no aportan información fiable.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Una palabra, un gesto o una forma de cuidado no tienen por qué corresponder exactamente al repertorio de la otra persona. Una diferencia de repertorio no es ausencia de emoción ni mala intención.",
      ],
    },
  },
  {
    slug: "expectativa-cambia-la-lectura",
    practiceSlug: "senal-expectativa-interpretacion-dato",
    title: "La expectativa cambia cómo lees la señal",
    summary:
      "Lo que esperamos que haga alguien cercano cambia cómo leemos su conducta. Vas a separar la señal, la expectativa propia, la interpretación y el dato que permitiría contrastarla.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuidar de maneras distintas",
      body: [
        "Lo que esperamos que haga alguien cercano cambia cómo leemos su conducta. Vas a separar la señal, la expectativa propia, la interpretación y el dato que permitiría contrastarla.",
      ],
      note: "Trabajaremos con el ejemplo del capítulo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "La ayuda que no parece ayuda",
      body: "Lee la sección con el estudio sobre respuestas compasivas en dos muestras y la conclusión que el capítulo extrae de él.",
    },
    concept: {
      title: "La expectativa participa en la lectura",
      body: [
        "El estudio no descubrió «la compasión ecuatoriana» ni describió a todos los habitantes de dos países: trabajó con muestras concretas y encontró diferencias promedio.",
        "Lo que sí ilustra es que dos personas pueden querer cuidar y no coincidir por completo en qué aspecto debería tener el cuidado. Cuando la ayuda no se parece a la esperada, es fácil leerla como desinterés.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Señal, expectativa, interpretación y dato",
      body: [
        "Separa una escena en cuatro campos, incluido el dato que permitiría comprobar la interpretación en vez de sostenerla.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 7, ¿qué papel juega la expectativa propia al leer la conducta de alguien cercano?",
      options: [
        {
          optionKey: "opcion-influye",
          label:
            "Influye en la interpretación: si la ayuda no se parece a la esperada, es fácil leerla como desinterés.",
        },
        {
          optionKey: "opcion-no-influye",
          label:
            "Ninguno: la conducta observable habla por sí misma y no depende de quien mira.",
        },
        {
          optionKey: "opcion-explica-todo",
          label:
            "Explica por completo el malentendido, sin que haga falta comprobar nada más.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Lo que esperamos de una persona cercana influye en cómo interpretamos su conducta. Reconocer esa influencia no explica toda la escena: sigue haciendo falta el dato que confirme o corrija.",
      ],
    },
  },
  {
    slug: "diferencia-no-es-excusa",
    practiceSlug: "diferencia-falta-contexto-o-limite",
    title: "Una diferencia cultural no es una excusa automática",
    summary:
      "El contexto puede explicar parte de una conducta sin volverla incuestionable. Vas a ordenar interpretaciones de una escena entre diferencia plausible, falta de contexto y límite en juego.",
    duration: "8–10 minutos",
    intro: {
      title: "Explicar no es justificar",
      body: [
        "El contexto puede explicar parte de una conducta sin volverla incuestionable. Vas a ordenar interpretaciones de una escena entre diferencia plausible, falta de contexto y límite en juego.",
      ],
      note: "Trabajaremos con escenas de ejemplo de baja intensidad.",
    },
    passage: {
      title: "Comprender el contexto no significa justificar el daño",
      body: "Lee el punto donde el capítulo marca el límite y formula la pregunta incómoda que acompaña a la curiosidad intercultural.",
    },
    concept: {
      title: "La cultura explica; no absuelve",
      body: [
        "Violencia, control, coerción, humillación o discriminación no se vuelven aceptables porque alguien diga «así es mi cultura».",
        "Y no todo desacuerdo entre personas de orígenes distintos es cultural: puede ser personalidad, cansancio, desigualdad de poder o una relación concreta. De ahí la pregunta que el capítulo propone: ¿tengo razones para pensar que la cultura es relevante aquí, o la estoy usando porque es la diferencia más visible?",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "¿Diferencia, falta de contexto o límite?",
      body: [
        "Ordena las lecturas posibles de una escena y marca cuándo lo que está en juego es un límite y no una diferencia de repertorio.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 7, ¿qué permite y qué no permite explicar una conducta por el contexto cultural?",
      options: [
        {
          optionKey: "opcion-explica-no-justifica",
          label:
            "Puede explicar parte de la conducta; no convierte el daño, la coerción o la discriminación en algo incuestionable.",
        },
        {
          optionKey: "opcion-justifica",
          label:
            "Si una conducta pertenece a la cultura de alguien, cuestionarla sería imponer la propia.",
        },
        {
          optionKey: "opcion-irrelevante",
          label:
            "El contexto cultural nunca aporta nada útil para entender un desacuerdo.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Comprender el contexto no significa justificar el daño. Y antes de explicar algo por la cultura conviene preguntarse si hay razones para creer que es relevante, o si solo es lo más visible.",
      ],
    },
  },
  {
    slug: "muchos-repertorios-dentro",
    practiceSlug: "un-pais-no-es-una-variable",
    title: "Dentro de una cultura también hay muchos repertorios",
    summary:
      "«En el país A pasa más que en el país B» todavía deja preguntas abiertas. Vas a mirar una generalización de ese tipo y separar lo que observa de lo que supone.",
    duration: "8–10 minutos",
    intro: {
      title: "Dentro de un país caben muchos repertorios",
      body: [
        "«En el país A pasa más que en el país B» todavía deja preguntas abiertas. Vas a mirar una generalización de ese tipo y separar lo que observa de lo que supone.",
      ],
      note: "No se trata de opinar sobre países ni regiones, sino de mirar qué sostiene una afirmación comparativa.",
    },
    passage: {
      title: "Un país no es una variable mágica",
      body: "Lee la sección donde el capítulo compara medir con reglas distintas y enumera las preguntas que conviene hacerle a una comparación entre países.",
    },
    concept: {
      title: "Un promedio no describe a cada persona",
      body: [
        "Las muestras pueden diferir en edad, educación, clase social o experiencia migratoria, y los instrumentos no siempre miden lo mismo al traducirse. Por eso una diferencia entre países no demuestra por sí sola una causa cultural.",
        "Región, familia, generación y migración producen variación dentro de un mismo país. La cultura importa, y no explica todo por decreto.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Un país no es una variable",
      body: [
        "Toma una generalización sobre una región o un país y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 7, encontrar una diferencia promedio entre dos países demuestra…",
      options: [
        {
          optionKey: "opcion-solo-promedio",
          label:
            "Una diferencia entre esas muestras: no que la causa sea la cultura ni que describa a cada persona.",
        },
        {
          optionKey: "opcion-cultura",
          label:
            "Que la cultura de esos países produce esa diferencia emocional.",
        },
        {
          optionKey: "opcion-nada",
          label:
            "Nada en absoluto: las comparaciones entre países no aportan información.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Dentro de una cultura hay muchos repertorios, y una diferencia interna puede ser tan relevante como una comparación entre países. Un promedio no define a la persona que tienes delante.",
      ],
    },
  },
  {
    slug: "preguntar-es-traducir",
    practiceSlug: "de-conclusion-a-pregunta",
    title: "Preguntar es parte de traducir",
    summary:
      "No hace falta memorizar un manual de costumbres. Vas a convertir tres conclusiones rápidas en preguntas de verificación que no renuncian a los límites.",
    duration: "8–10 minutos",
    intro: {
      title: "De la conclusión a la pregunta",
      body: [
        "No hace falta memorizar un manual de costumbres. Vas a convertir tres conclusiones rápidas en preguntas de verificación que no renuncian a los límites.",
      ],
      note: "Trabajaremos con frases de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Preguntar antes de interpretar",
      body: "Lee la sección sobre humildad cultural y por qué los manuales de costumbres por país no resuelven el malentendido.",
    },
    concept: {
      title: "Humildad no es fingir que no sabemos nada",
      body: [
        "Humildad cultural significa reconocer que nuestro mapa puede estar incompleto y prestar atención a la persona concreta, no al estereotipo de su origen.",
        "Preguntar forma parte de traducir. Mantener la hipótesis abierta no obliga a aceptar cualquier cosa: se puede preguntar y sostener un límite a la vez.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "De conclusión a pregunta",
      body: [
        "Ordena varias formulaciones según cuánto dejan abierta la comprobación, y elige las que permiten seguir conversando sin renunciar a un límite.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question: "Según el capítulo 7, la humildad cultural implica…",
      options: [
        {
          optionKey: "opcion-mapa-incompleto",
          label:
            "Reconocer que nuestro mapa puede estar incompleto y atender a la persona concreta, no al estereotipo.",
        },
        {
          optionKey: "opcion-no-saber",
          label:
            "Fingir que no sabemos nada sobre las diferencias culturales para no ofender.",
        },
        {
          optionKey: "opcion-aceptar-todo",
          label:
            "Aceptar cualquier conducta con tal de no imponer la propia manera de sentir.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Preguntar es parte de traducir: observar la señal, reconocer desde qué repertorio la leemos, preguntar y aceptar que alguna diferencia puede permanecer.",
      ],
    },
  },
];

export const EEC_C07_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C07_MICROGUIDES.map((m) => microguidePresentation(EEC_C07, m));

export const EEC_C07_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C07_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C07, m));

/**
 * EEC-C09's five microguides, as the browser needs them.
 *
 * GENERATED from `artifacts/eec/C09/v1.0/feelverse/guides/*.manifest.json`
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

const EEC_C09: MicroguideChapter = {
  keyPrefix: "eec-c9",
  chapterLabel: "capítulo 9",
};

export const EEC_C09_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "construido-no-significa-elegido",
    practiceSlug: "influencia-o-voluntarismo",
    title: "Construido no significa elegido",
    summary:
      "«Si las emociones se construyen, puedo construir la que quiera» suena esperanzador. Vas a mirar esa afirmación y separar la influencia posible del voluntarismo.",
    duration: "8–10 minutos",
    intro: {
      title: "Si se construye, ¿puedo elegirla?",
      body: [
        "«Si las emociones se construyen, puedo construir la que quiera» suena esperanzador. Vas a mirar esa afirmación y separar la influencia posible del voluntarismo.",
      ],
      note: "Trabajaremos con afirmaciones de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Construcción no es sinónimo de fabricación consciente",
      body: "Lee el punto donde el capítulo enumera lo que el sistema aprendió sin que lo recordemos con claridad, y lo que ocurre con esas lecciones.",
    },
    concept: {
      title: "Aprendido no es lo mismo que elegido",
      body: [
        "Buena parte de lo aprendido se adquirió en experiencias que quizá ya no se recuerdan: qué tono anuncia conflicto, qué pasa cuando dices que no, qué emociones se consideran aceptables.",
        "Algunas de esas lecciones siguen sirviendo, otras pertenecen a situaciones terminadas, y algunas nunca fueron reglas universales aunque se aprendieran como si lo fueran. Que algo se construya no significa que puedas fabricarlo o apagarlo a voluntad.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "¿Influencia posible o voluntarismo?",
      body: [
        "Toma una afirmación sobre control emocional y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 9, que una emoción dependa de aprendizaje y construcción significa que…",
      options: [
        {
          optionKey: "opcion-influir",
          label:
            "Se puede influir en ella y seguir aprendiendo; no que se pueda elegir directamente lo que se siente.",
        },
        {
          optionKey: "opcion-elegir",
          label:
            "Se puede decidir qué sentir, si se aprende la técnica adecuada.",
        },
        {
          optionKey: "opcion-fija",
          label:
            "No se puede cambiar nada, porque lo aprendido queda fijado para siempre.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Construido no significa elegido. Se puede influir y seguir aprendiendo sin que eso equivalga a decidir directamente lo que se siente.",
      ],
    },
  },
  {
    slug: "tecnica-util-no-es-universal",
    practiceSlug: "objetivo-y-herramienta",
    title: "Una técnica útil no es una técnica universal",
    summary:
      "Respirar, aceptar, reevaluar, distraerse o expresarse no hacen el mismo trabajo. Vas a emparejar situaciones con la herramienta que podría responder a ese objetivo.",
    duration: "8–10 minutos",
    intro: {
      title: "Cada herramienta responde a un problema",
      body: [
        "Respirar, aceptar, reevaluar, distraerse o expresarse no hacen el mismo trabajo. Vas a emparejar situaciones con la herramienta que podría responder a ese objetivo.",
      ],
      note: "No es una recomendación clínica ni una indicación para tu caso.",
    },
    passage: {
      title: "Tomar lo mejor sin convertir una herramienta en religión",
      body: "Lee la sección donde el capítulo recorre varios enfoques y señala el límite de cada uno.",
    },
    concept: {
      title: "Sacar una herramienta de contexto puede volverla inútil",
      body: [
        "Las escuelas terapéuticas no son enemigas que compiten por explicar toda la vida emocional: con frecuencia iluminan partes diferentes del mapa.",
        "Cada enfoque hace preguntas distintas y ofrece herramientas para problemas distintos. Se puede tomar lo mejor de una sin exigirle que resuelva aquello para lo que no fue diseñada.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Objetivo y herramienta",
      body: [
        "Empareja situaciones con la herramienta que podría responder a ese objetivo y marca cuándo falta información para decidir.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 9, que una técnica de regulación funcione en promedio significa que…",
      options: [
        {
          optionKey: "opcion-segun-problema",
          label:
            "Responde a cierto problema en cierto contexto; no es la respuesta correcta para todo.",
        },
        {
          optionKey: "opcion-universal",
          label: "Conviene aplicarla siempre que aparezca una emoción difícil.",
        },
        {
          optionKey: "opcion-inutil",
          label:
            "No sirve realmente, porque los promedios no describen a nadie.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Una técnica útil no es una técnica universal. «Funciona en promedio» no significa «es la respuesta correcta para todo», y la regulación flexible no es la terapia que gana.",
      ],
    },
  },
  {
    slug: "define-que-quieres-cambiar",
    practiceSlug: "objetivo-influencia-estrategia-senal",
    title: "Define qué quieres cambiar antes de regular",
    summary:
      "Una estrategia se evalúa contra un objetivo. Vas a separar el objetivo, lo que puedes influir, la estrategia candidata y cómo sabrías si ayudó.",
    duration: "8–10 minutos",
    intro: {
      title: "Antes de elegir una estrategia",
      body: [
        "Una estrategia se evalúa contra un objetivo. Vas a separar el objetivo, lo que puedes influir, la estrategia candidata y cómo sabrías si ayudó.",
      ],
      note: "Trabajaremos con una situación de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "No siempre necesitas sentirte mejor para responder mejor",
      body: "Lee la sección donde el capítulo separa «¿cómo quiero sentirme?» de «¿qué necesito lograr?».",
    },
    concept: {
      title: "Sentirse mejor no es el único criterio",
      body: [
        "Solemos imaginar una sola meta: bajar una emoción desagradable. Pero regulamos con objetivos distintos: tolerar algo durante una conversación, prepararnos, no convertir un impulso en conducta, comprender, descansar o pedir ayuda.",
        "A veces la situación que provoca la emoción es lo que necesita cambiar. Se puede seguir sintiendo culpa y aun así conseguir una conversación más honesta.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Objetivo, influencia, estrategia y señal",
      body: [
        "Separa una situación en cuatro campos, incluido cómo sabrías si la estrategia ayudó.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 9, ¿contra qué se evalúa una estrategia de regulación?",
      options: [
        {
          optionKey: "opcion-objetivo",
          label:
            "Contra el objetivo que se perseguía, que no siempre es sentirse mejor.",
        },
        {
          optionKey: "opcion-intensidad",
          label: "Contra cuánto bajó la intensidad de la emoción desagradable.",
        },
        {
          optionKey: "opcion-rapidez",
          label: "Contra la rapidez con que la emoción desapareció.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Definir qué quieres lograr cambia qué estrategia tiene sentido. «Sentirme mejor ya» es un criterio posible, y no el único.",
      ],
    },
  },
  {
    slug: "cuatro-puertas",
    practiceSlug: "por-que-puerta-entra",
    title: "Cuatro puertas para intervenir",
    summary:
      "El capítulo propone cuatro puertas: la situación, el espacio que ocupa ahora, la interpretación y la conducta. Vas a clasificar respuestas según la puerta que usan.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuatro maneras de entrar",
      body: [
        "El capítulo propone cuatro puertas: la situación, el espacio que ocupa ahora, la interpretación y la conducta. Vas a clasificar respuestas según la puerta que usan.",
      ],
      note: "Son una traducción pedagógica, no las únicas categorías científicas posibles.",
    },
    passage: {
      title: "Puerta 1: cambiar algo afuera",
      body: "Lee la primera puerta, con la imagen del humo que entra por una ventana abierta.",
    },
    concept: {
      title: "Ninguna puerta garantiza cambiar la emoción",
      body: [
        "A veces la ruta más directa no pasa por el mundo interior: pasa por preguntar, organizar, poner un límite o pedir apoyo. Si el humo entra por una ventana abierta, se puede practicar respiración veinte minutos o cerrar la ventana.",
        "El capítulo añade un límite ético que conviene no perder: la regulación se vuelve injusta cuando enseña a adaptarse indefinidamente a condiciones que deberían cambiar.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "¿Por qué puerta entra esta respuesta?",
      body: [
        "Clasifica varias respuestas según la puerta que usan y compara qué alcanza y qué no alcanza cada una.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 9, elegir una de las cuatro puertas de intervención garantiza…",
      options: [
        {
          optionKey: "opcion-no-garantiza",
          label:
            "Nada por sí solo: identifica dónde se está interviniendo, sin prometer que la emoción cambie.",
        },
        {
          optionKey: "opcion-resultado",
          label:
            "Que la emoción disminuya, si la puerta elegida es la adecuada.",
        },
        {
          optionKey: "opcion-unica",
          label: "Que ya no hará falta usar ninguna de las otras tres.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Hay puertas en la situación, en la activación, en la interpretación y en la conducta. Elegir una no garantiza que la emoción cambie, y a veces lo que hay que cambiar está afuera.",
      ],
    },
  },
  {
    slug: "repensar-ocurre-despues",
    practiceSlug: "objetivo-respuesta-consecuencia-ajuste",
    title: "Repensar también ocurre después",
    summary:
      "Cada episodio deja información. Vas a ordenar la secuencia que va del objetivo elegido al ajuste futuro.",
    duration: "8–10 minutos",
    intro: {
      title: "Después también se aprende",
      body: [
        "Cada episodio deja información. Vas a ordenar la secuencia que va del objetivo elegido al ajuste futuro.",
      ],
      note: "Es una secuencia del capítulo; puedes verla resuelta cuando quieras.",
    },
    passage: {
      title: "Repensar también es aprender para la próxima vez",
      body: "Lee la sección donde el capítulo recorre expectativas que no se cumplieron exactamente como se temía.",
    },
    concept: {
      title: "Observar lo que ocurrió permite recalcular",
      body: [
        "La regulación no termina cuando baja la intensidad. Esperabas que poner un límite destruyera el vínculo y no ocurrió exactamente así; esperabas que la ansiedad creciera sin fin y subió, se sostuvo y disminuyó.",
        "Esas experiencias no garantizan que la próxima emoción sea distinta, y pueden alimentar predicciones nuevas. Aprender una respuesta no borra necesariamente la anterior.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Objetivo, respuesta, consecuencia y ajuste",
      body: [
        "Ordena la secuencia que va del objetivo elegido hasta el ajuste posible para una próxima vez.",
      ],
      note: "Es una secuencia pedagógica, no una descripción de lo que debe pasarte a ti.",
    },
    recall: {
      question: "Según el capítulo 9, la regulación emocional termina…",
      options: [
        {
          optionKey: "opcion-no-termina",
          label:
            "No termina cuando baja la intensidad: cada episodio deja información que puede alimentar predicciones nuevas.",
        },
        {
          optionKey: "opcion-baja",
          label: "Cuando la emoción baja de intensidad y se recupera la calma.",
        },
        {
          optionKey: "opcion-nunca-cambia",
          label:
            "Nunca produce aprendizaje, porque las expectativas antiguas siempre vuelven.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Repensar también ocurre después: observar consecuencias permite recalcular. Es un ciclo de prueba y aprendizaje, no un control remoto.",
      ],
    },
  },
];

export const EEC_C09_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C09_MICROGUIDES.map((m) => microguidePresentation(EEC_C09, m));

export const EEC_C09_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C09_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C09, m));

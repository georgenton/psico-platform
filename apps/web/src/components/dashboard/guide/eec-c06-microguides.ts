/**
 * EEC-C06's five microguides, as the browser needs them.
 *
 * GENERATED from `artifacts/eec/C06/v1.1/feelverse/guides/*.manifest.json`
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

const EEC_C06: MicroguideChapter = {
  keyPrefix: "eec-c6",
  chapterLabel: "capítulo 6",
};

export const EEC_C06_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "sentir-se-aprende-con-otros",
    practiceSlug: "dos-respuestas-relacionales",
    title: "Sentir también se aprende con otros",
    summary:
      "Mirar a una persona y mirar lo que ocurre entre dos personas son dos planos distintos. Vas a comparar una misma expresión emocional frente a dos respuestas relacionales.",
    duration: "8–10 minutos",
    intro: {
      title: "Acercar y alejar la cámara",
      body: [
        "Mirar a una persona y mirar lo que ocurre entre dos personas son dos planos distintos. Vas a comparar una misma expresión emocional frente a dos respuestas relacionales.",
      ],
      note: "Trabajaremos con escenas de ejemplo, no con una relación tuya.",
    },
    passage: {
      title: "De lo que pasa en mí a lo que pasa entre nosotros",
      body: "Lee la sección de la cámara en el partido y la precisión que el capítulo añade enseguida.",
    },
    concept: {
      title: "Sumar el plano relacional no borra el individual",
      body: [
        "Cada persona percibe y actúa, y su conducta pasa a formar parte del mundo que la otra está percibiendo. Ese plano añade información que el plano individual no alcanza.",
        "El capítulo lo dice con cuidado: añadir el nivel relacional no elimina el nivel individual. La relación no es una fuerza por encima de las personas; es parte del contexto donde ocurren sus cuerpos, recuerdos y expectativas.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "La misma señal, dos respuestas",
      body: [
        "Compara una expresión emocional ante dos respuestas relacionales distintas y elige qué podría cambiar en cada caso.",
      ],
      note: "Es una comparación entre ejemplos; no concluye nada sobre tus relaciones.",
    },
    recall: {
      question:
        "Según el capítulo 6, añadir el plano relacional al análisis de una emoción…",
      options: [
        {
          optionKey: "opcion-no-elimina",
          label:
            "Añade información sin eliminar el plano individual: cuerpo, historia y conceptos siguen participando.",
        },
        {
          optionKey: "opcion-sustituye",
          label:
            "Sustituye al plano individual, porque las emociones ocurren realmente entre personas.",
        },
        {
          optionKey: "opcion-determina",
          label:
            "Demuestra que la relación determina lo que cada persona sentirá.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Sentir también se aprende con otros: relaciones, modelado y respuestas repetidas participan en el aprendizaje emocional. Participar no es fabricar por completo lo que alguien siente.",
      ],
    },
  },
  {
    slug: "regular-juntos-no-es-controlar",
    practiceSlug: "apoyo-validacion-control-escalamiento",
    title: "Regular juntos no es controlar",
    summary:
      "Escuchar, distraer, ayudar a reinterpretar, acompañar en silencio: todas son respuestas sociales a una emoción, y no hacen lo mismo. Vas a clasificar respuestas a una escena cotidiana.",
    duration: "8–10 minutos",
    intro: {
      title: "Acompañar tiene varias formas",
      body: [
        "Escuchar, distraer, ayudar a reinterpretar, acompañar en silencio: todas son respuestas sociales a una emoción, y no hacen lo mismo. Vas a clasificar respuestas a una escena cotidiana.",
      ],
      note: "Trabajaremos con la escena del capítulo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Cuando otra persona ayuda —o empeora— lo que sientes",
      body: "Lee la sección de la llamada tras una mala noticia, la caja de herramientas sociales y lo que el capítulo dice sobre co-regulación y co-rumiación.",
    },
    concept: {
      title: "Co-regular no es conseguir que el otro sienta lo que queremos",
      body: [
        "Regular no siempre significa reducir una emoción: a veces se trata de sostenerla o de aumentar energía antes de algo importante. El proceso describe qué ocurre; no garantiza que el objetivo sea saludable.",
        "Dos personas pueden calmarse juntas y también desregularse juntas. Dar vueltas al mismo problema puede acercar y a la vez mantener la atención pegada a él. Compartir no es una técnica única.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Apoyo, validación, control o escalamiento",
      body: [
        "Clasifica varias respuestas a una escena cotidiana y marca cuándo la información disponible no alcanza para decidir.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question: "Según el capítulo 6, co-regular con otra persona significa…",
      options: [
        {
          optionKey: "opcion-ajuste-mutuo",
          label:
            "Un ajuste mutuo que puede estabilizar o intensificar; no lograr que el otro sienta lo que queremos.",
        },
        {
          optionKey: "opcion-prestar-calma",
          label:
            "Prestarle calma a alguien para que su emoción difícil disminuya.",
        },
        {
          optionKey: "opcion-siempre-bueno",
          label:
            "Un proceso que, por definición, mejora el estado emocional de ambas personas.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Regular juntos no es controlar. Una respuesta puede ayudar, sostener o intensificar, y una pregunta sencilla sobre qué necesita la otra persona suele servir más que una frase aprendida.",
      ],
    },
  },
  {
    slug: "ciclo-no-es-culpa-compartida",
    practiceSlug: "ordenar-el-ciclo",
    title: "Un ciclo no significa culpa compartida",
    summary:
      "Describir un ciclo ayuda a ver cómo cada respuesta prepara la siguiente. Vas a ordenar esa secuencia y a señalar dónde existe una opción propia.",
    duration: "8–10 minutos",
    intro: {
      title: "Un minuto en la mesa",
      body: [
        "Describir un ciclo ayuda a ver cómo cada respuesta prepara la siguiente. Vas a ordenar esa secuencia y a señalar dónde existe una opción propia.",
      ],
      note: "Usaremos la escena del capítulo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Cuando una respuesta prepara la siguiente",
      body: "Lee la escena de la pregunta sobre el trabajo y la secuencia que el capítulo dibuja a partir de ella.",
    },
    concept: {
      title: "Describir un ciclo no reparte culpas",
      body: [
        "Un ciclo no es una criatura invisible que controla a la familia: es una secuencia que se repite porque cada respuesta vuelve más probable la siguiente.",
        "Ver la reciprocidad no borra la causalidad, los límites ni la responsabilidad por lo que cada quien hace. Describir cómo se sostiene un patrón y repartir la culpa a medias son dos cosas distintas.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Ordenar el ciclo",
      body: [
        "Ordena la secuencia observable de ese minuto y observa en qué punto aparece una opción distinta.",
      ],
      note: "Es una secuencia del capítulo, no una descripción de tu relación ni una asignación de responsabilidades.",
    },
    recall: {
      question:
        "Según el capítulo 6, describir un ciclo recíproco entre dos personas significa…",
      options: [
        {
          optionKey: "opcion-como-se-sostiene",
          label:
            "Mostrar cómo cada respuesta vuelve más probable la siguiente; no repartir la culpa a medias.",
        },
        {
          optionKey: "opcion-50-50",
          label:
            "Que ambas personas son igualmente responsables de lo que ocurre.",
        },
        {
          optionKey: "opcion-nadie",
          label:
            "Que nadie es responsable, porque el ciclo actúa por encima de las personas.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Un ciclo describe cómo se sostiene un patrón, no una culpa 50/50. Reconocer la reciprocidad es compatible con sostener límites y con responder por la propia conducta.",
      ],
    },
  },
  {
    slug: "parecidos-que-no-son-sinonimos",
    practiceSlug: "empatia-contagio-sincronia",
    title: "Parecidos que no son sinónimos",
    summary:
      "Empatía, contagio, sincronía y regulación interpersonal se parecen y no son lo mismo. Vas a clasificar mini-escenas según el fenómeno que mejor las describe.",
    duration: "8–10 minutos",
    intro: {
      title: "Casas del mismo barrio",
      body: [
        "Empatía, contagio, sincronía y regulación interpersonal se parecen y no son lo mismo. Vas a clasificar mini-escenas según el fenómeno que mejor las describe.",
      ],
      note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Regulación interpersonal",
      body: "Lee el cierre de la sección donde el capítulo distingue estas palabras vecinas y explica por qué la precisión importa.",
    },
    concept: {
      title: "Nombrar con precisión permite preguntar con precisión",
      body: [
        "Distinguir estas palabras no es pedantería: es lo que impide que cualquier experiencia de conexión termine descrita con una sola palabra nebulosa.",
        "Cuando se nombra con precisión se puede preguntar con precisión: si estamos observando una señal o haciendo una inferencia. Y parecerse emocionalmente no demuestra por sí solo empatía, vínculo sano o comprensión.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Empatía, contagio, sincronía o regulación",
      body: [
        "Clasifica mini-escenas según el fenómeno mejor descrito y marca cuándo falta información para decidir.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 6, que dos personas sientan algo parecido al mismo tiempo demuestra…",
      options: [
        {
          optionKey: "opcion-solo-coincidencia",
          label:
            "Que hubo coincidencia: no demuestra por sí solo empatía, amor ni salud relacional.",
        },
        {
          optionKey: "opcion-empatia",
          label:
            "Que existe empatía entre ellas, porque sentir lo mismo es comprender al otro.",
        },
        {
          optionKey: "opcion-nada-real",
          label:
            "Que ninguna de las dos siente realmente nada propio en ese momento.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Empatía, contagio, imitación, sincronía y regulación interpersonal no son el mismo mecanismo. Sincronía o parecido emocional no demuestran amor, empatía ni salud relacional.",
      ],
    },
  },
  {
    slug: "influencia-no-es-destino",
    practiceSlug: "mi-parte-la-otra-el-contexto-el-limite",
    title: "Influencia no es destino",
    summary:
      "Las relaciones influyen y no deciden. Vas a separar qué depende de ti, qué de la otra persona, qué del contexto y qué límite pide la situación.",
    duration: "8–10 minutos",
    intro: {
      title: "Ni islas ni marionetas",
      body: [
        "Las relaciones influyen y no deciden. Vas a separar qué depende de ti, qué de la otra persona, qué del contexto y qué límite pide la situación.",
      ],
      note: "Trabajaremos con un caso cotidiano de baja intensidad, no con una situación de riesgo.",
    },
    passage: {
      title: "Influencia no es destino",
      body: "Lee el cierre del capítulo, donde reconoce todo lo que aprendemos con otros y marca el límite de esa idea.",
    },
    concept: {
      title: "Influencia real, agencia real",
      body: [
        "Aprendemos palabras con otros, recibimos señales, interpretamos silencios, nos contagiamos de un ambiente. No somos islas.",
        "Y tampoco somos marionetas de nuestras relaciones. Comprender un ciclo no garantiza que alguien encuentre las palabras perfectas, y hay situaciones —coerción, violencia, asimetría grave— donde hablar de responsabilidad recíproca sería un error.",
      ],
      note: "Si una situación implica violencia o coerción, no es material para este ejercicio: la seguridad y el apoyo tienen prioridad.",
    },
    practice: {
      title: "Mi parte, la del otro, el contexto y el límite",
      body: [
        "Separa una situación cotidiana en cuatro campos, incluido el límite o la condición de seguridad que la situación requiere.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 6, ¿dónde deja de aplicarse con justicia la idea de circularidad?",
      options: [
        {
          optionKey: "opcion-coercion",
          label:
            "Donde hay coerción, violencia o asimetría grave de poder: ahí no se lee como responsabilidad recíproca.",
        },
        {
          optionKey: "opcion-siempre",
          label:
            "En ningún caso: todo vínculo puede describirse como un ciclo entre iguales.",
        },
        {
          optionKey: "opcion-familia",
          label:
            "Solo dentro de la familia; fuera de ella las relaciones no forman ciclos.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Pertenencia y grupo influyen, y la agencia sigue existiendo. Donde hay coerción o asimetría grave, describir un ciclo recíproco deja de ser una descripción justa.",
      ],
    },
  },
];

export const EEC_C06_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C06_MICROGUIDES.map((m) => microguidePresentation(EEC_C06, m));

export const EEC_C06_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C06_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C06, m));

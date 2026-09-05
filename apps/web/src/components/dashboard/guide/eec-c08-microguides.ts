/**
 * EEC-C08's five microguides, as the browser needs them.
 *
 * GENERATED from `artifacts/eec/C08/v1.0/feelverse/guides/*.manifest.json`
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

const EEC_C08: MicroguideChapter = {
  keyPrefix: "eec-c8",
  chapterLabel: "capítulo 8",
};

export const EEC_C08_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "sentirlo-no-lo-vuelve-verdad",
    practiceSlug: "emocion-interpretacion-hechos-falta",
    title: "Sentirlo no lo vuelve verdad",
    summary:
      "Una experiencia puede ser real y su primera explicación estar equivocada. Vas a separar emoción, interpretación, hechos disponibles e información que falta.",
    duration: "8–10 minutos",
    intro: {
      title: "«Siento culpa» y «soy culpable»",
      body: [
        "Una experiencia puede ser real y su primera explicación estar equivocada. Vas a separar emoción, interpretación, hechos disponibles e información que falta.",
      ],
      note: "Usaremos una escena de ejemplo de baja intensidad. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Cuando sentir también es valorar",
      body: "Lee la sección donde el capítulo presenta la propuesta de que las emociones involucran evaluaciones sobre lo que consideramos importante, con el ejemplo de las dos llamadas.",
    },
    concept: {
      title: "La emoción señala importancia, no veracidad",
      body: [
        "La misma noticia produce reacciones distintas según con quién nos vincule: la emoción habla de una relación de importancia.",
        "De ahí no se sigue que la evaluación que la acompaña sea necesariamente correcta. Sentir culpa después de poner un límite dice que algo importa; no establece que se haya hecho daño.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Emoción, interpretación, hechos y lo que falta",
      body: [
        "Separa una escena de culpa en cuatro campos y observa cuánta de la conclusión venía de la emoción y cuánta de los hechos disponibles.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 8, sentir culpa después de poner un límite establece que…",
      options: [
        {
          optionKey: "opcion-importa",
          label:
            "Algo importa en esa relación; no que se haya hecho daño ni que la negativa fuera injusta.",
        },
        {
          optionKey: "opcion-culpable",
          label:
            "Que probablemente se hizo algo mal, porque la culpa no aparece sin motivo.",
        },
        {
          optionKey: "opcion-irrelevante",
          label:
            "Nada: la culpa es una emoción que conviene descartar al tomar decisiones.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "«Siento culpa» y «soy culpable» son dos afirmaciones distintas. La experiencia es real; su primera explicación puede estar incompleta o desactualizada.",
      ],
    },
  },
  {
    slug: "muestra-lo-que-importa-no-que-hacer",
    practiceSlug: "que-importa-y-que-esta-justificado",
    title: "Una emoción puede mostrar lo que importa, no qué hacer",
    summary:
      "Una emoción puede poner algo en primer plano sin decidir qué hacer con ello. Vas a comparar esas dos preguntas en situaciones cotidianas.",
    duration: "8–10 minutos",
    intro: {
      title: "Lo que importa y lo que está justificado",
      body: [
        "Una emoción puede poner algo en primer plano sin decidir qué hacer con ello. Vas a comparar esas dos preguntas en situaciones cotidianas.",
      ],
      note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "La ética empieza cuando aparece el otro",
      body: "Lee la sección donde el capítulo muestra que una ética centrada solo en la autenticidad individual sería insuficiente.",
    },
    concept: {
      title: "Poner algo en primer plano no es autorizar una acción",
      body: [
        "Los celos pueden señalar que una relación importa. Aun siendo intensos, no otorgan automáticamente derecho a revisar el teléfono de otra persona, aislarla o controlarla.",
        "La distancia entre «esto parece importarme» y «esta acción está justificada» es donde ocurre el discernimiento. Las decisiones afectan a otras personas, y eso añade preguntas que la intensidad no responde.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Qué parece importar, qué está justificado",
      body: [
        "Compara en dos situaciones lo que la emoción hace visible y lo que la acción requeriría para estar justificada.",
      ],
      note: "Es una comparación entre ejemplos; no es un consejo sobre qué hacer en tu caso.",
    },
    recall: {
      question:
        "Según el capítulo 8, ¿qué autoriza la intensidad de una emoción como los celos?",
      options: [
        {
          optionKey: "opcion-no-autoriza",
          label:
            "Nada por sí sola: puede señalar que algo importa, y no da derecho a revisar el teléfono de alguien ni a controlarlo.",
        },
        {
          optionKey: "opcion-autoriza",
          label:
            "Justifica comprobar lo que ocurre, porque una emoción tan fuerte suele tener razón.",
        },
        {
          optionKey: "opcion-reprimir",
          label: "Indica que la emoción debe reprimirse hasta que desaparezca.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Una emoción puede mostrar lo que importa y no dicta qué hacer. Entre lo que sentimos y lo que está justificado aparecen los derechos y las consecuencias para otras personas.",
      ],
    },
  },
  {
    slug: "pista-evidencia-veredicto",
    practiceSlug: "clasificar-pista-evidencia-veredicto",
    title: "Pista, evidencia y veredicto son distintos",
    summary:
      "Que una reacción tenga una historia explica su aparición y no confirma su contenido. Vas a clasificar afirmaciones como pista, evidencia adicional o veredicto todavía no justificado.",
    duration: "8–10 minutos",
    intro: {
      title: "Una pista merece examen",
      body: [
        "Que una reacción tenga una historia explica su aparición y no confirma su contenido. Vas a clasificar afirmaciones como pista, evidencia adicional o veredicto todavía no justificado.",
      ],
      note: "Trabajaremos con la escena del capítulo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Pista, evidencia y veredicto no son lo mismo",
      body: "Lee la escena de la entrevista de trabajo y el gesto de mirar el reloj.",
    },
    concept: {
      title: "Explicar el origen no confirma el contenido",
      body: [
        "Quizá una experiencia anterior enseñó a asociar ese gesto con desaprobación. Comprender esa historia explica por qué apareció la emoción, y no demuestra que la interpretación sea correcta esta vez.",
        "Las emociones influyen en lo que atendemos, recordamos y elegimos: a veces ayudan y a veces sesgan. Por eso una pista pide investigación, no sentencia.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "¿Pista, evidencia o veredicto?",
      body: [
        "Clasifica varias afirmaciones y marca qué haría falta antes de convertir una pista en una creencia firme.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 8, comprender por qué apareció una emoción demuestra que…",
      options: [
        {
          optionKey: "opcion-explica-no-confirma",
          label:
            "Explica su aparición; no demuestra que la interpretación que la acompaña sea correcta esta vez.",
        },
        {
          optionKey: "opcion-confirma",
          label:
            "Confirma la interpretación, porque una reacción con historia responde a algo real.",
        },
        {
          optionKey: "opcion-invalida",
          label:
            "La invalida: si viene del pasado, la emoción no aporta información sobre el presente.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Una emoción funciona como pista evaluativa. Comprender de dónde viene explica su aparición sin certificar su contenido: entre la pista y el veredicto falta la investigación.",
      ],
    },
  },
  {
    slug: "validar-no-es-dar-la-razon",
    practiceSlug: "experiencia-interpretacion-impulso-conducta",
    title: "Validar no es dar la razón en todo",
    summary:
      "«No le hagas caso a lo que sientes» y «tu emoción ya sabe la verdad» fallan por lados distintos. Vas a separar experiencia, interpretación, impulso y conducta.",
    duration: "8–10 minutos",
    intro: {
      title: "Entre dos extremos",
      body: [
        "«No le hagas caso a lo que sientes» y «tu emoción ya sabe la verdad» fallan por lados distintos. Vas a separar experiencia, interpretación, impulso y conducta.",
      ],
      note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "No certifica la interpretación que la acompaña",
      body: "Lee el punto donde el capítulo compara la emoción con una pista en una escena y propone su alternativa a los dos extremos.",
    },
    concept: {
      title: "Validar la experiencia, examinar la interpretación",
      body: [
        "Una pista merece atención y puede cambiar por completo el rumbo de una investigación. Lo que no hace es certificar la interpretación que llega con ella.",
        "Por eso el capítulo propone algo más exigente que cualquiera de los dos extremos: escuchar la pista y después investigar. Reconocer que alguien está furioso no equivale a aceptar su acusación ni a autorizar cualquier conducta.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Experiencia, interpretación, impulso y conducta",
      body: [
        "Separa una escena en cuatro campos y observa cuál de ellos estabas validando sin darte cuenta.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 8, decir «entiendo que estés furioso» valida…",
      options: [
        {
          optionKey: "opcion-solo-experiencia",
          label:
            "La experiencia de esa persona; no su interpretación de los hechos ni cualquier conducta.",
        },
        {
          optionKey: "opcion-todo",
          label:
            "Su versión completa de lo ocurrido, porque validar implica dar la razón.",
        },
        {
          optionKey: "opcion-nada",
          label: "Nada relevante: es una fórmula de cortesía sin efecto real.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Validar la experiencia, aceptar la interpretación y justificar la conducta son decisiones distintas. Escucha la pista; después investiga.",
      ],
    },
  },
  {
    slug: "antes-de-actuar-amplia-el-examen",
    practiceSlug: "que-respuesta-puedo-justificar",
    title: "Antes de actuar, amplía el examen",
    summary:
      "Discernir no es encontrar «la emoción correcta». Vas a revisar una decisión con las preguntas que el capítulo propone.",
    duration: "8–10 minutos",
    intro: {
      title: "Más preguntas antes de actuar",
      body: [
        "Discernir no es encontrar «la emoción correcta». Vas a revisar una decisión con las preguntas que el capítulo propone.",
      ],
      note: "Trabajaremos con una decisión de ejemplo, no con una tuya.",
    },
    passage: {
      title: "¿Qué respuesta puedes justificar?",
      body: "Lee el paso donde el capítulo enumera qué considerar antes de elegir una respuesta.",
    },
    concept: {
      title: "La respuesta más rápida no es la más justificada",
      body: [
        "El capítulo pide no pensar únicamente en qué acción reduciría el malestar más rápido, y considerar la evidencia disponible, los valores elegidos, los derechos propios y ajenos, las consecuencias previsibles, las perspectivas que faltan y la propia responsabilidad.",
        "Escuchar una emoción, entonces, abre preguntas antes de cerrar una decisión.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "¿Qué respuesta puedo justificar?",
      body: [
        "Toma una conclusión rápida sobre qué hacer y sepárala en lo que observa, lo que supone y lo que faltaría para sostenerla.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 8, ¿qué añade el discernimiento antes de elegir una respuesta?",
      options: [
        {
          optionKey: "opcion-amplia",
          label:
            "Evidencia, valores elegidos, derechos, consecuencias, perspectivas que faltan y responsabilidad.",
        },
        {
          optionKey: "opcion-emocion-correcta",
          label:
            "Una manera de identificar cuál era la emoción correcta en esa situación.",
        },
        {
          optionKey: "opcion-rapidez",
          label:
            "Un criterio para elegir la acción que reduzca el malestar más rápido.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Antes de actuar conviene ampliar el examen: evidencia, valores elegidos, derechos, consecuencias, perspectivas que faltan y responsabilidad. Escuchar una emoción pide más preguntas, no menos.",
      ],
    },
  },
];

export const EEC_C08_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C08_MICROGUIDES.map((m) => microguidePresentation(EEC_C08, m));

export const EEC_C08_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C08_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C08, m));

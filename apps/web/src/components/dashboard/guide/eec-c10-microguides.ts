/**
 * EEC-C10's five microguides, as the browser needs them.
 *
 * GENERATED from `artifacts/eec/C10/v1.0/feelverse/guides/*.manifest.json`
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

const EEC_C10: MicroguideChapter = {
  keyPrefix: "eec-c10",
  chapterLabel: "capítulo 10",
};

export const EEC_C10_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "hacer-espacio-no-es-confirmar",
    practiceSlug: "de-minimizar-a-hacer-espacio",
    title: "Hacer espacio no es confirmar toda la historia",
    summary:
      "Corregir demasiado pronto puede dejar intacta la experiencia principal. Vas a transformar respuestas que minimizan o escalan en respuestas que hacen espacio.",
    duration: "8–10 minutos",
    intro: {
      title: "Reconocer antes de corregir",
      body: [
        "Corregir demasiado pronto puede dejar intacta la experiencia principal. Vas a transformar respuestas que minimizan o escalan en respuestas que hacen espacio.",
      ],
      note: "Trabajaremos con la escena del capítulo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Hacer espacio a la experiencia",
      body: "Lee la sección donde el capítulo muestra qué pasa cuando se empieza discutiendo la interpretación.",
    },
    concept: {
      title: "Validar la experiencia no valida la interpretación",
      body: [
        "«Seguro no todos se ríen de ti» puede ser cierto y, dicho demasiado pronto, deja sin atender lo principal: algo ocurrió y dolió.",
        "Hacer espacio no significa confirmar toda la historia. Reconocer que algo afectó a alguien puede ocurrir antes de decidir si su interpretación es correcta.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "De minimizar a hacer espacio",
      body: [
        "Ordena varias respuestas según cuánto reconocen la experiencia sin cerrar la interpretación, y marca cuándo falta información.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 10, hacer espacio a la experiencia de alguien valida…",
      options: [
        {
          optionKey: "opcion-experiencia",
          label:
            "Que algo le afectó; no confirma que su interpretación de lo ocurrido sea correcta.",
        },
        {
          optionKey: "opcion-toda-historia",
          label:
            "Toda su versión de los hechos, porque de otro modo no se sentiría acompañado.",
        },
        {
          optionKey: "opcion-nada",
          label:
            "Nada todavía: primero hay que averiguar si la interpretación es correcta.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Hacer espacio no es confirmar toda la historia. Reconocer el impacto y examinar la interpretación son dos momentos distintos, y el primero no obliga al segundo.",
      ],
    },
  },
  {
    slug: "no-narrador-de-la-mente-ajena",
    practiceSlug: "observacion-interpretacion-pregunta-falta",
    title: "No te conviertas demasiado pronto en narrador de la mente ajena",
    summary:
      "Acompañar no exige explicar qué siente la otra persona ni por qué. Vas a separar observación, interpretación de quien acompaña, pregunta que aclara e información que falta.",
    duration: "8–10 minutos",
    intro: {
      title: "Explicar por el otro",
      body: [
        "Acompañar no exige explicar qué siente la otra persona ni por qué. Vas a separar observación, interpretación de quien acompaña, pregunta que aclara e información que falta.",
      ],
      note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "No te conviertas en narrador oficial de la mente ajena",
      body: "Lee el punto donde el capítulo contrasta «te dolió que no te invitaran» con «te excluyeron porque no te valoran».",
    },
    concept: {
      title: "Reconocer sin cerrar la historia",
      body: [
        "Sentir algo no convierte automáticamente una interpretación en un hecho, y eso vale también para quien acompaña.",
        "La regla que el capítulo propone es sencilla: reconocer la experiencia sin convertirse demasiado pronto en narrador oficial de la mente ajena. Nombrar el impacto es una cosa; atribuir intenciones a terceros es otra.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Observación, interpretación, pregunta y lo que falta",
      body: [
        "Separa una escena de acompañamiento en cuatro campos y elige una formulación que no cierre la historia antes de conocerla.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 10, ¿qué evita quien acompaña sin convertirse en narrador de la mente ajena?",
      options: [
        {
          optionKey: "opcion-no-cierra",
          label:
            "Cerrar la historia antes de conocerla, atribuyendo intenciones a terceros que nadie ha comprobado.",
        },
        {
          optionKey: "opcion-no-nombra",
          label:
            "Nombrar cualquier emoción, porque hacerlo siempre condiciona a la otra persona.",
        },
        {
          optionKey: "opcion-no-pregunta",
          label:
            "Hacer preguntas, ya que preguntar puede parecer una duda sobre su relato.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Acompañar no exige explicar por la otra persona qué siente ni qué intención tuvo un tercero. Reconocer el impacto y dejar la historia abierta caben en la misma frase.",
      ],
    },
  },
  {
    slug: "emocion-si-conducta-con-limites",
    practiceSlug: "experiencia-impulso-limite-alternativa",
    title: "La emoción puede estar; la conducta sigue teniendo límites",
    summary:
      "Poner un límite a una conducta no exige negar la emoción que la acompaña. Vas a separar experiencia, impulso, límite y alternativa.",
    duration: "8–10 minutos",
    intro: {
      title: "La emoción puede estar",
      body: [
        "Poner un límite a una conducta no exige negar la emoción que la acompaña. Vas a separar experiencia, impulso, límite y alternativa.",
      ],
      note: "Trabajaremos con la escena del capítulo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Poner límites a la conducta sin castigar la emoción",
      body: "Lee la respuesta que el capítulo propone ante «voy a destrozarlos en el chat» y las tres cosas que separa.",
    },
    concept: {
      title: "Validar la experiencia no permite cualquier conducta",
      body: [
        "«Puedes estar furioso. No vamos a enviar amenazas. Veamos primero qué ocurrió y qué necesitas» sostiene tres cosas a la vez: la emoción puede estar presente, la conducta tiene un límite y sigue habiendo algo que entender.",
        "Aquí la escucha no basta por sí sola, y el límite no requiere castigar lo que la persona siente.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Experiencia, impulso, límite y alternativa",
      body: [
        "Separa una escena en cuatro campos y elige una alternativa conductual que no niegue la emoción.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 10, ¿qué relación hay entre validar una emoción y permitir una conducta?",
      options: [
        {
          optionKey: "opcion-distintas",
          label:
            "Son cosas distintas: la emoción puede estar presente y la conducta seguir teniendo límites.",
        },
        {
          optionKey: "opcion-implica",
          label:
            "Validar la emoción implica aceptar la conducta que viene con ella.",
        },
        {
          optionKey: "opcion-castigar",
          label:
            "Para poner un límite eficaz hay que dejar claro que esa emoción no corresponde.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Sentir, querer hacer algo y hacerlo son cosas distintas. Validar una experiencia no equivale a permitir una conducta, y poner un límite no exige castigar la emoción.",
      ],
    },
  },
  {
    slug: "ayudar-sin-borrar-la-agencia",
    practiceSlug: "escuchar-opciones-o-intervenir",
    title: "Ayudar sin borrar la agencia",
    summary:
      "Escuchar, ofrecer opciones o intervenir son niveles distintos de ayuda. Vas a comparar cuál conserva participación sin abandonar a la persona.",
    duration: "8–10 minutos",
    intro: {
      title: "Ayudar sin decidir por el otro",
      body: [
        "Escuchar, ofrecer opciones o intervenir son niveles distintos de ayuda. Vas a comparar cuál conserva participación sin abandonar a la persona.",
      ],
      note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Ajustar ayuda y agencia",
      body: "Lee la sección donde el capítulo muestra la pregunta que ofrece una elección dentro de una situación difícil.",
    },
    concept: {
      title: "El nivel de ayuda depende del contexto",
      body: [
        "La prisa por ayudar también puede quitar algo: hablar por la otra persona, resolver cada conflicto o decidir siempre qué debe hacer. A veces eso es necesario; otras, ayudar mejor significa devolver participación.",
        "«¿Quieres que te escuche, que pensemos opciones o que intervenga contigo?» no abandona: ofrece una elección pequeña. Qué nivel corresponde depende de la edad, el riesgo, el poder y el contexto.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "¿Escuchar, ofrecer opciones o intervenir?",
      body: [
        "Ordena varias formas de ayuda según cuánta participación conservan y marca cuándo el riesgo cambia la respuesta adecuada.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 10, ¿de qué depende el nivel de ayuda adecuado al acompañar a alguien?",
      options: [
        {
          optionKey: "opcion-contexto",
          label:
            "De la edad, el riesgo, el poder y el contexto: escuchar, ofrecer opciones o intervenir no son intercambiables.",
        },
        {
          optionKey: "opcion-maximo",
          label:
            "Conviene siempre el nivel máximo: resolverlo evita sufrimiento innecesario.",
        },
        {
          optionKey: "opcion-minimo",
          label:
            "Conviene siempre escuchar sin intervenir, para no quitar autonomía.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Ayudar bien puede significar escuchar, ofrecer opciones o intervenir. Conservar la participación de la persona no es abandonarla, y el nivel adecuado depende del riesgo y del contexto.",
      ],
    },
  },
  {
    slug: "cambiar-el-escenario",
    practiceSlug: "habilidad-o-condicion",
    title: "A veces hay que cambiar el escenario",
    summary:
      "Enseñar una habilidad puede ayudar y no siempre alcanza. Vas a comparar dos puertas: la habilidad individual y la condición del entorno.",
    duration: "8–10 minutos",
    intro: {
      title: "La habilidad y el suelo mojado",
      body: [
        "Enseñar una habilidad puede ayudar y no siempre alcanza. Vas a comparar dos puertas: la habilidad individual y la condición del entorno.",
      ],
      note: "Trabajaremos con escenas de ejemplo. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Mirar también el escenario",
      body: "Lee la sección donde el capítulo compara enseñar equilibrio con secar el suelo.",
    },
    concept: {
      title: "Aprender equilibrio importa; secar el suelo también",
      body: [
        "Una buena estrategia para manejar la ira puede ayudar y no sería suficiente si existe acoso. Es como enseñar equilibrio mientras el suelo continúa mojado.",
        "Lo mismo ocurre donde alguien debe mantener siempre la calma para evitar la violencia de otra persona, o donde pedir ayuda tiene costo. A veces hace falta ampliar una habilidad, y a veces cambiar la condición que la exige.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "¿Habilidad individual o condición del entorno?",
      body: [
        "Compara dos puertas ante una misma situación y elige qué factores indicarían que hacen falta las dos.",
      ],
      note: "Es una comparación entre ejemplos; no es un diagnóstico de tu entorno.",
    },
    recall: {
      question:
        "Según el capítulo 10, enseñar a alguien a regularse mejor ante un problema que se repite…",
      options: [
        {
          optionKey: "opcion-no-sustituye",
          label:
            "Puede ayudar y no sustituye modificar la condición que genera el problema una y otra vez.",
        },
        {
          optionKey: "opcion-suficiente",
          label:
            "Es suficiente: con la habilidad adecuada, cualquier entorno se vuelve manejable.",
        },
        {
          optionKey: "opcion-inutil",
          label:
            "Es inútil mientras el entorno no cambie, así que conviene no enseñar nada.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Enseñar habilidades individuales no sustituye cambiar lo que genera el problema una y otra vez. «Regularte mejor» no puede ser la única respuesta a algo estructural.",
      ],
    },
  },
];

export const EEC_C10_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C10_MICROGUIDES.map((m) => microguidePresentation(EEC_C10, m));

export const EEC_C10_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C10_MICROGUIDES.map((m) => microguideReaderCopy(EEC_C10, m));

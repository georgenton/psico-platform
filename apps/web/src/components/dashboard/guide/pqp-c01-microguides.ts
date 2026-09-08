/**
 * PQP-C01's four microguides, as the browser needs them.
 *
 * Same rule as every EEC route: every string is copied from an approved source
 * and nothing is composed here.
 *
 *   - scene titles, bodies and notes come from the manifests in
 *     `artifacts/pqp/C01/v1.0/feelverse/guides/`, which are the artifacts the
 *     four DRAFTs are created from;
 *   - `title` and `duration` are the approved editorial inventory's (PQP-C01 —
 *     Inventario editorial y diseño de experiencia v0.1, 2026-09-07);
 *   - `summary` is the intro's own opening line, so the route card says what the
 *     guide says it will do rather than a second sentence written for the card;
 *   - the recall question and its three option labels are the PUBLIC half of the
 *     server-side recall catalog. Nothing in this file knows which option is
 *     correct, so nothing here could leak it.
 *
 * Four, not five. The chapter sustained four defensible ideas; the shared-novelty
 * idea stayed in reading rather than being stretched into a fifth.
 *
 * The extra scenes each Experience has — REFLECTION in all four, QUESTION in
 * MG01, EXAMPLE in MG03 — live in the stored definition and are drawn by the
 * player from there. They are deliberately absent from this table: a guide has
 * three obligatory steps, and those scenes are optional by design. Turning them
 * into extra steps here would make an optional invitation a requirement for
 * finishing.
 */

import type { GuidePresentation } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";
import {
  microguidePresentation,
  microguideReaderCopy,
  type MicroguideChapter,
  type MicroguideEntry,
} from "./guide-microguide-bundle";

const PQP_C01: MicroguideChapter = {
  // The EDITORIAL chapter number, matching the book's own numbering and the
  // guide keys. Its PLATFORM order is 2 — unit 1 is the front matter.
  keyPrefix: "pqp-c1",
  chapterLabel: "capítulo 1",
};

export const PQP_C01_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "amor-como-practica",
    practiceSlug: "orden-de-lo-cotidiano",
    title: "El amor se practica",
    summary:
      "El capítulo abre con una idea que es más exigente de lo que parece: además de sentirse, el amor se hace. Vas a mirar de cerca qué significa eso en la vida diaria de una pareja.",
    duration: "8–10 minutos",
    intro: {
      title: "El amor se practica",
      body: [
        "El capítulo abre con una idea que es más exigente de lo que parece: además de sentirse, el amor se hace. Vas a mirar de cerca qué significa eso en la vida diaria de una pareja.",
      ],
      note: "Trabajaremos con una pareja inventada para el ejercicio, no con tu historia. Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.",
    },
    passage: {
      title: "El Amor como Medicina",
      body: "Lee la sección donde el capítulo narra el caso de una pareja que cambia dos cosas pequeñas de su rutina, y fíjate en la frase con la que cierra.",
    },
    concept: {
      title: "Un verbo, además de un sustantivo",
      body: [
        "La idea que sostiene el capítulo es que un vínculo duradero también se construye con conductas pequeñas y repetidas, no solo con la intensidad de lo que una persona siente.",
        "Eso no vuelve irrelevante el sentimiento. Lo que propone es un desplazamiento de atención: de «cuánto quiero a esta persona» a «qué hago, y con qué frecuencia, para que eso se note».",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti ni sobre tu relación.",
    },
    practice: {
      title: "El orden de lo cotidiano",
      body: [
        "Ordena los cuatro pasos de una pareja inventada para este ejercicio y observa dónde queda la repetición dentro de la secuencia.",
      ],
      note: "Es un caso editorial, no tu relación. Puedes elegir entre las opciones sugeridas.",
    },
    recall: {
      question:
        "Según la idea central de este capítulo, ¿de qué depende principalmente un amor que dura?",
      options: [
        {
          optionKey: "pqp-opcion-conductas-repetidas",
          label:
            "De practicar de forma repetida conductas de cuidado y conexión.",
        },
        {
          optionKey: "pqp-opcion-enamoramiento-permanente",
          label:
            "De mantener permanentemente la intensidad del enamoramiento inicial.",
        },
        {
          optionKey: "pqp-opcion-evitar-conflictos",
          label: "De evitar los conflictos para que no dañen el vínculo.",
        },
      ],
    },
    summaryScene: {
      title: "Recordar no es transformar",
      body: [
        "Has trabajado la idea de que el amor duradero también se practica: se sostiene en conductas cotidianas y repetidas.",
        "Recordar una idea no es lo mismo que transformar una relación. Lo que sigue no es saber más, sino elegir algo pequeño y sostenerlo.",
      ],
    },
  },
  {
    slug: "presencia-sin-acuerdo",
    practiceSlug: "lo-que-se-y-lo-que-supongo",
    title: "Presencia sin acuerdo",
    summary:
      "Cuando hay un desacuerdo, lo primero que suele aparecer es la urgencia de resolverlo. Esta guía trabaja una distinción que el capítulo propone: permanecer presente y resolver no son la misma cosa.",
    duration: "8–10 minutos",
    intro: {
      title: "Presencia sin acuerdo",
      body: [
        "Cuando hay un desacuerdo, lo primero que suele aparecer es la urgencia de resolverlo. Esta guía trabaja una distinción que el capítulo propone: permanecer presente y resolver no son la misma cosa.",
      ],
      note: "Trabajaremos con una escena inventada para el ejercicio. Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.",
    },
    passage: {
      title: "El Cerebro Enamorado",
      body: "Lee la sección donde el capítulo describe un estudio hecho con parejas que estaban en conflicto, y fíjate en qué se les pidió y en qué NO se les pidió.",
    },
    concept: {
      title: "Estar no es haber arreglado",
      body: [
        "En un desacuerdo, mantener señales de conexión y presencia puede ser distinto de resolver de inmediato el problema. Son dos cosas separadas, y confundirlas hace que una pareja sienta que no puede acercarse hasta tener razón.",
        "Conflicto y conexión tampoco son necesariamente opuestos: se puede estar en desacuerdo y a la vez sostener señales de vínculo y de respeto.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa tu forma de discutir ni infiere nada sobre tu relación.",
    },
    practice: {
      title: "Lo que sé y lo que supongo",
      body: [
        "Una escena breve: alguien se sienta cerca de su pareja después de una discusión sin resolver, y no dice nada. Separa lo que la escena dice de lo que estarías añadiendo tú.",
      ],
      note: "Es un caso editorial, no tu relación. Ninguna lectura se marca como equivocada: el ejercicio es notar cuáles no están en la escena.",
    },
    recall: {
      question:
        "¿Qué idea describe mejor la relación entre conflicto y seguridad emocional?",
      options: [
        {
          optionKey: "pqp-opcion-atravesar-conservando",
          label:
            "Una relación puede atravesar un conflicto y, al mismo tiempo, intentar conservar señales de vínculo y respeto.",
        },
        {
          optionKey: "pqp-opcion-sin-conflictos",
          label: "Una relación segura nunca tiene conflictos.",
        },
        {
          optionKey: "pqp-opcion-evitar-hasta-que-pase",
          label:
            "La mejor forma de proteger una relación es evitar las conversaciones difíciles hasta que el malestar desaparezca.",
        },
      ],
    },
    summaryScene: {
      title: "Estar, antes que arreglar",
      body: [
        "Presencia y resolución son cosas distintas, y una relación puede atravesar un desacuerdo sin renunciar a todas las señales de vínculo.",
        "Si algo de esto te resultó difícil de leer, es información sobre el momento, no un diagnóstico de tu relación.",
      ],
    },
  },
  {
    slug: "clima-que-aprenden",
    practiceSlug: "misma-escena-dos-lecturas",
    title: "Lo que aprenden mirando",
    summary:
      "Esta guía trabaja qué se aprende de una relación observándola, y por qué la misma escena no enseña siempre lo mismo.",
    duration: "8–10 minutos",
    intro: {
      title: "Lo que aprenden mirando",
      body: [
        "Esta guía trabaja qué se aprende de una relación observándola, y por qué la misma escena no enseña siempre lo mismo.",
      ],
      note: "Esto no es una evaluación de tu crianza. Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.",
    },
    passage: {
      title: "Los Hijos",
      body: "Lee la sección donde el capítulo presenta un seguimiento a lo largo de los años sobre lo que niñas y niños absorben de las relaciones que tienen cerca.",
    },
    concept: {
      title: "El currículo que nadie dicta",
      body: [
        "Lo que niños y adolescentes observan en las relaciones cercanas contribuye a las ideas que van formando sobre el afecto, el conflicto, el cuidado y la reparación.",
        "Contribuye: no es la única fuente, no es necesariamente la principal, y ninguna escena aislada determina lo que alguien entenderá por amor. Lo que se repite pesa más que lo que ocurre una vez.",
      ],
      note: "Esto no es una evaluación de tu crianza ni significa que una interacción aislada determine lo que un hijo aprenderá sobre las relaciones.",
    },
    practice: {
      title: "La misma escena, dos contextos",
      body: [
        "Las mismas tres señales en dos situaciones distintas. Observa qué podría cambiar en lo que alguien alcanza a aprender de ellas.",
      ],
      note: "Son escenas editoriales, no tu familia. Nada se marca como correcto o incorrecto.",
    },
    recall: {
      question:
        "Según la idea trabajada en esta guía, ¿qué puede contribuir a lo que niños y adolescentes aprenden sobre las relaciones?",
      options: [
        {
          optionKey: "pqp-opcion-tambien-lo-observado",
          label:
            "También lo que observan en cómo las personas cercanas se tratan, atraviesan desacuerdos y reparan.",
        },
        {
          optionKey: "pqp-opcion-solo-explicaciones",
          label: "Solo las explicaciones explícitas que reciben sobre el amor.",
        },
        {
          optionKey: "pqp-opcion-una-discusion-define",
          label:
            "Una única discusión familiar define cómo entenderán sus relaciones en el futuro.",
        },
      ],
    },
    summaryScene: {
      title: "Contribuye, no determina",
      body: [
        "Lo observado se suma a lo que se dice, y la reparación es parte de lo que se observa.",
        "La palabra que sostiene toda la idea es «contribuye»: nadie queda definido por una escena.",
      ],
    },
  },
  {
    slug: "reinventar-el-vinculo",
    practiceSlug: "lo-que-dejo-de-funcionar",
    title: "Cuando el amor se reinventa",
    summary:
      "Esta guía trabaja qué puede ocurrir cuando una forma habitual de estar cerca deja de ser posible.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuando el amor se reinventa",
      body: [
        "Esta guía trabaja qué puede ocurrir cuando una forma habitual de estar cerca deja de ser posible.",
      ],
      note: "Puede tocar recuerdos difíciles. Todas las preguntas son opcionales y puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.",
    },
    passage: {
      title: "Un testimonio del autor",
      body: "Lee el testimonio en primera persona con el que el autor cierra el capítulo, y fíjate en la frase final.",
    },
    concept: {
      title: "Otra forma de sostener lo mismo",
      body: [
        "Cuando una forma habitual de expresar conexión deja de ser posible, una pareja puede buscar otras maneras de cuidar el vínculo.",
        "Es una posibilidad, no una obligación ni una receta que sirva igual en toda situación. Hay circunstancias en las que lo que hace falta no es reinventar nada, sino tiempo o ayuda.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa cómo atravesaste tus propias crisis.",
    },
    practice: {
      title: "Cuando una forma deja de ser posible",
      body: [
        "Ordena la secuencia de una pareja inventada para este ejercicio, y fíjate especialmente en el paso que suele saltarse.",
      ],
      note: "Es un caso editorial, no tu historia.",
    },
    recall: {
      question:
        "¿Qué ocurre cuando una pareja atraviesa una dificultad que impide mantener una forma habitual de conexión?",
      options: [
        {
          optionKey: "pqp-opcion-otra-manera",
          label:
            "Pueden buscar otra manera de sostener el vínculo mientras esa forma no sea posible.",
        },
        {
          optionKey: "pqp-opcion-deterioro-inevitable",
          label: "Significa que la relación se está deteriorando.",
        },
        {
          optionKey: "pqp-opcion-esperar",
          label:
            "Deben esperar sin hacer nada hasta que las circunstancias vuelvan a permitirlo.",
        },
      ],
    },
    summaryScene: {
      title: "Inventar, no volver",
      body: [
        "Cuando una forma de cuidarse deja de ser posible, puede aparecer otra. Buscarla es una opción disponible, no una prueba que haya que aprobar.",
        "Con esto cierras el recorrido del capítulo.",
      ],
    },
  },
];

export const PQP_C01_PRESENTATIONS: readonly GuidePresentation[] =
  PQP_C01_MICROGUIDES.map((m) => microguidePresentation(PQP_C01, m));

export const PQP_C01_READER_COPY: readonly GuideReaderCopy[] =
  PQP_C01_MICROGUIDES.map((m) => microguideReaderCopy(PQP_C01, m));

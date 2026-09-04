/**
 * EEC-C01's five microguides, as the browser needs them.
 *
 * Every string here is copied from an approved source and nothing is composed:
 *
 *   - the scene titles, bodies, notes and action labels come from the
 *     manifests in `artifacts/eec/C01/v1.0/feelverse/guides/`;
 *   - the recall question and its three option labels are the PUBLIC half of
 *     the server-side recall catalog. The correct option is not among them, and
 *     nothing in this file knows which one it is, so nothing here could leak it.
 *
 * One table, two shapes. The registries want a `GuidePresentation` (what the
 * player draws) and a `GuideReaderCopy` (what the reader panel says), and both
 * are built from the same entry below — because two hand-written copies of the
 * same approved sentence are two chances to drift from it.
 */

import type { GuidePresentation } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";
import { READER_GUIDE_SHARED } from "./guide-reader-shared";

interface MicroguideEntry {
  slug: string;
  practiceSlug: string;
  title: string;
  /** The route card's one-liner. Same words the route endpoint serves. */
  summary: string;
  duration: string;
  intro: { title: string; body: readonly string[]; note: string };
  passage: { title: string; body: string };
  concept: {
    title: string;
    body: readonly string[];
    note: string;
  };
  practice: { title: string; body: readonly string[]; note: string };
  recall: {
    question: string;
    options: readonly { optionKey: string; label: string }[];
  };
  summaryScene: { title: string; body: readonly string[] };
}

export const EEC_C01_MICROGUIDES: readonly MicroguideEntry[] = [
  {
    slug: "teorias-como-lentes",
    practiceSlug: "revisar-un-lente",
    title: "Las teorías son lentes, no la escena",
    summary:
      "Cada teoría responde a ciertas preguntas e ilumina una parte. Revisa " +
      "una creencia cotidiana separando lo que observas de lo que supones.",
    duration: "7–9 minutos",
    intro: {
      title: "Lo que una teoría alcanza a mirar",
      body: [
        "Vas a revisar una creencia cotidiana sobre las emociones con tres " +
          "preguntas: qué se observa, qué se está suponiendo y qué contexto falta.",
      ],
      note: "Trabajaremos con frases de uso común, no con tu historia personal. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Distintas lentes para comprender una emoción",
      body:
        "Lee la sección donde el capítulo compara las teorías con mapas: cada " +
        "una resalta ciertos caminos y deja otros con menos detalle.",
    },
    concept: {
      title: "Una teoría responde a una pregunta",
      body: [
        "Las teorías sobre las emociones no son opiniones sueltas: son " +
          "explicaciones organizadas a partir de preguntas, observaciones y " +
          "métodos distintos. Por eso compararlas no consiste en buscar de " +
          "inmediato una ganadora, sino en entender qué problema intentaba " +
          "resolver cada una.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
    },
    practice: {
      title: "Revisa un lente",
      body: [
        "Toma una frase de uso común sobre las emociones y sepárala en tres: " +
          "qué se observa realmente, qué se está suponiendo y qué contexto " +
          "haría falta para saberlo.",
      ],
      note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
    },
    recall: {
      question:
        "Según el capítulo 1, ¿por qué comparar dos teorías de la emoción no " +
        "consiste en buscar de inmediato una ganadora?",
      options: [
        {
          optionKey: "opcion-preguntas-distintas",
          label:
            "Porque cada una se organizó alrededor de preguntas, " +
            "observaciones y métodos distintos, así que primero hay que " +
            "entender qué problema intentaba resolver cada una.",
        },
        {
          optionKey: "opcion-todas-igual-validas",
          label:
            "Porque todas las teorías son igualmente válidas y elegir entre " +
            "ellas es solo cuestión de preferencia personal.",
        },
        {
          optionKey: "opcion-falta-evidencia",
          label:
            "Porque todavía no existe evidencia suficiente sobre las " +
            "emociones y por eso ninguna teoría puede compararse con otra.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "Antes de preguntar cuál teoría gana, conviene saber qué problema " +
          "intentaba resolver cada una. Eso no las vuelve equivalentes: las " +
          "vuelve comparables.",
      ],
    },
  },
  {
    slug: "rostro-como-pista",
    practiceSlug: "una-sonrisa-varios-contextos",
    title: "El rostro es una pista, no un diccionario",
    summary:
      "Una misma expresión cambia de sentido según la persona y la situación. " +
      "Compara varias lecturas plausibles de una sonrisa.",
    duration: "8–10 minutos",
    intro: {
      title: "Una sonrisa, varios contextos",
      body: [
        "Vas a comparar lecturas posibles de una misma expresión. No se trata " +
          "de acertar la emoción, sino de notar cuánta información aporta un " +
          "rostro y dónde termina.",
      ],
      note: "Usaremos escenas cotidianas y ajenas. No necesitas traer ninguna situación tuya.",
    },
    passage: {
      title: "Paul Ekman: el rostro como pista",
      body:
        "Lee la sección sobre Ekman. El capítulo reconoce el aporte del rostro " +
        "y también dónde la lectura directa se queda corta.",
    },
    concept: {
      title: "Pista, no diccionario",
      body: [
        "Un movimiento facial aporta información, pero su significado depende " +
          "de la persona, la situación y lo ocurrido antes. Un rostro ofrece " +
          "pistas; no entrega una lectura completa de la experiencia.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa tu capacidad de leer a nadie.",
    },
    practice: {
      title: "Una sonrisa, varios contextos",
      body: [
        "Ante una sonrisa en un contexto concreto, separa cuatro cosas: qué se " +
          "observa, qué contexto tienes disponible, qué interpretaciones son " +
          "plausibles y qué información falta.",
        "Que haya varias lecturas posibles no significa que todas sean igual " +
          "de probables: unas encajan mejor con el contexto disponible que otras.",
      ],
      note: "Hay una alternativa sin arrastrar: puedes clasificar cada lectura como más plausible, posible o falta información.",
    },
    recall: {
      question:
        "Según el capítulo 1, ¿qué nos permite y qué no nos permite concluir " +
        "una expresión facial?",
      options: [
        {
          optionKey: "opcion-pista-sin-lectura",
          label:
            "Aporta información útil sobre lo que puede estar ocurriendo, " +
            "pero no entrega por sí sola una lectura completa de la " +
            "experiencia de esa persona.",
        },
        {
          optionKey: "opcion-diccionario-universal",
          label:
            "Permite identificar la emoción exacta que siente la persona, " +
            "porque las expresiones significan lo mismo en todas las culturas.",
        },
        {
          optionKey: "opcion-no-informa-nada",
          label:
            "No aporta ninguna información fiable, porque el rostro se " +
            "controla voluntariamente casi siempre.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "El rostro informa. Lo que no hace es cerrar por sí solo la pregunta " +
          "de qué está sintiendo alguien, y esa distinción cambia cómo escuchas.",
      ],
    },
  },
  {
    slug: "alarma-antes-del-relato",
    practiceSlug: "ordenar-alarma-y-relato",
    title: "La alarma antes del relato",
    summary:
      "Una respuesta de protección puede empezar antes de que entiendas qué " +
      "pasa. Ordena la secuencia entre señal, reacción, contexto e interpretación.",
    duration: "8–10 minutos",
    intro: {
      title: "Cuando reaccionas antes de entender",
      body: [
        "A veces el organismo se prepara antes de que alcances a explicar qué " +
          "ocurrió. En esta guía distinguirás esa respuesta rápida de la " +
          "emoción consciente que después puedes reconocer y nombrar.",
      ],
      note: "Trabajaremos con situaciones hipotéticas y cotidianas. No necesitas recordar una experiencia difícil. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Una alarma antes de la historia",
      body:
        "Lee el pasaje donde el capítulo presenta la propuesta de Joseph " +
        "LeDoux. Mientras avanzas, busca una diferencia: responder rápidamente " +
        "a una señal no es todavía lo mismo que saber qué sientes.",
    },
    concept: {
      title: "Protegerse no es lo mismo que sentir miedo",
      body: [
        "Una señal repentina puede iniciar una respuesta protectora antes de " +
          "que comprendas la situación. Después, al integrar el contexto, los " +
          "recuerdos y los conceptos disponibles, puedes reconocer la " +
          "experiencia como miedo, sobresalto, alivio u otra cosa. La reacción " +
          "aporta información, pero no revela por sí sola una emoción completa.",
        "Esta es una secuencia pedagógica para distinguir procesos " +
          "relacionados; no una cadena cerebral rígida que funcione igual en " +
          "todas las personas y situaciones.",
      ],
      note: "Marcar esta escena registra que exploraste el concepto; no evalúa lo que sentiste ni infiere un estado psicológico.",
    },
    practice: {
      title: "Ordena la alarma y el relato",
      body: [
        "Imagina que lees tranquilamente y una puerta se cierra de golpe. " +
          "Ordena las tarjetas según el modelo de esta guía. No buscamos " +
          "reconstruir cada milisegundo del cerebro, sino distinguir partes que " +
          "suelen confundirse.",
      ],
      note: "Puedes ver el ejemplo resuelto y continuar sin penalización. Confirmar registra únicamente que hiciste la práctica.",
    },
    recall: {
      question:
        "Según el capítulo 1, ¿qué diferencia hay entre una respuesta rápida " +
        "de protección y sentir miedo?",
      options: [
        {
          optionKey: "opcion-reconocer-esto-me-asusta",
          label:
            "La respuesta de protección puede empezar antes de entender qué " +
            "pasa; sentir miedo incluye además reconocer de alguna manera " +
            "«esto me asusta».",
        },
        {
          optionKey: "opcion-amigdala-produce-miedo",
          label:
            "No hay diferencia: la amígdala produce el miedo y la reacción " +
            "del cuerpo es ese mismo miedo.",
        },
        {
          optionKey: "opcion-miedo-primero",
          label:
            "Primero se siente el miedo de forma consciente y solo después el " +
            "cuerpo organiza una respuesta de protección.",
        },
      ],
    },
    summaryScene: {
      title: "Una alarma no cuenta toda la historia",
      body: [
        "Antes de concluir «esto es miedo», conviene separar tres cosas: la " +
          "reacción que apareció, lo que el contexto mostró y el significado " +
          "que después tomó la experiencia. La respuesta protectora es real; " +
          "no es, por sí sola, toda la emoción.",
        "En las siguientes microguías veremos por qué observar una expresión " +
          "o sentir un impulso tampoco basta para leer una emoción completa.",
      ],
    },
  },
  {
    slug: "emocion-informa-no-manda",
    practiceSlug: "siento-interpreto-impulso-elijo",
    title: "La emoción informa; no manda",
    summary:
      "Sentir, interpretar, querer hacer y elegir son cosas distintas. " +
      "Sepáralas en una situación cotidiana y leve.",
    duration: "10–12 minutos",
    intro: {
      title: "Sentir, interpretar, querer, elegir",
      body: [
        "Vas a separar cuatro cosas que solemos juntar: lo que sientes, cómo " +
          "lo interpretas, qué impulso aparece y qué eliges hacer.",
      ],
      note: "La situación es cotidiana y leve, y la ponemos nosotros. Puedes salir y volver cuando quieras.",
    },
    passage: {
      title: "Una emoción no es una conducta",
      body:
        "Esta microguía se apoya en dos secciones del capítulo que sostienen " +
        "la misma idea desde ángulos distintos: Goleman, sobre la diferencia " +
        "entre reconocer, expresar y actuar; y Damasio, sobre cómo las señales " +
        "afectivas marcan qué es relevante sin decidir por ti.",
    },
    concept: {
      title: "Informa; no manda",
      body: [
        "Una emoción aporta información y señala qué es relevante. No dicta " +
          "por sí sola la decisión: sentir, interpretar, tener un impulso y " +
          "elegir una conducta son procesos distintos, y entre el último y los " +
          "anteriores hay un espacio.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa tus decisiones ni las califica.",
    },
    practice: {
      title: "Siento, interpreto, impulso, elijo",
      body: [
        "Sobre esa situación, completa cuatro campos: siento, interpreto, " +
          "tengo ganas de, elijo hacer.",
      ],
      note: "Lo que elijas no es un diagnóstico ni una recomendación de conducta. Si escribes, tu texto se queda en tu dispositivo.",
    },
    recall: {
      question:
        "Según el capítulo 1, ¿qué relación hay entre una emoción y la " +
        "conducta que sigue?",
      options: [
        {
          optionKey: "opcion-informa-no-dicta",
          label:
            "La emoción aporta información y señala qué es relevante, pero no " +
            "dicta por sí sola la decisión: sentir, interpretar, tener un " +
            "impulso y elegir son procesos distintos.",
        },
        {
          optionKey: "opcion-emocion-determina",
          label:
            "La emoción determina la conducta: si la señal es intensa, la " +
            "acción que sigue es la única posible.",
        },
        {
          optionKey: "opcion-ignorar-emocion",
          label:
            "Para decidir bien conviene dejar la emoción fuera, porque " +
            "interfiere con el razonamiento.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "La emoción orienta hacia lo que importa. Entre esa orientación y la " +
          "conducta hay un espacio, y ese espacio es donde se decide.",
      ],
    },
  },
  {
    slug: "construida-no-significa-falsa",
    practiceSlug: "senales-y-contextos",
    title: "Construida no significa falsa",
    summary:
      "Las mismas señales del cuerpo pueden significar cosas distintas según " +
      "el contexto. Eso no vuelve la emoción irreal ni voluntaria.",
    duration: "9–11 minutos",
    intro: {
      title: "Construida no significa falsa",
      body: [
        "Vas a comparar unas mismas señales del cuerpo en dos contextos " +
          "distintos y a notar qué información cambia su significado.",
      ],
      note: "Los dos escenarios los ponemos nosotros. No hace falta que traigas nada tuyo.",
    },
    passage: {
      title: "Lisa Feldman Barrett: la emoción como construcción",
      body:
        "Lee la sección sobre Barrett, incluida la escena del rubor y las " +
        "mariposas que terminaron siendo gripe.",
    },
    concept: {
      title: "Real, y no elegida",
      body: [
        "Las emociones se forman con señales reales del cuerpo, percepción, " +
          "memoria, conceptos aprendidos y contexto. Construir una emoción no " +
          "significa inventarla: sigue siendo real, se siente en el cuerpo y no " +
          "se elige a voluntad.",
        "El construccionismo es el mapa principal de este libro, no un " +
          "consenso científico cerrado.",
      ],
      note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sientes.",
    },
    practice: {
      title: "Señales y contextos",
      body: [
        "Ante esas señales ambiguas en dos contextos, identifica qué " +
          "información hace que signifiquen cosas distintas: la situación, el " +
          "aprendizaje previo, la expectativa, los recuerdos disponibles o la " +
          "información nueva.",
      ],
      note: "No hay una única respuesta correcta; la práctica registra únicamente que la hiciste.",
    },
    recall: {
      question:
        "Según el capítulo 1, ¿qué quiere decir que una emoción sea " +
        "«construida»?",
      options: [
        {
          optionKey: "opcion-real-y-no-elegida",
          label:
            "Que se forma con señales reales del cuerpo, memoria, conceptos " +
            "aprendidos y contexto — sigue siendo real y no se elige a voluntad.",
        },
        {
          optionKey: "opcion-inventada",
          label:
            "Que en realidad es imaginaria: si la construimos nosotros, no " +
            "corresponde a nada que esté ocurriendo de verdad.",
        },
        {
          optionKey: "opcion-controlable",
          label:
            "Que podemos decidir conscientemente qué emoción sentir en cada " +
            "momento si nos lo proponemos.",
        },
      ],
    },
    summaryScene: {
      title: "Lo que te llevas",
      body: [
        "«Construida» no es lo contrario de «real». Señales del cuerpo, " +
          "contexto, memoria y conceptos participan a la vez, y por eso la " +
          "misma sensación puede significar cosas distintas.",
      ],
    },
  },
];

const LABELS = {
  start: "Empezar guía",
  resume: "Continuar guía",
  restart: "Empezar de nuevo",
  finish: "Finalizar guía",
  exit: "Salir de la guía",
  back: "Volver al capítulo",
  retry: "Reintentar",
} as const;

/** One entry → what the player draws. */
function toPresentation(m: MicroguideEntry): GuidePresentation {
  return {
    guideKey: `eec-c1-${m.slug}`,
    guideVersion: 1,
    title: m.title,
    tag: "Guía breve",
    summary: m.summary,
    steps: [
      {
        surface: "confirm",
        stepKey: `explorar-${m.slug}`,
        initialReaderScene: "cover",
        shortLabel: "Concepto",
        title: m.concept.title,
        body: [...m.concept.body],
        actionLabel: "He explorado la idea",
        note: m.concept.note,
      },
      {
        surface: "confirm",
        stepKey: `practicar-${m.practiceSlug}`,
        initialReaderScene: "practice",
        shortLabel: "Práctica",
        title: m.practice.title,
        body: [...m.practice.body],
        actionLabel: "Ya hice la práctica",
        note: m.practice.note,
      },
      {
        surface: "recall",
        stepKey: `recordar-${m.slug}`,
        initialReaderScene: "recall",
        shortLabel: "Recordar",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo 1."],
        question: m.recall.question,
        options: m.recall.options,
        actionLabel: "Registrar respuesta",
      },
    ],
    labels: LABELS,
  };
}

/** The same entry → what the reader panel says. */
function toReaderCopy(m: MicroguideEntry): GuideReaderCopy {
  return {
    guideKey: `eec-c1-${m.slug}`,
    guideVersion: 1,
    ...READER_GUIDE_SHARED,

    cover: {
      eyebrow: "Guía breve",
      scope: "1 idea del capítulo",
      title: m.intro.title,
      duration: m.duration,
      body: [
        ...m.intro.body,
        "Puedes salir cuando quieras — tu avance queda guardado en el punto " +
          "donde lo dejes.",
      ],
      start: "Empezar",
    },

    // No clip for these five: there is no asset, and a play button over
    // nothing is a lie. The passage below is where the chapter is read.
    clip: {
      title: "Un clip breve",
      pending: "Clip breve en producción",
      pendingNote:
        "Esta microguía no tiene clip. Puedes seguir directamente al pasaje.",
      readTranscript: "Leer transcripción",
      hideTranscript: "Ocultar transcripción",
      transcript: [],
      continue: "Continuar",
    },

    anchor: {
      title: m.passage.title,
      body: m.passage.body,
      goToPassage: "Ir al pasaje",
      located: "Pasaje localizado en el capítulo.",
      unresolved:
        "No pudimos ubicar el pasaje en esta edición del capítulo. Puedes " +
        "seguir con la guía igual.",
      confirm: "Leí el pasaje",
      confirmNote:
        "Marcarlo registra que llegaste hasta aquí; no evalúa lo que entendiste.",
    },

    practice: {
      title: m.practice.title,
      body: m.practice.body,
      timerSeconds: 45,
      timerStart: "Usar 45 segundos",
      timerStop: "Detener",
      timerNote: "El temporizador es opcional y no se registra en ningún lado.",
      confirm: "Ya hice la práctica",
      confirmNote: m.practice.note,
    },

    recall: { title: "Recordar lo leído", submit: "Registrar respuesta" },

    // The words the SERVER sends now replace these at runtime; they remain as
    // the panel's fallback for a verdict that arrives without copy.
    feedback: {
      correct: {
        title: "Eso es lo que dice el capítulo",
        body: "Tu respuesta coincide con lo que plantea el texto.",
      },
      review: {
        title: "Vale la pena volver al pasaje",
        body:
          "El capítulo lo plantea distinto. Puedes releer el pasaje cuando " +
          "quieras — no hay calificación aquí.",
      },
      continue: "Continuar",
    },

    finish: {
      title: m.summaryScene.title,
      body: m.summaryScene.body.join(" "),
      finish: "Finalizar",
    },

    completed: {
      banner: "COMPLETASTE ESTA LECTURA GUIADA",
      continueReading: "Continuar leyendo",
      returnToPassage: "Volver al pasaje",
      repeat: "Repetir la guía",
    },
  };
}

export const EEC_C01_PRESENTATIONS: readonly GuidePresentation[] =
  EEC_C01_MICROGUIDES.map(toPresentation);

export const EEC_C01_READER_COPY: readonly GuideReaderCopy[] =
  EEC_C01_MICROGUIDES.map(toReaderCopy);

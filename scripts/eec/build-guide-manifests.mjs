#!/usr/bin/env node
/**
 * EEC — emit a chapter's guided-suite manifests.
 *
 *   node scripts/eec/build-guide-manifests.mjs                        # check
 *   node scripts/eec/build-guide-manifests.mjs --chapter=C02 --write  # emit
 *
 * One generator, one manifest shape, one checksum rule for every chapter. C02
 * added a row to `CHAPTERS` and its own microguides; it did not add a second
 * script, because two generators of the same artifact drift the moment one is
 * fixed and the other is not.
 *
 * The manifests are the executable contract between the editorial decision, the
 * repository and the CMS. They are GENERATED rather than hand-written for one
 * reason: the checksum has to be reproducible, and a JSON somebody edits by
 * hand grows a trailing comma, a reordered key or a stray space, and then two
 * runs of the same content hash differently.
 *
 * ── What is deliberately NOT in them ───────────────────────────────────────
 *
 *   database ids     resolved by `plan` against the target environment. A
 *                    literal id is true in one database and false in the next.
 *   blockKey         same reason (Content Core derives it per environment).
 *   anchor offsets   the anchor is a heading plus a sentence, verifiable by a
 *                    human reading the book; offsets would be a number nobody
 *                    can check.
 *   correctOptionKey it lives in the server-side exercise catalog and never
 *                    reaches an artifact anything client-facing can read.
 *   chapter prose    scenes reference the anchor; copying the passage would
 *                    fork the canonical text into a second place to update.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMON_C03_C10,
  MICROGUIDES_C03_C10,
} from "./microguides-c03-c10.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const COMMON_C01 = {
  schemaVersion: "1.0",
  bookSlug: "emociones-en-construccion",
  editionKey: "emociones-en-construccion-1e",
  chapterCode: "EEC-C01",
  chapterOrder: 1,
  unitKey: "dce92620-2398-5efb-80a4-b90b180a01ae",
  canonicalVersion: "EEC_C01_v1.0_TEXT_LOCKED_2026-08-20",
  canonicalSha256:
    "e10f42cedf881838578b7337355887c0e8cb2fe37b75dfa4204db509ac023018",
  sourceArtifact: "artifacts/eec/C01/v1.0/feelverse/unit-payload.json",
  experienceVersion: 1,
  guideVersion: 1,
  status: "DRAFT",
  publishAllowed: false,
  media: { audio: null, video: null },
  privacyPolicy: {
    freeTextLeavesDevice: false,
    freeTextInProgress: false,
    emotionalInference: false,
    diagnosis: false,
    requiresIntenseEmotion: false,
  },
  accessibilityRequirements: [
    "Navegación completa por teclado, con foco visible y orden de tabulación lógico.",
    "Toda reordenación anunciada por lector de pantalla mediante aria-live.",
    "Alternativa sin arrastrar para cualquier interacción de ordenamiento.",
    "Respeta prefers-reduced-motion.",
    "El color nunca es la única señal de estado.",
    "Ninguna reproducción automática y ningún audio o vídeo obligatorio.",
  ],
  approvalReferences: [
    "https://app.notion.com/p/3cfcbb1031a0813fb184fe6173d8a826",
    "Decisión autoral 2026-09-03: implementar las cinco microguías de EEC-C01.",
  ],
};

/** EEC-C02 — same contract, second chapter (revisión productiva 11). */
const COMMON_C02 = {
  ...COMMON_C01,
  chapterCode: "EEC-C02",
  chapterOrder: 2,
  unitKey: "f58df2e8-4203-5aa2-83b0-1a8ab79a885a",
  canonicalVersion: "EEC_C02_v1.0_TEXT_LOCKED_2026-08-21",
  canonicalSha256:
    "f137ee10fb80a3ea91af42d93d7262b98de7101a5eeae37051d765dc12a2188a",
  sourceArtifact: "artifacts/eec/C02/v1.0/feelverse/unit-payload.json",
  approvalReferences: [
    "https://app.notion.com/p/3d1cbb1031a0812f8fb9f5a4723752ab",
    "APROBAR ARQUITECTURA C02 — decisión autoral 2026-09-04.",
  ],
};

/** The three obligatory steps, derived from the keys so they cannot drift. */
const steps = (prefix, slug, conceptKey, practiceSlug) => [
  {
    order: 1,
    kind: "CONCEPT_EXPLORATION",
    stepKey: `explorar-${slug}`,
    targetKey: conceptKey,
  },
  {
    order: 2,
    kind: "CATALOG_PRACTICE",
    stepKey: `practicar-${practiceSlug}`,
    targetKey: `${prefix}-practice-${practiceSlug}`,
  },
  {
    order: 3,
    kind: "ACTIVE_RECALL",
    stepKey: `recordar-${slug}`,
    targetKey: `${prefix}-recall-${slug}`,
  },
];

const MICROGUIDES_C01 = [
  {
    id: "EEC-C01-MG01",
    slug: "teorias-como-lentes",
    conceptKey: "eec-teorias-como-lentes",
    practiceSlug: "revisar-un-lente",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c1-distintas-lentes",
        heading: "Distintas lentes para comprender una emoción",
        fingerprint:
          "Las teorías sobre las emociones no son simples opiniones",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Lo que una teoría alcanza a mirar",
        body: [
          "Vas a revisar una creencia cotidiana sobre las emociones con tres preguntas: qué se observa, qué se está suponiendo y qué contexto falta.",
        ],
        note: "Trabajaremos con frases de uso común, no con tu historia personal. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Distintas lentes para comprender una emoción",
        body: [
          "Lee la sección donde el capítulo compara las teorías con mapas: cada una resalta ciertos caminos y deja otros con menos detalle.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Una teoría responde a una pregunta",
        body: [
          "Las teorías sobre las emociones no son opiniones sueltas: son explicaciones organizadas a partir de preguntas, observaciones y métodos distintos. Por eso compararlas no consiste en buscar de inmediato una ganadora, sino en entender qué problema intentaba resolver cada una.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos mapas de la misma ciudad",
        body: [
          "Un mapa del metro y uno de ciclovías describen la misma ciudad enfocando aspectos distintos. Saber a qué pregunta responde cada uno evita exigirle a uno lo que el otro fue hecho para mostrar.",
          "La analogía tiene un límite: que dos teorías miren aspectos distintos no las vuelve equivalentes ni automáticamente compatibles. Algunas sí afirman cosas incompatibles entre sí, y esa discusión sigue abierta.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Revisa un lente",
        body: [
          "Toma una frase de uso común sobre las emociones y sepárala en tres: qué se observa realmente, qué se está suponiendo y qué contexto haría falta para saberlo.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué se compara al comparar dos teorías?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Antes de preguntar cuál teoría gana, conviene saber qué problema intentaba resolver cada una. Eso no las vuelve equivalentes: las vuelve comparables.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C01-MG02",
    slug: "rostro-como-pista",
    conceptKey: "eec-rostro-como-pista",
    practiceSlug: "una-sonrisa-varios-contextos",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c1-rostro-como-pista",
        heading: "Paul Ekman: el rostro como pista",
        fingerprint:
          "un rostro ofrece pistas; no entrega una lectura completa de la experiencia",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Una sonrisa, varios contextos",
        body: [
          "Vas a comparar lecturas posibles de una misma expresión. No se trata de acertar la emoción, sino de notar cuánta información aporta un rostro y dónde termina.",
        ],
        note: "Usaremos escenas cotidianas y ajenas. No necesitas traer ninguna situación tuya.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Paul Ekman: el rostro como pista",
        body: [
          "Lee la sección sobre Ekman. El capítulo reconoce el aporte del rostro y también dónde la lectura directa se queda corta.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Pista, no diccionario",
        body: [
          "Un movimiento facial aporta información, pero su significado depende de la persona, la situación y lo ocurrido antes. Un rostro ofrece pistas; no entrega una lectura completa de la experiencia.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa tu capacidad de leer a nadie.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "La misma sonrisa",
        body: [
          "La misma sonrisa puede aparecer al saludar por cortesía, al terminar algo que costaba, en una situación incómoda o al ver a alguien querido. El movimiento se parece; lo que ocurre alrededor, no.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Una sonrisa, varios contextos",
        body: [
          "Ante una sonrisa en un contexto concreto, separa cuatro cosas: qué se observa, qué contexto tienes disponible, qué interpretaciones son plausibles y qué información falta.",
          "Que haya varias lecturas posibles no significa que todas sean igual de probables: unas encajan mejor con el contexto disponible que otras.",
        ],
        note: "Hay una alternativa sin arrastrar: puedes clasificar cada lectura como más plausible, posible o falta información.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué entrega un rostro?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "El rostro informa. Lo que no hace es cerrar por sí solo la pregunta de qué está sintiendo alguien, y esa distinción cambia cómo escuchas.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C01-MG03",
    slug: "alarma-antes-del-relato",
    conceptKey: "eec-alarma-antes-del-relato",
    practiceSlug: "ordenar-alarma-y-relato",
    practiceKind: "sequence_ordering",
    anchors: {
      primary: {
        reference: "eec-c1-alarma-antes-del-relato",
        heading: "Joseph LeDoux: la alarma antes del relato",
        fingerprint:
          "Una respuesta rápida de protección no es exactamente lo mismo que sentir miedo.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuando reaccionas antes de entender",
        body: [
          "A veces el organismo se prepara antes de que alcances a explicar qué ocurrió. En esta guía distinguirás esa respuesta rápida de la emoción consciente que después puedes reconocer y nombrar.",
        ],
        note: "Trabajaremos con situaciones hipotéticas y cotidianas. No necesitas recordar una experiencia difícil. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Una alarma antes de la historia",
        body: [
          "Lee el pasaje donde el capítulo presenta la propuesta de Joseph LeDoux. Mientras avanzas, busca una diferencia: responder rápidamente a una señal no es todavía lo mismo que saber qué sientes.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Protegerse no es lo mismo que sentir miedo",
        body: [
          "Una señal repentina puede iniciar una respuesta protectora antes de que comprendas la situación. Después, al integrar el contexto, los recuerdos y los conceptos disponibles, puedes reconocer la experiencia como miedo, sobresalto, alivio u otra cosa. La reacción aporta información, pero no revela por sí sola una emoción completa.",
          "Esta es una secuencia pedagógica para distinguir procesos relacionados; no una cadena cerebral rígida que funcione igual en todas las personas y situaciones.",
        ],
        note: "Marcar esta escena registra que exploraste el concepto; no evalúa lo que sentiste ni infiere un estado psicológico.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Lo que sabía Darwin y lo que hizo su cuerpo",
        body: [
          "Ante una serpiente protegida por un vidrio, Darwin sabía que estaba a salvo. Aun así, su cuerpo retrocedió cuando el animal atacó el cristal. El ejemplo no demuestra que hubiera una única emoción automática; muestra que una respuesta protectora puede adelantarse a la explicación consciente.",
          "Algo parecido puede ocurrir cuando una puerta se cierra de golpe: primero aparece el sobresalto; después compruebas qué pasó y le das significado.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Ordena la alarma y el relato",
        body: [
          "Imagina que lees tranquilamente y una puerta se cierra de golpe. Ordena las tarjetas según el modelo de esta guía. No buscamos reconstruir cada milisegundo del cerebro, sino distinguir partes que suelen confundirse.",
        ],
        note: "Puedes ver el ejemplo resuelto y continuar sin penalización. Confirmar registra únicamente que hiciste la práctica.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué demuestra una reacción rápida?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Una alarma no cuenta toda la historia",
        body: [
          "Antes de concluir «esto es miedo», conviene separar tres cosas: la reacción que apareció, lo que el contexto mostró y el significado que después tomó la experiencia. La respuesta protectora es real; no es, por sí sola, toda la emoción.",
          "En las siguientes microguías veremos por qué observar una expresión o sentir un impulso tampoco basta para leer una emoción completa.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C01-MG04",
    slug: "emocion-informa-no-manda",
    conceptKey: "eec-emocion-informa-no-manda",
    practiceSlug: "siento-interpreto-impulso-elijo",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c1-aprender-a-leer-el-mundo-emocional",
        heading: "Daniel Goleman: aprender a leer el mundo emocional",
        fingerprint: "una emoción no es una conducta",
        expectedMatchCount: 1,
      },
      secondary: {
        reference: "eec-c1-razon-necesita-relevancia",
        heading: "Antonio Damasio: la razón necesita relevancia",
        fingerprint:
          "Una emoción aporta información; no dicta por sí sola la decisión.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Sentir, interpretar, querer, elegir",
        body: [
          "Vas a separar cuatro cosas que solemos juntar: lo que sientes, cómo lo interpretas, qué impulso aparece y qué eliges hacer.",
        ],
        note: "La situación es cotidiana y leve, y la ponemos nosotros. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Una emoción no es una conducta",
        body: [
          "Esta microguía se apoya en dos secciones del capítulo que sostienen la misma idea desde ángulos distintos: Goleman, sobre la diferencia entre reconocer, expresar y actuar; y Damasio, sobre cómo las señales afectivas marcan qué es relevante sin decidir por ti.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Informa; no manda",
        body: [
          "Una emoción aporta información y señala qué es relevante. No dicta por sí sola la decisión: sentir, interpretar, tener un impulso y elegir una conducta son procesos distintos, y entre el último y los anteriores hay un espacio.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa tus decisiones ni las califica.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Un mensaje que no llega",
        body: [
          "Escribes a alguien y no responde en todo el día. Aparece una sensación, la interpretas de alguna manera, surge un impulso; y lo que finalmente haces sigue siendo una decisión tuya.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Siento, interpreto, impulso, elijo",
        body: [
          "Sobre esa situación, completa cuatro campos: siento, interpreto, tengo ganas de, elijo hacer.",
        ],
        note: "Lo que elijas no es un diagnóstico ni una recomendación de conducta. Si escribes, tu texto se queda en tu dispositivo.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Si quieres, anótalo",
        body: [
          "¿Qué notaste al separar los cuatro campos? Es opcional, no se evalúa, no viaja con tu progreso y puedes saltarla.",
        ],
      },
      {
        kind: "RECALL",
        title: "¿Qué hace una emoción con la conducta?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "La emoción orienta hacia lo que importa. Entre esa orientación y la conducta hay un espacio, y ese espacio es donde se decide.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C01-MG05",
    slug: "construida-no-significa-falsa",
    conceptKey: "eec-construida-no-significa-falsa",
    practiceSlug: "senales-y-contextos",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c1-emocion-como-construccion",
        heading: "Lisa Feldman Barrett: la emoción como construcción",
        fingerprint: "construir una emoción no significa inventarla",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Construida no significa falsa",
        body: [
          "Vas a comparar unas mismas señales del cuerpo en dos contextos distintos y a notar qué información cambia su significado.",
        ],
        note: "Los dos escenarios los ponemos nosotros. No hace falta que traigas nada tuyo.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Lisa Feldman Barrett: la emoción como construcción",
        body: [
          "Lee la sección sobre Barrett, incluida la escena del rubor y las mariposas que terminaron siendo gripe.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Real, y no elegida",
        body: [
          "Las emociones se forman con señales reales del cuerpo, percepción, memoria, conceptos aprendidos y contexto. Construir una emoción no significa inventarla: sigue siendo real, se siente en el cuerpo y no se elige a voluntad.",
          "El construccionismo es el mapa principal de este libro, no un consenso científico cerrado.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sientes.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Mismas señales, dos situaciones",
        body: [
          "Corazón acelerado y estómago revuelto antes de una entrevista, y antes de una primera cita. Las señales del cuerpo se parecen.",
          "Lo que cambia no es solo lo que te dices: cambian la situación, lo que aprendiste a esperar de ella, los recuerdos que trae y los conceptos con los que la reconoces.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Señales y contextos",
        body: [
          "Ante esas señales ambiguas en dos contextos, identifica qué información hace que signifiquen cosas distintas: la situación, el aprendizaje previo, la expectativa, los recuerdos disponibles o la información nueva.",
        ],
        note: "No hay una única respuesta correcta; la práctica registra únicamente que la hiciste.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "QUESTION",
        title: "Si quieres, respóndete",
        body: [
          "¿Qué dato adicional buscarías antes de cerrar una interpretación? Es opcional y, si respondes, tu texto se queda en tu dispositivo.",
        ],
      },
      {
        kind: "RECALL",
        title: "¿Qué significa que una emoción sea construida?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "«Construida» no es lo contrario de «real». Señales del cuerpo, contexto, memoria y conceptos participan a la vez, y por eso la misma sensación puede significar cosas distintas.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

const MICROGUIDES_C02 = [
  {
    id: "EEC-C02-MG01",
    slug: "universal-no-significa-uniforme",
    conceptKey: "eec-universal-no-significa-uniforme",
    practiceSlug: "seis-cajones",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c2-que-significa-universal",
        heading: "¿Qué significa realmente que una emoción sea universal?",
        fingerprint:
          "En realidad, la palabra *universal* puede referirse a cosas diferentes.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Seis preguntas dentro de una",
        body: [
          "«¿Las emociones son universales?» parece una sola pregunta, y en realidad son varias. Vas a separar seis niveles que el capítulo distingue y a ver qué permite concluir cada uno.",
        ],
        note: "Trabajaremos con afirmaciones de ejemplo, no con tu historia personal. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "¿Qué significa realmente que una emoción sea universal?",
        body: [
          "Lee la sección donde el capítulo abre la palabra «universal» en preguntas distintas: capacidades del cuerpo, acontecimientos que importan, categorías, expresión, reconocimiento y reglas sociales.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Universal no es sinónimo de uniforme",
        body: [
          "Hablar de universalidad exige decir qué nivel estamos comparando. Podemos compartir capacidades corporales y aun así agrupar las experiencias en categorías distintas; podemos producir gestos parecidos y darles significados diferentes; podemos reconocer una expresión en una tarea con opciones dadas y no interpretarla igual en una conversación real.",
          "Por eso una semejanza encontrada en un nivel no demuestra uniformidad en los demás. Decirlo con precisión no debilita la evidencia: la ubica.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos ciudades, cuatro respuestas",
        body: [
          "Preguntar si dos ciudades son iguales no tiene respuesta hasta aclarar si hablamos del clima, del trazado de sus calles, de sus costumbres o de sus leyes. La respuesta puede cambiar en cada caso, y ninguna anula a las otras.",
          "Con las emociones ocurre lo mismo: la comparación se vuelve informativa cuando se dice de qué nivel habla.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Seis cajones",
        body: [
          "Clasifica cada afirmación en el nivel del que habla y observa después qué conclusión permite y cuál no permite ese tipo de evidencia.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué demuestra una semejanza en un nivel?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Antes de responder si una emoción es universal, conviene preguntar de qué nivel hablamos. Compartir una capacidad no obliga a compartir una categoría, ni una expresión a compartir un significado.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C02-MG02",
    slug: "cultura-gramatica-no-destino",
    conceptKey: "eec-cultura-gramatica-no-destino",
    practiceSlug: "de-etiqueta-a-contexto",
    practiceKind: "belief_lens",
    anchors: {
      primary: {
        reference: "eec-c2-cultura-gramatica",
        heading: "La cultura como gramática emocional",
        fingerprint:
          "la cultura emocional no determina mecánicamente cada experiencia",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Reglas que orientan, no que deciden",
        body: [
          "La cultura enseña qué suele notarse, qué puede decirse y qué respuesta se espera. Vas a tomar una generalización rígida y a convertirla en algo más preciso: una tendencia, un contexto, una persona concreta y lo que falta saber.",
        ],
        note: "No te pediremos datos sobre tu identidad ni sobre tu familia. Trabajamos con una frase de ejemplo.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "La cultura como gramática emocional",
        body: [
          "Lee la sección donde el capítulo compara la cultura emocional con una gramática: ofrece estructuras que vuelven ciertas combinaciones familiares y otras extrañas, sin decidir cada frase.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Gramática, no destino",
        body: [
          "Una gramática no pronuncia las frases por nosotros: hace que unas suenen naturales y otras raras. La cultura emocional funciona parecido. Ofrece significados, valores y expectativas sobre qué conviene sentir, mostrar y acompañar, y aun así no determina mecánicamente lo que una persona vive.",
          "De ahí se siguen dos cuidados. Una tendencia observada en un grupo no describe a cada integrante, y una costumbre aprendida en la infancia no es una sentencia: se pueden aprender palabras nuevas y ampliar el repertorio.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Dos casas después de una pelea",
        body: [
          "A un niño le preguntan qué sintió cuando ocurrió. A otro le dicen que no le dé importancia. Ninguna frase fabrica por sí sola una emoción; repetidas en el tiempo, orientan la atención hacia lo que conviene notar y decir.",
          "Eso influye en lo que se vuelve fácil o difícil de reconocer. No permite deducir la historia completa de nadie a partir de una frase.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "De etiqueta a contexto",
        body: [
          "Toma la frase que aparece y sepárala en tres: qué afirma exactamente, qué está suponiendo y qué faltaría precisar — el contexto y la persona concreta.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Una regla que aprendiste",
        body: [
          "Si quieres, piensa en una regla emocional cotidiana y manejable que hayas aprendido en la familia, la escuela o el trabajo: algo como «aquí no se llora en público» o «primero se resuelve y después se habla».",
        ],
        note: "Es opcional y puedes saltarla. Lo que escribas se queda en tu dispositivo: no se envía, no se guarda con tu progreso y nadie lo revisa.",
        actionLabel: "Continuar",
      },
      {
        kind: "RECALL",
        title: "¿Qué significa que la cultura sea una gramática?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "La cultura emocional influye sin determinar. Distinguir entre una tendencia aprendida y una regla fija te deja espacio para mirar el contexto y a la persona concreta que tienes delante.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C02-MG03",
    slug: "gesto-necesita-contexto",
    conceptKey: "eec-gesto-necesita-contexto",
    practiceSlug: "del-gesto-a-la-pregunta",
    practiceKind: "context_plausibility",
    anchors: {
      primary: {
        reference: "eec-c2-rostro-no-habla-solo",
        heading: "El rostro no habla solo",
        fingerprint:
          "La expresión es una pista; el contexto y la conversación permiten formular **hipótesis**",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "De la conclusión a la pregunta",
        body: [
          "Un gesto visible casi siempre admite más de una lectura. Vas a practicar un recorrido corto: describir lo que se observa, sostener dos interpretaciones posibles, notar qué contexto falta y elegir una pregunta para comprobar.",
        ],
        note: "Es una escena hipotética, no un caso real. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "El rostro no habla solo",
        body: [
          "Lee la sección donde el capítulo explica las reglas de expresión y advierte que regular lo que se muestra no equivale a no sentir.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Gesto, contexto, hipótesis, verificación",
        body: [
          "Una expresión aporta información, como una palabra suelta dentro de una frase que todavía no escuchamos completa. Qué ocurrió antes, quién está presente y qué se aprendió a mostrar cambian lo que esa expresión significa.",
          "Por eso conviene tratarla como una hipótesis: una lectura provisional que se comprueba preguntando, no un veredicto sobre lo que la otra persona siente. Las reglas de expresión aprendidas pueden modificar lo visible sin demostrar que la experiencia no exista.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "El volumen y el silencio",
        body: [
          "En una conversación tensa, una persona sube la voz y la otra deja de responder. En una casa, hablar con intensidad era habitual y no anunciaba ruptura; en la otra, el silencio era la forma aprendida de no escalar.",
          "Cada quien lee al otro con su propia gramática: una interpreta indiferencia, la otra amenaza. Traducirse en voz alta suele funcionar mejor que acertar de una.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Del gesto a la pregunta",
        body: [
          "Ordena las lecturas posibles según cuánto encajan con lo que realmente se ve, y termina eligiendo la pregunta que harías para comprobar.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué demuestra una expresión suavizada?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Un gesto abre una hipótesis, no la cierra. Describir lo observado, sostener dos lecturas y preguntar cuesta menos que corregir una conclusión apresurada.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C02-MG04",
    slug: "palabras-dan-contorno",
    conceptKey: "eec-palabras-dan-contorno",
    practiceSlug: "la-palabra-no-basta",
    practiceKind: "signal_context_compare",
    anchors: {
      primary: {
        reference: "eec-c2-palabras-contorno",
        heading: "Las palabras dan contorno a la experiencia",
        fingerprint: "Las palabras funcionan como líneas en un mapa.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuando la palabra alcanza y cuando no",
        body: [
          "«Pena», «coraje», «sentido», «nervioso»: la misma palabra puede señalar experiencias distintas según la región, la familia y la escena. Vas a comparar cuatro frases en dos contextos y a notar qué información ayuda a interpretarlas.",
        ],
        note: "Trabajaremos con frases de uso común, no con tu historia personal. Puedes salir y volver cuando quieras.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Las palabras dan contorno a la experiencia",
        body: [
          "Lee la sección donde el capítulo compara las palabras con líneas en un mapa: no producen las montañas ni los ríos, pero ayudan a diferenciarlos y a orientarse.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Dan contorno; no dictan el territorio",
        body: [
          "Disponer de conceptos emocionales puede ayudarnos a atender, diferenciar y compartir lo que nos pasa. Decir «me siento decepcionado porque esperaba apoyo» abre más opciones que decir «estoy mal».",
          "Al mismo tiempo, no hace falta una palabra exacta para que la experiencia exista, y tener la palabra no fija su significado: «pena» puede nombrar tristeza en una región y vergüenza en otra. Cuando alguien no encuentra cómo decirlo, conviene evitar dos juicios rápidos —«no sabe lo que siente» o «está reprimiendo»— y dar tiempo u otra pregunta.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "«Estoy sentido»",
        body: [
          "Dentro de una familia, «estoy sentido» puede comunicar tristeza, ofensa, resentimiento o necesidad de distancia. La palabra funciona: alcanza para avisar que algo pasó.",
          "Que sea amplia no significa que esté mal elegida. A veces todavía no aprendimos a distinguir más; a veces la experiencia misma viene mezclada.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "La palabra no basta",
        body: [
          "Lee cada frase en las dos escenas propuestas y marca qué información adicional ayudaría a interpretarla: la región, con quién se habla, qué pasó antes, qué ocurre en el cuerpo, en qué lengua se dice.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué hacen las palabras con la experiencia?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "Las palabras ayudan a diferenciar y comunicar, y su significado sigue dependiendo del contexto. Nombrar ayuda, pero no obliga: el silencio también puede ser una etapa del significado.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
  {
    id: "EEC-C02-MG05",
    slug: "rituales-dan-marco-no-guion",
    conceptKey: "eec-rituales-dan-marco-no-guion",
    practiceSlug: "acompanar-sin-imponer",
    practiceKind: "four_part_distinction",
    anchors: {
      primary: {
        reference: "eec-c2-rituales-marco-compartido",
        heading: "Rituales: cuando sentir necesita un marco compartido",
        fingerprint:
          "Los rituales pueden ofrecer testigos. Pero el testigo no dicta cómo debe sentirse quien está de duelo.",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Acompañar sin dar instrucciones",
        body: [
          "Un ritual puede organizar el tiempo, reunir testigos y ofrecer palabras cuando cuesta ordenar lo que pasa. Vas a practicar cómo acompañar sin prescribir: convertir un «deberías» en una opción o en una pregunta.",
        ],
        note: "Es una escena hipotética y de baja intensidad. No te pediremos recordar una pérdida propia y puedes salir en cualquier momento.",
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Rituales: cuando sentir necesita un marco compartido",
        body: [
          "Lee la sección donde el capítulo distingue lo que un ritual ofrece —tiempo, acciones, testigos, significado compartido— de lo que no garantiza.",
        ],
        actionLabel: "Leí el pasaje",
      },
      {
        kind: "CONCEPT",
        title: "Marco compartido, no guion",
        body: [
          "Un ritual puede decir «esta pérdida importa» y sostener a quien la vive. Su efecto depende del sentido que tenga para esa persona y de las condiciones que la rodean; participar no garantiza alivio y no participar tampoco demuestra negación.",
          "El duelo tampoco tiene una cronología igual para todos: cambia con el vínculo, las circunstancias y los recursos disponibles. Acompañar consiste en tolerar esa variedad — a veces hace falta hablar, a veces ayuda práctica, a veces compañía en silencio.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Muchas formas en una misma casa",
        body: [
          "En un velorio, algunas personas acompañan conversando, otras cocinan, otras rezan o permanecen sentadas. Ninguna conducta contiene por sí sola todo el duelo; juntas construyen un marco.",
          "Para alguien que migró, una videollamada puede ser la única despedida posible. Y no hacer ninguna ceremonia también puede ser una forma legítima de vivirlo.",
        ],
      },
      {
        kind: "PRACTICE",
        title: "Acompañar sin imponer",
        body: [
          "Separa cuatro cosas en la escena: qué observas, qué estás suponiendo que la otra persona necesita, qué te sale decir y qué puedes ofrecer o preguntar en su lugar.",
        ],
        note: "Puedes elegir entre las opciones sugeridas. Si prefieres escribir, tu texto se queda en tu dispositivo y no viaja con tu progreso.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "RECALL",
        title: "¿Qué demuestra participar o no en un ritual?",
        body: ["Recupera la idea central de esta microguía."],
      },
      {
        kind: "SUMMARY",
        title: "Lo que te llevas",
        body: [
          "El ritual ofrece marco y testigos; no un guion de cómo sentir. Una pregunta sencilla —«¿qué sería útil para ti en este momento?»— suele acompañar mejor que una interpretación segura.",
        ],
        actionLabel: "Finalizar",
      },
    ],
  },
];

/**
 * The chapters this generator knows. A new chapter is a row plus its
 * microguides — never a copy of this file.
 *
 * `keyPrefix` is what the platform keys start with (`eec-c1`, `eec-c2`);
 * `idPrefix` only names the idempotency key, which is a label for an operator
 * rather than an identity the platform resolves.
 */
/**
 * C03–C10 — eight rows built from one shape.
 *
 * The chapters differ in identity (unitKey, canonical SHA, where the artifacts
 * land) and in their five microguides. Everything else — the privacy policy,
 * the accessibility requirements, the media contract — is C01's, inherited
 * rather than restated, so a change to the shared contract cannot apply to two
 * chapters and miss six.
 */
const c03c10 = (code) => ({
  common: { ...COMMON_C01, ...COMMON_C03_C10[code] },
  microguides: MICROGUIDES_C03_C10[code],
  keyPrefix: `eec-c${COMMON_C03_C10[code].chapterOrder}`,
  idPrefix: `eec-${code.toLowerCase()}`,
  out: `artifacts/eec/${code}/${code === "C06" ? "v1.1" : "v1.0"}/feelverse/guides`,
  chapterMd: `content/books/eec/${code}/chapter.md`,
  suiteId: `EEC-${code}-SUITE`,
  // No flag, same reason as C02: the five ship as DRAFT and the chapter is not
  // in the discovery catalog, so the route is dark by construction.
  featureFlag: null,
  legacyPilot: null,
});

const CHAPTERS = {
  C01: {
    common: COMMON_C01,
    microguides: MICROGUIDES_C01,
    keyPrefix: "eec-c1",
    idPrefix: "eec-c01",
    out: "artifacts/eec/C01/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C01/chapter.md",
    suiteId: "EEC-C01-SUITE",
    featureFlag: "EEC_C01_GUIDED_SUITE_V1",
    legacyPilot: {
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
      inV2Route: false,
      mutated: false,
      note:
        "Conservado y registrado: una sesión fijada a él debe seguir resolviendo. " +
        "Fuera del recorrido nuevo, y su ancla dejó de resolver contra el texto v1.0.",
    },
  },
  C02: {
    common: COMMON_C02,
    microguides: MICROGUIDES_C02,
    keyPrefix: "eec-c2",
    idPrefix: "eec-c02",
    out: "artifacts/eec/C02/v1.0/feelverse/guides",
    chapterMd: "content/books/eec/C02/chapter.md",
    suiteId: "EEC-C02-SUITE",
    // No flag: the five ship as DRAFT and the chapter is not in the discovery
    // catalog, so the route is dark by construction rather than by a switch.
    featureFlag: null,
    legacyPilot: null,
  },
  ...Object.fromEntries(
    Object.keys(MICROGUIDES_C03_C10).map((code) => [code, c03c10(code)]),
  ),
};

/** Deterministic JSON: keys emitted in a declared order, two-space indent. */
const KEY_ORDER = [
  "schemaVersion","manifestId","bookSlug","editionKey","chapterCode",
  "chapterOrder","unitKey","canonicalVersion","canonicalSha256","sourceArtifact",
  "experienceKey","experienceVersion","guideKey","guideVersion","conceptKey",
  "practiceKey","practiceKind","recallKey","anchors","scenes","guideSteps","media",
  "privacyPolicy","accessibilityRequirements","status","publishAllowed",
  "idempotencyKey","approvalReferences","manifestSha256",
];

function ordered(obj) {
  const out = {};
  for (const k of KEY_ORDER) if (k in obj) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

function buildOne(mg, ch) {
  const base = ordered({
    ...ch.common,
    manifestId: mg.id,
    title: mg.title,
    experienceKey: `${ch.keyPrefix}-${mg.slug}`,
    guideKey: `${ch.keyPrefix}-${mg.slug}`,
    conceptKey: mg.conceptKey,
    practiceKey: `${ch.keyPrefix}-practice-${mg.practiceSlug}`,
    practiceKind: mg.practiceKind,
    recallKey: `${ch.keyPrefix}-recall-${mg.slug}`,
    anchors: mg.anchors,
    scenes: mg.scenes.map((raw, i) => {
      const { kind, title, body, note, actionLabel } = raw;
      const scene = { order: i + 1, kind, title, body };
      if (note !== undefined) scene.note = note;
      if (actionLabel !== undefined) scene.actionLabel = actionLabel;
      if (kind === "PASSAGE") scene.anchorRef = mg.anchors.primary.reference;
      if (kind === "CONCEPT") scene.stepKey = `explorar-${mg.slug}`;
      if (kind === "PRACTICE") {
        scene.stepKey = `practicar-${mg.practiceSlug}`;
        scene.practiceKind = mg.practiceKind;
      }
      if (kind === "RECALL") scene.stepKey = `recordar-${mg.slug}`;
      if (kind === "REFLECTION" || kind === "QUESTION") scene.optional = true;
      return scene;
    }),
    guideSteps: steps(ch.keyPrefix, mg.slug, mg.conceptKey, mg.practiceSlug),
    // Stable across runs and across machines: the same manifest content always
    // yields the same key, so a replay is recognisably the same operation.
    idempotencyKey: `${ch.idPrefix}-${mg.slug}-v1-${sha(mg.id + ch.common.canonicalSha256).slice(0, 16)}`,
  });
  // The checksum covers the manifest WITHOUT itself — otherwise it would have
  // to predict its own value.
  const body = JSON.stringify(base, null, 2);
  return ordered({ ...base, manifestSha256: sha(body) });
}

export function buildManifests(code = "C01") {
  const ch = CHAPTERS[code];
  return ch.microguides.map((mg) => buildOne(mg, ch));
}

export function suiteManifest(manifests, code = "C01") {
  const ch = CHAPTERS[code];
  return ordered({
    schemaVersion: "1.0",
    manifestId: ch.suiteId,
    bookSlug: ch.common.bookSlug,
    editionKey: ch.common.editionKey,
    chapterCode: ch.common.chapterCode,
    chapterOrder: ch.common.chapterOrder,
    unitKey: ch.common.unitKey,
    canonicalVersion: ch.common.canonicalVersion,
    canonicalSha256: ch.common.canonicalSha256,
    status: "DRAFT",
    publishAllowed: false,
    featureFlag: ch.featureFlag,
    featureFlagDefault: "off",
    legacyPilot: ch.legacyPilot,
    route: manifests.map((m, i) => ({
      order: i + 1,
      manifestId: m.manifestId,
      guideKey: m.guideKey,
      guideVersion: m.guideVersion,
    })),
    approvalReferences: ch.common.approvalReferences,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes("--write");
  const code =
    process.argv.find((a) => a.startsWith("--chapter="))?.slice(10) ?? "C01";
  const ch = CHAPTERS[code];
  if (!ch) {
    console.error(`FALLO CHAPTER_DESCONOCIDO: ${code}`);
    process.exit(1);
  }
  const OUT = join(ROOT, ch.out);
  const canonical = sha(readFileSync(join(ROOT, ch.chapterMd), "utf8"));
  if (canonical !== ch.common.canonicalSha256) {
    console.error(`FALLO CANONICAL_SHA: ${canonical}`);
    process.exit(1);
  }
  const manifests = buildManifests(code);
  const suite = suiteManifest(manifests, code);
  const files = [
    ...manifests.map((m, i) => [`mg0${i + 1}.manifest.json`, m]),
    ["chapter-guided-suite.manifest.json", suite],
  ];
  if (write) {
    mkdirSync(OUT, { recursive: true });
    const sums = [];
    for (const [name, doc] of files) {
      const body = JSON.stringify(doc, null, 2) + "\n";
      writeFileSync(join(OUT, name), body);
      sums.push(`${sha(body)}  ${name}`);
    }
    writeFileSync(
      join(OUT, "SHA256SUMS.txt"),
      sums.sort((a, b) => a.slice(66).localeCompare(b.slice(66))).join("\n") + "\n",
    );
  }
  for (const [name, doc] of files) {
    const s = doc.manifestSha256 ? ` sha=${doc.manifestSha256.slice(0, 12)}…` : "";
    console.log(`  ${name}${s}`);
  }
  console.log(write ? "escritos" : "(dry-run — usa --write)");
}

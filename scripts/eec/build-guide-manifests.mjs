#!/usr/bin/env node
/**
 * EEC-C01 — emit the guided-suite manifests.
 *
 *   node scripts/eec/build-guide-manifests.mjs           # check (no write)
 *   node scripts/eec/build-guide-manifests.mjs --write   # emit + SHA256SUMS
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "artifacts/eec/C01/v1.0/feelverse/guides");
const CHAPTER = join(ROOT, "content/books/eec/C01/chapter.md");

const COMMON = {
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

/** The three obligatory steps, derived from the keys so they cannot drift. */
const steps = (slug, conceptKey, practiceSlug) => [
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
    targetKey: `eec-c1-practice-${practiceSlug}`,
  },
  {
    order: 3,
    kind: "ACTIVE_RECALL",
    stepKey: `recordar-${slug}`,
    targetKey: `eec-c1-recall-${slug}`,
  },
];

const MICROGUIDES = [
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

function buildOne(mg) {
  const base = ordered({
    ...COMMON,
    manifestId: mg.id,
    experienceKey: `eec-c1-${mg.slug}`,
    guideKey: `eec-c1-${mg.slug}`,
    conceptKey: mg.conceptKey,
    practiceKey: `eec-c1-practice-${mg.practiceSlug}`,
    practiceKind: mg.practiceKind,
    recallKey: `eec-c1-recall-${mg.slug}`,
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
    guideSteps: steps(mg.slug, mg.conceptKey, mg.practiceSlug),
    // Stable across runs and across machines: the same manifest content always
    // yields the same key, so a replay is recognisably the same operation.
    idempotencyKey: `eec-c01-${mg.slug}-v1-${sha(mg.id + COMMON.canonicalSha256).slice(0, 16)}`,
  });
  // The checksum covers the manifest WITHOUT itself — otherwise it would have
  // to predict its own value.
  const body = JSON.stringify(base, null, 2);
  return ordered({ ...base, manifestSha256: sha(body) });
}

export function buildManifests() {
  return MICROGUIDES.map(buildOne);
}

export function suiteManifest(manifests) {
  return ordered({
    schemaVersion: "1.0",
    manifestId: "EEC-C01-SUITE",
    bookSlug: COMMON.bookSlug,
    editionKey: COMMON.editionKey,
    chapterCode: COMMON.chapterCode,
    chapterOrder: COMMON.chapterOrder,
    unitKey: COMMON.unitKey,
    canonicalVersion: COMMON.canonicalVersion,
    canonicalSha256: COMMON.canonicalSha256,
    status: "DRAFT",
    publishAllowed: false,
    featureFlag: "EEC_C01_GUIDED_SUITE_V1",
    featureFlagDefault: "off",
    legacyPilot: {
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
      inV2Route: false,
      mutated: false,
      note:
        "Conservado y registrado: una sesión fijada a él debe seguir resolviendo. " +
        "Fuera del recorrido nuevo, y su ancla dejó de resolver contra el texto v1.0.",
    },
    route: manifests.map((m, i) => ({
      order: i + 1,
      manifestId: m.manifestId,
      guideKey: m.guideKey,
      guideVersion: m.guideVersion,
    })),
    approvalReferences: COMMON.approvalReferences,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes("--write");
  const canonical = sha(readFileSync(CHAPTER, "utf8"));
  if (canonical !== COMMON.canonicalSha256) {
    console.error(`FALLO CANONICAL_SHA: ${canonical}`);
    process.exit(1);
  }
  const manifests = buildManifests();
  const suite = suiteManifest(manifests);
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

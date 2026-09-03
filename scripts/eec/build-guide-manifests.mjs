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
const steps = (slug, conceptKey) => [
  {
    order: 1,
    kind: "CONCEPT_EXPLORATION",
    stepKey: `explorar-${slug}`,
    targetKey: conceptKey,
  },
  {
    order: 2,
    kind: "CATALOG_PRACTICE",
    stepKey: `practicar-${slug}`,
    targetKey: `eec-c1-practice-${slug}`,
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
    practiceKey: "eec-c1-practice-teorias-como-lentes",
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
      ["INTRO", "Lo que una teoría alcanza a mirar", "Vas a revisar una creencia cotidiana sobre las emociones con una pregunta sencilla: qué observa, qué supone y qué contexto le falta. Son unos minutos y puedes dejarlo cuando quieras."],
      ["PASSAGE", "El pasaje", "Lee la sección del capítulo sobre las distintas lentes. Ahí el libro compara las teorías con mapas: cada una resalta ciertos caminos y deja otros con menos detalle."],
      ["CONCEPT", "Una teoría responde a una pregunta", "Las teorías sobre las emociones no son opiniones sueltas: son explicaciones organizadas a partir de preguntas, observaciones y métodos distintos. Por eso compararlas no consiste en buscar de inmediato una ganadora."],
      ["EXAMPLE", "Dos mapas de la misma ciudad", "Un mapa del metro y uno de ciclovías describen la misma ciudad y no se contradicen: responden a preguntas distintas. Con las emociones pasa algo parecido — unas teorías miraron el rostro, otras cómo el cuerpo responde al peligro."],
      ["PRACTICE", "Revisa una creencia", "Elige una frase que hayas oído sobre las emociones. Sepárala en tres: qué se observa realmente, qué se está suponiendo, y qué contexto haría falta para saberlo. Puedes usar las opciones sugeridas; si escribes algo, se queda en tu dispositivo."],
      ["RECALL", "Una pregunta", "Comprueba la idea principal de esta microguía."],
      ["SUMMARY", "Lo que te llevas", "Antes de preguntar cuál teoría gana, conviene saber qué problema intentaba resolver cada una. Eso no las vuelve equivalentes: las vuelve comparables."],
    ],
  },
  {
    id: "EEC-C01-MG02",
    slug: "rostro-como-pista",
    conceptKey: "eec-rostro-como-pista",
    practiceKey: "eec-c1-practice-rostro-como-pista",
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
      ["INTRO", "Una sonrisa, varios contextos", "Vas a comparar lecturas posibles de una misma expresión. No se trata de acertar la emoción: se trata de notar cuánta información aporta un rostro y dónde termina."],
      ["PASSAGE", "El pasaje", "Lee la sección sobre Ekman. El capítulo reconoce el aporte del rostro y también dónde la lectura directa se queda corta."],
      ["CONCEPT", "Pista, no diccionario", "Un movimiento facial aporta información, pero su significado depende de la persona, la situación y lo ocurrido antes. Un rostro ofrece pistas; no entrega una lectura completa de la experiencia."],
      ["EXAMPLE", "La misma sonrisa", "La misma sonrisa puede aparecer al saludar por cortesía, al terminar algo que costaba, en una situación incómoda o al ver a alguien querido. El movimiento se parece; lo que ocurre alrededor, no."],
      ["PRACTICE", "Varias lecturas plausibles", "Ante una sonrisa en un contexto dado, ordena qué interpretaciones te parecen más y menos plausibles. Que haya varias posibles no significa que todas sean igual de probables."],
      ["RECALL", "Una pregunta", "Comprueba la idea principal de esta microguía."],
      ["SUMMARY", "Lo que te llevas", "El rostro informa. Lo que no hace es cerrar por sí solo la pregunta de qué está sintiendo alguien — y esa distinción cambia cómo escuchas."],
    ],
  },
  {
    id: "EEC-C01-MG03",
    slug: "alarma-antes-del-relato",
    conceptKey: "eec-alarma-antes-del-relato",
    practiceKey: "eec-c1-practice-alarma-antes-del-relato",
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
      ["INTRO", "La alarma antes del relato", "Vas a ordenar una secuencia breve y de baja intensidad. No hace falta recordar nada difícil: el ejemplo lo ponemos nosotros."],
      ["PASSAGE", "El pasaje", "Lee la sección sobre LeDoux, con la escena de Darwin frente a la víbora tras el vidrio: sabía que estaba a salvo y aun así saltó hacia atrás."],
      ["CONCEPT", "Protegerse y sentir miedo no son lo mismo", "El cerebro puede empezar a organizar una respuesta de protección antes de que entiendas conscientemente qué pasa. Sentir miedo incluye además reconocer, de alguna manera, «esto me asusta»."],
      ["EXAMPLE", "El detector de humo", "Un detector de humo no explica si el fuego vino de una vela o de una tostada quemada. Su tarea inicial es detectar una señal relevante y movilizar una respuesta. A veces acierta; a veces se activa por la tostada."],
      ["PRACTICE", "Ordena la secuencia", "Coloca en orden: aparece una señal repentina · el cuerpo inicia una respuesta de protección · compruebas el contexto · interpretas y quizá le pones nombre. Puedes arrastrar, usar los botones Subir y Bajar, o pedir ver la secuencia resuelta y seguir sin penalización."],
      ["RECALL", "Una pregunta", "Comprueba la idea principal de esta microguía."],
      ["SUMMARY", "Lo que te llevas", "El orden no es una cronología neural rígida ni una escalera fija: es una forma de separar lo que se dispara solo de lo que después nombras."],
    ],
  },
  {
    id: "EEC-C01-MG04",
    slug: "emocion-informa-no-manda",
    conceptKey: "eec-emocion-informa-no-manda",
    practiceKey: "eec-c1-practice-emocion-informa-no-manda",
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
      ["INTRO", "Sentir, interpretar, querer, elegir", "Vas a separar cuatro cosas que solemos juntar. La situación es cotidiana y leve; la reflexión, si la escribes, es opcional y se queda contigo."],
      ["PASSAGE", "Los pasajes", "Esta microguía se apoya en dos secciones: Goleman, sobre la diferencia entre reconocer, expresar y actuar; y Damasio, sobre cómo las señales afectivas orientan sin garantizar."],
      ["CONCEPT", "Informa; no manda", "Una emoción aporta información y señala qué es relevante. No dicta por sí sola la decisión: sentir, interpretar, tener un impulso y elegir una conducta son procesos distintos."],
      ["EXAMPLE", "Un mensaje que no llega", "Escribes a alguien y no responde en todo el día. Sientes algo, lo interpretas de alguna manera, aparece un impulso — y lo que finalmente haces sigue siendo una decisión tuya."],
      ["PRACTICE", "Cuatro campos", "Sobre esa situación, completa: siento · interpreto · tengo ganas de · elijo hacer. Validar una emoción no es justificar cualquier conducta; separar los cuatro campos es lo que hace visible esa diferencia."],
      ["REFLECTION", "Opcional", "Si quieres, anota qué notaste al separarlos. Es opcional, no se evalúa, no viaja con tu progreso y puedes saltarla."],
      ["RECALL", "Una pregunta", "Comprueba la idea principal de esta microguía."],
      ["SUMMARY", "Lo que te llevas", "La emoción orienta hacia lo que importa. Entre esa orientación y la conducta hay un espacio, y ese espacio es donde se decide."],
    ],
  },
  {
    id: "EEC-C01-MG05",
    slug: "construida-no-significa-falsa",
    conceptKey: "eec-construida-no-significa-falsa",
    practiceKey: "eec-c1-practice-construida-no-significa-falsa",
    anchors: {
      primary: {
        reference: "eec-c1-emocion-como-construccion",
        heading: "Lisa Feldman Barrett: la emoción como construcción",
        fingerprint: "construir una emoción no significa inventarla",
        expectedMatchCount: 1,
      },
    },
    scenes: [
      ["INTRO", "Construida no significa falsa", "Vas a comparar unas mismas señales del cuerpo en dos contextos distintos, y a notar qué información cambia su significado."],
      ["PASSAGE", "El pasaje", "Lee la sección sobre Barrett, incluida la escena del rubor y las mariposas que terminaron siendo gripe."],
      ["CONCEPT", "Real, y no elegida", "Las emociones se forman con señales reales del cuerpo, memoria, conceptos aprendidos y contexto. Construir una emoción no significa inventarla: sigue siendo real y no se elige a voluntad."],
      ["EXAMPLE", "Mismas señales, dos pies de foto", "Corazón acelerado y estómago revuelto antes de una entrevista, y antes de una primera cita. Las señales se parecen; lo que cuentas sobre ellas, no."],
      ["PRACTICE", "Qué cambia el significado", "Ante esas señales ambiguas en dos contextos, identifica qué información hace que signifiquen cosas distintas."],
      ["QUESTION", "Una pregunta abierta", "¿Qué dato adicional buscarías antes de cerrar una interpretación? Es opcional y, si respondes, tu texto se queda en tu dispositivo."],
      ["RECALL", "Una pregunta", "Comprueba la idea principal de esta microguía."],
      ["SUMMARY", "Lo que te llevas", "El construccionismo es el mapa principal de este libro, no un consenso científico cerrado. Y «construida» no es lo contrario de «real»."],
    ],
  },
];

/** Deterministic JSON: keys emitted in a declared order, two-space indent. */
const KEY_ORDER = [
  "schemaVersion","manifestId","bookSlug","editionKey","chapterCode",
  "chapterOrder","unitKey","canonicalVersion","canonicalSha256","sourceArtifact",
  "experienceKey","experienceVersion","guideKey","guideVersion","conceptKey",
  "practiceKey","recallKey","anchors","scenes","guideSteps","media",
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
    practiceKey: mg.practiceKey,
    recallKey: `eec-c1-recall-${mg.slug}`,
    anchors: mg.anchors,
    scenes: mg.scenes.map(([kind, title, body], i) => {
      const scene = { order: i + 1, kind, title, body };
      if (kind === "PASSAGE") scene.anchorRef = mg.anchors.primary.reference;
      if (kind === "CONCEPT") scene.stepKey = `explorar-${mg.slug}`;
      if (kind === "PRACTICE") scene.stepKey = `practicar-${mg.slug}`;
      if (kind === "RECALL") scene.stepKey = `recordar-${mg.slug}`;
      if (kind === "REFLECTION" || kind === "QUESTION") scene.optional = true;
      return scene;
    }),
    guideSteps: steps(mg.slug, mg.conceptKey),
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

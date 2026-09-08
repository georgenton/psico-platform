#!/usr/bin/env node
/**
 * PQP-C01 — build the four microguide manifests plus the chapter route.
 *
 * Same artifact contract EEC uses (`artifacts/<book>/<chapter>/<version>/
 * feelverse/guides`), so the existing CLI reads these without a second loader.
 * The copy lives here rather than in hand-written JSON for one reason: five
 * files that must agree on keys, step names and anchors are five chances to
 * disagree, and this way the agreement is generated instead of maintained.
 *
 *   node scripts/pqp/build-guide-manifests.mjs
 *
 * Nothing here reaches production. It writes files a human reviews.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "artifacts/pqp/C01/v1.0/feelverse/guides";
const BOOK = "parejas-que-perduran";
const EDITION = "parejas-que-perduran-1e";
/** PLATFORM order. The book's chapter 1 is unit 2; unit 1 is the front matter. */
const CHAPTER_ORDER = 2;
const UNIT_KEY = "a8f009c0-1660-5f1e-a435-b8bc4ebbb7d4";
const CANONICAL_SHA =
  "6151a1ca2d88529ca1ca959997d04b681255d4e9f00510a0510651ddf65b616f";

/** Every microguide carries the same promises about what it does with words. */
const PRIVACY = {
  freeTextLeavesDevice: false,
  freeTextInProgress: false,
  emotionalInference: false,
  diagnosis: false,
  requiresIntenseEmotion: false,
};

const ACCESSIBILITY = [
  "Toda práctica ofrece un camino sin arrastrar y sin depender del color.",
  "Ninguna escena comunica su estado únicamente con un icono.",
  "Las escenas opcionales se pueden omitir con el teclado.",
];

const SAFE_EXIT =
  "Puedes salir y volver cuando quieras. Nada de lo que escribas sale de tu dispositivo.";

const MICROGUIDES = [
  {
    n: 1,
    slug: "amor-como-practica",
    practiceSlug: "orden-de-lo-cotidiano",
    practiceKind: "sequence_ordering",
    anchor: {
      heading: "El Amor como Medicina",
      fingerprint: "el amor es un verbo, no un sustantivo",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "El amor se practica",
        body: [
          "El capítulo abre con una idea que es más exigente de lo que parece: además de sentirse, el amor se hace. Vas a mirar de cerca qué significa eso en la vida diaria de una pareja.",
        ],
        note: `Trabajaremos con una pareja inventada para el ejercicio, no con tu historia. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "El Amor como Medicina",
        body: [
          "Lee la sección donde el capítulo narra el caso de una pareja que cambia dos cosas pequeñas de su rutina, y fíjate en la frase con la que cierra.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Un verbo, además de un sustantivo",
        body: [
          "La idea que sostiene el capítulo es que un vínculo duradero también se construye con conductas pequeñas y repetidas, no solo con la intensidad de lo que una persona siente.",
          "Eso no vuelve irrelevante el sentimiento. Lo que propone es un desplazamiento de atención: de «cuánto quiero a esta persona» a «qué hago, y con qué frecuencia, para que eso se note».",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa lo que sabes ni infiere nada sobre ti ni sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "El orden de lo cotidiano",
        body: [
          "Ordena los cuatro pasos de una pareja inventada para este ejercicio y observa dónde queda la repetición dentro de la secuencia.",
        ],
        note: "Es un caso editorial, no tu relación. Puedes elegir entre las opciones sugeridas.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Un momento para ti",
        body: [
          "Del 1 al 5, ¿cuánto sientes hoy que tu relación funciona como un lugar de refugio? No hace falta que escribas el número: basta con que lo pienses.",
          "Y si quieres seguir: ¿qué haces tú que probablemente ayuda a que la otra persona se sienta acompañada, y qué haces que quizá le suma tensión sin que te lo propongas?",
        ],
        note: "Privado y opcional. No se guarda, no puntúa nada, no viaja con tu progreso y no alimenta ningún mapa ni perfil.",
        optional: true,
      },
      {
        kind: "QUESTION",
        title: "Una elección",
        body: [
          "No intentes cambiar toda tu relación. Elige una sola conducta, pequeña y observable, que quieras sostener durante siete días.",
          "Un ejemplo del tipo de tamaño que funciona: dejar el teléfono cuando la otra persona cuenta su día.",
        ],
        note: "Lo que escribas se queda en tu dispositivo. Confirmar registra que elegiste algo, no qué elegiste.",
        actionLabel: "Ya elegí mi conducta",
      },
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Recordar no es transformar",
        body: [
          "Has trabajado la idea de que el amor duradero también se practica: se sostiene en conductas cotidianas y repetidas.",
          "Recordar una idea no es lo mismo que transformar una relación. Lo que sigue no es saber más, sino elegir algo pequeño y sostenerlo.",
        ],
      },
    ],
  },
  {
    n: 2,
    slug: "presencia-sin-acuerdo",
    practiceSlug: "lo-que-se-y-lo-que-supongo",
    practiceKind: "context_plausibility",
    anchor: {
      heading: "El Cerebro Enamorado",
      fingerprint:
        "La hormona no requería consenso, solo presencia (Scheele et al., 2016).",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Presencia sin acuerdo",
        body: [
          "Cuando hay un desacuerdo, lo primero que suele aparecer es la urgencia de resolverlo. Esta guía trabaja una distinción que el capítulo propone: permanecer presente y resolver no son la misma cosa.",
        ],
        note: `Trabajaremos con una escena inventada para el ejercicio. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "El Cerebro Enamorado",
        body: [
          "Lee la sección donde el capítulo describe un estudio hecho con parejas que estaban en conflicto, y fíjate en qué se les pidió y en qué NO se les pidió.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Estar no es haber arreglado",
        body: [
          "En un desacuerdo, mantener señales de conexión y presencia puede ser distinto de resolver de inmediato el problema. Son dos cosas separadas, y confundirlas hace que una pareja sienta que no puede acercarse hasta tener razón.",
          "Conflicto y conexión tampoco son necesariamente opuestos: se puede estar en desacuerdo y a la vez sostener señales de vínculo y de respeto.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa tu forma de discutir ni infiere nada sobre tu relación.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Lo que sé y lo que supongo",
        body: [
          "Una escena breve: alguien se sienta cerca de su pareja después de una discusión sin resolver, y no dice nada. Separa lo que la escena dice de lo que estarías añadiendo tú.",
        ],
        note: "Es un caso editorial, no tu relación. Ninguna lectura se marca como equivocada: el ejercicio es notar cuáles no están en la escena.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "La última vez",
        body: [
          "Recuerda la última vez que estuviste realmente presente con alguien, sin pantalla de por medio y sin estar haciendo otra cosa. ¿Qué hizo que fuera posible?",
        ],
        note: "Privado y opcional. No se guarda ni viaja con tu progreso.",
        optional: true,
      },
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Estar, antes que arreglar",
        body: [
          "Presencia y resolución son cosas distintas, y una relación puede atravesar un desacuerdo sin renunciar a todas las señales de vínculo.",
          "Si algo de esto te resultó difícil de leer, es información sobre el momento, no un diagnóstico de tu relación.",
        ],
      },
    ],
  },
  {
    n: 3,
    slug: "clima-que-aprenden",
    practiceSlug: "misma-escena-dos-lecturas",
    practiceKind: "signal_context_compare",
    anchor: {
      heading: "Los Hijos",
      fingerprint: "inició un estudio pionero",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Lo que aprenden mirando",
        body: [
          "Esta guía trabaja qué se aprende de una relación observándola, y por qué la misma escena no enseña siempre lo mismo.",
        ],
        note: `Esto no es una evaluación de tu crianza. ${SAFE_EXIT}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Los Hijos",
        body: [
          "Lee la sección donde el capítulo presenta un seguimiento a lo largo de los años sobre lo que niñas y niños absorben de las relaciones que tienen cerca.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "El currículo que nadie dicta",
        body: [
          "Lo que niños y adolescentes observan en las relaciones cercanas contribuye a las ideas que van formando sobre el afecto, el conflicto, el cuidado y la reparación.",
          "Contribuye: no es la única fuente, no es necesariamente la principal, y ninguna escena aislada determina lo que alguien entenderá por amor. Lo que se repite pesa más que lo que ocurre una vez.",
        ],
        note: "Esto no es una evaluación de tu crianza ni significa que una interacción aislada determine lo que un hijo aprenderá sobre las relaciones.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "EXAMPLE",
        title: "Por qué la reparación se nota",
        body: [
          "El capítulo describe algo que suele pasar desapercibido: lo que más se observa no es la discusión, sino lo que ocurre después de ella.",
          "Una discusión que se retoma y se nombra deja una escena distinta de una que simplemente se apaga, aunque el tono haya sido el mismo.",
        ],
        optional: true,
      },
      {
        kind: "PRACTICE",
        title: "La misma escena, dos contextos",
        body: [
          "Las mismas tres señales en dos situaciones distintas. Observa qué podría cambiar en lo que alguien alcanza a aprender de ellas.",
        ],
        note: "Son escenas editoriales, no tu familia. Nada se marca como correcto o incorrecto.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Desde dónde miras esto",
        body: [
          "Si tienes hijos: ¿qué te gustaría que aprendieran de su relación con ustedes sobre lo que significa cuidar a alguien?",
          "Si no tienes hijos: ¿qué aprendiste tú observando las relaciones cercanas de tu infancia? Solo lo que recuerdes con tranquilidad; no hace falta ir más lejos.",
        ],
        note: "Privado y opcional. No se guarda, no se interpreta y no viaja con tu progreso.",
        optional: true,
      },
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Contribuye, no determina",
        body: [
          "Lo observado se suma a lo que se dice, y la reparación es parte de lo que se observa.",
          "La palabra que sostiene toda la idea es «contribuye»: nadie queda definido por una escena.",
        ],
      },
    ],
  },
  {
    n: 4,
    slug: "reinventar-el-vinculo",
    practiceSlug: "lo-que-dejo-de-funcionar",
    practiceKind: "sequence_ordering",
    anchor: {
      heading:
        "Un Testimonio Personal: Mireya y Yo – Los Abrazos que Cruzaron el Dolor",
      fingerprint: "sino lo que reinventas juntos",
    },
    scenes: [
      {
        kind: "INTRO",
        title: "Cuando el amor se reinventa",
        body: [
          "Esta guía trabaja qué puede ocurrir cuando una forma habitual de estar cerca deja de ser posible.",
        ],
        note: `Puede tocar recuerdos difíciles. Todas las preguntas son opcionales y ${SAFE_EXIT.toLowerCase()}`,
        actionLabel: "Comenzar",
      },
      {
        kind: "PASSAGE",
        title: "Un testimonio del autor",
        body: [
          "Lee el testimonio en primera persona con el que el autor cierra el capítulo, y fíjate en la frase final.",
        ],
      },
      {
        kind: "CONCEPT",
        title: "Otra forma de sostener lo mismo",
        body: [
          "Cuando una forma habitual de expresar conexión deja de ser posible, una pareja puede buscar otras maneras de cuidar el vínculo.",
          "Es una posibilidad, no una obligación ni una receta que sirva igual en toda situación. Hay circunstancias en las que lo que hace falta no es reinventar nada, sino tiempo o ayuda.",
        ],
        note: "Marcar esta escena registra que exploraste la idea; no evalúa cómo atravesaste tus propias crisis.",
        actionLabel: "He explorado la idea",
      },
      {
        kind: "PRACTICE",
        title: "Cuando una forma deja de ser posible",
        body: [
          "Ordena la secuencia de una pareja inventada para este ejercicio, y fíjate especialmente en el paso que suele saltarse.",
        ],
        note: "Es un caso editorial, no tu historia.",
        actionLabel: "Ya hice la práctica",
      },
      {
        kind: "REFLECTION",
        title: "Dos preguntas, si quieres",
        body: [
          "¿Hubo alguna forma de estar cerca que dejó de funcionar en algún momento?",
          "¿Qué necesitarían reinventar hoy?",
        ],
        note: "Privado y opcional; puedes omitirlo entero. No se guarda ni viaja con tu progreso, y no hace falta escribir sobre pérdidas o enfermedades.",
        optional: true,
      },
      {
        kind: "RECALL",
        title: "Recordar lo leído",
        body: ["Elige la opción que corresponde a lo que dice el capítulo."],
        actionLabel: "Registrar respuesta",
      },
      {
        kind: "SUMMARY",
        title: "Inventar, no volver",
        body: [
          "Cuando una forma de cuidarse deja de ser posible, puede aparecer otra. Buscarla es una opción disponible, no una prueba que haya que aprobar.",
          "Con esto cierras el recorrido del capítulo.",
        ],
      },
    ],
  },
];

const STEP_KINDS = [
  ["CONCEPT_EXPLORATION", (m) => `explorar-${m.slug}`, (m) => m.conceptKey],
  ["CATALOG_PRACTICE", (m) => `practicar-${m.practiceSlug}`, (m) => m.practiceKey],
  ["ACTIVE_RECALL", (m) => `recordar-${m.slug}`, (m) => m.recallKey],
];

mkdirSync(OUT, { recursive: true });

const route = [];
for (const mg of MICROGUIDES) {
  const id = `PQP-C01-MG0${mg.n}`;
  const guideKey = `pqp-c1-${mg.slug}`;
  const enriched = {
    ...mg,
    conceptKey: `pqp-c1-${mg.slug}`,
    practiceKey: `pqp-c1-practice-${mg.practiceSlug}`,
    recallKey: `pqp-c1-recall-${mg.slug}`,
  };
  const manifest = {
    schemaVersion: "1.0",
    manifestId: id,
    bookSlug: BOOK,
    editionKey: EDITION,
    chapterCode: "C01",
    chapterOrder: CHAPTER_ORDER,
    unitKey: UNIT_KEY,
    canonicalVersion: "PQP_PRINTED_v1.0_TEXT_LOCKED_2026-09-07",
    canonicalSha256: CANONICAL_SHA,
    sourceArtifact: "Pareja que perduran_final.docx",
    experienceKey: guideKey,
    experienceVersion: 1,
    guideKey,
    guideVersion: 1,
    conceptKey: enriched.conceptKey,
    practiceKey: enriched.practiceKey,
    practiceKind: mg.practiceKind,
    recallKey: enriched.recallKey,
    anchors: {
      primary: {
        reference: guideKey,
        heading: mg.anchor.heading,
        fingerprint: mg.anchor.fingerprint,
        expectedMatchCount: 1,
      },
    },
    scenes: mg.scenes.map((s, i) => ({
      order: i + 1,
      kind: s.kind,
      title: s.title,
      body: s.body,
      ...(s.note !== undefined ? { note: s.note } : {}),
      ...(s.actionLabel !== undefined ? { actionLabel: s.actionLabel } : {}),
      ...(s.optional ? { optional: true } : {}),
    })),
    guideSteps: STEP_KINDS.map(([kind, stepKey, targetKey], i) => ({
      order: i + 1,
      kind,
      stepKey: stepKey(enriched),
      targetKey: targetKey(enriched),
    })),
    media: {
      // David proposed a 60–90 s opening clip. It does not exist yet, so no
      // scene claims it: an absent asset must not render a player.
      authorVideoPending: true,
      authorVideoScope: "MG01 · clip de apertura propuesto por el autor",
    },
    privacyPolicy: PRIVACY,
    accessibilityRequirements: ACCESSIBILITY,
    status: "DRAFT",
    publishAllowed: false,
    idempotencyKey: `pqp-c01-${mg.slug}-v1`,
    approvalReferences: [
      "PQP-C01 — Inventario editorial y diseño de experiencia v0.1 (2026-09-07)",
    ],
  };
  // The checksum covers the manifest WITHOUT itself, serialized exactly as the
  // validator serializes it (two-space indent). Any other shape recomputes to a
  // different digest and the CLI reports the file as edited by hand.
  manifest.manifestSha256 = createHash("sha256")
    .update(JSON.stringify(manifest, null, 2), "utf8")
    .digest("hex");
  writeFileSync(
    join(OUT, `mg0${mg.n}.manifest.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  route.push({ order: mg.n, manifestId: id, guideKey, guideVersion: 1 });
}

const suite = {
  schemaVersion: "1.0",
  manifestId: "PQP-C01-SUITE",
  bookSlug: BOOK,
  editionKey: EDITION,
  chapterCode: "C01",
  chapterOrder: CHAPTER_ORDER,
  unitKey: UNIT_KEY,
  canonicalVersion: "PQP_PRINTED_v1.0_TEXT_LOCKED_2026-09-07",
  canonicalSha256: CANONICAL_SHA,
  status: "DRAFT",
  publishAllowed: false,
  approvalReferences: [
    "PQP-C01 — Inventario editorial y diseño de experiencia v0.1 (2026-09-07)",
  ],
  // No flag: like EEC-C02 onwards, the four ship as DRAFT and the chapter is
  // absent from the discovery catalog, so the route is dark by construction
  // rather than by a switch somebody could flip early.
  featureFlag: null,
  featureFlagDefault: "off",
  legacyPilot: {
    guideKey: "pqp-c1-contacto-sostenido",
    guideVersion: 1,
    inV2Route: false,
    mutated: false,
    note: "Conservado y registrado. Dos sesiones fijadas a él (1 CANCELLED, 1 ACTIVE) deben seguir resolviendo. Fuera del recorrido nuevo: su ancla apuntaba a una línea del OCR que la edición impresa no contiene.",
  },
  route,
};
writeFileSync(
  join(OUT, "chapter-guided-suite.manifest.json"),
  JSON.stringify(suite, null, 2) + "\n",
);

console.log(`wrote ${MICROGUIDES.length} manifests + suite to ${OUT}`);

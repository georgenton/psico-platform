/**
 * Convierte `paquete-cinco.json` en un documento que se lee como las cinco
 * experiencias, no como un volcado.
 *
 * Regla única: ninguna cadena del contenido se reescribe. Lo que esta capa
 * añade es estructura —encabezados, orden, etiquetas de campo— y las notas que
 * van marcadas como observación editorial.
 */

import { readFileSync, writeFileSync } from "node:fs";

const IN = process.argv[2];
const OUT = process.argv[3];
if (!IN || !OUT) {
  console.error("uso: node render-paquete.cjs <paquete.json> <salida.md>");
  process.exit(1);
}

const d = JSON.parse(readFileSync(IN, "utf8"));

const TIPO = {
  INTRO: "Apertura",
  PASSAGE: "Pasaje del libro",
  CONCEPT: "Concepto",
  EXAMPLE: "Ejemplo",
  PRACTICE: "Práctica",
  RECALL: "Recuerdo activo",
  REFLECTION: "Reflexión",
  QUESTION: "Pregunta",
  SUMMARY: "Cierre",
};

const out = [];
const p = (s = "") => out.push(s);

/**
 * Cómo se presenta cada campo de una interacción, y en qué orden.
 *
 * La primera versión de este renderizador sólo conocía `zones`, así que cuatro
 * de las cinco prácticas acabaron con su contenido real plegado en un bloque
 * JSON — que es peor que un contador: parece que está y no se lee. Esta tabla
 * nombra cada campo y la forma en que se imprime; lo que no esté aquí se
 * imprime igual, por su forma, y el cierre avisa si quedó algo sin nombrar.
 */
const CAMPOS = [
  ["scenario", "La situación"],
  ["situation", "La situación"],
  ["belief", "La creencia que se examina"],
  ["observation", "Lo que se observa"],
  ["prompt", "La consigna"],
  ["signals", "Las señales del cuerpo"],
  ["availableContext", "El contexto disponible"],
  ["cards", "Las piezas que hay que ordenar"],
  ["solved", "El orden resuelto"],
  ["solvedLabel", "Botón de salida sin resolver"],
  ["zones", "Las zonas donde se clasifican las opciones"],
  ["fields", "Los cuatro campos que se distinguen"],
  ["readings", "Las lecturas posibles"],
  ["buckets", "Los cajones donde se colocan"],
  ["contexts", "Los contextos que se comparan"],
  ["factors", "Los factores que se pueden elegir"],
  ["items", "Los elementos"],
  ["steps", "Los pasos"],
  ["missingInformationPrompt", "La pregunta de cierre"],
  ["feedback", "La devolución"],
  ["disclaimer", "El aviso que acompaña a la práctica"],
  ["allowsFreeText", "Texto libre"],
];

const sinNombrar = [];

function esLista(v) {
  return Array.isArray(v);
}

/** Un valor con `label` y `options` se imprime como subapartado con viñetas. */
function renderValor(clave, etiqueta, v, it) {
  if (v === null || v === undefined) return;

  if (typeof v === "boolean") {
    if (clave === "allowsFreeText") {
      p(
        `*${etiqueta}:* ${v ? "la persona puede escribir sus propias palabras además de elegir." : "sólo se eligen opciones; no se escribe."}`,
      );
    } else {
      p(`*${etiqueta}:* ${v ? "sí" : "no"}`);
    }
    p();
    return;
  }

  if (typeof v === "string") {
    p(`*${etiqueta}:* ${v}`);
    p();
    return;
  }

  if (esLista(v)) {
    // `solved` es una lista de claves: se resuelve contra las tarjetas para que
    // el orden correcto se lea como frases y no como identificadores.
    if (clave === "solved" && esLista(it.cards)) {
      p(`**${etiqueta}**`);
      p();
      v.forEach((k, idx) => {
        const card = it.cards.find((c) => c.key === k);
        p(`${idx + 1}. ${card?.label ?? k}`);
      });
      p();
      return;
    }
    if (v.every((x) => typeof x === "string")) {
      p(`**${etiqueta}**`);
      p();
      v.forEach((x) => p(`- ${x}`));
      p();
      return;
    }
    // Objetos con opciones anidadas → subapartado por cada uno.
    if (v.some((x) => esLista(x?.options))) {
      p(`**${etiqueta}**`);
      p();
      v.forEach((z) => {
        p(`*${z.label ?? z.key}*${z.hint ? ` — ${z.hint}` : ""}`);
        p();
        (z.options ?? []).forEach((o) => p(`- ${o.label ?? o.key}`));
        p();
      });
      return;
    }
    // Objetos planos `{key,label[,description]}`.
    p(`**${etiqueta}**`);
    p();
    v.forEach((o) =>
      p(
        `- ${o.label ?? o.key}${o.description ? ` — ${o.description}` : ""}${o.hint ? ` — ${o.hint}` : ""}`,
      ),
    );
    p();
    return;
  }

  // Un objeto suelto: se imprime campo a campo, nunca como JSON.
  p(`**${etiqueta}**`);
  p();
  Object.entries(v).forEach(([k2, v2]) => p(`- ${k2}: ${v2}`));
  p();
}

function renderInteraccion(it) {
  const vistos = new Set(["kind"]);
  for (const [clave, etiqueta] of CAMPOS) {
    if (clave in it) {
      renderValor(clave, etiqueta, it[clave], it);
      vistos.add(clave);
    }
  }
  // Nada se pliega en silencio: lo que no tenga nombre se imprime por su forma
  // y se anota, para que la próxima vez tenga nombre.
  for (const clave of Object.keys(it)) {
    if (vistos.has(clave)) continue;
    sinNombrar.push(clave);
    renderValor(clave, clave, it[clave], it);
  }
}

p("# Las cinco microguías de EEC-C01 — el contenido completo, para revisar");
p();
p(
  "Esto es lo que una persona leería y haría en cada una de las cinco, palabra por",
);
p(
  "palabra. No hay contadores ni fragmentos: cada escena va con su texto íntegro, y",
);
p(
  "cada pregunta con sus opciones y su devolución. Si una frase no te parece, es una",
);
p("frase que puedes señalar aquí.");
p();
p("**De dónde sale, y por qué se puede confiar en que es lo mismo.** De dos");
p(
  "fuentes del repositorio, unidas igual que las une el `preview-report` del CLI:",
);
p(
  "los cinco manifiestos de `artifacts/eec/C01/v1.0/feelverse/guides` aportan las",
);
p(
  "escenas; `exercise-ingestion-catalog` aporta la interacción de cada práctica y",
);
p(
  "la pregunta de cada recuerdo activo, con sus opciones y su devolución. Se unen",
);
p("sin base de datos a propósito: el contenido es idéntico y así queda en un");
p("artefacto que no depende de un entorno temporal.");
p();
p(
  "**Lo que este documento NO es.** No es una aprobación, no publica nada y no",
);
p("enciende ningún interruptor. Tampoco es la pantalla: es su contenido.");
p();
p("| | |");
p("| --- | --- |");
p(`| Microguías | ${d.length} |`);
p(`| Escenas | ${d.map((x) => x.escenas.length).join(" · ")} |`);
p(`| Revisión canónica | \`${d[0].canonico.version}\` |`);
p(`| SHA-256 del capítulo | \`${d[0].canonico.sha256}\` |`);
p(
  `| Estado declarado en los manifiestos | \`${d[0].estadoDeclarado.status}\`, \`publishAllowed: ${d[0].estadoDeclarado.publishAllowed}\` |`,
);
p();
p("---");
p();

d.forEach((m, i) => {
  const n = String(i + 1).padStart(2, "0");
  const titulo = m.escenas[0]?.titulo ?? m.experiencia;
  p(`## MG${n} · ${titulo}`);
  p();
  p("| | |");
  p("| --- | --- |");
  p(`| Identificador | \`${m.experiencia}\` |`);
  p(`| Guía | \`${m.guia}\` |`);
  p(
    `| Manifiesto | \`${m.manifestId}\` — [\`${m.archivo}\`](../../${m.archivo}) |`,
  );
  p(`| SHA-256 del manifiesto | \`${m.canonico.manifestSha256}\` |`);
  p(`| Concepto | \`${m.concepto}\` |`);
  p(`| Tipo de práctica | \`${m.practiceKind}\` |`);
  if (m.ancla) {
    p(`| Ancla en el capítulo | «${m.ancla.heading}» |`);
    p(`| Huella del ancla | «${m.ancla.fingerprint}…» |`);
  }
  p(
    `| Orden de escenas | ${m.escenas.map((s) => TIPO[s.tipo] ?? s.tipo).join(" → ")} |`,
  );
  p();

  p("### El recorrido, escena por escena");
  p();
  m.escenas.forEach((s) => {
    p(
      `#### ${s.orden}. ${TIPO[s.tipo] ?? s.tipo} — ${s.titulo ?? "(sin título)"}`,
    );
    p();
    s.cuerpo.forEach((par) => {
      p(par);
      p();
    });
    if (s.nota) {
      p(`> **Nota en pantalla.** ${s.nota}`);
      p();
    }
    if (s.accion) {
      p(`*Botón:* **${s.accion}**`);
      p();
    }
  });

  if (m.practica && !m.practica.ausente) {
    p("### La práctica, con sus instrucciones y opciones");
    p();
    p(`**${m.practica.titulo}**`);
    p();
    p(
      `Tipo \`${m.practica.tipo}\` · \`${m.practiceKind}\` · ancla «${m.practica.encabezadoFuente}»`,
    );
    p();
    const it = m.practica.interaccion ?? {};
    renderInteraccion(it);
  }

  if (m.recuerdo && !m.recuerdo.ausente) {
    p("### El recuerdo activo, con su respuesta");
    p();
    p(`**${m.recuerdo.pregunta}**`);
    p();
    m.recuerdo.opciones.forEach((o) => {
      const ok = o.key === m.recuerdo.correcta;
      p(`- ${ok ? "**✓** " : ""}${o.label}`);
    });
    p();
    if (m.recuerdo.devolucion) {
      p(`*Si acierta:* ${m.recuerdo.devolucion.correct}`);
      p();
      p(`*Si no:* ${m.recuerdo.devolucion.review}`);
      p();
    }
    p(
      "> **La respuesta correcta no viaja al cliente.** Se marca aquí porque sin ella",
    );
    p(
      "> no se puede juzgar si los distractores son justos, pero la definición de la",
    );
    p("> Experience no la lleva — hay comprobación que lo exige.");
    p();
  }

  p("### Lo que la microguía declara sobre sí misma");
  p();
  const pr = m.privacidad ?? {};
  p(
    `- **Privacidad:** el texto libre ${pr.freeTextLeavesDevice ? "**SALE** del dispositivo" : "no sale del dispositivo"}; ${pr.emotionalInference ? "**hay** inferencia emocional" : "sin inferencia emocional"}; ${pr.diagnosis ? "**hay** diagnóstico" : "sin diagnóstico"}; ${pr.requiresIntenseEmotion ? "**requiere** emoción intensa" : "no requiere emoción intensa"}.`,
  );
  p(`- **Pasos de guía:** ${m.pasosDeGuia.map((g) => g.kind).join(" → ")}.`);
  p(
    `- **Aprobaciones que cita el manifiesto:** ${m.aprobacionesCitadas.map((a) => (a.startsWith("http") ? `[acta](${a})` : `«${a}»`)).join(" · ")}.`,
  );
  p();
  p(
    `<details><summary>Requisitos de accesibilidad declarados (${m.accesibilidad.length})</summary>`,
  );
  p();
  m.accesibilidad.forEach((a) => p(`- ${a}`));
  p();
  p("</details>");
  p();
  p("---");
  p();
});

p("## Qué conviene mirar al revisar");
p();
p(
  "No es una lista de fallos: son los sitios donde una decisión editorial cambia lo",
);
p("que la persona lee, y por tanto donde tu criterio pesa más que el mío.");
p();
p(
  "1. **La huella del ancla.** Cada microguía apunta a un encabezado del capítulo y",
);
p(
  "   a una frase literal dentro de él. Si el capítulo se reescribe, el ancla deja de",
);
p(
  "   encontrarse y la práctica no se puede montar — eso es exactamente lo que retiró",
);
p("   al par del piloto V1. Las cinco anclas van en sus tablas.");
p(
  "2. **Los distractores.** Las dos opciones que no son la correcta están escritas",
);
p(
  "   como lecturas plausibles que el propio capítulo corrige, no como disparates. Si",
);
p(
  "   alguna te parece demasiado fácil o demasiado capciosa, es una frase editable.",
);
p(
  "3. **Las notas en pantalla.** Varias dicen qué NO hace la microguía («no evalúa lo",
);
p(
  "   que sabes ni infiere nada sobre ti»). Son promesas al lector, y conviene que las",
);
p("   firmes tú.");
p(
  "4. **El cierre.** La última escena es lo que queda cuando la persona termina; es el",
);
p(
  "   lugar donde una microguía puede sonar a examen en vez de a lectura acompañada.",
);
p();

// ── Dos observaciones que salen del dato, no de mi impresión ──────────────────
//
// Las dos se CALCULAN. La primera versión de esta sección decía «MG04 y MG05 son
// las únicas donde la persona escribe algo propio», escrito a mano y falso: hay
// dos vías distintas de escritura y una de ellas vive dentro de la práctica.
// Contarlas desde los manifiestos evita volver a afirmarlo de memoria.
const conEscenaEscritura = d.filter((m) =>
  m.escenas.some((s) => s.tipo === "REFLECTION" || s.tipo === "QUESTION"),
);
const conTextoLibre = d.filter(
  (m) => (m.practica?.interaccion ?? {}).allowsFreeText === true,
);
const conAcotacion = d.filter((m) =>
  m.escenas.some((s) =>
    s.tipo === "CONCEPT" || s.tipo === "EXAMPLE" ? s.cuerpo.length > 1 : false,
  ),
);
const nombra = (xs) => {
  const ids = xs.map((m) => m.manifestId.replace("EEC-C01-", ""));
  if (ids.length <= 1) return ids.join("");
  return `${ids.slice(0, -1).join(", ")} y ${ids[ids.length - 1]}`;
};

p("### Dos observaciones que salen del propio contenido");
p();
p(
  `- **${conAcotacion.length} de las cinco llevan un párrafo que acota su propia tesis** ` +
    `(${nombra(conAcotacion)}): un segundo párrafo en Concepto o Ejemplo que marca ` +
    "hasta dónde llega la idea — que dos teorías miren cosas distintas no las vuelve " +
    "equivalentes, que la secuencia es pedagógica y no una cadena cerebral rígida, que " +
    "el construccionismo es el mapa de este libro y no un consenso cerrado. Son las " +
    "frases que impiden afirmar más que el capítulo; conviene leerlas como una familia " +
    "y decidir si las cinco deberían tenerla.",
);
p(
  `- **${new Set([...conEscenaEscritura, ...conTextoLibre]).size} de las cinco dejan escribir, por dos vías distintas.** ` +
    `${nombra(conEscenaEscritura)} añaden una **escena dedicada** y opcional, que puede saltarse. ` +
    `Y dentro de la **práctica**, ${nombra(conTextoLibre)} admiten texto libre además de las ` +
    "opciones; las otras sólo se eligen. Todas prometen que el texto se queda en el dispositivo.",
);
p();

writeFileSync(OUT, out.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
console.log(`escrito: ${OUT} (${out.join("\n").length} caracteres)`);
if (sinNombrar.length > 0)
  console.log("campos sin nombrar:", [...new Set(sinNombrar)].join(", "));
else console.log("todos los campos de interacción tienen nombre");

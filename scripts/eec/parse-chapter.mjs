/**
 * EEC — manuscrito → bloques tipados.
 *
 * Copia literal de las reglas que `apps/api/scripts/ingest-chapter-md.mjs`
 * aplicó cuando se sembró el contenido que hoy está en producción. Vive aquí
 * porque aquel script está CONGELADO (`LEGACY_INGEST_FORBIDDEN_IN_PRODUCTION`,
 * Content Core CC-5) y ejecuta `main()` al importarse: acoplar el build a él lo
 * volvería a poner en marcha.
 *
 * Que las reglas sean las mismas no es cosmético. El emparejador de CC-1 lleva
 * la identidad de un bloque hacia adelante comparando hash y similitud; si el
 * build partiera el texto de otra forma, cada bloque parecería nuevo y las
 * marcas del lector quedarían huérfanas. Cambiar algo aquí es cambiar qué
 * subrayados sobreviven — no es una decisión de formato.
 */

const HEADING_MAX_LEN = 80;
const EXERCISE_HEADING =
  /actividad|ejercicio|exploraci[oó]n.*guiada|pr[aá]ctica guiada/i;
const REFERENCES_HEADING = /referencias bibliogr/i;
const FENCE = /^:::\s*(pausa|ejercicio|video)\s*$/i;
const FENCE_END = /^:::\s*$/;
const FENCE_KIND = {
  pausa: "PAUSE",
  ejercicio: "EXERCISE",
  video: "VIDEO_MOCK",
};

/**
 * A short line without terminal punctuation reads as an implicit section
 * heading — that's how this manuscript separates sections (no `##`).
 */
function isImplicitHeading(line) {
  return (
    line.length > 0 &&
    line.length < HEADING_MAX_LEN &&
    !/[.?!:…;,"”'’)]$/.test(line)
  );
}

const PAUSE_MOCK =
  "Haz una pausa aquí. Suelta el libro un momento, respira profundo tres veces y nota qué se mueve en tu cuerpo con lo que acabas de leer. No hay respuesta correcta — solo observa.";
// Caption for the VIDEO block. No 🎬 prefix / "próximamente" prose — the
// VideoBlock component renders the play frame + "en producción" state itself.
const VIDEO_MOCK = (title) =>
  `Cápsula del capítulo: el autor conversa sobre «${title}».`;
const EXERCISE_MOCK = (heading) =>
  `✍️ Actividad interactiva — próximamente. «${heading}» se convertirá en un ejercicio guiado dentro de la app (con espacio para responder y guardar). Por ahora, léela como una invitación y, si quieres, llévala a tu Diario o conversa con Eco.`;

/**
 * Parse a manuscript file into { title, blocks: [{kind, content}] }.
 *
 * Fidelity first: manuscript prose stays PARAGRAPH; QUOTE/HEADING come from
 * real Markdown or implicit-heading detection. We DON'T convert whole
 * sections to EXERCISE (that would mangle prose-heavy activity sections).
 * Instead, when a heading looks like an activity/guided-reflection, we drop
 * ONE interactive mock card right after it so the EXERCISE block kind is
 * visible and the reader knows where the real activity will land — while the
 * author's text below stays readable prose.
 *
 * VIDEO mocks render as first-class VIDEO blocks (the real player shows an
 * "en producción" placeholder until ops sets `meta.videoUrl`). The caption
 * goes in `content`. `titleFallback` (from titles.json / filename) is used
 * when the first line is too long to be a real chapter title (e.g. a
 * narrative opening).
 */
export function parseChapter(raw, titleFallback) {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim());

  let title = null;
  const blocks = [];
  let fence = null; // active ::: fence kind
  let fenceBuf = [];

  const pushSpecial = (kind, content) => {
    if (!content) return;
    if (kind === "VIDEO_MOCK") blocks.push({ kind: "VIDEO", content });
    else blocks.push({ kind, content });
  };
  const pushHeading = (text) => {
    blocks.push({ kind: "HEADING", content: text });
    if (EXERCISE_HEADING.test(text) && !REFERENCES_HEADING.test(text)) {
      blocks.push({ kind: "EXERCISE", content: EXERCISE_MOCK(text) });
    }
  };
  const takeTitle = (text) => {
    // A real title is short; a long first line is a narrative opening →
    // keep it as the first paragraph and use the fallback title.
    if (text.length <= 120 && !/[.]$/.test(text)) {
      title = text;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    if (!line) continue;

    // ::: fenced specials (forward-compat with curated Markdown).
    if (fence) {
      if (FENCE_END.test(line)) {
        pushSpecial(fence, fenceBuf.join(" "));
        fence = null;
        fenceBuf = [];
      } else fenceBuf.push(line);
      continue;
    }
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      fence = FENCE_KIND[fenceMatch[1].toLowerCase()];
      continue;
    }

    // Explicit Markdown markers.
    if (/^#{1,3}\s+/.test(line)) {
      const text = line.replace(/^#{1,3}\s+/, "");
      if (!title && takeTitle(text)) continue;
      pushHeading(text);
      continue;
    }
    if (/^>\s+/.test(line)) {
      blocks.push({ kind: "QUOTE", content: line.replace(/^>\s+/, "") });
      continue;
    }

    // First non-empty line = chapter title if it's short enough.
    if (title === null) {
      if (takeTitle(line)) continue;
      title = titleFallback ?? "Sin título";
      blocks.push({ kind: "PARAGRAPH", content: line }); // narrative opening
      continue;
    }

    if (isImplicitHeading(line)) {
      pushHeading(line);
      continue;
    }

    blocks.push({ kind: "PARAGRAPH", content: line });
  }

  injectMocks(blocks, title ?? titleFallback ?? "este capítulo");
  return { title: title ?? titleFallback ?? "Sin título", blocks };
}

function injectMocks(blocks, title) {
  // Insert point: right before the references section, else the end.
  let insertAt = blocks.findIndex(
    (b) => b.kind === "HEADING" && REFERENCES_HEADING.test(b.content),
  );
  if (insertAt === -1) insertAt = blocks.length;

  // 🎬 video capsule at the end of the readable body. Ships as a VIDEO block
  // with no meta.videoUrl → the real player renders an "en producción"
  // placeholder until ops uploads the file and sets meta.videoUrl.
  blocks.splice(insertAt, 0, {
    kind: "VIDEO",
    content: VIDEO_MOCK(title),
  });

  // One curated pause ~45% through if the manuscript has none.
  if (!blocks.some((b) => b.kind === "PAUSE")) {
    const mid = Math.max(1, Math.round(blocks.length * 0.45));
    blocks.splice(mid, 0, { kind: "PAUSE", content: PAUSE_MOCK });
  }
}

/**
 * Strip inline Markdown from a heading that is about to be quoted inside
 * generated prose.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Two of the ingest script's templates interpolate a manuscript heading into a
 * sentence the READER sees:
 *
 *     «${heading}» se convertirá en un ejercicio guiado…
 *     Cápsula del capítulo: el autor conversa sobre «${title}».
 *
 * A heading is Markdown SOURCE, so it legitimately carries `**`, `*` and
 * backticks. Copying it verbatim prints those markers on screen — which is how
 * `«**El ejercicio no se aprueba sintiéndote mejor.**»` ended up visible in
 * chapter 5 of *Emociones en Construcción*, four asterisks and all.
 *
 * ── Why the markers are DROPPED and not preserved ─────────────────────────
 *
 * Everywhere else in this pipeline, emphasis is preserved: the repair of
 * 2026-10-26 moved it out of the text and into `meta.inlineMarks`, because the
 * contract is that content is exactly what you read and formatting lives
 * beside it.
 *
 * This case is the exception, and deliberately so. The text here is not
 * manuscript prose — it is a sentence this pipeline writes, quoting a heading.
 * The angle quotes already carry the emphasis, and `EXERCISE` has nowhere to
 * store inline marks, which is exactly why that repair had to EXCLUDE this
 * block rather than fix it. Dropping a marker from generated scaffolding loses
 * nothing an author wrote.
 *
 * ── Deliberately narrow ───────────────────────────────────────────────────
 *
 * It normalises what goes INSIDE a generated sentence and never touches
 * manuscript prose. It is not a Markdown renderer: there is no link, image,
 * list or heading handling, because a heading quoted in a sentence does not
 * contain them, and a half-built renderer invites being used as a whole one.
 */

/** A heading, as prose: no emphasis markers, no code ticks. */
export function plainHeading(heading) {
  return String(heading ?? "")
    // Bold first: `**x**` would otherwise be eaten as two italics.
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    // Single markers, without consuming a neighbouring one.
    .replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_(?!_)([^_]+?)_(?!_)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

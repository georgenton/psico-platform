/**
 * What a chapter is allowed to be CALLED.
 *
 * `Chapter.order` is a platform ordering key. It says where a unit sits in the
 * reading sequence — nothing more. In «Parejas que Perduran» the preface holds
 * `order = 1`, so the book's editorial chapter 1 sits at `order = 2` and the
 * reader was being told «Cap. 2» about a page whose own title page says one.
 *
 * That is a fabricated number, and a number is a claim. The audit behind this
 * module looked for somewhere honest to get it — `Chapter`, `ContentUnitVersion`,
 * `ContentUnitRead`, the public types, and the code-owned content sidecars — and
 * found nothing: no `displayNumber`, no `displayLabel`, no `chapterKind`, no
 * `isPreface`. There is no field that distinguishes front matter from a chapter,
 * for any book.
 *
 * So the rule is: say only what we know.
 *
 *   - An explicit editorial label, when one day a book carries one, wins.
 *   - Otherwise the chapter is named by its TITLE, with no numeric prefix.
 *
 * Deriving the number instead — `order - 1` for one slug, say — would trade a
 * wrong number for a wrong number that is harder to notice. There are no
 * per-book special cases here on purpose.
 *
 * Scope of what this module settles, stated plainly so nobody reads it as more:
 *
 *   EDITORIAL_LABEL_RULE_IMPLEMENTED=true      the presentation rule lives here
 *   EDITORIAL_LABEL_METADATA_PRESENT=false     nothing stores such a label
 *   EDITORIAL_LABEL_WIRING_COMPLETE=false      no contract, no transport, no wiring
 *   PLATFORM_ORDER_USED_AS_VISIBLE_NUMBER=false
 *
 * The presentation rule is ready. The day editorial metadata exists it will
 * still need a storage contract, a way across the API, and wiring into each
 * surface — this file is the last step of that chain, not the whole of it.
 */

export interface ChapterLabelInput {
  /**
   * An editorial label supplied by the book itself («Capítulo 1», «Prefacio»).
   *
   * Nothing populates this yet — no layer stores it, no endpoint carries it,
   * nothing passes it in. It exists so the honest branch is already the first
   * one when that chain is built, not because the chain is half built.
   *
   * Until then a book with no front matter still gets no «Capítulo 1»:
   * NOT_SUPPORTED_UNTIL_EDITORIAL_METADATA_EXISTS.
   */
  editorialLabel?: string | null;
  title: string;
  partNumber?: number | null;
  partTitle?: string | null;
}

/**
 * The heading a reader sees for the chapter — title-first, number only when a
 * book actually declared one.
 */
export function chapterHeading({
  editorialLabel,
  title,
}: ChapterLabelInput): string {
  const label = editorialLabel?.trim();
  return label ? `${label} · ${title}` : title;
}

/**
 * The small line above the heading: which part of the book this belongs to.
 *
 * Parts ARE stored (`partNumber` / `partTitle`), editorially set, and nullable
 * — a single-part book simply leaves them empty and gets no eyebrow. Unlike the
 * chapter number, this one is real.
 */
export function chapterPartEyebrow({
  partNumber,
  partTitle,
}: ChapterLabelInput): string | null {
  if (partNumber == null || !partTitle) return null;
  return `Parte ${partNumber} — ${partTitle}`;
}

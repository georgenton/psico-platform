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
 */

export interface ChapterLabelInput {
  /**
   * An editorial label supplied by the book itself («Capítulo 1», «Prefacio»).
   *
   * Nothing populates this yet — no layer stores it. It exists so that the day
   * a book does carry one, the honest branch is already the first one, and the
   * change is a wiring change rather than a rewrite of every heading.
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

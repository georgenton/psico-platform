import { READER_REF_SEGMENT, type ReaderChapterRef } from "@psico/types";

/**
 * Where a chapter lives in the mobile router (Phase B.A).
 *
 * The discriminator segment (`u` / `c`) comes from `READER_REF_SEGMENT`, the
 * same constant the web paths and the API routes use — so the three grammars
 * cannot drift into disagreeing about what a `u` means.
 *
 * The path shape itself is the app's own: `/books/:slug/lector/...`, matching
 * how every other mobile reader link is built.
 */
export function readerRoutePath(
  bookSlug: string,
  ref: ReaderChapterRef,
): string {
  return `/books/${encodeURIComponent(bookSlug)}/lector/${
    READER_REF_SEGMENT[ref.kind]
  }/${encodeURIComponent(ref.id)}`;
}

/**
 * Parse a route's `kind` segment back into a ref discriminator.
 *
 * Returns null for anything else rather than guessing: a URL we do not
 * recognise should 404 on its own terms, not silently open some chapter.
 */
export function readerRefKindFromSegment(
  segment: string | undefined,
): ReaderChapterRef["kind"] | null {
  if (segment === READER_REF_SEGMENT.unit) return "unit";
  if (segment === READER_REF_SEGMENT.chapter) return "chapter";
  return null;
}

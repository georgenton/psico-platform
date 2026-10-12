/**
 * Where the catalogue's authorship claims come from.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 *
 * `BookAuthor` rows record what somebody typed. They do not record who said
 * it or on what authority, and until now nothing in this repository did. The
 * seed therefore created an author with a doctorate, a licence number and
 * `isVerified: true` — none of which anybody had accredited — and the public
 * book detail served all three. A row is not a source.
 *
 * So each attribution below names the document that backs it. A book absent
 * from this table has NO source in this repository, and the honest value for
 * it is `PENDING`, not a guess borrowed from the nearest neighbour.
 *
 * ── What a source of editorial authorship is NOT ──────────────────────────
 *
 * The coordination document accredits WHO WROTE THE BOOK. It accredits
 * nothing else, and the distinction is the whole point of this change:
 *
 *   · not a doctorate or any professional title
 *   · not a licence or college registration number
 *   · not professional verification (`isVerified`)
 *   · not ownership of a user account
 *   · not `AuthorBook` / `AuthorProfile` permissions
 *   · not royalties, payouts or any economic right
 *
 * Being the author of a book is not the same as being a verified clinician,
 * and this table must never be read as promoting one into the other.
 */

/** A claim we can point at a document for. */
export interface AuthorshipSource {
  /** `Book.slug` the claim is about. */
  bookSlug: string;
  /** The work's title, for human-readable plans. */
  bookTitle: string;
  /** Editorial author, exactly as the source writes the name. */
  authorName: string;
  /** `BookAuthor.slug` — derived once, here, so nothing re-derives it. */
  authorSlug: string;
  /** The document that backs this, so a reviewer can check it. */
  source: string;
}

/**
 * The two works the coordination document records explicitly.
 *
 * Deliberately NOT a rename of the existing demo row. One `BookAuthor` row
 * can carry several books, so renaming it would silently re-attribute the
 * others and fuse two identities into one. These are attributions of
 * particular works to particular authors.
 */
export const AUTHORSHIP_SOURCES: readonly AuthorshipSource[] = [
  {
    bookSlug: "emociones-en-construccion",
    bookTitle: "Emociones en Construcción",
    authorName: "Jorge Quizamanchuro",
    authorSlug: "jorge-quizamanchuro",
    source:
      "Notion · «07 — Libros prioritarios: Parejas y Emociones» (Emociones en construcción → Jorge Quizamanchuro)",
  },
  {
    bookSlug: "parejas-que-perduran",
    bookTitle: "Parejas que perduran",
    authorName: "David Jaramillo",
    authorSlug: "david-jaramillo",
    source:
      "Notion · «07 — Libros prioritarios: Parejas y Emociones» (Parejas que perduran → David Jaramillo, edición impresa entregada, TEXT_LOCKED)",
  },
] as const;

/**
 * Books present in the catalogue whose authorship this repository cannot
 * source. They are listed so that "we did not check" and "we checked and
 * found nothing" stop looking identical in a plan.
 *
 * `familias-ensambladas` is here on purpose: it currently points at the demo
 * author row, and no document in reach attributes it to anyone. Extrapolating
 * either name from the table above would be inventing an attribution.
 */
export const AUTHORSHIP_PENDING: readonly string[] = [
  "familias-ensambladas",
] as const;

export const sourceForBook = (slug: string): AuthorshipSource | undefined =>
  AUTHORSHIP_SOURCES.find((s) => s.bookSlug === slug);

/**
 * Author identities created by fixtures rather than by an editorial source.
 *
 * The row is NOT deleted — it carries books, and deleting an author with
 * relations would detach them. What is withdrawn is the set of claims nobody
 * accredited. Withdrawing them says "no source on file in this repository";
 * it does NOT say the person does not exist, nor that any credential was
 * forged. We have no evidence for either and must not imply them.
 */
export const FIXTURE_AUTHOR_SLUGS: readonly string[] = [
  "marina-quintana",
] as const;

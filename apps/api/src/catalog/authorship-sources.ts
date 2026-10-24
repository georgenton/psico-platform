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
 * The works a document in reach records explicitly.
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
    bookSlug: "familias-ensambladas",
    bookTitle: "Familias Ensambladas",
    authorName: "Jorge Quizamanchuro",
    authorSlug: "jorge-quizamanchuro",
    // This entry exists because the deferral it used to describe was lifted,
    // in writing, by a later decision — not because the earlier reasoning was
    // wrong. #797 withdrew the book from publication and left the attribution
    // PENDING on the explicit grounds that the note of 2026-10-13 «no
    // autoriza corregir la fila ahora». The authorisation of 2026-10-23 says
    // the opposite in its own words: it names the author of this work and
    // states that it «levanta el aplazamiento operativo anterior de esas
    // atribuciones de catálogo».
    //
    // It accredits authorship and nothing else — no title, no licence, no
    // verification, no bio — which is exactly what this table is allowed to
    // carry. The planner links the book to the sourced row; it does not
    // rename the fixture identity, which also carries copy of its own.
    source:
      "Autorización operativa de Jorge Quizamanchuro · 2026-10-23 · §3.B «Autoría del catálogo» (Familias ensambladas → Jorge Quizamanchuro)",
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
 * Empty is a legitimate state and NOT the same as "there is nothing to say":
 * every book the planner meets is either sourced above or named here, and a
 * book in neither list is reported as unrecognised rather than skipped.
 */
export const AUTHORSHIP_PENDING: readonly string[] = [] as const;

/* ── Publication state decided editorially ──────────────────────────────── */

/**
 * Works whose publication state is an editorial decision on record.
 *
 * ── Why this is a separate table from authorship ──────────────────────────
 *
 * Who wrote a book and whether it is offered to readers are different claims
 * with different sources. Conflating them would let an attribution carry a
 * publication change along with it, which is how a retained work gets served
 * by accident.
 *
 * ── Why the only direction is withdrawal ─────────────────────────────────
 *
 * The decision on record retains works; it never opens one. Encoding a
 * two-way `isPublished` here would let a future edit publish a retained work
 * through a repair plan — a route nobody would look at for that. So the
 * planner reads this table as "must not be served" and can only move a row
 * from published to retained. Publishing a work stays where it belongs: an
 * explicit editorial act, through the normal surfaces.
 */
export interface RetentionDecision {
  /** `Book.slug` the decision is about. */
  bookSlug: string;
  /** The work's title, for human-readable plans. */
  bookTitle: string;
  /** The document that backs it, so a reviewer can check it. */
  source: string;
}

export const RETAINED_BOOKS: readonly RetentionDecision[] = [
  {
    bookSlug: "familias-ensambladas",
    bookTitle: "Familias Ensambladas",
    // The seed stopped publishing this book in #797, but only on `create`:
    // `isPublished` was deliberately taken out of the upsert's `update` so a
    // hosted row could be retired without editing the file. Nothing has
    // retired the hosted row yet, so a database seeded before that change
    // still serves the book. That is the gap this entry closes.
    source:
      "Autorización operativa de Jorge Quizamanchuro · 2026-10-23 · §3.C «Disponibilidad» (Familias debe respetar «Aún no disponible»)",
  },
] as const;

export const retentionForBook = (
  slug: string,
): RetentionDecision | undefined =>
  RETAINED_BOOKS.find((r) => r.bookSlug === slug);

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

/* ── Naming a fixture identity in editorial copy ─────────────────────────── */

/**
 * Withdrawing the foreign key and the credentials is not the whole repair.
 *
 * The UAT of 2026-10-22 measured two leftovers served publicly, without a
 * session, on a catalogue whose attribution had already been corrected: the
 * anchor book's synopsis opened with the fixture identity's name, and that
 * identity's bio asserted a professional specialty. A name in prose credits
 * exactly as effectively as a foreign key does, and nothing was checking prose.
 *
 * So the names are DERIVED from the slugs above rather than written down
 * anywhere: declare a new fixture identity and its copy is covered with it, in
 * the planner and in the ratchet alike. This is the same derivation the
 * onboarding ratchet already does (`onboarding/motivos-alignment.spec.ts`).
 */

/** Accents off, so `jose-perez` still recognises «José Pérez». */
const deaccent = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Is this match written as a proper noun — `Marina`, `MARINA`, not `marina`? */
function hasCapitalisedMatch(haystack: string, token: string): boolean {
  const re = new RegExp(`\\b${escapeRe(token)}\\b`, "gi");
  for (const m of haystack.matchAll(re)) {
    const first = m[0]!.charAt(0);
    if (first !== first.toLowerCase()) return true;
  }
  return false;
}

/**
 * Which fixture identities, if any, this piece of copy names.
 *
 * ── Why two different strictnesses ────────────────────────────────────────
 *
 * The planner acts on the answer by replacing editorial copy, so a false
 * positive destroys a legitimate synopsis. The hazard is not hypothetical for
 * a rule that must also cover identities declared later: a fixture slug like
 * `luz-blanco` or `paz-moreno` turns ordinary Spanish words into triggers.
 *
 *   · Two or more tokens in sequence («Marina Quintana») is not a
 *     coincidence, so it matches regardless of case.
 *   · A single token on its own may be a common word, so it only counts when
 *     written as a proper noun — «Marina» yes, «la vida marina» no.
 *
 * Returns the SLUGS it recognised, never the matched text: what a reviewer
 * needs is which identity was named and where.
 */
export function fixtureIdentitiesNamedIn(
  text: string | null | undefined,
  slugs: readonly string[] = FIXTURE_AUTHOR_SLUGS,
): string[] {
  if (!text) return [];
  const haystack = deaccent(text);
  const named: string[] = [];
  for (const slug of slugs) {
    const tokens = slug.split("-").map(deaccent).filter(Boolean);
    if (tokens.length === 0) continue;
    const fullName =
      tokens.length > 1 &&
      new RegExp(`\\b${tokens.map(escapeRe).join("\\s+")}\\b`, "i").test(
        haystack,
      );
    if (fullName || tokens.some((t) => hasCapitalisedMatch(haystack, t))) {
      named.push(slug);
    }
  }
  return named;
}

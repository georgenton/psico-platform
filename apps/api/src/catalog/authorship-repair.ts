import {
  BOOK_COPY_FIELDS,
  BOOK_COPY_WITHDRAWAL,
  fieldDigest,
  type BookCopyField,
} from "./authorship-plan-file";
import {
  AUTHORSHIP_PENDING,
  AUTHORSHIP_SOURCES,
  FIXTURE_AUTHOR_SLUGS,
  RETAINED_BOOKS,
  fixtureIdentitiesNamedIn,
  type AuthorshipSource,
  type RetentionDecision,
} from "./authorship-sources";

/**
 * Planning the catalogue's authorship repair.
 *
 * ── Why a planner, separate from the writing ──────────────────────────────
 *
 * Correcting a row is the easy half. The half that goes wrong is deciding
 * WHICH row, on what authority, and what to do when the database does not
 * look the way the plan assumed. So the decision is a pure function over a
 * snapshot: same snapshot in, same plan out, no client, no environment, no
 * writes. The applier then refuses to execute an operation whose row no
 * longer matches what the plan was built against.
 *
 * That split is what makes "a concurrent change blocks the application" a
 * property we can test rather than a hope.
 *
 * ── Why expectations are digests, not literals and not shapes ─────────────
 *
 * An operation that withdraws an unfounded licence number must check it is
 * withdrawing the value it meant to. It must NOT do that by pinning the
 * literal string: this repository is public, and committing a fabricated
 * credential into the very file that removes it would publish the thing being
 * retired.
 *
 * The first version therefore used structural expectations — "a non-null
 * title", "verified" — and that was not enough: a title changing from one
 * non-null string to a DIFFERENT non-null string satisfied them, so the
 * applier would have withdrawn a value nobody reviewed. Expectations are now
 * per-field SHA-256 digests, which are exact enough to catch A → B and reveal
 * nothing. The row's `name` and `slug` travel with them, because the right
 * fields on the wrong row is still the wrong write.
 */

/**
 * Everything the planner needs to know about the live catalogue.
 *
 * The copy fields are REQUIRED, not optional. An optional `summary` would let
 * a caller read the catalogue without asking for the column and get a plan
 * that reports nothing to withdraw — which is this file's one unforgivable
 * confusion: "we did not look" and "we looked and found nothing" must not
 * produce the same plan.
 */
export interface CatalogSnapshot {
  authors: ReadonlyArray<{
    id: string;
    slug: string;
    name: string;
    title: string | null;
    licenseNumber: string | null;
    /** Editorial prose about the person. Unsourced on a fixture identity. */
    bio: string | null;
    isVerified: boolean;
  }>;
  books: ReadonlyArray<{
    id: string;
    slug: string;
    title: string;
    authorId: string | null;
    /** Long-form synopsis, served on the public detail page. */
    summary: string | null;
    /** One or two sentences, served on the public cards. */
    description: string | null;
    /**
     * Whether the catalogue currently offers the work. REQUIRED for the same
     * reason the copy fields are: a caller who did not ask for the column
     * would otherwise get a plan reporting nothing to retire, and "we did not
     * look" would be indistinguishable from "it is already retired".
     */
    isPublished: boolean;
  }>;
}

export type RepairOp =
  /**
   * Withdraw professional claims nobody accredited. The row stays; only the
   * unfounded fields are cleared, using states the current contract already
   * has — no new column, no migration.
   */
  | {
      kind: "withdraw-author-credentials";
      authorId: string;
      authorSlug: string;
      /**
       * EXACT expectation, as digests plus the row's identity.
       *
       * Presence booleans were not enough: a title changing from one non-null
       * string to a different non-null string left `hasTitle: true` either
       * way, so the applier would have withdrawn a value nobody reviewed. A
       * per-field digest catches A → B. `name` and `slug` are here because
       * identity matters too — the right fields on the wrong row is still the
       * wrong write.
       */
      expect: {
        name: string;
        slug: string;
        titleDigest: string | null;
        licenseDigest: string | null;
        bioDigest: string | null;
        isVerified: boolean;
      };
      next: {
        title: null;
        licenseNumber: null;
        bio: null;
        isVerified: false;
      };
    }
  /**
   * Withdraw public copy that names an identity nobody accredited.
   *
   * ── Why the copy needs its own operation ──────────────────────────────
   *
   * Correcting the foreign key corrected the byline and nothing else. The
   * UAT of 2026-10-22 measured the anchor book still opening its synopsis
   * with the fixture identity's first name while the header credited the
   * sourced author — one page crediting two people, the wrong one in prose.
   * A reader does not distinguish a byline from a sentence.
   *
   * ── Why a declared placeholder and not null, and not a rewrite ────────
   *
   * Three candidate outcomes, and the reasons the other two lose:
   *
   *   · REWRITE the sentence. The seed shows what the honest rewrite of the
   *     anchor book looked like — the name dropped, the verb and the article
   *     repaired — and a person did that with judgement. Regex surgery on
   *     arbitrary prose produces either ungrammatical Spanish or an
   *     editorial claim nobody reviewed, which is the thing this whole
   *     expediente exists to stop.
   *   · NULL it. The author's credentials go to null because absence is the
   *     honest state for a claim with no source. A synopsis is not a claim
   *     about a person: it describes a real, published work, and most of it
   *     is legitimate. Emptying it degrades a legitimate public page over a
   *     defect confined to one clause, and leaves nothing saying why.
   *
   * So the copy is WITHDRAWN to a fixed, declared placeholder: the false
   * credit stops being served, the page keeps a line, the placeholder is
   * visibly pending, and the literal survives in the private preimage for
   * whoever writes the replacement.
   *
   * This applies to a PENDING book too. `AUTHORSHIP_PENDING` says we may not
   * invent WHO wrote it; removing a name that no source backs invents
   * nothing.
   */
  | {
      kind: "withdraw-book-copy";
      bookId: string;
      bookSlug: string;
      /** The affected fields, in a stable order. Never empty. */
      fields: BookCopyField[];
      /** Which fixture identities the copy named — for the reviewer. */
      namedIdentities: string[];
      /**
       * EXACT expectation, same reasoning as the author's: digests catch a
       * value changing from one non-null string to a different one, and
       * reveal nothing. `slug` is the book's identity, so it travels too.
       */
      expect: {
        slug: string;
        summaryDigest: string | null;
        descriptionDigest: string | null;
      };
    }
  /** Create a source-backed author row. Name only — no credentials, ever. */
  | {
      kind: "create-author";
      authorSlug: string;
      authorName: string;
      source: string;
    }
  /** Point a book at the author its source names. */
  | {
      kind: "reattribute-book";
      bookId: string;
      bookSlug: string;
      authorSlug: string;
      authorName: string;
      /** The author id the book points at now; null when it has none. */
      expectAuthorId: string | null;
      /**
       * The id resolved at PLAN time, when the author already existed.
       *
       * Frozen here so the applier does not re-resolve by canonical slug: the
       * planner accepts a normalised match (` Jorge-Quizamanchuro ` is the
       * same identity), and an exact `findUnique({ slug })` in the applier
       * would miss exactly that row and mint a duplicate. `null` means "the
       * plan expects this author to be created by its own create-author op".
       */
      targetAuthorId: string | null;
      source: string;
    }
  /**
   * Stop offering a work the editorial decision retains.
   *
   * ── Why this is an operation and not a line in the seed ───────────────
   *
   * #797 stopped the seed from publishing this book, and deliberately took
   * `isPublished` out of the upsert's `update` so that a hosted row could be
   * retired without editing the file. The consequence is the one it intended
   * and the one still outstanding: a database seeded before that change goes
   * on serving the work no matter how many times the seed runs. Only a write
   * against the row closes it, and a write against a hosted row belongs in a
   * reviewed, frozen, reversible plan rather than in an ad-hoc statement.
   *
   * ── Why it only ever withdraws ────────────────────────────────────────
   *
   * There is no `isPublished: true` outcome here, by construction. A repair
   * plan is not where anybody would look for the act of publishing a work,
   * so it must not be able to perform it: the operation names the retained
   * state and carries no alternative. Publishing stays an explicit editorial
   * act through the normal surfaces.
   *
   * ── What it does not touch ────────────────────────────────────────────
   *
   * Nothing but the one column. Chapters, revisions, units, blocks, media,
   * anchors and every reader's own history stay exactly as they are: a work
   * that is no longer offered is not a work that never existed, and the
   * contract that preserves somebody's existing journey is a separate
   * guarantee this operation must not quietly cancel.
   */
  | {
      kind: "retire-book-publication";
      bookId: string;
      bookSlug: string;
      bookTitle: string;
      /**
       * EXACT expectation. `isPublished` is a boolean, so a digest adds
       * nothing a value does not; `slug` travels because the right column on
       * the wrong row is still the wrong write.
       */
      expect: { slug: string; isPublished: true };
      next: { isPublished: false };
      source: string;
    };

export type RepairBlocker = {
  /** What could not be planned. */
  subject: string;
  reason: string;
};

export type RepairNote = { subject: string; note: string };

export interface RepairPlan {
  ops: RepairOp[];
  /** Already correct — listed so a re-run visibly changes nothing. */
  satisfied: string[];
  /** Ambiguous or divergent: the plan refuses rather than guessing. */
  blockers: RepairBlocker[];
  /** Deliberately untouched, with the reason. */
  untouched: RepairNote[];
}

/**
 * Resolve a book slug to exactly one row.
 *
 * Absence and ambiguity are NOT the same answer, and the first version
 * collapsed both into "no book" — which sent an ambiguous slug to `untouched`
 * while the procedure documented that ambiguity blocks the whole plan. A work
 * that is not here is nothing to do; two rows claiming the same slug is a
 * question nobody has answered, and guessing which one to rewrite is exactly
 * the failure this tool exists to avoid.
 */
type BookResolution =
  | { kind: "found"; book: CatalogSnapshot["books"][number] }
  | { kind: "absent" }
  | { kind: "ambiguous"; count: number };

function findBook(snapshot: CatalogSnapshot, slug: string): BookResolution {
  const matches = snapshot.books.filter((b) => b.slug === slug);
  if (matches.length === 1) return { kind: "found", book: matches[0]! };
  if (matches.length === 0) return { kind: "absent" };
  return { kind: "ambiguous", count: matches.length };
}

/**
 * Resolve an author slug under normalisation, refusing to pick a winner.
 *
 * `find` would silently take the first of several normalised matches. Two rows
 * that normalise to the same slug are two identities the catalogue cannot tell
 * apart; choosing one would attach a book to a coin flip.
 */
type AuthorResolution =
  | { kind: "found"; author: CatalogSnapshot["authors"][number] }
  | { kind: "absent" }
  | { kind: "ambiguous"; count: number };

function findAuthor(snapshot: CatalogSnapshot, slug: string): AuthorResolution {
  const matches = snapshot.authors.filter((a) => sameSlug(a.slug, slug));
  if (matches.length === 1) return { kind: "found", author: matches[0]! };
  if (matches.length === 0) return { kind: "absent" };
  return { kind: "ambiguous", count: matches.length };
}

/**
 * Normalised comparison for author identity.
 *
 * Case and surrounding whitespace must not mint a second row for the same
 * person: `jorge-quizamanchuro` and ` Jorge-Quizamanchuro ` are one identity.
 */
const normaliseSlug = (s: string) => s.trim().toLowerCase();

const sameSlug = (a: string, b: string) =>
  normaliseSlug(a) === normaliseSlug(b);

/**
 * Refuse a snapshot that did not read the columns the plan reasons about.
 *
 * TypeScript cannot defend this at the only boundary where it matters:
 * `readSnapshot` casts the result of a Prisma `select` to `CatalogSnapshot`,
 * so a forgotten field arrives as `undefined` and the compiler never sees it.
 * Left alone, the copy passes would find nothing to withdraw and the plan
 * would report a clean catalogue — the precise failure this file refuses to
 * make elsewhere: "we did not look" must not read as "we looked and found
 * nothing".
 */
function assertSnapshotComplete(snapshot: CatalogSnapshot): void {
  const missing = (where: string, row: object, keys: readonly string[]) =>
    keys.filter((k) => !(k in row)).map((k) => `${where}.${k}`);

  const gaps = [
    ...snapshot.authors.flatMap((a) =>
      missing("authors", a, ["title", "licenseNumber", "bio", "isVerified"]),
    ),
    ...snapshot.books.flatMap((b) =>
      missing("books", b, [
        "authorId",
        "summary",
        "description",
        "isPublished",
      ]),
    ),
  ];
  if (gaps.length > 0) {
    throw new Error(
      `SNAPSHOT INCOMPLETO: faltan ${[...new Set(gaps)].sort().join(", ")}. Un plan sobre columnas que nadie leyó diría que no hay nada que retirar.`,
    );
  }
}

export function planAuthorshipRepair(
  snapshot: CatalogSnapshot,
  opts: {
    sources?: readonly AuthorshipSource[];
    retained?: readonly RetentionDecision[];
  } = {},
): RepairPlan {
  assertSnapshotComplete(snapshot);
  const sources = opts.sources ?? AUTHORSHIP_SOURCES;
  const retained = opts.retained ?? RETAINED_BOOKS;
  const plan: RepairPlan = {
    ops: [],
    satisfied: [],
    blockers: [],
    untouched: [],
  };

  // ── 1 · withdraw credentials nobody accredited ──────────────────────────
  for (const slug of FIXTURE_AUTHOR_SLUGS) {
    const resolved = findAuthor(snapshot, slug);
    if (resolved.kind === "ambiguous") {
      plan.blockers.push({
        subject: `autor ${slug}`,
        reason: `${resolved.count} filas normalizan al mismo slug; no se elige una para retirarle credenciales`,
      });
      continue;
    }
    if (resolved.kind === "absent") {
      plan.untouched.push({
        subject: `autor ${slug}`,
        note: "no existe en este entorno; nada que retirar",
      });
      continue;
    }
    const author = resolved.author;
    // The bio belongs with the credentials, in the same conditional write.
    // It is the same kind of thing — an assertion about a person on a row
    // with no editorial source — and the one the UAT found still claiming a
    // professional specialty. It goes to null for the reason the title does:
    // absence is how this tool says «no source on file», and inventing a
    // biography for an identity nobody accredited would be the original
    // defect in a new shape. Splitting it into its own operation would mean
    // two UPDATEs on one row and two chances to half-apply.
    const hasClaims =
      author.title !== null ||
      author.licenseNumber !== null ||
      author.bio !== null ||
      author.isVerified;
    if (!hasClaims) {
      plan.satisfied.push(
        `autor ${slug}: sin título, sin colegiatura, sin biografía y no verificado`,
      );
      continue;
    }
    plan.ops.push({
      kind: "withdraw-author-credentials",
      authorId: author.id,
      authorSlug: author.slug,
      expect: {
        name: author.name,
        slug: author.slug,
        titleDigest: fieldDigest(author.title),
        licenseDigest: fieldDigest(author.licenseNumber),
        bioDigest: fieldDigest(author.bio),
        isVerified: author.isVerified,
      },
      next: { title: null, licenseNumber: null, bio: null, isVerified: false },
    });
  }

  // ── 1b · withdraw public copy that names an unsourced identity ──────────
  //
  // Per ROW, not per slug: a book is identified here by its id, so the slug
  // ambiguity that blocks an ATTRIBUTION ("which row is the work?") does not
  // arise. Each row's own copy is a well-defined question.
  for (const book of snapshot.books) {
    const affected: BookCopyField[] = [];
    const named = new Set<string>();
    for (const field of BOOK_COPY_FIELDS) {
      const hits = fixtureIdentitiesNamedIn(book[field]);
      if (hits.length === 0) continue;
      affected.push(field);
      for (const slug of hits) named.add(slug);
    }
    if (affected.length === 0) continue;
    plan.ops.push({
      kind: "withdraw-book-copy",
      bookId: book.id,
      bookSlug: book.slug,
      fields: affected,
      namedIdentities: [...named].sort(),
      expect: {
        slug: book.slug,
        summaryDigest: fieldDigest(book.summary),
        descriptionDigest: fieldDigest(book.description),
      },
    });
  }

  // ── 1c · stop offering the works the editorial decision retains ─────────
  //
  // Before attribution, deliberately. If both are planned for the same work,
  // withdrawing it from the catalogue is the operation that must not be lost
  // to a blocker raised by the other one.
  for (const decision of retained) {
    const resolved = findBook(snapshot, decision.bookSlug);

    if (resolved.kind === "ambiguous") {
      plan.blockers.push({
        subject: `${decision.bookTitle} (${decision.bookSlug})`,
        reason: `${resolved.count} filas comparten el slug; no se puede identificar inequívocamente la obra a retirar`,
      });
      continue;
    }

    if (resolved.kind === "absent") {
      plan.untouched.push({
        subject: `${decision.bookTitle} (${decision.bookSlug})`,
        note: "sin fila identificada en el alcance consultado de este entorno; nada que retirar aquí",
      });
      continue;
    }

    const book = resolved.book;
    if (!book.isPublished) {
      plan.satisfied.push(
        `${decision.bookTitle}: ya retirado del catálogo (no publicado)`,
      );
      continue;
    }

    plan.ops.push({
      kind: "retire-book-publication",
      bookId: book.id,
      bookSlug: book.slug,
      bookTitle: book.title,
      expect: { slug: book.slug, isPublished: true },
      next: { isPublished: false },
      source: decision.source,
    });
  }

  // ── 2 · attribute the works a source names ──────────────────────────────
  /** Author slugs this plan already proposes creating. */
  const planned = new Set<string>();
  for (const source of sources) {
    const resolvedBook = findBook(snapshot, source.bookSlug);

    if (resolvedBook.kind === "ambiguous") {
      // Documented as blocking, so it blocks. Previously this landed in
      // `untouched` and the plan carried on.
      plan.blockers.push({
        subject: `${source.bookTitle} (${source.bookSlug})`,
        reason: `${resolvedBook.count} filas comparten el slug; no se puede identificar inequívocamente la obra a corregir`,
      });
      continue;
    }

    if (resolvedBook.kind === "absent") {
      // Not a failure of the repair, and not proof the work does not exist:
      // this snapshot is the catalogue rows this tool can see. The attribution
      // stays prepared for whenever the row is identified.
      plan.untouched.push({
        subject: `${source.bookTitle} (${source.bookSlug})`,
        note: `sin fila identificada en el alcance consultado de este entorno; la atribución a ${source.authorName} queda preparada, sin bootstrap ni ingesta`,
      });
      continue;
    }

    const book = resolvedBook.book;
    const resolvedAuthor = findAuthor(snapshot, source.authorSlug);

    if (resolvedAuthor.kind === "ambiguous") {
      plan.blockers.push({
        subject: `autor ${source.authorSlug}`,
        reason: `${resolvedAuthor.count} filas normalizan al mismo slug; no se elige una para atribuirle la obra`,
      });
      continue;
    }

    const existing =
      resolvedAuthor.kind === "found" ? resolvedAuthor.author : null;

    // A row under this slug carrying a different name is two people colliding.
    // Attaching the book to it would misattribute the work — the same refusal
    // `bootstrap-book` already makes.
    if (existing && existing.name.trim() !== source.authorName.trim()) {
      plan.blockers.push({
        subject: `autor ${source.authorSlug}`,
        reason: `la fila existente se llama «${existing.name}» y la fuente dice «${source.authorName}»; no se adjunta el libro a una identidad distinta`,
      });
      continue;
    }

    // One row, several works: the create belongs to the AUTHOR, not to each
    // book that names them. Pushing it per source emitted a duplicate alta
    // the moment a second work shared a new author — which is the shape the
    // catalogue has had since Familias gained a source — and the plan file
    // rejects duplicates, so the whole plan became unloadable.
    if (!existing && !planned.has(normaliseSlug(source.authorSlug))) {
      planned.add(normaliseSlug(source.authorSlug));
      plan.ops.push({
        kind: "create-author",
        authorSlug: source.authorSlug,
        authorName: source.authorName,
        source: source.source,
      });
    }

    if (existing && book.authorId === existing.id) {
      plan.satisfied.push(
        `${source.bookTitle}: ya atribuido a ${source.authorName}`,
      );
      continue;
    }

    plan.ops.push({
      kind: "reattribute-book",
      bookId: book.id,
      bookSlug: book.slug,
      authorSlug: source.authorSlug,
      authorName: source.authorName,
      expectAuthorId: book.authorId,
      // Frozen when the row exists, so the applier uses the id the planner
      // resolved under normalisation instead of re-looking-up an exact slug.
      targetAuthorId: existing?.id ?? null,
      source: source.source,
    });
  }

  // ── 3 · what stays untouched, and why ───────────────────────────────────
  for (const slug of AUTHORSHIP_PENDING) {
    const r = findBook(snapshot, slug);
    if (r.kind !== "found") continue;
    const book = r.book;
    plan.untouched.push({
      subject: `${book.title} (${slug})`,
      note: "AUTHORSHIP_SOURCE = PENDING — ninguna fuente de este repositorio lo atribuye; extrapolar un nombre de otra obra sería inventarlo",
    });
  }

  // A book in NEITHER table is not the same as a book nobody can source: it
  // is a book this expedient never considered. Saying so keeps the file's one
  // rule — "we did not look" and "we looked and found nothing" must not read
  // alike — true now that the pending list can legitimately be empty.
  const considered = new Set<string>([
    ...sources.map((s) => normaliseSlug(s.bookSlug)),
    ...AUTHORSHIP_PENDING.map(normaliseSlug),
  ]);
  for (const book of snapshot.books) {
    if (considered.has(normaliseSlug(book.slug))) continue;
    plan.untouched.push({
      subject: `${book.title} (${book.slug})`,
      note: "no figura en ninguna tabla de fuentes de este expediente; no se decide nada sobre su autoría",
    });
  }

  const touchedAuthorIds = new Set(
    plan.ops.flatMap((op) =>
      op.kind === "withdraw-author-credentials" ? [op.authorId] : [],
    ),
  );
  for (const a of snapshot.authors) {
    if (touchedAuthorIds.has(a.id)) continue;
    if (FIXTURE_AUTHOR_SLUGS.some((s) => sameSlug(a.slug, s))) continue;
    if (sources.some((s) => sameSlug(a.slug, s.authorSlug))) continue;
    plan.untouched.push({
      subject: `autor ${a.slug}`,
      note: "ajeno a este expediente; sus datos y credenciales no se tocan",
    });
  }

  return plan;
}

/** Human-readable, used by the CLI for the dry-run report and the PR. */
export function describePlan(plan: RepairPlan): string {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push(`OPERACIONES PROPUESTAS: ${plan.ops.length}`);
  for (const op of plan.ops) {
    if (op.kind === "withdraw-author-credentials") {
      push(`  · retirar credenciales sin fuente — autor ${op.authorSlug}`);
      // Presence and identity only: the digests stay out of the report, and
      // the literals were never in the plan to begin with.
      push(
        `      espera: fila «${op.expect.name}» · título=${
          op.expect.titleDigest ? "presente" : "nulo"
        } · colegiatura=${
          op.expect.licenseDigest ? "presente" : "nula"
        } · verificado=${op.expect.isVerified}`,
      );
      push(
        `      queda:  título=null · colegiatura=null · biografía=null · verificado=false`,
      );
    } else if (op.kind === "withdraw-book-copy") {
      push(`  · retirar copy sin fuente — libro ${op.bookSlug}`);
      push(
        `      nombra a: ${op.namedIdentities.join(", ")} · campos: ${op.fields.join(", ")}`,
      );
      // The replacement is read from the module constant, so the report
      // cannot describe a text the applier will not write.
      for (const f of op.fields) {
        push(`      queda:  ${f} = «${BOOK_COPY_WITHDRAWAL[f]}»`);
      }
      push(
        `      el texto anterior sólo queda en la preimagen privada, para reescribirlo`,
      );
    } else if (op.kind === "create-author") {
      push(`  · alta de autor ${op.authorSlug} («${op.authorName}»)`);
      push(
        `      sólo slug y nombre — sin título, colegiatura ni verificación`,
      );
      push(`      fuente: ${op.source}`);
    } else if (op.kind === "retire-book-publication") {
      push(`  · retirar del catálogo — libro ${op.bookSlug}`);
      push(`      espera: publicado=true · queda: publicado=false`);
      push(
        `      capítulos, versiones, medios e historial de lectura no se tocan`,
      );
      push(`      fuente: ${op.source}`);
    } else if (op.kind === "reattribute-book") {
      push(`  · atribuir ${op.bookSlug} → ${op.authorName}`);
      push(`      espera authorId actual: ${op.expectAuthorId ?? "null"}`);
      push(`      fuente: ${op.source}`);
    } else {
      // Exhaustive on purpose. A new operation reaching the report without a
      // branch would otherwise be described as whatever the last `else` said,
      // which is how a reviewer approves something they never read.
      const unreached: never = op;
      push(`  · OPERACIÓN NO DESCRITA: ${JSON.stringify(unreached)}`);
    }
  }

  push();
  push(`YA CORRECTO: ${plan.satisfied.length}`);
  for (const s of plan.satisfied) push(`  · ${s}`);

  push();
  push(`INTACTO: ${plan.untouched.length}`);
  for (const u of plan.untouched) push(`  · ${u.subject} — ${u.note}`);

  push();
  push(`BLOQUEOS: ${plan.blockers.length}`);
  for (const b of plan.blockers) push(`  · ${b.subject} — ${b.reason}`);

  return lines.join("\n");
}

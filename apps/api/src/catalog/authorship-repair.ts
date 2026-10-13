import { fieldDigest } from "./authorship-plan-file";
import {
  AUTHORSHIP_PENDING,
  AUTHORSHIP_SOURCES,
  FIXTURE_AUTHOR_SLUGS,
  type AuthorshipSource,
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

/** Everything the planner needs to know about the live catalogue. */
export interface CatalogSnapshot {
  authors: ReadonlyArray<{
    id: string;
    slug: string;
    name: string;
    title: string | null;
    licenseNumber: string | null;
    isVerified: boolean;
  }>;
  books: ReadonlyArray<{
    id: string;
    slug: string;
    title: string;
    authorId: string | null;
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
        isVerified: boolean;
      };
      next: { title: null; licenseNumber: null; isVerified: false };
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
const sameSlug = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export function planAuthorshipRepair(
  snapshot: CatalogSnapshot,
  opts: { sources?: readonly AuthorshipSource[] } = {},
): RepairPlan {
  const sources = opts.sources ?? AUTHORSHIP_SOURCES;
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
    const hasClaims =
      author.title !== null ||
      author.licenseNumber !== null ||
      author.isVerified;
    if (!hasClaims) {
      plan.satisfied.push(
        `autor ${slug}: sin título, sin colegiatura y no verificado`,
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
        isVerified: author.isVerified,
      },
      next: { title: null, licenseNumber: null, isVerified: false },
    });
  }

  // ── 2 · attribute the works a source names ──────────────────────────────
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

    if (!existing) {
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
      push(`      queda:  título=null · colegiatura=null · verificado=false`);
    } else if (op.kind === "create-author") {
      push(`  · alta de autor ${op.authorSlug} («${op.authorName}»)`);
      push(
        `      sólo slug y nombre — sin título, colegiatura ni verificación`,
      );
      push(`      fuente: ${op.source}`);
    } else {
      push(`  · atribuir ${op.bookSlug} → ${op.authorName}`);
      push(`      espera authorId actual: ${op.expectAuthorId ?? "null"}`);
      push(`      fuente: ${op.source}`);
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

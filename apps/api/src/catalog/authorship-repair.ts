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
 * ── Why expectations are shapes, not literals ─────────────────────────────
 *
 * An operation that withdraws an unfounded licence number must check it is
 * withdrawing the value it meant to. It must NOT do that by pinning the
 * literal string: this repository is public, and committing a fabricated
 * credential into the very file that removes it would publish the thing being
 * retired. So expectations are structural — "a non-null title", "verified" —
 * which is enough to detect that the row is the one the plan described and to
 * stop when it is not.
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
      /** Structural expectation; see the header on why it is not a literal. */
      expect: { hasTitle: boolean; hasLicense: boolean; isVerified: boolean };
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

/** Resolve a book slug to exactly one row, or say why not. */
function findBook(snapshot: CatalogSnapshot, slug: string) {
  const matches = snapshot.books.filter((b) => b.slug === slug);
  if (matches.length === 1) return { book: matches[0]!, error: null as null };
  return {
    book: null,
    error:
      matches.length === 0
        ? "no existe en el catálogo de este entorno"
        : `${matches.length} filas comparten el slug, no se puede identificar inequívocamente`,
  };
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
    const author = snapshot.authors.find((a) => sameSlug(a.slug, slug));
    if (!author) {
      plan.untouched.push({
        subject: `autor ${slug}`,
        note: "no existe en este entorno; nada que retirar",
      });
      continue;
    }
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
        hasTitle: author.title !== null,
        hasLicense: author.licenseNumber !== null,
        isVerified: author.isVerified,
      },
      next: { title: null, licenseNumber: null, isVerified: false },
    });
  }

  // ── 2 · attribute the works a source names ──────────────────────────────
  for (const source of sources) {
    const { book, error } = findBook(snapshot, source.bookSlug);
    if (!book) {
      // Not a failure of the repair: the work may simply not exist here. The
      // attribution stays prepared for whenever the row is created.
      plan.untouched.push({
        subject: `${source.bookTitle} (${source.bookSlug})`,
        note: `${error}; la atribución a ${source.authorName} queda preparada, no pendiente de decisión`,
      });
      continue;
    }

    const existing = snapshot.authors.find((a) =>
      sameSlug(a.slug, source.authorSlug),
    );

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
      source: source.source,
    });
  }

  // ── 3 · what stays untouched, and why ───────────────────────────────────
  for (const slug of AUTHORSHIP_PENDING) {
    const { book } = findBook(snapshot, slug);
    if (!book) continue;
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
      push(
        `      espera: título=${op.expect.hasTitle ? "presente" : "nulo"} · colegiatura=${
          op.expect.hasLicense ? "presente" : "nula"
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

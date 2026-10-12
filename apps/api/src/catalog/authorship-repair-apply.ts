import { fieldDigest } from "./authorship-plan-file";
import type { RepairOp } from "./authorship-repair";
import type { FrozenPlan } from "./authorship-plan-file";

/**
 * Applying a frozen plan — the only place that writes.
 *
 * ── What changed, and why the first version was not enough ────────────────
 *
 * **It consumed a recomputed plan.** The CLI re-planned on every invocation,
 * so `--apply` executed whatever the database looked like at that moment, not
 * the dry run somebody reviewed. Now it takes a `FrozenPlan` read from a file
 * and refuses on any divergence.
 *
 * **Its expectations were presence booleans.** A title changing from one
 * non-null string to a different non-null string left `hasTitle: true` either
 * way, so the applier would have withdrawn a value nobody had reviewed. Now
 * the plan carries a per-field digest and the comparison is exact.
 *
 * **It read, then wrote by id.** Between those two statements another
 * connection could change the row, and the write would land anyway: the read
 * proved nothing about the state at write time. Now every write is
 * **conditional on the values just read** — `updateMany` with the old values
 * in the `WHERE`, requiring exactly one affected row. That is a
 * compare-and-set in SQL, so the guarantee comes from the statement itself
 * and not from an isolation level nobody declared.
 *
 * **It re-resolved authors by canonical slug.** The planner accepts a
 * normalised match, so an exact `findUnique({ slug })` here would miss that
 * row and mint a duplicate. Now the applier uses the id the planner froze and
 * revalidates its identity before touching any relation.
 *
 * A conflict is never resolved by re-planning with the new value: adopting it
 * would mean authorising a state nobody reviewed.
 */

export interface RepairTx {
  bookAuthor: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      slug: string;
      name: string;
      title: string | null;
      licenseNumber: string | null;
      isVerified: boolean;
    } | null>;
    /**
     * All authors, for the normalised ambiguity check.
     *
     * Deliberately a plain `findMany`, because normalisation is done in JS:
     * the real `findUnique({ slug })` is an exact match and cannot express
     * "same slug ignoring case and surrounding whitespace". A mock that
     * normalised lookups would offer a semantics the database does not have,
     * and the test would pass on a guarantee the tool lacks.
     */
    findMany(args?: {
      select?: Record<string, boolean>;
    }): Promise<Array<{ id: string; slug: string; name: string }>>;
    updateMany(args: {
      where: {
        id: string;
        title?: string | null;
        licenseNumber?: string | null;
        isVerified?: boolean;
      };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    create(args: { data: { slug: string; name: string } }): Promise<{
      id: string;
      slug: string;
      name: string;
    }>;
  };
  book: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      slug: string;
      authorId: string | null;
    } | null>;
    updateMany(args: {
      where: { id: string; authorId: string | null };
      data: { authorId: string };
    }): Promise<{ count: number }>;
  };
}

export class RepairPreconditionError extends Error {
  constructor(
    readonly subject: string,
    message: string,
  ) {
    super(`${subject}: ${message}`);
    this.name = "RepairPreconditionError";
  }
}

export class RepairConflictError extends RepairPreconditionError {
  constructor(subject: string, message: string) {
    super(subject, message);
    this.name = "RepairConflictError";
  }
}

export interface AppliedOp {
  op: RepairOp["kind"];
  subject: string;
  wrote: boolean;
  /** Sanitized: never the withdrawn literals. */
  beforeSummary?: Record<string, unknown>;
  afterSummary?: Record<string, unknown>;
}

/** Literal prior values. Goes ONLY to the private reversal file. */
export interface ReversalEntry {
  subject: string;
  restore: Record<string, unknown>;
}

export interface RepairResult {
  dryRun: boolean;
  rowsWritten: number;
  applied: AppliedOp[];
  reversal: ReversalEntry[];
}

const sameSlug = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Collect everything a reversal would need, WITHOUT writing.
 *
 * Separated from the writing because the reversal file has to be persisted and
 * verified before the first write. You cannot back up what you only discover
 * while changing it — the first version printed `before` after `$transaction`
 * had already committed.
 *
 * It also checks every precondition it can check. In particular it validates
 * `expectAuthorId` for a book whose target author does not exist yet: the
 * earlier version returned early in that case, so a dry run skipped the check
 * AND omitted the book's previous link from the reversal — the one value you
 * cannot reconstruct afterwards.
 */
export async function collectReversal(
  tx: RepairTx,
  plan: FrozenPlan,
): Promise<ReversalEntry[]> {
  const entries: ReversalEntry[] = [];

  for (const op of plan.ops) {
    if (op.kind === "withdraw-author-credentials") {
      const row = await assertAuthorMatchesPlan(tx, op);
      if (row === "settled") continue;
      entries.push({
        subject: `bookAuthor id=${op.authorId}`,
        restore: {
          title: row.title,
          licenseNumber: row.licenseNumber,
          isVerified: row.isVerified,
        },
      });
      continue;
    }

    if (op.kind === "create-author") {
      entries.push({
        subject: `bookAuthor slug=${op.authorSlug}`,
        restore: {
          note: "fila que esta reparación crearía; retirarla sólo si ningún libro la referencia, y con autorización sobre ese alcance",
        },
      });
      continue;
    }

    // reattribute-book — validated and recorded even when the target author
    // does not exist yet.
    const book = await tx.book.findUnique({ where: { id: op.bookId } });
    if (!book) {
      throw new RepairPreconditionError(
        `libro ${op.bookSlug}`,
        "la fila ya no existe",
      );
    }
    if (book.slug !== op.bookSlug) {
      throw new RepairPreconditionError(
        `libro ${op.bookSlug}`,
        `el id ${op.bookId} corresponde ahora a «${book.slug}»; la identidad del registro cambió`,
      );
    }
    if (book.authorId !== op.expectAuthorId) {
      throw new RepairConflictError(
        `libro ${op.bookSlug}`,
        `apunta a ${book.authorId ?? "null"} y el plan revisado observó ${
          op.expectAuthorId ?? "null"
        }; se detiene sin escribir`,
      );
    }
    entries.push({
      subject: `book id=${book.id}`,
      restore: { authorId: book.authorId },
    });
  }

  return entries;
}

/**
 * Re-read the author and prove it is the row the plan described — same
 * identity, same exact values. Returns `"settled"` when it is already at its
 * final state, which is how a second run writes nothing.
 */
async function assertAuthorMatchesPlan(
  tx: RepairTx,
  op: Extract<RepairOp, { kind: "withdraw-author-credentials" }>,
) {
  const row = await tx.bookAuthor.findUnique({ where: { id: op.authorId } });
  if (!row) {
    throw new RepairPreconditionError(
      `autor ${op.authorSlug}`,
      "la fila ya no existe",
    );
  }

  // Identity first: the right fields on the wrong row is still the wrong write.
  if (!sameSlug(row.slug, op.expect.slug) || row.name !== op.expect.name) {
    throw new RepairPreconditionError(
      `autor ${op.authorSlug}`,
      `el id ${op.authorId} es ahora «${row.name}» (${row.slug}); el plan revisó «${op.expect.name}» (${op.expect.slug})`,
    );
  }

  const settled =
    row.title === null && row.licenseNumber === null && !row.isVerified;
  if (settled) return "settled" as const;

  // Exact comparison by digest — catches a non-null → non-null change that a
  // presence boolean would miss.
  if (
    fieldDigest(row.title) !== op.expect.titleDigest ||
    fieldDigest(row.licenseNumber) !== op.expect.licenseDigest ||
    row.isVerified !== op.expect.isVerified
  ) {
    throw new RepairConflictError(
      `autor ${op.authorSlug}`,
      "los valores actuales no son los que el plan revisado observó; alguien cambió la fila — se detiene sin escribir y NO se replanifica con el dato nuevo",
    );
  }
  return row;
}

/**
 * Execute a frozen plan. `apply` defaults to false.
 *
 * The caller owns the transaction, so atomicity belongs to the CLI (and to the
 * pg-spec, which exercises a real rollback and a real interleaved writer).
 */
export async function applyAuthorshipRepair(
  tx: RepairTx,
  plan: FrozenPlan,
  opts: { apply?: boolean } = {},
): Promise<RepairResult> {
  const apply = opts.apply === true;
  const result: RepairResult = {
    dryRun: !apply,
    rowsWritten: 0,
    applied: [],
    reversal: [],
  };

  if (plan.blockers.length > 0) {
    throw new RepairPreconditionError(
      "plan",
      `${plan.blockers.length} bloqueo(s) sin resolver; no se aplica nada`,
    );
  }

  /** Author slug → id for ops that depend on one created in this run. */
  const createdBySlug = new Map<string, string>();

  for (const op of plan.ops) {
    if (op.kind === "withdraw-author-credentials") {
      const row = await assertAuthorMatchesPlan(tx, op);
      if (row === "settled") {
        result.applied.push({
          op: op.kind,
          subject: `autor ${op.authorSlug}`,
          wrote: false,
        });
        continue;
      }

      result.reversal.push({
        subject: `bookAuthor id=${row.id}`,
        restore: {
          title: row.title,
          licenseNumber: row.licenseNumber,
          isVerified: row.isVerified,
        },
      });

      if (apply) {
        // Conditional write: the old values are in the WHERE, so if another
        // connection changed the row between the read above and this
        // statement, zero rows match and nothing is overwritten.
        const { count } = await tx.bookAuthor.updateMany({
          where: {
            id: row.id,
            title: row.title,
            licenseNumber: row.licenseNumber,
            isVerified: row.isVerified,
          },
          data: op.next,
        });
        if (count !== 1) {
          throw new RepairConflictError(
            `autor ${op.authorSlug}`,
            `la escritura condicionada afectó ${count} filas; otra operación cambió el dato entre la comprobación y la escritura. No se sobrescribe ese cambio`,
          );
        }
        result.rowsWritten += 1;
      }

      result.applied.push({
        op: op.kind,
        subject: `autor ${op.authorSlug}`,
        wrote: apply,
        beforeSummary: {
          titlePresent: row.title !== null,
          licensePresent: row.licenseNumber !== null,
          isVerified: row.isVerified,
        },
        afterSummary: {
          titlePresent: false,
          licensePresent: false,
          isVerified: false,
        },
      });
      continue;
    }

    if (op.kind === "create-author") {
      // Normalised ambiguity check with the semantics the planner used, done
      // in JS over real rows — not delegated to a lookup that cannot express
      // it.
      const all = await tx.bookAuthor.findMany({
        select: { id: true, slug: true, name: true },
      });
      const matches = all.filter((a) => sameSlug(a.slug, op.authorSlug));

      if (matches.length > 1) {
        throw new RepairPreconditionError(
          `autor ${op.authorSlug}`,
          `${matches.length} filas normalizan al mismo slug; no se elige una ni se crea otra`,
        );
      }
      if (matches.length === 1) {
        const found = matches[0]!;
        if (found.name.trim() !== op.authorName.trim()) {
          throw new RepairPreconditionError(
            `autor ${op.authorSlug}`,
            `apareció una fila con nombre «${found.name}»; no se reutiliza una identidad distinta ni se renombra`,
          );
        }
        // Idempotent: a previous run created it.
        createdBySlug.set(op.authorSlug, found.id);
        result.applied.push({
          op: op.kind,
          subject: `autor ${op.authorSlug}`,
          wrote: false,
        });
        continue;
      }

      result.reversal.push({
        subject: `bookAuthor slug=${op.authorSlug}`,
        restore: {
          note: "fila creada por esta reparación; retirarla sólo si ningún libro la referencia, y con autorización sobre ese alcance",
        },
      });

      if (apply) {
        const created = await tx.bookAuthor.create({
          data: { slug: op.authorSlug, name: op.authorName },
        });
        createdBySlug.set(op.authorSlug, created.id);
        result.rowsWritten += 1;
      }
      result.applied.push({
        op: op.kind,
        subject: `autor ${op.authorSlug}`,
        wrote: apply,
        afterSummary: { slug: op.authorSlug, name: op.authorName },
      });
      continue;
    }

    // ── reattribute-book ────────────────────────────────────────────────────
    const book = await tx.book.findUnique({ where: { id: op.bookId } });
    if (!book) {
      throw new RepairPreconditionError(
        `libro ${op.bookSlug}`,
        "la fila ya no existe",
      );
    }
    if (book.slug !== op.bookSlug) {
      throw new RepairPreconditionError(
        `libro ${op.bookSlug}`,
        `el id ${op.bookId} corresponde ahora a «${book.slug}»; la identidad del registro cambió`,
      );
    }

    // Resolve the target: the id the planner froze, or the one created in this
    // run. Never a fresh lookup by canonical slug.
    const targetId =
      op.targetAuthorId ?? createdBySlug.get(op.authorSlug) ?? null;

    if (targetId) {
      // Revalidate identity before touching the relation.
      const target = await tx.bookAuthor.findUnique({
        where: { id: targetId },
      });
      if (!target) {
        throw new RepairPreconditionError(
          `autor ${op.authorSlug}`,
          `el id ${targetId} que el plan resolvió ya no existe`,
        );
      }
      if (
        !sameSlug(target.slug, op.authorSlug) ||
        target.name.trim() !== op.authorName.trim()
      ) {
        throw new RepairPreconditionError(
          `autor ${op.authorSlug}`,
          `el id ${targetId} es ahora «${target.name}» (${target.slug}); no se atribuye la obra a una identidad distinta`,
        );
      }
    }

    // Already correct → idempotent no-op.
    if (targetId && book.authorId === targetId) {
      result.applied.push({
        op: op.kind,
        subject: `libro ${op.bookSlug}`,
        wrote: false,
      });
      continue;
    }

    if (book.authorId !== op.expectAuthorId) {
      throw new RepairConflictError(
        `libro ${op.bookSlug}`,
        `apunta a ${book.authorId ?? "null"} y el plan revisado observó ${
          op.expectAuthorId ?? "null"
        }; se detiene sin escribir`,
      );
    }

    // Recorded whether or not the target id is known yet: the book's previous
    // link is the value a reversal cannot reconstruct later.
    result.reversal.push({
      subject: `book id=${book.id}`,
      restore: { authorId: book.authorId },
    });

    if (!targetId) {
      if (!apply) {
        // A dry run with a pending author: everything checkable has been
        // checked and the reversal is recorded. Only the destination id is
        // unknown, because nothing was created.
        result.applied.push({
          op: op.kind,
          subject: `libro ${op.bookSlug}`,
          wrote: false,
          beforeSummary: { authorId: book.authorId },
          afterSummary: { authorSlug: `${op.authorSlug} (pendiente de alta)` },
        });
        continue;
      }
      throw new RepairPreconditionError(
        `libro ${op.bookSlug}`,
        `no se resolvió el autor ${op.authorSlug}`,
      );
    }

    if (apply) {
      const { count } = await tx.book.updateMany({
        where: { id: book.id, authorId: book.authorId },
        data: { authorId: targetId },
      });
      if (count !== 1) {
        throw new RepairConflictError(
          `libro ${op.bookSlug}`,
          `la escritura condicionada afectó ${count} filas; otra operación cambió la atribución entre la comprobación y la escritura`,
        );
      }
      result.rowsWritten += 1;
    }

    result.applied.push({
      op: op.kind,
      subject: `libro ${op.bookSlug}`,
      wrote: apply,
      beforeSummary: { authorId: book.authorId },
      afterSummary: { authorId: targetId },
    });
  }

  return result;
}

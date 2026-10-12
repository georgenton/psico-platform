import type { RepairOp, RepairPlan } from "./authorship-repair";

/**
 * Applying the plan — the only place that writes.
 *
 * Four properties this file exists to guarantee, each one tested:
 *
 *   1. **Dry-run is the default.** The caller must pass `apply: true`. A run
 *      with no flag reports and writes nothing.
 *   2. **Expected values are re-read inside the transaction.** The plan was
 *      built from a snapshot taken earlier; if the row moved since, the
 *      operation is refused instead of overwriting somebody else's change.
 *   3. **One transaction.** A failure in the second operation must not leave
 *      the first one applied — a half-corrected catalogue is worse than an
 *      uncorrected one, because it looks finished.
 *   4. **Idempotence.** Re-running finds the rows already at `next`, counts
 *      zero writes, and mints no second author.
 *
 * What it never does: delete an author, change a slug, change a book or
 * chapter id, touch users, run a seed, or restore a database.
 */

/** The subset of Prisma this needs — so tests can hand it a transaction. */
export interface RepairTx {
  bookAuthor: {
    findUnique(args: { where: { id?: string; slug?: string } }): Promise<{
      id: string;
      slug: string;
      name: string;
      title: string | null;
      licenseNumber: string | null;
      isVerified: boolean;
    } | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
    create(args: {
      data: { slug: string; name: string };
    }): Promise<{ id: string; slug: string; name: string }>;
  };
  book: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{ id: string; slug: string; authorId: string | null } | null>;
    update(args: {
      where: { id: string };
      data: { authorId: string };
    }): Promise<unknown>;
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

export interface AppliedOp {
  op: RepairOp["kind"];
  subject: string;
  /** False when the row was already at `next` — idempotent no-op. */
  wrote: boolean;
  /** Prior values, kept so the change can be reversed without a restore. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface RepairResult {
  dryRun: boolean;
  /** Real number of rows written — not the number of operations planned. */
  rowsWritten: number;
  applied: AppliedOp[];
  /** Everything needed to put the catalogue back as it was. */
  reversal: Array<{ subject: string; restore: Record<string, unknown> }>;
}

/**
 * Execute the plan. `apply` defaults to false, so the dangerous path is the
 * one you have to ask for.
 *
 * The caller supplies the transaction: this function does not open one, so
 * the atomicity guarantee belongs to the CLI (and to the pg-spec, which
 * exercises a real rollback).
 */
export async function applyAuthorshipRepair(
  tx: RepairTx,
  plan: RepairPlan,
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

  /** Author slug → id, for ops that depend on an author created in this run. */
  const authorIdBySlug = new Map<string, string>();

  for (const op of plan.ops) {
    if (op.kind === "withdraw-author-credentials") {
      const row = await tx.bookAuthor.findUnique({
        where: { id: op.authorId },
      });
      if (!row) {
        throw new RepairPreconditionError(
          `autor ${op.authorSlug}`,
          "la fila ya no existe",
        );
      }
      // Re-read and compare against what the plan was built on. A value that
      // moved since means somebody else is editing this row.
      const now = {
        hasTitle: row.title !== null,
        hasLicense: row.licenseNumber !== null,
        isVerified: row.isVerified,
      };
      const settled = !now.hasTitle && !now.hasLicense && !now.isVerified;
      if (settled) {
        result.applied.push({
          op: op.kind,
          subject: `autor ${op.authorSlug}`,
          wrote: false,
        });
        continue;
      }
      if (
        now.hasTitle !== op.expect.hasTitle ||
        now.hasLicense !== op.expect.hasLicense ||
        now.isVerified !== op.expect.isVerified
      ) {
        throw new RepairPreconditionError(
          `autor ${op.authorSlug}`,
          "los valores actuales no coinciden con los que el plan observó; alguien cambió la fila — se detiene sin escribir",
        );
      }

      const before = {
        title: row.title,
        licenseNumber: row.licenseNumber,
        isVerified: row.isVerified,
      };
      if (apply) {
        await tx.bookAuthor.update({
          where: { id: row.id },
          data: op.next,
        });
        result.rowsWritten += 1;
      }
      result.applied.push({
        op: op.kind,
        subject: `autor ${op.authorSlug}`,
        wrote: apply,
        before,
        after: { ...op.next },
      });
      result.reversal.push({
        subject: `bookAuthor id=${row.id}`,
        restore: before,
      });
      continue;
    }

    if (op.kind === "create-author") {
      const existing = await tx.bookAuthor.findUnique({
        where: { slug: op.authorSlug },
      });
      if (existing) {
        if (existing.name.trim() !== op.authorName.trim()) {
          throw new RepairPreconditionError(
            `autor ${op.authorSlug}`,
            `apareció una fila con nombre «${existing.name}»; no se reutiliza una identidad distinta`,
          );
        }
        // Idempotent: a previous run already created it.
        authorIdBySlug.set(op.authorSlug, existing.id);
        result.applied.push({
          op: op.kind,
          subject: `autor ${op.authorSlug}`,
          wrote: false,
        });
        continue;
      }
      if (apply) {
        const created = await tx.bookAuthor.create({
          data: { slug: op.authorSlug, name: op.authorName },
        });
        authorIdBySlug.set(op.authorSlug, created.id);
        result.rowsWritten += 1;
      }
      result.applied.push({
        op: op.kind,
        subject: `autor ${op.authorSlug}`,
        wrote: apply,
        after: { slug: op.authorSlug, name: op.authorName },
      });
      // Reversal of a creation is a deletion, and deleting an author with
      // relations is forbidden here. So the reversal note says what to undo
      // and leaves the decision to a person.
      result.reversal.push({
        subject: `bookAuthor slug=${op.authorSlug}`,
        restore: {
          note: "fila creada por esta reparación; retirarla sólo si ningún libro la referencia",
        },
      });
      continue;
    }

    // reattribute-book
    const book = await tx.book.findUnique({ where: { id: op.bookId } });
    if (!book) {
      throw new RepairPreconditionError(
        `libro ${op.bookSlug}`,
        "la fila ya no existe",
      );
    }

    let targetId = authorIdBySlug.get(op.authorSlug);
    if (!targetId) {
      const author = await tx.bookAuthor.findUnique({
        where: { slug: op.authorSlug },
      });
      if (author) {
        if (author.name.trim() !== op.authorName.trim()) {
          throw new RepairPreconditionError(
            `autor ${op.authorSlug}`,
            `la fila se llama «${author.name}» y la fuente dice «${op.authorName}»`,
          );
        }
        targetId = author.id;
      }
    }

    if (!targetId) {
      // In a dry run the author was never created, so there is no id to point
      // at. That is expected and not a failure; the write is simply described.
      if (!apply) {
        result.applied.push({
          op: op.kind,
          subject: `libro ${op.bookSlug}`,
          wrote: false,
          before: { authorId: book.authorId },
          after: { authorId: `(nuevo autor ${op.authorSlug})` },
        });
        continue;
      }
      throw new RepairPreconditionError(
        `libro ${op.bookSlug}`,
        `no se resolvió el autor ${op.authorSlug}`,
      );
    }

    if (book.authorId === targetId) {
      result.applied.push({
        op: op.kind,
        subject: `libro ${op.bookSlug}`,
        wrote: false,
      });
      continue;
    }
    if (book.authorId !== op.expectAuthorId) {
      throw new RepairPreconditionError(
        `libro ${op.bookSlug}`,
        `apunta a ${book.authorId ?? "null"} y el plan observó ${op.expectAuthorId ?? "null"}; se detiene sin escribir`,
      );
    }

    if (apply) {
      await tx.book.update({
        where: { id: book.id },
        data: { authorId: targetId },
      });
      result.rowsWritten += 1;
    }
    result.applied.push({
      op: op.kind,
      subject: `libro ${op.bookSlug}`,
      wrote: apply,
      before: { authorId: book.authorId },
      after: { authorId: targetId },
    });
    result.reversal.push({
      subject: `book id=${book.id}`,
      restore: { authorId: book.authorId },
    });
  }

  return result;
}

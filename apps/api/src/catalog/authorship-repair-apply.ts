import {
  BOOK_COPY_FIELDS,
  BOOK_COPY_WITHDRAWAL,
  fieldDigest,
  WITHDRAWAL,
} from "./authorship-plan-file";
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
      bio: string | null;
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
        /**
         * Identity is part of the condition, not merely checked beforehand.
         *
         * The read proved the row's identity at read time; a rename in the
         * window would not have been caught, so claiming identity was
         * protected through it was false. Now `slug` and `name` are in the
         * `WHERE` too, and the claim is true because the statement enforces it.
         */
        slug?: string;
        name?: string;
        title?: string | null;
        licenseNumber?: string | null;
        bio?: string | null;
        isVerified?: boolean;
      };
      data: {
        title: null;
        licenseNumber: null;
        bio: null;
        isVerified: false;
      };
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
      summary: string | null;
      description: string | null;
    } | null>;
    updateMany(args: {
      where: {
        id: string;
        slug?: string;
        authorId?: string | null;
        /** Copy columns travel in the WHERE when they are being replaced. */
        summary?: string | null;
        description?: string | null;
      };
      data:
        | { authorId: string }
        | Partial<Record<"summary" | "description", string>>;
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

/** Slugs a plan creates itself, so a pending target is recognisable as one. */
function willCreateSet(ops: RepairOp[]): ReadonlySet<string> {
  return new Set(
    ops
      .filter((o) => o.kind === "create-author")
      .map((o) =>
        (o as Extract<RepairOp, { kind: "create-author" }>).authorSlug
          .trim()
          .toLowerCase(),
      ),
  );
}

/**
 * Collect everything a reversal would need, WITHOUT writing.
 *
 * Separated from the writing because the reversal file has to be persisted and
 * verified before the first write. You cannot back up what you only discover
 * while changing it — the first version printed `before` after `$transaction`
 * had already committed.
 *
 * It checks every precondition it can check, with the SAME order of questions
 * the applier asks. That symmetry is not cosmetic: this function used to treat
 * an already-repaired book as somebody else's divergence and threw before the
 * applier could reach its no-op, so the documented idempotence was false for
 * the whole journey even though the applier alone was idempotent. **A
 * recognised final state is not a conflict.**
 *
 * It also validates the target author — both a pending creation and one that
 * already exists — because a dry run that skips that check is not a rehearsal
 * of anything.
 */
export async function collectReversal(
  tx: RepairTx,
  plan: FrozenPlan,
): Promise<ReversalEntry[]> {
  const entries: ReversalEntry[] = [];
  const willCreate = willCreateSet(plan.ops);

  for (const op of plan.ops) {
    if (op.kind === "withdraw-author-credentials") {
      const row = await assertAuthorMatchesPlan(tx, op);
      if (row === "settled") continue;
      entries.push({
        subject: `bookAuthor id=${op.authorId}`,
        restore: {
          title: row.title,
          licenseNumber: row.licenseNumber,
          // Every field the withdrawal clears has to be here, or the reversal
          // restores a row that is not the one it replaced.
          bio: row.bio,
          isVerified: row.isVerified,
        },
      });
      continue;
    }

    if (op.kind === "withdraw-book-copy") {
      const checked = await assertBookCopyMatchesPlan(tx, op);
      if (checked === "settled") continue;
      entries.push({
        subject: `book copy id=${op.bookId}`,
        restore: {
          summary: checked.row.summary,
          description: checked.row.description,
        },
      });
      continue;
    }

    if (op.kind === "create-author") {
      const resolved = await resolveCreatableAuthor(tx, op);
      if (resolved) {
        // A previous run created it. Nothing to undo, nothing to warn about.
        continue;
      }
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

    // Resolve the destination exactly as the applier will, and validate its
    // identity. `targetAuthorId` is the id frozen at plan time; when it is
    // null the plan promised to create the row, so look for one a previous
    // run may already have created.
    const target = await resolveTargetAuthor(tx, op, willCreate);

    // Already pointing at the destination → recognised final state.
    if (target && book.authorId === target.id) continue;

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
 * The single normalised lookup for a creatable author, shared by the dry run
 * and the write so they cannot disagree.
 *
 * Returns the existing row, or null when there is none. Throws when the slug
 * is ambiguous, or when it is held by a different identity — neither is a row
 * this plan may adopt.
 */
async function resolveCreatableAuthor(
  tx: RepairTx,
  op: Extract<RepairOp, { kind: "create-author" }>,
): Promise<{ id: string; slug: string; name: string } | null> {
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
  if (matches.length === 0) return null;
  const found = matches[0]!;
  if (found.name.trim() !== op.authorName.trim()) {
    throw new RepairPreconditionError(
      `autor ${op.authorSlug}`,
      `apareció una fila con nombre «${found.name}»; no se reutiliza una identidad distinta ni se renombra`,
    );
  }
  return found;
}

/**
 * Where a `reattribute-book` op is pointing, with its identity revalidated.
 *
 * Null means "the author does not exist yet and this plan creates it" — which
 * is a legitimate dry-run state, not a missing precondition.
 */
async function resolveTargetAuthor(
  tx: RepairTx,
  op: Extract<RepairOp, { kind: "reattribute-book" }>,
  willCreate: ReadonlySet<string>,
): Promise<{ id: string; slug: string; name: string } | null> {
  if (op.targetAuthorId) {
    const target = await tx.bookAuthor.findUnique({
      where: { id: op.targetAuthorId },
    });
    if (!target) {
      throw new RepairPreconditionError(
        `autor ${op.authorSlug}`,
        `el id ${op.targetAuthorId} que el plan resolvió ya no existe`,
      );
    }
    assertSameAuthorIdentity(target, op);
    return target;
  }

  if (!willCreate.has(op.authorSlug.trim().toLowerCase())) {
    throw new RepairPreconditionError(
      `libro ${op.bookSlug}`,
      `espera que ${op.authorSlug} se cree en este mismo plan y el plan no lo da de alta`,
    );
  }

  // Pending creation: a previous run may already have created the row.
  const existing = await resolveCreatableAuthor(tx, {
    kind: "create-author",
    authorSlug: op.authorSlug,
    authorName: op.authorName,
    source: op.source,
  });
  return existing;
}

function assertSameAuthorIdentity(
  row: { id: string; slug: string; name: string },
  op: Extract<RepairOp, { kind: "reattribute-book" }>,
): void {
  if (
    !sameSlug(row.slug, op.authorSlug) ||
    row.name.trim() !== op.authorName.trim()
  ) {
    throw new RepairPreconditionError(
      `autor ${op.authorSlug}`,
      `el id ${row.id} es ahora «${row.name}» (${row.slug}); no se atribuye la obra a una identidad distinta`,
    );
  }
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
    row.title === null &&
    row.licenseNumber === null &&
    row.bio === null &&
    !row.isVerified;
  if (settled) return "settled" as const;

  // Exact comparison by digest — catches a non-null → non-null change that a
  // presence boolean would miss.
  if (
    fieldDigest(row.title) !== op.expect.titleDigest ||
    fieldDigest(row.licenseNumber) !== op.expect.licenseDigest ||
    fieldDigest(row.bio) !== op.expect.bioDigest ||
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
 * Re-read the book and prove its copy is the copy the plan described.
 *
 * Mirrors `assertAuthorMatchesPlan`, deliberately: same order of questions —
 * existence, identity, recognised final state, exact values — so the dry run
 * and the write cannot disagree, and so a second run is a no-op instead of a
 * conflict. The final state here is "the affected fields already hold the
 * withdrawal text", which is what a previous run left behind.
 *
 * Both copy digests are compared even when only one field is being replaced.
 * A row whose other copy column changed since the review is not the row the
 * plan described, and this tool refuses rather than writing into it.
 */
async function assertBookCopyMatchesPlan(
  tx: RepairTx,
  op: Extract<RepairOp, { kind: "withdraw-book-copy" }>,
) {
  // The selected columns are resolved against the module FIRST, and anything
  // unrecognised stops the operation. This has to come before every other
  // question: with an unknown field, "is it already withdrawn?" compares
  // `undefined` against `undefined`, answers yes, and the operation vanishes
  // as a silent no-op — a refusal that looks like success is worse than the
  // write it avoided. An empty selection does the same, for the same reason.
  const fields = BOOK_COPY_FIELDS.filter((f) => op.fields.includes(f));
  if (fields.length === 0 || fields.length !== op.fields.length) {
    throw new RepairPreconditionError(
      `libro ${op.bookSlug}`,
      `la operación selecciona columnas que esta reparación no reescribe (${op.fields.join(", ") || "ninguna"}); no se ejecuta`,
    );
  }

  const row = await tx.book.findUnique({ where: { id: op.bookId } });
  if (!row) {
    throw new RepairPreconditionError(
      `libro ${op.bookSlug}`,
      "la fila ya no existe",
    );
  }
  if (row.slug !== op.expect.slug) {
    throw new RepairPreconditionError(
      `libro ${op.bookSlug}`,
      `el id ${op.bookId} corresponde ahora a «${row.slug}»; la identidad del registro cambió`,
    );
  }

  const settled = fields.every((f) => row[f] === BOOK_COPY_WITHDRAWAL[f]);
  if (settled) return "settled" as const;

  if (
    fieldDigest(row.summary) !== op.expect.summaryDigest ||
    fieldDigest(row.description) !== op.expect.descriptionDigest
  ) {
    throw new RepairConflictError(
      `libro ${op.bookSlug}`,
      "el copy actual no es el que el plan revisado observó; alguien cambió la fila — se detiene sin escribir y NO se replanifica con el texto nuevo",
    );
  }
  // The validated selection travels with the row so the writer cannot derive
  // it again, differently.
  return { row, fields };
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
  const willCreate = willCreateSet(plan.ops);

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
          bio: row.bio,
          isVerified: row.isVerified,
        },
      });

      if (apply) {
        // Conditional write: the values AND the identity just read are in the
        // WHERE, so if another connection changed the row — including renaming
        // it — between the read above and this statement, zero rows match and
        // nothing is overwritten.
        //
        // `data` is the module constant, never `op.next`. The plan says WHICH
        // operation to run; it does not get to describe what the operation
        // writes, because that object came out of a JSON file.
        const { count } = await tx.bookAuthor.updateMany({
          where: {
            id: row.id,
            slug: row.slug,
            name: row.name,
            title: row.title,
            licenseNumber: row.licenseNumber,
            isVerified: row.isVerified,
          },
          data: WITHDRAWAL,
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
          bioPresent: row.bio !== null,
          isVerified: row.isVerified,
        },
        afterSummary: {
          titlePresent: false,
          licensePresent: false,
          bioPresent: false,
          isVerified: false,
        },
      });
      continue;
    }

    if (op.kind === "withdraw-book-copy") {
      const checked = await assertBookCopyMatchesPlan(tx, op);
      if (checked === "settled") {
        result.applied.push({
          op: op.kind,
          subject: `libro ${op.bookSlug}`,
          wrote: false,
        });
        continue;
      }
      const { row, fields } = checked;

      // The literals go to the private preimage and nowhere else: this is the
      // only copy of the prose that is about to be replaced, and whoever
      // writes the replacement needs to read what it said.
      result.reversal.push({
        subject: `book copy id=${row.id}`,
        restore: { summary: row.summary, description: row.description },
      });

      // Both the KEYS and the VALUES come from the module: `fields` was
      // resolved against `BOOK_COPY_FIELDS` by the check above, and the text
      // is the frozen constant. Mapping `op.fields` here would have let a
      // field name out of a JSON file become a column in Prisma's `data` —
      // the same hole `WITHDRAWAL` exists to close for the author's row.
      const patch = Object.fromEntries(
        fields.map((f) => [f, BOOK_COPY_WITHDRAWAL[f]]),
      );

      if (apply) {
        // Conditional write, same shape as the author's: identity AND both
        // copy values just read are in the WHERE, so a change landing between
        // the read and this statement matches zero rows instead of being
        // overwritten.
        const { count } = await tx.book.updateMany({
          where: {
            id: row.id,
            slug: row.slug,
            summary: row.summary,
            description: row.description,
          },
          data: patch,
        });
        if (count !== 1) {
          throw new RepairConflictError(
            `libro ${op.bookSlug}`,
            `la escritura condicionada afectó ${count} filas; otra operación cambió el copy entre la comprobación y la escritura. No se sobrescribe ese cambio`,
          );
        }
        result.rowsWritten += 1;
      }

      result.applied.push({
        op: op.kind,
        subject: `libro ${op.bookSlug}`,
        wrote: apply,
        beforeSummary: {
          fields,
          namedIdentities: op.namedIdentities,
          summaryPresent: row.summary !== null,
          descriptionPresent: row.description !== null,
        },
        afterSummary: {
          withdrawn: fields,
          pendingEditorialRewrite: true,
        },
      });
      continue;
    }

    if (op.kind === "create-author") {
      // Normalised ambiguity check with the semantics the planner used, done
      // in JS over real rows — not delegated to a lookup that cannot express
      // it. Shared with `collectReversal` so the rehearsal and the write
      // cannot answer this question differently.
      const found = await resolveCreatableAuthor(tx, op);
      if (found) {
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

    // Resolve the target: the id created in this run, else the id the planner
    // froze, else a row a previous run created. Never a fresh lookup by
    // canonical slug, and always with its identity revalidated.
    const createdHere = createdBySlug.get(op.authorSlug);
    const targetId = createdHere
      ? createdHere
      : ((await resolveTargetAuthor(tx, op, willCreate))?.id ?? null);

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
        // `slug` is in the condition for the same reason as the author's
        // identity: a row that changed identity in the window is not the row
        // the plan described.
        where: { id: book.id, slug: book.slug, authorId: book.authorId },
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

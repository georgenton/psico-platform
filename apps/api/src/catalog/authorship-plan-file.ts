import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";

import { AUTHORSHIP_SOURCES, FIXTURE_AUTHOR_SLUGS } from "./authorship-sources";
import type { RepairOp, RepairPlan } from "./authorship-repair";

/**
 * Freezing a repair plan, and the private files that go with it.
 *
 * ── Why a plan is a file and not a recomputation ──────────────────────────
 *
 * The first version recomputed the plan on every invocation, so `--apply`
 * never executed the dry-run somebody had reviewed: it executed whatever the
 * database looked like at that moment, silently adopting conditions nobody
 * had seen. A reviewed plan has to be a *thing* — identified, bound to the
 * records and the target it was built against, and consumed as-is.
 *
 * ── Why the file is validated like untrusted input ────────────────────────
 *
 * Checking the operation NAMES was not enough. The payloads reached the
 * applier unvalidated, and `op.next` — a JSON object — was handed to Prisma's
 * `data`. A file with an allowed `kind` and extra fields was therefore an
 * arbitrary write list wearing the right label. So this module carries a
 * strict runtime schema: an exact key set per kind, checked types, and
 * correspondences that must be backed by `authorship-sources`. The withdrawal
 * itself is a module constant; nothing from the JSON is passed through.
 *
 * ── Why hashes and not literals ───────────────────────────────────────────
 *
 * The expectations must detect a value changing from one non-null string to a
 * different non-null string — presence booleans cannot. But the values being
 * withdrawn are fabricated credentials, and this repository is public, so they
 * must not land in the plan that travels with a PR.
 *
 * Per-field SHA-256 solves both: it is exact enough to catch A → B, and it
 * reveals nothing. The literals exist in exactly one place — the preimage
 * file, which is private, 0600, and lives outside the product tree.
 *
 * ── Why the preimage is immutable ─────────────────────────────────────────
 *
 * The outcome used to be stamped onto the backup by rewriting it, which means
 * the only copy of the previous values was truncated and rewritten *after*
 * the database had changed. A failure there destroyed exactly what it existed
 * to protect. The preimage is now written once and never reopened for
 * writing; the outcome is a separate sibling file. `applied`, `aborted` and
 * `uncertain` are distinct, and the last one is honest: the transaction
 * committed and recording that fact failed.
 */

export const PLAN_FORMAT = "feelverse.catalog-authorship-plan/v1" as const;
export const PREIMAGE_FORMAT =
  "feelverse.catalog-authorship-reversal/v1" as const;
export const OUTCOME_FORMAT =
  "feelverse.catalog-authorship-outcome/v1" as const;

/**
 * The one and only change a withdrawal may make.
 *
 * Frozen here as a constant so the applier never forwards an object that came
 * out of a JSON file. A plan can ask for this operation; it cannot describe
 * what the operation does.
 */
export const WITHDRAWAL = Object.freeze({
  title: null,
  licenseNumber: null,
  isVerified: false,
}) as { title: null; licenseNumber: null; isVerified: false };

/** Stable digest of a field value. `null` stays null — absence is not a hash. */
export function fieldDigest(value: string | null): string | null {
  if (value === null) return null;
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32)}`;
}

/**
 * Identity of the database a plan was built against.
 *
 * Deliberately NOT the connection string: that carries credentials. Host,
 * port and database name are enough to tell two targets apart, and the name
 * is re-checked against `current_database()` at apply time so a plan built
 * for one database cannot be replayed against another.
 */
export interface TargetIdentity {
  host: string;
  port: string;
  database: string;
  /** What `resolveEnvironment()` said, recorded as declared, not inferred. */
  posture: string;
  /** Whether the host is loopback. Decided once, here. */
  isLoopback: boolean;
  fingerprint: string;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function fingerprintOf(host: string, port: string, database: string): string {
  return `sha256:${createHash("sha256")
    .update(`${host}|${port}|${database}`, "utf8")
    .digest("hex")
    .slice(0, 32)}`;
}

export function targetIdentityFromUrl(
  rawUrl: string,
  posture: string,
): TargetIdentity {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(
      "TARGET INVÁLIDO: la cadena de conexión no se puede interpretar. No se adivina un destino.",
    );
  }
  const host = u.hostname;
  const port = u.port || "5432";
  const database = u.pathname.replace(/^\//, "");
  if (!host || !database) {
    throw new Error(
      "TARGET INCOMPLETO: la conexión no declara host y base de datos. No se adivina un destino.",
    );
  }
  return {
    host,
    port,
    database,
    posture,
    isLoopback: LOOPBACK.has(host),
    fingerprint: fingerprintOf(host, port, database),
  };
}

export interface FrozenPlan {
  format: typeof PLAN_FORMAT;
  planId: string;
  planHash: string;
  createdAt: string;
  target: TargetIdentity;
  ops: RepairOp[];
  satisfied: string[];
  blockers: RepairPlan["blockers"];
  untouched: RepairPlan["untouched"];
}

/** Canonical JSON so the hash does not depend on key order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

/**
 * Hash over everything that decides what will happen.
 *
 * The first version covered the operations and the target's fingerprint, so a
 * file could have its POSTURE edited, or its BLOCKERS deleted, and still hash
 * correctly — and blockers are the mechanism that stops an ambiguous plan. So
 * the control fields are inside the hash now: the full target identity, the
 * blockers, and the notes a reviewer read.
 *
 * `planId` and `createdAt` are deliberately OUT: the hash addresses content,
 * so two freezes of an unchanged catalogue agree. Telling two *files* apart is
 * the job of the expected `planId`, which the operator passes separately.
 */
export function computePlanHash(
  ops: RepairOp[],
  target: TargetIdentity,
  control: {
    blockers?: RepairPlan["blockers"];
    satisfied?: string[];
    untouched?: RepairPlan["untouched"];
  } = {},
): string {
  return `sha256:${createHash("sha256")
    .update(
      canonical({
        format: PLAN_FORMAT,
        ops,
        blockers: control.blockers ?? [],
        satisfied: control.satisfied ?? [],
        untouched: control.untouched ?? [],
        target: {
          host: target.host,
          port: target.port,
          database: target.database,
          posture: target.posture,
          isLoopback: target.isLoopback,
          fingerprint: target.fingerprint,
        },
      }),
      "utf8",
    )
    .digest("hex")}`;
}

export function freezePlan(
  plan: RepairPlan,
  target: TargetIdentity,
): FrozenPlan {
  return {
    format: PLAN_FORMAT,
    planId: randomUUID(),
    planHash: computePlanHash(plan.ops, target, {
      blockers: plan.blockers,
      satisfied: plan.satisfied,
      untouched: plan.untouched,
    }),
    createdAt: new Date().toISOString(),
    target,
    ops: plan.ops,
    satisfied: plan.satisfied,
    blockers: plan.blockers,
    untouched: plan.untouched,
  };
}

export class PlanFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanFileError";
  }
}

/* ── Runtime schema of the three operations ─────────────────────────────── */

/** The exact key set each kind may carry. Anything else is out of scope. */
const OP_KEYS: Record<string, readonly string[]> = {
  "withdraw-author-credentials": [
    "kind",
    "authorId",
    "authorSlug",
    "expect",
    "next",
  ],
  "create-author": ["kind", "authorSlug", "authorName", "source"],
  "reattribute-book": [
    "kind",
    "bookId",
    "bookSlug",
    "authorSlug",
    "authorName",
    "expectAuthorId",
    "targetAuthorId",
    "source",
  ],
};

const EXPECT_KEYS = [
  "name",
  "slug",
  "titleDigest",
  "licenseDigest",
  "isVerified",
] as const;

const sameSlug = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";

const isDigestOrNull = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && /^sha256:[0-9a-f]{32}$/.test(v));

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void {
  const extra = Object.keys(value).filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    throw new PlanFileError(
      `OPERACIÓN FUERA DE ALCANCE (${where}): campos no permitidos ${extra
        .map((k) => JSON.stringify(k))
        .join(
          ", ",
        )}. El archivo describe cuál operación ejecutar, no qué escribe.`,
    );
  }
  const missing = allowed.filter((k) => !(k in value));
  if (missing.length > 0) {
    throw new PlanFileError(
      `OPERACIÓN INCOMPLETA (${where}): faltan ${missing.map((k) => JSON.stringify(k)).join(", ")}.`,
    );
  }
}

/**
 * Validate one operation's payload, and that it is an attribution this
 * repository can point at a document for.
 *
 * The correspondence check is the part that matters most: a well-formed
 * `reattribute-book` naming a work and an author that no source pairs is a
 * perfectly valid-looking instruction to invent an attribution.
 */
function validateOp(raw: unknown, index: number): void {
  const where = `op #${index + 1}`;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PlanFileError(`OPERACIÓN INVÁLIDA (${where}): no es un objeto.`);
  }
  const op = raw as Record<string, unknown>;
  const kind = op.kind;
  if (typeof kind !== "string" || !(kind in OP_KEYS)) {
    throw new PlanFileError(
      `OPERACIÓN FUERA DE ALCANCE (${where}): ${JSON.stringify(
        kind,
      )}. Esta herramienta no ejecuta un archivo como lista arbitraria de escrituras.`,
    );
  }
  assertExactKeys(op, OP_KEYS[kind]!, where);

  if (kind === "withdraw-author-credentials") {
    if (!isNonEmptyString(op.authorId) || !isNonEmptyString(op.authorSlug)) {
      throw new PlanFileError(
        `OPERACIÓN INVÁLIDA (${where}): authorId y authorSlug deben ser cadenas.`,
      );
    }
    // Only identities this repository classifies as fixture-made may have
    // claims withdrawn. Any other author would be a different decision.
    if (
      !FIXTURE_AUTHOR_SLUGS.some((s) => sameSlug(s, op.authorSlug as string))
    ) {
      throw new PlanFileError(
        `CORRESPONDENCIA NO SUSTENTADA (${where}): ${JSON.stringify(
          op.authorSlug,
        )} no es una identidad de fixture de este repositorio; retirarle credenciales sería otra decisión.`,
      );
    }
    const expect = op.expect;
    if (
      expect === null ||
      typeof expect !== "object" ||
      Array.isArray(expect)
    ) {
      throw new PlanFileError(
        `OPERACIÓN INVÁLIDA (${where}): expect no es un objeto.`,
      );
    }
    const e = expect as Record<string, unknown>;
    assertExactKeys(e, EXPECT_KEYS, `${where}.expect`);
    if (!isNonEmptyString(e.name) || !isNonEmptyString(e.slug)) {
      throw new PlanFileError(
        `OPERACIÓN INVÁLIDA (${where}): expect.name y expect.slug deben ser cadenas.`,
      );
    }
    if (!sameSlug(e.slug, op.authorSlug)) {
      throw new PlanFileError(
        `REFERENCIA INCOHERENTE (${where}): expect.slug ${JSON.stringify(
          e.slug,
        )} no corresponde a authorSlug ${JSON.stringify(op.authorSlug)}.`,
      );
    }
    if (!isDigestOrNull(e.titleDigest) || !isDigestOrNull(e.licenseDigest)) {
      throw new PlanFileError(
        `OPERACIÓN INVÁLIDA (${where}): los digests deben ser sha256:<32 hex> o null. Un literal aquí publicaría el valor que se retira.`,
      );
    }
    if (typeof e.isVerified !== "boolean") {
      throw new PlanFileError(
        `OPERACIÓN INVÁLIDA (${where}): expect.isVerified debe ser booleano.`,
      );
    }
    // `next` is accepted only as the exact, fixed withdrawal. It is NOT the
    // instruction: the applier uses the module constant.
    if (canonical(op.next) !== canonical(WITHDRAWAL)) {
      throw new PlanFileError(
        `OPERACIÓN FUERA DE ALCANCE (${where}): next sólo puede ser la retirada fija ${canonical(
          WITHDRAWAL,
        )}. No se pasa a la base un objeto recibido del archivo.`,
      );
    }
    return;
  }

  if (kind === "create-author") {
    if (
      !isNonEmptyString(op.authorSlug) ||
      !isNonEmptyString(op.authorName) ||
      !isNonEmptyString(op.source)
    ) {
      throw new PlanFileError(
        `OPERACIÓN INVÁLIDA (${where}): authorSlug, authorName y source deben ser cadenas.`,
      );
    }
    const backed = AUTHORSHIP_SOURCES.find(
      (s) =>
        sameSlug(s.authorSlug, op.authorSlug as string) &&
        s.authorName.trim() === (op.authorName as string).trim() &&
        s.source === op.source,
    );
    if (!backed) {
      throw new PlanFileError(
        `CORRESPONDENCIA NO SUSTENTADA (${where}): ninguna fuente de este repositorio pareja ${JSON.stringify(
          op.authorSlug,
        )} con ese nombre y esa cita. Un alta de autor no se inventa en un archivo.`,
      );
    }
    return;
  }

  // reattribute-book
  if (
    !isNonEmptyString(op.bookId) ||
    !isNonEmptyString(op.bookSlug) ||
    !isNonEmptyString(op.authorSlug) ||
    !isNonEmptyString(op.authorName) ||
    !isNonEmptyString(op.source)
  ) {
    throw new PlanFileError(
      `OPERACIÓN INVÁLIDA (${where}): bookId, bookSlug, authorSlug, authorName y source deben ser cadenas.`,
    );
  }
  if (op.expectAuthorId !== null && !isNonEmptyString(op.expectAuthorId)) {
    throw new PlanFileError(
      `OPERACIÓN INVÁLIDA (${where}): expectAuthorId debe ser una cadena o null.`,
    );
  }
  if (op.targetAuthorId !== null && !isNonEmptyString(op.targetAuthorId)) {
    throw new PlanFileError(
      `OPERACIÓN INVÁLIDA (${where}): targetAuthorId debe ser una cadena o null.`,
    );
  }
  const pair = AUTHORSHIP_SOURCES.find(
    (s) =>
      s.bookSlug === op.bookSlug &&
      sameSlug(s.authorSlug, op.authorSlug as string) &&
      s.authorName.trim() === (op.authorName as string).trim() &&
      s.source === op.source,
  );
  if (!pair) {
    throw new PlanFileError(
      `CORRESPONDENCIA NO SUSTENTADA (${where}): ninguna fuente pareja ${JSON.stringify(
        op.bookSlug,
      )} con ${JSON.stringify(
        op.authorSlug,
      )} y esa cita. Atribuir una obra fuera de las correspondencias sustentadas sería inventarlo.`,
    );
  }
}

/**
 * Cross-operation coherence.
 *
 * A `reattribute-book` with `targetAuthorId: null` says "my author is created
 * by this same plan". If no such `create-author` is present, the file is
 * internally inconsistent and the applier would fail halfway through.
 */
function validateOpGraph(ops: RepairOp[]): void {
  const creates = new Set(
    ops
      .filter((o) => o.kind === "create-author")
      .map((o) =>
        (o as Extract<RepairOp, { kind: "create-author" }>).authorSlug
          .trim()
          .toLowerCase(),
      ),
  );
  const seen = new Set<string>();
  for (const [i, op] of ops.entries()) {
    const where = `op #${i + 1}`;
    if (op.kind === "create-author") {
      const key = op.authorSlug.trim().toLowerCase();
      if (seen.has(key)) {
        throw new PlanFileError(
          `REFERENCIA INCOHERENTE (${where}): el alta de ${JSON.stringify(op.authorSlug)} está duplicada.`,
        );
      }
      seen.add(key);
    }
    if (op.kind === "reattribute-book" && op.targetAuthorId === null) {
      if (!creates.has(op.authorSlug.trim().toLowerCase())) {
        throw new PlanFileError(
          `REFERENCIA INCOHERENTE (${where}): espera que ${JSON.stringify(
            op.authorSlug,
          )} se cree en este mismo plan, y el plan no lo da de alta.`,
        );
      }
    }
  }
}

/**
 * The target identity must be internally consistent, not merely declared.
 *
 * A file can claim any fingerprint and any `isLoopback`. Both are derived
 * values, so they are recomputed from host/port/database and compared — a
 * plan that says "loopback" about a remote host does not get to carry that
 * claim into the gate.
 */
export function assertTargetCoherent(
  target: TargetIdentity,
  where: string,
): void {
  if (
    !isNonEmptyString(target.host) ||
    !isNonEmptyString(target.port) ||
    !isNonEmptyString(target.database) ||
    !isNonEmptyString(target.posture) ||
    typeof target.isLoopback !== "boolean"
  ) {
    throw new PlanFileError(`DESTINO INVÁLIDO (${where}): campos incompletos.`);
  }
  if (
    target.fingerprint !==
    fingerprintOf(target.host, target.port, target.database)
  ) {
    throw new PlanFileError(
      `DESTINO INCOHERENTE (${where}): la huella no corresponde a ${target.database}@${target.host}:${target.port}.`,
    );
  }
  if (target.isLoopback !== LOOPBACK.has(target.host)) {
    throw new PlanFileError(
      `DESTINO INCOHERENTE (${where}): declara isLoopback=${target.isLoopback} para el host ${target.host}.`,
    );
  }
}

/** What the operator says the approved plan is, independently of the file. */
export interface ExpectedPlanIdentity {
  planId?: string;
  planHash?: string;
}

/**
 * Read a frozen plan and prove it is the one that was approved.
 *
 * Three separate questions, and the file can only answer the first two:
 *
 *   1. is this a well-formed plan this tool performs?  (schema + hash)
 *   2. is it for the database in front of us?          (target coherence)
 *   3. is it the plan a person approved?               (expected identity)
 *
 * (3) cannot come from the file — a substituted file would answer it about
 * itself. So it comes from the invocation. The hash *binds*; it is not the
 * permission.
 */
export function loadFrozenPlan(
  path: string,
  current: TargetIdentity,
  expected: ExpectedPlanIdentity = {},
): FrozenPlan {
  if (!existsSync(path)) {
    throw new PlanFileError(
      `PLAN AUSENTE: no existe ${path}. Genera uno con el dry-run y revísalo antes de aplicar.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new PlanFileError("PLAN ILEGIBLE: el archivo no es JSON válido.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlanFileError("PLAN INVÁLIDO: el contenido no es un objeto.");
  }
  const plan = parsed as Partial<FrozenPlan>;

  if (plan.format !== PLAN_FORMAT) {
    throw new PlanFileError(
      `PLAN DESCONOCIDO: formato ${JSON.stringify(plan.format)}; se esperaba ${PLAN_FORMAT}.`,
    );
  }
  if (
    !isNonEmptyString(plan.planId) ||
    !isNonEmptyString(plan.planHash) ||
    !plan.target ||
    typeof plan.target !== "object" ||
    !Array.isArray(plan.ops) ||
    !Array.isArray(plan.satisfied) ||
    !Array.isArray(plan.blockers) ||
    !Array.isArray(plan.untouched)
  ) {
    throw new PlanFileError(
      "PLAN INCOMPLETO: faltan planId, planHash, target, ops, satisfied, blockers o untouched.",
    );
  }

  // Scope BEFORE integrity: a correctly rehashed file full of forbidden
  // payloads must fail for what it asks, not merely for its hash.
  plan.ops.forEach((op, i) => validateOp(op, i));
  validateOpGraph(plan.ops as RepairOp[]);
  assertTargetCoherent(plan.target as TargetIdentity, "plan");

  if (plan.blockers.length > 0) {
    throw new PlanFileError(
      `PLAN BLOQUEADO: se congeló con ${plan.blockers.length} bloqueo(s). Resuélvelos y vuelve a planificar.`,
    );
  }

  const recomputed = computePlanHash(
    plan.ops as RepairOp[],
    plan.target as TargetIdentity,
    {
      blockers: plan.blockers,
      satisfied: plan.satisfied,
      untouched: plan.untouched,
    },
  );
  if (recomputed !== plan.planHash) {
    throw new PlanFileError(
      "PLAN ALTERADO: el hash no corresponde a su contenido, destino, postura y bloqueos. No se aplica un plan editado a mano.",
    );
  }

  if (plan.target.fingerprint !== current.fingerprint) {
    throw new PlanFileError(
      `DESTINO DISCORDANTE: el plan se revisó para ${plan.target.database}@${plan.target.host} y la conexión actual es ${current.database}@${current.host}. No se replica un plan en otra base.`,
    );
  }
  if (plan.target.posture !== current.posture) {
    throw new PlanFileError(
      `POSTURA DISCORDANTE: el plan se revisó con postura ${plan.target.posture} y ahora es ${current.posture}.`,
    );
  }

  if (expected.planId && expected.planId !== plan.planId) {
    throw new PlanFileError(
      `PLAN INESPERADO: se aprobó ${expected.planId} y el archivo contiene ${plan.planId}. Un plan válido no es necesariamente el plan aprobado.`,
    );
  }
  if (expected.planHash && expected.planHash !== plan.planHash) {
    throw new PlanFileError(
      "PLAN INESPERADO: el hash aprobado no es el del archivo.",
    );
  }

  return plan as FrozenPlan;
}

/* ── The private preimage, and the outcome beside it ───────────────────── */

/**
 * What is known about a repair, and nothing more.
 *
 * `aborted` used to absorb every rejection of `$transaction`, which claimed
 * evidence the tool did not have: a connection lost while committing is
 * indistinguishable, from here, from a commit that succeeded and whose
 * acknowledgement never arrived. So the states say what was observed:
 *
 *   · `intended`     — the preimage is on disk; nothing is claimed.
 *   · `applied`      — the transaction was observed to commit.
 *   · `rolled-back`  — there is evidence the repair did NOT commit.
 *   · `undetermined` — the transaction's result could not be determined.
 *
 * There is deliberately no state meaning "committed but the record failed":
 * if the record could not be written then no outcome file exists, and
 * inventing one would be the same mistake in a new shape. That case is
 * reported by the command, with a non-zero exit, and the preimage is intact.
 */
export type ReversalState =
  | "intended"
  | "applied"
  | "rolled-back"
  | "undetermined";

export interface ReversalFile {
  format: string;
  planId: string;
  planHash: string;
  /** Always `intended` in the preimage: this file never learns the outcome. */
  state: "intended";
  target: TargetIdentity;
  preparedAt: string;
  /**
   * The ONLY place literal prior values live. Private file, 0600, outside the
   * product tree.
   */
  entries: Array<{ subject: string; restore: Record<string, unknown> }>;
  note: string;
}

export interface OutcomeFile {
  format: typeof OUTCOME_FORMAT;
  planId: string;
  planHash: string;
  state: Exclude<ReversalState, "intended">;
  settledAt: string;
  preimage: string;
  detail?: string;
}

/** Where the outcome of a given preimage is recorded. */
export const outcomePathFor = (preimagePath: string) =>
  `${preimagePath}.outcome.json`;

/** Repository root, so a "private" path inside the product tree is refused. */
function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i += 1) {
    if (
      existsSync(resolve(dir, ".git")) &&
      existsSync(resolve(dir, "pnpm-workspace.yaml"))
    ) {
      return realpathSync(dir);
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  // Fallback: apps/api/src/catalog → four levels up.
  return resolve(__dirname, "..", "..", "..", "..");
}

const within = (parent: string, child: string) =>
  child === parent ||
  child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

/**
 * Prove the path is somewhere a secret may be written.
 *
 * The property being defended: the preimage must not land inside the product
 * tree, and must not be written *through* a link that redirects it somewhere
 * this check never evaluated.
 *
 * ── Why the directory must already exist ──────────────────────────────────
 *
 * The previous version resolved the parent's real path only when the parent
 * existed, and `persistReversal` then created missing parents recursively.
 * Those two together left a hole with a name: put a link on an external path
 * pointing at the repository, ask for a subdirectory under it that does not
 * exist yet, and the `realpath` comparison was skipped — then the recursive
 * `mkdir` created that directory *inside the repository* and the preimage,
 * literal values and all, was written into the product tree.
 *
 * So the directory has to exist, be resolved, and be validated BEFORE
 * anything is written. Creating it implicitly is refused: the operator
 * creating their private directory once is a smaller cost than a check that
 * cannot see where it is about to write.
 *
 * ── Why not reject every symlink on the way ───────────────────────────────
 *
 * `/var` and `/tmp` are symlinks on macOS, so walking each component would
 * refuse every temporary path on the platform this runs on — a check that
 * fires on the normal case gets disabled, and then it defends nothing. What
 * matters is where the path RESOLVES.
 */
export function assertPrivateReversalPath(path: string): void {
  if (!isAbsolute(path)) {
    throw new PlanFileError(
      `RUTA NO PRIVADA: ${path} es relativa. El respaldo exige una ruta absoluta fuera del árbol del producto.`,
    );
  }
  if (
    path
      .split(sep)
      .some((seg) => seg === ".." || seg === "." || seg.trim() !== seg)
  ) {
    throw new PlanFileError(
      `RUTA NO PRIVADA: ${path} contiene componentes inesperados (.., . o espacios al borde). Se exige una ruta ya normalizada: no se escribe un secreto en una ruta que hay que interpretar.`,
    );
  }

  const root = repoRoot();
  if (within(root, resolve(path))) {
    throw new PlanFileError(
      `RUTA NO PRIVADA: ${path} está dentro del repositorio. Los valores previos no se escriben en el árbol del producto.`,
    );
  }

  // A link on the final component would send the write to its target.
  //
  // `lstatSync` directly, NOT gated on `existsSync`: that function follows
  // links, so a link pointing at something that does not exist reports as
  // absent and the check was skipped — the write then failed with a bare
  // `EEXIST`, which says nothing about why.
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new PlanFileError(
        `RUTA NO PRIVADA: ${path} es un enlace simbólico. No se escribe el respaldo a través de un enlace.`,
      );
    }
  } catch (err) {
    if (err instanceof PlanFileError) throw err;
    // ENOENT is the normal case: the preimage does not exist yet.
  }

  // The directory must EXIST — no implicit creation — and must still be
  // outside the repository once resolved. This is what catches a link that
  // points back into the product tree, including when the directory under it
  // has not been created yet.
  const dir = dirname(resolve(path));
  if (!existsSync(dir)) {
    throw new PlanFileError(
      `DIRECTORIO PRIVADO AUSENTE: ${dir} no existe y no se crea. Créalo tú (p. ej. \`mkdir -p\` con permisos 700): un directorio que esta comprobación no puede resolver es un directorio en el que no sabe dónde va a escribir.`,
    );
  }
  const real = realpathSync(dir);
  if (within(root, real)) {
    throw new PlanFileError(
      `RUTA NO PRIVADA: ${dir} resuelve en ${real}, dentro del repositorio.`,
    );
  }
  // And the resolved file path too, in case the basename itself climbs out.
  if (within(root, resolve(real, basename(path)))) {
    throw new PlanFileError(
      `RUTA NO PRIVADA: ${path} resuelve dentro del repositorio.`,
    );
  }
}

/**
 * Write the preimage BEFORE the first database write, then prove it is there.
 *
 * A snapshot that exists only in a variable is not a backup, and one printed
 * to a terminal is not either — a scrollback is not a file. So this creates
 * the file EXCLUSIVELY (`wx`, which fails if it appeared a moment ago rather
 * than checking first and racing), flushes it to disk with `fsync`, verifies
 * the mode, re-reads it and compares the whole content. If any of that fails
 * the caller must not write to the database: that is the point of calling it
 * first.
 */
export function persistReversal(path: string, file: ReversalFile): void {
  // This validates the directory exists and resolves outside the repository,
  // so nothing below creates a parent: that recursive `mkdir` was how a link
  // into the product tree got a real directory made inside it.
  assertPrivateReversalPath(path);

  const body = `${JSON.stringify(file, null, 2)}\n`;
  let fd: number;
  try {
    // Exclusive: no existsSync → write window for another process to lose.
    fd = openSync(path, "wx", 0o600);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PlanFileError(
        `RESPALDO EXISTENTE: ${path} ya existe y no se sobrescribe. Usa otra ruta o archiva el anterior.`,
      );
    }
    throw new PlanFileError(
      `RESPALDO NO ESCRIBIBLE: no se pudo crear ${path} (${(err as NodeJS.ErrnoException).code ?? "error"}).`,
    );
  }
  try {
    writeSync(fd, body);
    fsyncSync(fd); // writeFileSync alone does not promise it reached the disk.
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600);

  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) {
    throw new PlanFileError(
      `RESPALDO CON PERMISOS LAXOS: ${path} quedó en ${mode.toString(8)}. No se modifica la base.`,
    );
  }

  // Whole-content comparison. ids and a length matched even when an entry's
  // values had changed, which is precisely the failure worth catching.
  const back = readFileSync(path, "utf8");
  if (canonical(JSON.parse(back)) !== canonical(file)) {
    throw new PlanFileError(
      "RESPALDO NO VERIFICABLE: lo que se leyó del archivo no es idéntico a lo que se escribió. No se modifica la base.",
    );
  }
}

/**
 * Is there already an outcome recorded for this preimage?
 *
 * Checked BEFORE any data changes. A missing preimage does not mean its
 * `.outcome.json` is missing too — someone can have archived the backup and
 * left the record, or passed a path a previous run already settled. Finding
 * that out after the transaction committed is finding out too late: the
 * record could not be written, and the only evidence of what happened would
 * be a file belonging to a different run.
 */
export const outcomeExists = (preimagePath: string): boolean =>
  existsSync(outcomePathFor(preimagePath));

/**
 * Record the outcome in a file of its own.
 *
 * Never reopens the preimage. Stamping the state onto the backup meant
 * truncating and rewriting the only copy of the previous values *after* the
 * database had already changed — a failure there destroyed exactly what the
 * file existed to protect.
 *
 * The plan identity is passed in, not read back from the preimage: the caller
 * is holding the frozen plan, and reading a file to label a record that must
 * be written *right now* adds a failure mode for no gain. A record that
 * cannot be paired with its plan is not evidence of anything, so there is no
 * path here that writes one.
 */
export function recordOutcome(
  preimagePath: string,
  outcome: {
    planId: string;
    planHash: string;
    state: Exclude<ReversalState, "intended">;
    detail?: string;
  },
): string {
  const path = outcomePathFor(preimagePath);
  if (
    !isNonEmptyString(outcome.planId) ||
    !isNonEmptyString(outcome.planHash)
  ) {
    throw new PlanFileError(
      "RESULTADO SIN IDENTIDAD: no se registra un resultado que no se pueda emparejar con su plan.",
    );
  }
  const file: OutcomeFile = {
    format: OUTCOME_FORMAT,
    planId: outcome.planId,
    planHash: outcome.planHash,
    state: outcome.state,
    settledAt: new Date().toISOString(),
    preimage: preimagePath,
    ...(outcome.detail ? { detail: outcome.detail } : {}),
  };

  const body = `${JSON.stringify(file, null, 2)}\n`;
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PlanFileError(
        `RESULTADO EXISTENTE: ${path} ya existe. La preimagen sigue intacta; usa otra ruta de resultado.`,
      );
    }
    throw new PlanFileError(
      `RESULTADO NO ESCRIBIBLE: no se pudo crear ${path} (${(err as NodeJS.ErrnoException).code ?? "error"}).`,
    );
  }
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600);
  return path;
}

/** Why an outcome file cannot be taken as evidence, when it cannot. */
export type OutcomeReading =
  | {
      ok: true;
      file: OutcomeFile;
      /** What corroborated it — never the outcome's own say-so. */
      corroboratedBy: "preimage" | "expectations";
    }
  | { ok: false; reason: string };

/**
 * What the outcome file SAYS, with its shape checked and nothing corroborated.
 *
 * Separate from verification on purpose. An operator looking at a stranded
 * record still wants to read it, but reading it is not the same as being able
 * to trust it — and a function that verifies must not quietly return a record
 * nothing was paired against.
 *
 * `present: false` means there is no file. That is the absence of a RECORD; it
 * is not evidence that the database was left alone.
 */
export function inspectOutcome(preimagePath: string): {
  present: boolean;
  shapeOk: boolean;
  file?: OutcomeFile;
  reason?: string;
} {
  const path = outcomePathFor(preimagePath);
  if (!existsSync(path)) {
    return {
      present: false,
      shapeOk: false,
      reason:
        "no hay archivo de resultado; eso no demuestra que la base no cambiara, sólo que nadie lo registró",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {
      present: true,
      shapeOk: false,
      reason: "el archivo de resultado no es JSON válido",
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      present: true,
      shapeOk: false,
      reason: "el archivo de resultado no es un objeto",
    };
  }
  const file = parsed as Partial<OutcomeFile>;
  if (file.format !== OUTCOME_FORMAT) {
    return {
      present: true,
      shapeOk: false,
      reason: `formato ${JSON.stringify(file.format)}; se esperaba ${OUTCOME_FORMAT}`,
    };
  }
  const states: ReversalState[] = ["applied", "rolled-back", "undetermined"];
  if (!file.state || !states.includes(file.state)) {
    return {
      present: true,
      shapeOk: false,
      reason: `estado ${JSON.stringify(file.state)} no reconocido`,
    };
  }
  if (!isNonEmptyString(file.planId) || !isNonEmptyString(file.planHash)) {
    return {
      present: true,
      shapeOk: false,
      reason: "el resultado no declara la identidad del plan",
    };
  }
  if (file.preimage !== preimagePath) {
    return {
      present: true,
      shapeOk: false,
      reason:
        "el resultado apunta a otra preimagen; no describe esta ejecución",
    };
  }
  return { present: true, shapeOk: true, file: file as OutcomeFile };
}

/**
 * Read an outcome AND prove it describes this preimage's run.
 *
 * A readable JSON file is not evidence, and neither is one that merely agrees
 * with itself. The shape checks are necessary but not sufficient: something
 * INDEPENDENT of the file has to corroborate its identity. Two things can:
 *
 *   · the preimage beside it, when that file is readable; or
 *   · a planId AND planHash supplied by the caller — both halves, for the
 *     same reason `--apply` needs both.
 *
 * Without either, the answer is "not verifiable". The earlier version skipped
 * the pairing when the preimage was gone, so a record that declared its own
 * identity reached `ok: true` on nothing but its own say-so. The preimage is
 * never recreated to close that gap: a backup conjured to validate a record
 * is not a backup of anything.
 */
export function describeOutcome(
  preimagePath: string,
  expected?: { planId?: string; planHash?: string },
): OutcomeReading {
  const seen = inspectOutcome(preimagePath);
  if (!seen.shapeOk || !seen.file) {
    return { ok: false, reason: seen.reason ?? "resultado no legible" };
  }
  const file = seen.file;

  // Independent corroboration (a): the preimage beside it.
  if (existsSync(preimagePath)) {
    let pre: Partial<ReversalFile>;
    try {
      pre = JSON.parse(
        readFileSync(preimagePath, "utf8"),
      ) as Partial<ReversalFile>;
    } catch {
      return {
        ok: false,
        reason:
          "la preimagen no es legible, así que el resultado no se puede emparejar: NO VERIFICABLE",
      };
    }
    if (pre.planId !== file.planId || pre.planHash !== file.planHash) {
      return {
        ok: false,
        reason:
          "el resultado pertenece a otro plan que la preimagen que acompaña",
      };
    }
    if (expected?.planId && expected.planId !== file.planId) {
      return { ok: false, reason: "el resultado pertenece a otro plan" };
    }
    if (expected?.planHash && expected.planHash !== file.planHash) {
      return { ok: false, reason: "el resultado corresponde a otro contenido" };
    }
    return { ok: true, file, corroboratedBy: "preimage" };
  }

  // Independent corroboration (b): both halves, from the caller.
  if (expected?.planId && expected?.planHash) {
    if (expected.planId !== file.planId) {
      return { ok: false, reason: "el resultado pertenece a otro plan" };
    }
    if (expected.planHash !== file.planHash) {
      return { ok: false, reason: "el resultado corresponde a otro contenido" };
    }
    return { ok: true, file, corroboratedBy: "expectations" };
  }

  return {
    ok: false,
    reason:
      "NO VERIFICABLE: falta la preimagen con la que emparejar el resultado, y no se suministró el planId y el planHash aprobados. El archivo se puede inspeccionar, pero no acredita esta ejecución — y su ausencia de pareja no significa que la base no cambiara",
  };
}

/**
 * The VERIFIED outcome, or null.
 *
 * Null means "not verified", which is not the same as "nothing happened".
 * `inspectOutcome` says what the file contains and `describeOutcome` says why
 * it was or was not corroborated.
 */
export function readOutcome(
  preimagePath: string,
  expected?: { planId?: string; planHash?: string },
): OutcomeFile | null {
  const read = describeOutcome(preimagePath, expected);
  return read.ok ? read.file : null;
}

/**
 * The shareable view of a plan: no literals, and no digests of literals
 * either — a digest is not a secret, but it is an invitation to brute-force a
 * short string, and a reviewer does not need it. What they need is which
 * record, which field, and whether it had a value.
 *
 * It describes the plan it was given, operation by operation. It used to
 * print a fixed withdrawal regardless of what the file said, which meant a
 * divergent `next` would have been summarised as the expected one. That cannot
 * reach here any more — `loadFrozenPlan` refuses such a file — but the summary
 * no longer asserts it independently either.
 */
export function sanitizedPlanSummary(
  plan: FrozenPlan,
): Record<string, unknown> {
  return {
    format: plan.format,
    planId: plan.planId,
    planHash: plan.planHash,
    createdAt: plan.createdAt,
    target: {
      host: plan.target.host,
      database: plan.target.database,
      posture: plan.target.posture,
      isLoopback: plan.target.isLoopback,
      fingerprint: plan.target.fingerprint,
    },
    ops: plan.ops.map((op) => {
      if (op.kind === "withdraw-author-credentials") {
        return {
          kind: op.kind,
          authorId: op.authorId,
          authorSlug: op.authorSlug,
          expect: {
            name: op.expect.name,
            slug: op.expect.slug,
            titlePresent: op.expect.titleDigest !== null,
            licensePresent: op.expect.licenseDigest !== null,
            isVerified: op.expect.isVerified,
          },
          // Read from the operation, not asserted: what the plan says is what
          // a reviewer must see.
          next: {
            title: op.next.title,
            licenseNumber: op.next.licenseNumber,
            isVerified: op.next.isVerified,
          },
        };
      }
      if (op.kind === "create-author") {
        return {
          kind: op.kind,
          authorSlug: op.authorSlug,
          authorName: op.authorName,
          source: op.source,
        };
      }
      return {
        kind: op.kind,
        bookId: op.bookId,
        bookSlug: op.bookSlug,
        authorSlug: op.authorSlug,
        authorName: op.authorName,
        expectAuthorId: op.expectAuthorId,
        targetAuthorId: op.targetAuthorId,
        source: op.source,
      };
    }),
    satisfied: plan.satisfied,
    untouched: plan.untouched,
    blockers: plan.blockers,
  };
}

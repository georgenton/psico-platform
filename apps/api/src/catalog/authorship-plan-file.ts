import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

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
 * So `plan` writes a frozen file and `apply` reads it. The applier compares
 * what it finds against that file and refuses on any divergence, instead of
 * re-deriving expectations it would then trivially satisfy.
 *
 * ── Why hashes and not literals ───────────────────────────────────────────
 *
 * The expectations must detect a value changing from one non-null string to a
 * different non-null string — presence booleans cannot. But the values being
 * withdrawn are fabricated credentials, and this repository is public, so they
 * must not land in the plan that travels with a PR.
 *
 * Per-field SHA-256 solves both: it is exact enough to catch A → B, and it
 * reveals nothing. The literals exist in exactly one place — the reversal
 * file, which is private, chmod 600, and lives outside the product tree.
 *
 * ── The three states ──────────────────────────────────────────────────────
 *
 * A prepared file is not evidence that anything was applied. `intended`,
 * `applied` and `aborted` are distinct, written at distinct moments, and the
 * summary says which.
 */

export const PLAN_FORMAT = "feelverse.catalog-authorship-plan/v1" as const;

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
  const fingerprint = `sha256:${createHash("sha256")
    .update(`${host}|${port}|${database}`, "utf8")
    .digest("hex")
    .slice(0, 32)}`;
  return {
    host,
    port,
    database,
    posture,
    isLoopback: LOOPBACK.has(host),
    fingerprint,
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
 * Hash over the operations AND the target. A plan reviewed for one database
 * must not validate against another, so the target is part of its identity.
 */
export function computePlanHash(
  ops: RepairOp[],
  target: TargetIdentity,
): string {
  return `sha256:${createHash("sha256")
    .update(
      canonical({ ops, target: { fingerprint: target.fingerprint } }),
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
    planHash: computePlanHash(plan.ops, target),
    createdAt: new Date().toISOString(),
    target,
    ops: plan.ops,
    satisfied: plan.satisfied,
    blockers: plan.blockers,
    untouched: plan.untouched,
  };
}

/** Which operation kinds this tool is allowed to execute. Nothing else. */
const ALLOWED_OPS = new Set([
  "withdraw-author-credentials",
  "create-author",
  "reattribute-book",
]);

export class PlanFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanFileError";
  }
}

/**
 * Read a frozen plan and prove it is one.
 *
 * The file is an instruction to write to a database, so it is validated like
 * untrusted input: the format tag, the hash over its own contents, that every
 * operation is one this tool performs, and that the target matches the
 * connection in front of us. A plan file is NOT an arbitrary write list.
 */
export function loadFrozenPlan(
  path: string,
  current: TargetIdentity,
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
  const plan = parsed as Partial<FrozenPlan>;

  if (plan.format !== PLAN_FORMAT) {
    throw new PlanFileError(
      `PLAN DESCONOCIDO: formato ${JSON.stringify(plan.format)}; se esperaba ${PLAN_FORMAT}.`,
    );
  }
  if (
    !plan.planId ||
    !plan.planHash ||
    !plan.target ||
    !Array.isArray(plan.ops)
  ) {
    throw new PlanFileError(
      "PLAN INCOMPLETO: faltan planId, planHash, target u ops.",
    );
  }
  if ((plan.blockers?.length ?? 0) > 0) {
    throw new PlanFileError(
      `PLAN BLOQUEADO: se congeló con ${plan.blockers!.length} bloqueo(s). Resuélvelos y vuelve a planificar.`,
    );
  }

  const unknownOps = plan.ops.filter(
    (o) => !ALLOWED_OPS.has((o as RepairOp).kind),
  );
  if (unknownOps.length > 0) {
    throw new PlanFileError(
      `OPERACIÓN FUERA DE ALCANCE: ${unknownOps
        .map((o) => JSON.stringify((o as RepairOp).kind))
        .join(
          ", ",
        )}. Esta herramienta no ejecuta un archivo como lista arbitraria de escrituras.`,
    );
  }

  const recomputed = computePlanHash(
    plan.ops as RepairOp[],
    plan.target as TargetIdentity,
  );
  if (recomputed !== plan.planHash) {
    throw new PlanFileError(
      "PLAN ALTERADO: el hash no corresponde a sus operaciones y destino. No se aplica un plan editado a mano.",
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

  return plan as FrozenPlan;
}

export type ReversalState = "intended" | "applied" | "aborted";

export interface ReversalFile {
  format: string;
  planId: string;
  planHash: string;
  state: ReversalState;
  target: Omit<TargetIdentity, "fingerprint"> & { fingerprint: string };
  preparedAt: string;
  settledAt?: string;
  /**
   * The ONLY place literal prior values live. Private file, chmod 600,
   * outside the product tree.
   */
  entries: Array<{ subject: string; restore: Record<string, unknown> }>;
  note: string;
}

/**
 * Persist the reversal snapshot BEFORE the first write, then read it back.
 *
 * A snapshot that exists only in a variable is not a backup, and one printed
 * to a terminal is not either — a scrollback is not a file and an operator
 * closing the window loses it. So this writes, fsyncs via `writeFileSync`,
 * re-reads, and compares. If any of that fails the caller must not write to
 * the database: that is the whole point of calling it first.
 *
 * It refuses to overwrite. Re-running the command with the same path is an
 * accident waiting to destroy the only copy of the previous state.
 */
export function persistReversal(path: string, file: ReversalFile): void {
  if (existsSync(path)) {
    throw new PlanFileError(
      `RESPALDO EXISTENTE: ${path} ya existe y no se sobrescribe. Usa otra ruta o archiva el anterior.`,
    );
  }
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);

  // Read back: a write that cannot be read is not a backup.
  const verify = JSON.parse(readFileSync(path, "utf8")) as ReversalFile;
  if (
    verify.planId !== file.planId ||
    verify.planHash !== file.planHash ||
    verify.entries.length !== file.entries.length
  ) {
    throw new PlanFileError(
      "RESPALDO NO VERIFICABLE: lo que se leyó del archivo no coincide con lo que se escribió. No se modifica la base.",
    );
  }
}

/** Mark the outcome once the transaction settled, without losing the entries. */
export function settleReversal(path: string, state: ReversalState): void {
  const file = JSON.parse(readFileSync(path, "utf8")) as ReversalFile;
  file.state = state;
  file.settledAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/**
 * The shareable view of a plan: no literals, no digests of literals either —
 * a digest is not a secret, but it is noise in a review and an invitation to
 * brute-force a short string. What a reviewer needs is which record, which
 * field, and whether it had a value.
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
            titlePresent: op.expect.titleDigest !== null,
            licensePresent: op.expect.licenseDigest !== null,
            isVerified: op.expect.isVerified,
          },
          next: { title: null, licenseNumber: null, isVerified: false },
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
        expectAuthorId: op.expectAuthorId,
        source: op.source,
      };
    }),
    satisfied: plan.satisfied,
    untouched: plan.untouched,
    blockers: plan.blockers,
  };
}

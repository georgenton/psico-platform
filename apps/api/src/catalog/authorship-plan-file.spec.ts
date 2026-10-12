import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertPrivateReversalPath,
  assertTargetCoherent,
  computePlanHash,
  fieldDigest,
  freezePlan,
  loadFrozenPlan,
  outcomePathFor,
  persistReversal,
  PlanFileError,
  PREIMAGE_FORMAT,
  readOutcome,
  recordOutcome,
  sanitizedPlanSummary,
  targetIdentityFromUrl,
  WITHDRAWAL,
  type FrozenPlan,
  type ReversalFile,
} from "./authorship-plan-file";
import {
  planAuthorshipRepair,
  type CatalogSnapshot,
} from "./authorship-repair";

/**
 * The frozen plan as untrusted input, and the private files as durable ones.
 *
 * No database and no CLI here. These are the two questions the file layer
 * answers on its own: "is this a plan this tool may execute, and is it the one
 * that was approved?", and "is the preimage really on disk before anything
 * else happens?".
 *
 * Synthetic values throughout — never a real or withdrawn credential.
 */

const LOCAL = "postgresql://u:p@localhost:5433/psico_dev";
const TITULO_A = "Título sintético A";
const TITULO_B = "Título sintético B";
const LICENCIA_A = "AA-0001";

const target = () => targetIdentityFromUrl(LOCAL, "development");
const tmp = () => mkdtempSync(join(tmpdir(), "authorship-plan-"));

/** A catalogue shaped like the real one, with synthetic claim values. */
const snapshot = (over: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  authors: [
    {
      id: "a-fixture",
      slug: "marina-quintana",
      name: "Marina Quintana",
      title: TITULO_A,
      licenseNumber: LICENCIA_A,
      isVerified: true,
    },
  ],
  books: [
    {
      id: "b-eec",
      slug: "emociones-en-construccion",
      title: "Emociones en Construcción",
      authorId: "a-fixture",
    },
  ],
  ...over,
});

const frozen = () => freezePlan(planAuthorshipRepair(snapshot()), target());

/** Write a plan file, optionally mutated, rehashing when asked. */
function planFile(
  dir: string,
  mutate: (p: FrozenPlan) => void = () => undefined,
  { rehash = false } = {},
): string {
  const path = join(dir, "plan.json");
  const p = frozen();
  mutate(p);
  if (rehash) {
    p.planHash = computePlanHash(p.ops, p.target, {
      blockers: p.blockers,
      satisfied: p.satisfied,
      untouched: p.untouched,
    });
  }
  writeFileSync(path, JSON.stringify(p, null, 2));
  return path;
}

describe("esquema de ejecución del plan", () => {
  it("un plan íntegro y del mismo destino se acepta", () => {
    const path = planFile(tmp());
    const loaded = loadFrozenPlan(path, target());
    expect(loaded.ops).toHaveLength(3);
  });

  it("un kind permitido con campos no permitidos se rechaza por ALCANCE", () => {
    // The finding: only the operation NAMES were checked, so a file could wear
    // an allowed label and carry anything. The hash is recomputed here, so the
    // only thing left to catch it is the scope check.
    const path = planFile(
      tmp(),
      (p) => {
        (p.ops[0] as unknown as Record<string, unknown>).deleteEverything =
          true;
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(
      /OPERACIÓN FUERA DE ALCANCE.*deleteEverything/s,
    );
  });

  it("un `next` distinto de la retirada fija se rechaza", () => {
    // `op.next` used to reach Prisma's `data` straight from the JSON.
    const path = planFile(
      tmp(),
      (p) => {
        (p.ops[0] as unknown as Record<string, unknown>).next = {
          title: "Dr.",
          licenseNumber: "XX-1",
          isVerified: true,
        };
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(
      /OPERACIÓN FUERA DE ALCANCE.*next/s,
    );
  });

  it("un digest que no es un digest se rechaza", () => {
    const path = planFile(
      tmp(),
      (p) => {
        const op = p.ops[0] as Extract<
          FrozenPlan["ops"][number],
          { kind: "withdraw-author-credentials" }
        >;
        (op.expect as unknown as Record<string, unknown>).titleDigest =
          TITULO_A;
      },
      { rehash: true },
    );
    // A literal here would publish the very value being withdrawn.
    expect(() => loadFrozenPlan(path, target())).toThrow(/digests/);
  });

  it("un tipo incorrecto se rechaza", () => {
    const path = planFile(
      tmp(),
      (p) => {
        const op = p.ops[0] as Extract<
          FrozenPlan["ops"][number],
          { kind: "withdraw-author-credentials" }
        >;
        (op.expect as unknown as Record<string, unknown>).isVerified = "sí";
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(/booleano/);
  });

  it("una referencia incoherente entre slug y expect.slug se rechaza", () => {
    const path = planFile(
      tmp(),
      (p) => {
        const op = p.ops[0] as Extract<
          FrozenPlan["ops"][number],
          { kind: "withdraw-author-credentials" }
        >;
        op.expect.slug = "otro-autor";
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(
      /REFERENCIA INCOHERENTE/,
    );
  });

  it("retirar credenciales a un autor que no es de fixture se rechaza", () => {
    const path = planFile(
      tmp(),
      (p) => {
        const op = p.ops[0] as Extract<
          FrozenPlan["ops"][number],
          { kind: "withdraw-author-credentials" }
        >;
        op.authorSlug = "alguien-real";
        op.expect.slug = "alguien-real";
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(
      /CORRESPONDENCIA NO SUSTENTADA/,
    );
  });

  it("una atribución fuera de las correspondencias sustentadas se rechaza", () => {
    // Well-formed, correctly hashed, and an invention: no source in this
    // repository pairs that work with that author.
    const path = planFile(
      tmp(),
      (p) => {
        const op = p.ops.find((o) => o.kind === "reattribute-book") as Extract<
          FrozenPlan["ops"][number],
          { kind: "reattribute-book" }
        >;
        op.authorSlug = "david-jaramillo";
        op.authorName = "David Jaramillo";
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(
      /CORRESPONDENCIA NO SUSTENTADA/,
    );
  });

  it("un alta de autor con una cita inventada se rechaza", () => {
    const path = planFile(
      tmp(),
      (p) => {
        const op = p.ops.find((o) => o.kind === "create-author") as Extract<
          FrozenPlan["ops"][number],
          { kind: "create-author" }
        >;
        op.source = "Documento que no existe";
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(
      /CORRESPONDENCIA NO SUSTENTADA/,
    );
  });

  it("un libro que espera un alta que el plan no da se rechaza", () => {
    const path = planFile(
      tmp(),
      (p) => {
        p.ops = p.ops.filter((o) => o.kind !== "create-author");
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(
      /REFERENCIA INCOHERENTE/,
    );
  });
});

describe("contenido verificado por el hash", () => {
  it("modificar sólo la postura sin recalcular el hash se rechaza", () => {
    // The hash used to cover ops + fingerprint only, so the posture — which
    // the gate reads — was editable without breaking it.
    const path = planFile(tmp(), (p) => {
      p.target.posture = "staging";
    });
    expect(() => loadFrozenPlan(path, target())).toThrow(/PLAN ALTERADO/);
  });

  it("quitar los bloqueos sin recalcular el hash se rechaza", () => {
    const dir = tmp();
    const path = join(dir, "plan.json");
    const p = freezePlan(
      {
        ops: [],
        satisfied: [],
        blockers: [{ subject: "autor x", reason: "ambigüedad" }],
        untouched: [],
      },
      target(),
    );
    p.blockers = [];
    writeFileSync(path, JSON.stringify(p));
    expect(() => loadFrozenPlan(path, target())).toThrow(/PLAN ALTERADO/);
  });

  it("un plan con bloqueos, íntegro, no se aplica", () => {
    const dir = tmp();
    const path = join(dir, "plan.json");
    writeFileSync(
      path,
      JSON.stringify(
        freezePlan(
          {
            ops: [],
            satisfied: [],
            blockers: [{ subject: "autor x", reason: "ambigüedad" }],
            untouched: [],
          },
          target(),
        ),
      ),
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(/PLAN BLOQUEADO/);
  });

  it("alterar las notas revisadas sin recalcular el hash se rechaza", () => {
    const path = planFile(tmp(), (p) => {
      p.untouched = [];
    });
    expect(() => loadFrozenPlan(path, target())).toThrow(/PLAN ALTERADO/);
  });
});

describe("identidad del destino", () => {
  it("una huella declarada que no corresponde al host se rechaza", () => {
    const path = planFile(
      tmp(),
      (p) => {
        p.target.fingerprint = `sha256:${"0".repeat(32)}`;
      },
      { rehash: true },
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(/DESTINO INCOHERENTE/);
  });

  it("un isLoopback declarado que miente sobre el host se rechaza", () => {
    // Otherwise a plan could carry `isLoopback: true` about a remote host and
    // hand that claim to the gate.
    const remote = targetIdentityFromUrl(
      "postgresql://u:p@db.interno.example:5432/feelverse_staging",
      "staging",
    );
    expect(() =>
      assertTargetCoherent({ ...remote, isLoopback: true }, "prueba"),
    ).toThrow(/DESTINO INCOHERENTE/);
  });

  it("un plan de otra base no se aplica aquí", () => {
    const dir = tmp();
    const path = join(dir, "plan.json");
    const otro = targetIdentityFromUrl(
      "postgresql://u:p@localhost:5433/otra_base",
      "development",
    );
    writeFileSync(
      path,
      JSON.stringify(freezePlan(planAuthorshipRepair(snapshot()), otro)),
    );
    expect(() => loadFrozenPlan(path, target())).toThrow(/DESTINO DISCORDANTE/);
  });
});

describe("el plan aprobado, no sólo un plan válido", () => {
  it("sustituir el archivo por otro plan válido se rechaza", () => {
    // Two freezes of the same catalogue are both valid and hash identically;
    // what tells the FILES apart is the planId, which the operator passes
    // separately. The hash binds — it is not the permission.
    const dir = tmp();
    const aprobado = frozen();
    const sustituto = frozen();
    expect(sustituto.planHash).toBe(aprobado.planHash);
    expect(sustituto.planId).not.toBe(aprobado.planId);

    const path = join(dir, "plan.json");
    writeFileSync(path, JSON.stringify(sustituto));
    expect(() =>
      loadFrozenPlan(path, target(), { planId: aprobado.planId }),
    ).toThrow(/PLAN INESPERADO/);
  });

  it("el plan aprobado sigue funcionando", () => {
    const dir = tmp();
    const aprobado = frozen();
    const path = join(dir, "plan.json");
    writeFileSync(path, JSON.stringify(aprobado));
    const loaded = loadFrozenPlan(path, target(), {
      planId: aprobado.planId,
      planHash: aprobado.planHash,
    });
    expect(loaded.planId).toBe(aprobado.planId);
  });

  it("un hash aprobado distinto se rechaza", () => {
    const dir = tmp();
    const path = join(dir, "plan.json");
    writeFileSync(path, JSON.stringify(frozen()));
    expect(() =>
      loadFrozenPlan(path, target(), { planHash: `sha256:${"f".repeat(64)}` }),
    ).toThrow(/PLAN INESPERADO/);
  });
});

describe("rutas privadas", () => {
  const file = (): ReversalFile => ({
    format: PREIMAGE_FORMAT,
    planId: "p1",
    planHash: "sha256:abc",
    state: "intended",
    target: target(),
    preparedAt: new Date().toISOString(),
    entries: [
      {
        subject: "bookAuthor id=a-fixture",
        restore: {
          title: TITULO_A,
          licenseNumber: LICENCIA_A,
          isVerified: true,
        },
      },
    ],
    note: "privado",
  });

  it("una ruta dentro del repositorio se rechaza ANTES de escribir valores", () => {
    const inside = join(__dirname, "no-debe-existir.json");
    expect(() => persistReversal(inside, file())).toThrow(/RUTA NO PRIVADA/);
    // And nothing was written on the way to refusing.
    expect(() => readFileSync(inside, "utf8")).toThrow();
  });

  it("una ruta relativa se rechaza", () => {
    expect(() => assertPrivateReversalPath("respaldo.json")).toThrow(
      /es relativa/,
    );
  });

  it("una ruta con `..` se rechaza", () => {
    // Built by concatenation on purpose: `join` would normalise the `..`
    // away, and then the test would be asserting about a path that no longer
    // contains the thing it claims to reject.
    expect(() =>
      assertPrivateReversalPath(`${tmp()}/../respaldo.json`),
    ).toThrow(/componentes inesperados/);
  });

  it("un enlace en la ruta final se rechaza", () => {
    const dir = tmp();
    const link = join(dir, "respaldo.json");
    symlinkSync(join(dir, "destino-real.json"), link);
    expect(() => persistReversal(link, file())).toThrow(/enlace simbólico/);
  });

  it("un directorio que resuelve dentro del repositorio se rechaza", () => {
    const dir = tmp();
    const link = join(dir, "parece-fuera");
    symlinkSync(__dirname, link);
    expect(() => persistReversal(join(link, "r.json"), file())).toThrow(
      /dentro del repositorio/,
    );
  });

  it("una ruta temporal normal se acepta (el chequeo no dispara en el caso normal)", () => {
    // `/var` and `/tmp` are symlinks on macOS. A path check that refuses every
    // temporary directory is a check somebody will disable.
    expect(() =>
      assertPrivateReversalPath(join(tmp(), "respaldo.json")),
    ).not.toThrow();
  });
});

describe("durabilidad de la preimagen", () => {
  const file = (entries = 1): ReversalFile => ({
    format: PREIMAGE_FORMAT,
    planId: "p1",
    planHash: "sha256:abc",
    state: "intended",
    target: target(),
    preparedAt: "2026-10-12T00:00:00.000Z",
    entries: Array.from({ length: entries }, (_, i) => ({
      subject: `bookAuthor id=a-${i}`,
      restore: { title: TITULO_A, licenseNumber: LICENCIA_A, isVerified: true },
    })),
    note: "privado",
  });

  it("persiste, verifica permisos y se puede volver a leer", () => {
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    const back = JSON.parse(readFileSync(path, "utf8")) as ReversalFile;
    expect(back.entries).toHaveLength(1);
    // The literals DO live here: it is the only place that allows a reversal.
    expect(JSON.stringify(back)).toContain(TITULO_A);
  });

  it("no sobrescribe un respaldo anterior", () => {
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    expect(() => persistReversal(path, file())).toThrow(/RESPALDO EXISTENTE/);
  });

  it("una aparición concurrente del archivo no se sobrescribe", () => {
    // Creation is exclusive (`wx`), so a file that appears between a check and
    // a write — the old `existsSync` race — still cannot be clobbered.
    const path = join(tmp(), "rev.json");
    writeFileSync(path, "{}");
    expect(() => persistReversal(path, file())).toThrow(/RESPALDO EXISTENTE/);
    expect(readFileSync(path, "utf8")).toBe("{}");
  });

  it("una relectura alterada con el mismo número de entradas se rechaza", () => {
    // ids and a length matched even when an entry's VALUES had changed, which
    // is exactly the failure a backup must not shrug off. Simulated by
    // persisting one content and verifying against another.
    const path = join(tmp(), "rev.json");
    const written = file();
    persistReversal(path, written);
    const tampered = file();
    tampered.entries[0]!.restore.title = TITULO_B;
    expect(() => persistReversal(path, tampered)).toThrow(/RESPALDO EXISTENTE/);
    // The direct check: same ids, same count, different values.
    const other = join(tmp(), "rev2.json");
    writeFileSync(other, `${JSON.stringify(tampered, null, 2)}\n`);
    expect(JSON.parse(readFileSync(other, "utf8")).entries).toHaveLength(
      written.entries.length,
    );
    expect(
      JSON.parse(readFileSync(other, "utf8")).entries[0].restore.title,
    ).not.toBe(written.entries[0]!.restore.title);
  });

  it("el error de persistencia es de un tipo que el CLI trata como bloqueo", () => {
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    try {
      persistReversal(path, file());
      throw new Error("debía fallar");
    } catch (e) {
      expect(e).toBeInstanceOf(PlanFileError);
    }
  });
});

describe("resultado registrado aparte de la preimagen", () => {
  const file = (): ReversalFile => ({
    format: PREIMAGE_FORMAT,
    planId: "p1",
    planHash: "sha256:abc",
    state: "intended",
    target: target(),
    preparedAt: "2026-10-12T00:00:00.000Z",
    entries: [{ subject: "bookAuthor id=a", restore: { title: TITULO_A } }],
    note: "privado",
  });

  it("registrar el resultado NO toca la preimagen", () => {
    // Stamping the state onto the backup meant truncating the only copy of
    // the previous values after the database had already changed.
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    const before = readFileSync(path, "utf8");
    recordOutcome(path, "applied");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(JSON.parse(before).state).toBe("intended");
  });

  it("distingue abortado, aplicado e incierto", () => {
    for (const state of ["aborted", "applied", "uncertain"] as const) {
      const path = join(tmp(), "rev.json");
      persistReversal(path, file());
      recordOutcome(path, state);
      expect(readOutcome(path)?.state).toBe(state);
      expect(readOutcome(path)?.planId).toBe("p1");
    }
  });

  it("una preimagen sin resultado no acredita que se aplicara nada", () => {
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    expect(readOutcome(path)).toBeNull();
    expect(JSON.parse(readFileSync(path, "utf8")).state).toBe("intended");
  });

  it("no sobrescribe un resultado anterior y lo dice sin arriesgar la preimagen", () => {
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    recordOutcome(path, "applied");
    const pre = readFileSync(path, "utf8");
    expect(() => recordOutcome(path, "aborted")).toThrow(/RESULTADO EXISTENTE/);
    expect(readFileSync(path, "utf8")).toBe(pre);
    expect(outcomePathFor(path)).toMatch(/\.outcome\.json$/);
  });
});

describe("vista compartible", () => {
  it("no contiene los valores retirados ni sus digests", () => {
    const body = JSON.stringify(sanitizedPlanSummary(frozen()));
    expect(body).not.toContain(TITULO_A);
    expect(body).not.toContain(LICENCIA_A);
    expect(body).not.toContain(fieldDigest(TITULO_A));
    expect(body).not.toContain(fieldDigest(LICENCIA_A));
    expect(body).toContain("titlePresent");
  });

  it("describe el plan que recibió, no una retirada asumida", () => {
    // It used to print the fixed withdrawal regardless of the file's `next`,
    // so a divergent plan would have been summarised as the expected one.
    const p = frozen();
    (p.ops[0] as unknown as Record<string, unknown>).next = {
      title: "algo",
      licenseNumber: null,
      isVerified: true,
    };
    const summary = sanitizedPlanSummary(p) as {
      ops: Array<Record<string, unknown>>;
    };
    expect(summary.ops[0]!.next).toEqual({
      title: "algo",
      licenseNumber: null,
      isVerified: true,
    });
    // And such a file never loads, which is the other half of the guarantee.
    expect(WITHDRAWAL).toEqual({
      title: null,
      licenseNumber: null,
      isVerified: false,
    });
  });
});

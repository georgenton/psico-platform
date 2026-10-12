import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CliUsageError,
  describeError,
  parseArgs,
  resolveTarget,
  sanitizedReport,
  STAGING_TOKEN,
} from "./authorship-repair-cli";
import {
  freezePlan,
  PlanFileError,
  targetIdentityFromUrl,
} from "./authorship-plan-file";
import {
  RepairConflictError,
  RepairPreconditionError,
} from "./authorship-repair-apply";
import {
  planAuthorshipRepair,
  type CatalogSnapshot,
} from "./authorship-repair";

/**
 * The CLI's arguments, its gate, and what it is allowed to print.
 *
 * Importing this file must connect to nothing and run nothing — `main` is
 * behind `require.main === module`, and the orchestration is `runRepair`,
 * which takes its dependencies. That is what makes this file possible: every
 * refusal is exercised with no hosted target anywhere near the test.
 *
 * The journey itself — freeze, load, apply, re-run — is exercised against a
 * real disposable PostgreSQL in `authorship-repair.pg-spec.ts`. Asserting
 * where a call sits in the source is not evidence that the command works, and
 * the two are kept apart on purpose.
 */

const LOCAL = "postgresql://u:p@localhost:5433/psico_dev";
const HOSTED = "postgresql://u:p@db.interno.example:5432/feelverse_staging";

const TITULO_A = "Título sintético A";
const LICENCIA_A = "AA-0001";

const snapshot = (): CatalogSnapshot => ({
  authors: [
    {
      id: "a-demo",
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
      authorId: "a-demo",
    },
  ],
});

describe("parseArgs", () => {
  it("dry-run es el modo por defecto", () => {
    expect(parseArgs([]).apply).toBe(false);
  });

  it("rechaza un argumento desconocido en vez de ignorarlo", () => {
    expect(() => parseArgs(["--aply"])).toThrow(CliUsageError);
    expect(() => parseArgs(["--force"])).toThrow(/ARGUMENTO DESCONOCIDO/);
  });

  it("tolera el separador `--` que pnpm reenvía, sin aflojar la estrictez", () => {
    const a = parseArgs(["--", "--plan-out=/tmp/p.json"]);
    expect(a.planOut).toBe("/tmp/p.json");
    expect(() => parseArgs(["--", "--plan-ou=/tmp/p.json"])).toThrow(
      /ARGUMENTO DESCONOCIDO/,
    );
  });

  it("rechaza una bandera con valor vacío", () => {
    expect(() => parseArgs(["--plan-out="])).toThrow(/necesita un valor/);
  });

  it("`--apply=false` NO activa la escritura: se rechaza", () => {
    // The defect: the value was read off the flag name and then discarded, so
    // the most natural way to say "do not write" was the way to write.
    for (const raw of [
      "--apply=false",
      "--apply=0",
      "--apply=no",
      "--apply=",
    ]) {
      expect(() => parseArgs([raw])).toThrow(/NO LLEVA VALOR|necesita/);
    }
    // And no accepted form of it leaves apply true.
    expect(parseArgs([]).apply).toBe(false);
  });

  it("`--json=false` también se rechaza", () => {
    expect(() => parseArgs(["--json=false"])).toThrow(/NO LLEVA VALOR/);
  });

  it("rechaza una bandera repetida en vez de quedarse con la última", () => {
    expect(() =>
      parseArgs(["--apply", "--plan=/tmp/a.json", "--plan=/tmp/b.json"]),
    ).toThrow(/ARGUMENTO REPETIDO/);
    expect(() => parseArgs(["--apply", "--apply"])).toThrow(
      /ARGUMENTO REPETIDO/,
    );
  });

  it("rechaza modos incompatibles en vez de ignorar uno", () => {
    expect(() =>
      parseArgs([
        "--apply",
        "--plan=/tmp/a.json",
        "--reversal-out=/tmp/r.json",
        "--plan-out=/tmp/b.json",
      ]),
    ).toThrow(/MODOS INCOMPATIBLES/);
  });

  it("rechaza argumentos de aplicación en un dry-run", () => {
    // A dry run that accepts them looks like it applied something.
    expect(() => parseArgs(["--plan=/tmp/a.json"])).toThrow(
      /ARGUMENTO SIN EFECTO/,
    );
    expect(() => parseArgs(["--reversal-out=/tmp/r.json"])).toThrow(
      /ARGUMENTO SIN EFECTO/,
    );
    expect(() => parseArgs(["--expect-plan-id=x"])).toThrow(
      /ARGUMENTO SIN EFECTO/,
    );
  });

  it("los argumentos y modos válidos mantienen su comportamiento", () => {
    expect(parseArgs(["--plan-out=/tmp/p.json", "--json"])).toMatchObject({
      apply: false,
      planOut: "/tmp/p.json",
      json: true,
    });
    expect(
      parseArgs([
        "--apply",
        "--plan=/tmp/p.json",
        "--reversal-out=/tmp/r.json",
        "--expect-database=psico_dev",
        "--expect-posture=development",
        "--expect-plan-id=abc",
        "--expect-plan-hash=sha256:def",
        "--json",
      ]),
    ).toMatchObject({
      apply: true,
      planPath: "/tmp/p.json",
      reversalOut: "/tmp/r.json",
      expectDatabase: "psico_dev",
      expectPosture: "development",
      expectPlanId: "abc",
      expectPlanHash: "sha256:def",
      json: true,
    });
  });
});

describe("la puerta del destino", () => {
  const applyArgs = (db: string, posture: string) =>
    parseArgs([
      "--apply",
      "--plan=/tmp/p.json",
      "--reversal-out=/tmp/r.json",
      `--expect-database=${db}`,
      `--expect-posture=${posture}`,
    ]);

  it("sin DATABASE_URL no hay destino por defecto", () => {
    expect(() => resolveTarget(parseArgs([]), {}, "development")).toThrow(
      /CONEXIÓN AUSENTE/,
    );
  });

  it("una cadena de conexión ilegible se rechaza", () => {
    expect(() =>
      resolveTarget(
        parseArgs([]),
        { DATABASE_URL: "no-es-una-url" },
        "development",
      ),
    ).toThrow(/TARGET/);
  });

  it("un dry-run no necesita declarar el destino", () => {
    const t = resolveTarget(
      parseArgs([]),
      { DATABASE_URL: LOCAL },
      "development",
    );
    expect(t.database).toBe("psico_dev");
    expect(t.isLoopback).toBe(true);
  });

  it("aplicar sin declarar destino y postura se rechaza", () => {
    expect(() =>
      resolveTarget(
        parseArgs([
          "--apply",
          "--plan=/tmp/p.json",
          "--reversal-out=/tmp/r.json",
        ]),
        { DATABASE_URL: LOCAL },
        "development",
      ),
    ).toThrow(/DESTINO NO DECLARADO/);
  });

  it("una base declarada que no coincide se rechaza", () => {
    expect(() =>
      resolveTarget(
        applyArgs("otra_base", "development"),
        { DATABASE_URL: LOCAL },
        "development",
      ),
    ).toThrow(/DESTINO DISCORDANTE/);
  });

  it("una postura declarada que no coincide se rechaza", () => {
    expect(() =>
      resolveTarget(
        applyArgs("psico_dev", "staging"),
        { DATABASE_URL: LOCAL },
        "development",
      ),
    ).toThrow(/POSTURA DISCORDANTE/);
  });

  it("producción se rechaza incluso con el token", () => {
    expect(() =>
      resolveTarget(
        applyArgs("psico_dev", "production"),
        { DATABASE_URL: LOCAL, [STAGING_TOKEN]: "1" },
        "production",
      ),
    ).toThrow(/postura production/);
  });

  it("staging POR LOCALHOST sin permiso: rechazo", () => {
    // The defect: the token was required only for a non-loopback host, which
    // treated `localhost` as proof that nothing else could be behind it. A
    // tunnel, a proxy, or a staging box with a local database all present as
    // loopback.
    expect(() =>
      resolveTarget(
        applyArgs("psico_dev", "staging"),
        { DATABASE_URL: LOCAL },
        "staging",
      ),
    ).toThrow(new RegExp(STAGING_TOKEN));
  });

  it("staging por otro host sin permiso: rechazo", () => {
    expect(() =>
      resolveTarget(
        applyArgs("feelverse_staging", "staging"),
        { DATABASE_URL: HOSTED },
        "staging",
      ),
    ).toThrow(new RegExp(STAGING_TOKEN));
  });

  it("staging con permiso y destino correcto: permitido", () => {
    const porHost = resolveTarget(
      applyArgs("feelverse_staging", "staging"),
      { DATABASE_URL: HOSTED, [STAGING_TOKEN]: "1" },
      "staging",
    );
    expect(porHost.isLoopback).toBe(false);
    const porLocalhost = resolveTarget(
      applyArgs("psico_dev", "staging"),
      { DATABASE_URL: LOCAL, [STAGING_TOKEN]: "1" },
      "staging",
    );
    expect(porLocalhost.isLoopback).toBe(true);
  });

  it("una etiqueta development NO autoriza una base alojada", () => {
    // resolveEnvironment classifies the PROCESS; DATABASE_URL picks the
    // target. A local label must not reach a hosted database.
    expect(() =>
      resolveTarget(
        applyArgs("feelverse_staging", "development"),
        { DATABASE_URL: HOSTED },
        "development",
      ),
    ).toThrow(/no es loopback/);
    // Not even with the staging token, because the posture is still local.
    expect(() =>
      resolveTarget(
        applyArgs("feelverse_staging", "development"),
        { DATABASE_URL: HOSTED, [STAGING_TOKEN]: "1" },
        "development",
      ),
    ).toThrow(/no es loopback/);
  });

  it("local con destino declarado sí puede aplicar", () => {
    const t = resolveTarget(
      applyArgs("psico_dev", "development"),
      { DATABASE_URL: LOCAL },
      "development",
    );
    expect(t.database).toBe("psico_dev");
  });
});

describe("errores acotados", () => {
  it("un error ajeno no vuelca su mensaje", () => {
    // A driver error can carry the connection string, a statement's
    // parameters, or a row's values — including the credential being
    // withdrawn. Its identity is useful; its payload is not ours to print.
    const err = Object.assign(
      new Error(
        `no se pudo escribir title='${TITULO_A}' licenseNumber='${LICENCIA_A}' en postgresql://u:secreto@host/db`,
      ),
      { name: "PostgresError", code: "23505" },
    );
    const d = describeError(err);
    expect(d.kind).toBe("PostgresError");
    expect(d.code).toBe("23505");
    expect(d.message).not.toContain(TITULO_A);
    expect(d.message).not.toContain(LICENCIA_A);
    expect(d.message).not.toContain("secreto");
    expect(d.message).not.toContain("postgresql://");
    expect(d.exitCode).toBe(1);
  });

  it("nuestros propios errores sí pasan su mensaje, porque lo escribimos", () => {
    expect(
      describeError(new CliUsageError("DESTINO NO DECLARADO: x")),
    ).toMatchObject({ kind: "CliUsageError", exitCode: 4 });
    expect(describeError(new PlanFileError("PLAN ALTERADO: y"))).toMatchObject({
      kind: "PlanFileError",
      exitCode: 5,
    });
    expect(
      describeError(new RepairPreconditionError("autor x", "ya no existe")),
    ).toMatchObject({ kind: "RepairPreconditionError", exitCode: 3 });
    expect(
      describeError(new RepairConflictError("autor x", "cambió la fila")),
    ).toMatchObject({ kind: "RepairConflictError", exitCode: 3 });
  });

  it("un error sin nombre no inventa uno", () => {
    expect(describeError("algo").kind).toBe("Error");
    expect(describeError(null).kind).toBe("Error");
  });
});

describe("informe compartible", () => {
  it("no contiene los valores retirados", () => {
    const target = targetIdentityFromUrl(LOCAL, "development");
    const frozen = freezePlan(planAuthorshipRepair(snapshot()), target);
    const body = JSON.stringify(sanitizedReport(target, frozen));
    expect(body).not.toContain(TITULO_A);
    expect(body).not.toContain(LICENCIA_A);
    expect(body).toContain("titlePresent");
  });

  it("con --json, la salida estándar lleva sólo el informe", () => {
    // `main` needs a database, so this pins the property statically: the
    // narrative goes through the injected `say`, and the ONLY write to stdout
    // is the sanitized report. A banner added later with a plain console.log
    // would make `--json` unparseable for a caller piping it.
    const src = readFileSync(
      join(__dirname, "authorship-repair-cli.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const body = src.slice(
      src.indexOf("export async function runRepair"),
      src.length,
    );
    expect(body).toMatch(/runRepair/); // guard the guard

    const stdoutWrites = [
      ...body.matchAll(/console\.log\(|process\.stdout\.write\(/g),
    ];
    expect(stdoutWrites).toHaveLength(1);
    expect(
      body.slice(stdoutWrites[0]!.index, stdoutWrites[0]!.index + 80),
    ).toMatch(/JSON\.stringify\(run\.report/);
    expect(body).toMatch(/say\(/);
  });

  it("el respaldo se guarda y se verifica ANTES de la primera escritura", () => {
    // The crux of the finding: a reversal recorded after the transaction is
    // not a backup. The ORDER is pinned over the source — collect, persist
    // (which re-reads to verify), only then open the transaction — and the
    // outcome is recorded in a separate file, never onto the preimage.
    const src = readFileSync(
      join(__dirname, "authorship-repair-cli.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const body = src.slice(
      src.indexOf("export async function runRepair"),
      src.indexOf("async function main()"),
    );
    expect(body).toMatch(/collectReversal\(/); // guard the guard

    const at = (needle: string) => body.lastIndexOf(needle);
    expect(at("persistReversal(")).toBeGreaterThan(at("collectReversal("));
    expect(at("$transaction(")).toBeGreaterThan(at("persistReversal("));
    // Both outcomes are recorded, and neither reopens the preimage.
    expect(body).toMatch(/recordOutcome\([^)]*"aborted"/);
    expect(body).toMatch(/recordOutcome\([^)]*"applied"\)/);
    expect(body).not.toMatch(/settleReversal/);
  });
});

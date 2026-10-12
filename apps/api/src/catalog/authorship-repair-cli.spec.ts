import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CliUsageError,
  parseArgs,
  resolveTarget,
  sanitizedReport,
  STAGING_TOKEN,
} from "./authorship-repair-cli";
import {
  freezePlan,
  loadFrozenPlan,
  persistReversal,
  PlanFileError,
  settleReversal,
  targetIdentityFromUrl,
} from "./authorship-plan-file";
import {
  planAuthorshipRepair,
  type CatalogSnapshot,
} from "./authorship-repair";

/**
 * The CLI's gate and its files, without a database.
 *
 * Importing the CLI must connect to nothing and run nothing — `main` is behind
 * `require.main === module`. That is what makes this file possible: the parsing
 * and the target decision are exported pure functions, so every refusal can be
 * exercised without a hosted target anywhere near the test.
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

const tmp = () => mkdtempSync(join(tmpdir(), "authorship-cli-"));

describe("parseArgs", () => {
  it("dry-run es el modo por defecto", () => {
    expect(parseArgs([]).apply).toBe(false);
  });

  it("rechaza un argumento desconocido en vez de ignorarlo", () => {
    // Una bandera mal escrita no debe convertirse en silencio en otro modo.
    expect(() => parseArgs(["--aply"])).toThrow(CliUsageError);
    expect(() => parseArgs(["--force"])).toThrow(/ARGUMENTO DESCONOCIDO/);
  });

  it("rechaza una bandera con valor vacío", () => {
    expect(() => parseArgs(["--plan="])).toThrow(/necesita un valor/);
  });

  it("lee las rutas y las declaraciones de destino", () => {
    const a = parseArgs([
      "--apply",
      "--plan=/tmp/p.json",
      "--reversal-out=/tmp/r.json",
      "--expect-database=psico_dev",
      "--expect-posture=development",
      "--json",
    ]);
    expect(a).toMatchObject({
      apply: true,
      planPath: "/tmp/p.json",
      reversalOut: "/tmp/r.json",
      expectDatabase: "psico_dev",
      expectPosture: "development",
      json: true,
    });
  });
});

describe("resolveTarget", () => {
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
        parseArgs(["--apply"]),
        { DATABASE_URL: LOCAL },
        "development",
      ),
    ).toThrow(/DESTINO NO DECLARADO/);
  });

  it("una base declarada que no coincide se rechaza", () => {
    expect(() =>
      resolveTarget(
        parseArgs([
          "--apply",
          "--expect-database=otra_base",
          "--expect-posture=development",
        ]),
        { DATABASE_URL: LOCAL },
        "development",
      ),
    ).toThrow(/DESTINO DISCORDANTE/);
  });

  it("una postura declarada que no coincide se rechaza", () => {
    expect(() =>
      resolveTarget(
        parseArgs([
          "--apply",
          "--expect-database=psico_dev",
          "--expect-posture=staging",
        ]),
        { DATABASE_URL: LOCAL },
        "development",
      ),
    ).toThrow(/POSTURA DISCORDANTE/);
  });

  it("producción se rechaza sin token posible", () => {
    expect(() =>
      resolveTarget(
        parseArgs([
          "--apply",
          "--expect-database=psico_dev",
          "--expect-posture=production",
        ]),
        { DATABASE_URL: LOCAL, [STAGING_TOKEN]: "1" },
        "production",
      ),
    ).toThrow(/postura production/);
  });

  it("una etiqueta development NO autoriza una base alojada", () => {
    // El hallazgo central del punto 5: resolveEnvironment clasifica el
    // proceso, DATABASE_URL elige el destino, y una etiqueta local no debe
    // bastar para escribir fuera de loopback.
    expect(() =>
      resolveTarget(
        parseArgs([
          "--apply",
          "--expect-database=feelverse_staging",
          "--expect-posture=development",
        ]),
        { DATABASE_URL: HOSTED },
        "development",
      ),
    ).toThrow(/no es loopback/);
  });

  it("staging alojado exige el token de ESTA invocación", () => {
    const args = parseArgs([
      "--apply",
      "--expect-database=feelverse_staging",
      "--expect-posture=staging",
    ]);
    expect(() =>
      resolveTarget(args, { DATABASE_URL: HOSTED }, "staging"),
    ).toThrow(new RegExp(STAGING_TOKEN));
    // Con el token, pasa — y el mensaje dice por qué no debe quedar fijado.
    const ok = resolveTarget(
      args,
      { DATABASE_URL: HOSTED, [STAGING_TOKEN]: "1" },
      "staging",
    );
    expect(ok.isLoopback).toBe(false);
  });

  it("local con destino declarado sí puede aplicar", () => {
    const t = resolveTarget(
      parseArgs([
        "--apply",
        "--expect-database=psico_dev",
        "--expect-posture=development",
      ]),
      { DATABASE_URL: LOCAL },
      "development",
    );
    expect(t.database).toBe("psico_dev");
  });
});

describe("plan congelado en disco", () => {
  const target = targetIdentityFromUrl(LOCAL, "development");

  it("un plan ausente se rechaza con instrucciones", () => {
    expect(() => loadFrozenPlan(join(tmp(), "no-existe.json"), target)).toThrow(
      /PLAN AUSENTE/,
    );
  });

  it("un plan editado a mano no se aplica", () => {
    const dir = tmp();
    const path = join(dir, "plan.json");
    const frozen = freezePlan(planAuthorshipRepair(snapshot()), target);
    const tampered = { ...frozen, ops: frozen.ops.slice(0, 1) };
    writeFileSync(path, JSON.stringify(tampered));
    expect(() => loadFrozenPlan(path, target)).toThrow(/PLAN ALTERADO/);
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
    expect(() => loadFrozenPlan(path, target)).toThrow(/DESTINO DISCORDANTE/);
  });

  it("un plan con otra postura no se aplica", () => {
    const dir = tmp();
    const path = join(dir, "plan.json");
    const otra = targetIdentityFromUrl(LOCAL, "staging");
    writeFileSync(
      path,
      JSON.stringify(freezePlan(planAuthorshipRepair(snapshot()), otra)),
    );
    expect(() => loadFrozenPlan(path, target)).toThrow(/POSTURA DISCORDANTE/);
  });

  it("una operación fuera de alcance se rechaza", () => {
    // El archivo no es una lista arbitraria de escrituras.
    const dir = tmp();
    const path = join(dir, "plan.json");
    const frozen = freezePlan(planAuthorshipRepair(snapshot()), target);
    const evil = {
      ...frozen,
      ops: [...frozen.ops, { kind: "delete-everything" }],
    };
    // Rehash para que el único fallo sea el alcance, no la integridad.
    writeFileSync(path, JSON.stringify(evil));
    expect(() => loadFrozenPlan(path, target)).toThrow(
      /OPERACIÓN FUERA DE ALCANCE|PLAN ALTERADO/,
    );
  });

  it("un plan congelado con bloqueos no se aplica", () => {
    const dir = tmp();
    const path = join(dir, "plan.json");
    const frozen = freezePlan(
      {
        ops: [],
        satisfied: [],
        blockers: [{ subject: "x", reason: "ambigüedad" }],
        untouched: [],
      },
      target,
    );
    writeFileSync(path, JSON.stringify(frozen));
    expect(() => loadFrozenPlan(path, target)).toThrow(/PLAN BLOQUEADO/);
  });

  it("un plan íntegro y del mismo destino se acepta", () => {
    const dir = tmp();
    const path = join(dir, "plan.json");
    const frozen = freezePlan(planAuthorshipRepair(snapshot()), target);
    writeFileSync(path, JSON.stringify(frozen));
    expect(loadFrozenPlan(path, target).planId).toBe(frozen.planId);
  });
});

describe("respaldo de reversión", () => {
  const target = targetIdentityFromUrl(LOCAL, "development");
  const file = (state: "intended" | "applied" | "aborted" = "intended") => ({
    format: "feelverse.catalog-authorship-reversal/v1",
    planId: "p1",
    planHash: "sha256:abc",
    state,
    target,
    preparedAt: new Date().toISOString(),
    entries: [
      {
        subject: "bookAuthor id=a-demo",
        restore: {
          title: TITULO_A,
          licenseNumber: LICENCIA_A,
          isVerified: true,
        },
      },
    ],
    note: "privado",
  });

  it("persiste con permisos restrictivos y se puede volver a leer", () => {
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    const back = JSON.parse(readFileSync(path, "utf8"));
    expect(back.entries).toHaveLength(1);
    // Los literales SÍ viven aquí: es el único sitio que permite revertir.
    expect(JSON.stringify(back)).toContain(TITULO_A);
  });

  it("no sobrescribe un respaldo anterior", () => {
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    // Repetir el comando no debe destruir la única copia del estado previo.
    expect(() => persistReversal(path, file())).toThrow(/RESPALDO EXISTENTE/);
  });

  it("distingue previsto, aplicado y abortado", () => {
    const path = join(tmp(), "rev.json");
    persistReversal(path, file());
    expect(JSON.parse(readFileSync(path, "utf8")).state).toBe("intended");
    // Un archivo preparado NO acredita que se aplicara nada.
    settleReversal(path, "aborted");
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.state).toBe("aborted");
    expect(after.settledAt).toBeTruthy();
    expect(after.entries).toHaveLength(1);
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

describe("informe compartible", () => {
  it("no contiene los valores retirados", () => {
    const target = targetIdentityFromUrl(LOCAL, "development");
    const frozen = freezePlan(planAuthorshipRepair(snapshot()), target);
    const body = JSON.stringify(sanitizedReport(target, frozen));
    expect(body).not.toContain(TITULO_A);
    expect(body).not.toContain(LICENCIA_A);
    expect(body).toContain("titlePresent");
  });
});

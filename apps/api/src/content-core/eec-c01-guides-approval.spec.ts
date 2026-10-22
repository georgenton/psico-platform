import { generateKeyPairSync, sign } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approvalPayload,
  type ApprovalKeyring,
} from "../experience/experience-editorial-approval";
import { definitionDigest } from "../experience/experience-editorial-seal";
import {
  checkApprovals,
  resealApproved,
  toDefinition,
} from "./eec-c01-guides-apply";
import { CLI_ERRORS, loadManifests } from "./eec-c01-guides-cli";

/**
 * B4 — la transición de aprobación, de principio a fin, con datos sintéticos.
 *
 * El encargo pide que la pieza se pueda probar sin otorgar aprobaciones
 * reales. La clave de este archivo se genera al vuelo y muere con el proceso:
 * autoriza únicamente a los manifiestos de mentira que aparecen aquí dentro.
 *
 * **MG03 no se aprueba por sustitución.** Su manifiesto real, en
 * `artifacts/`, sigue declarando `publishAllowed: false`, y hay una prueba al
 * final que lo comprueba leyéndolo del disco.
 */

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const KEY_ID = "autora-sintetica";
const LLAVERO: ApprovalKeyring = new Map([
  [
    KEY_ID,
    publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  ],
]);

const DIR = join(
  process.cwd(),
  "../..",
  "artifacts/eec/C01/v1.0/feelverse/guides",
);
const REALES = loadManifests(DIR);
/** MG03, el que este bloque usa de referencia. Copiado, nunca mutado en disco. */
const MG03 = REALES.find((m) => m.manifestId === "EEC-C01-MG03")!;

const copia = () => JSON.parse(JSON.stringify(MG03)) as typeof MG03;

/** Un acta auténtica para un manifiesto, firmada con la clave sintética. */
function actaPara(m: typeof MG03, sobre = toDefinition(m)) {
  const sinFirma = {
    schemaVersion: 1 as const,
    manifestId: m.manifestId,
    experienceKey: m.experienceKey,
    experienceVersion: m.experienceVersion,
    guideKey: m.guideKey,
    guideVersion: m.guideVersion,
    canonicalVersion: m.canonicalVersion,
    canonicalSha256: m.canonicalSha256,
    manifestSha256: m.manifestSha256,
    definitionSha256: definitionDigest(sobre),
    approvedBy: "autora@ejemplo.test",
    approvedAt: "2026-10-21T12:00:00.000Z",
    keyId: KEY_ID,
  };
  return {
    ...sinFirma,
    signature: sign(
      null,
      Buffer.from(approvalPayload(sinFirma), "utf8"),
      privateKey,
    ).toString("base64"),
  };
}

const codigos = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("declaración y acta tienen que decir lo mismo", () => {
  it("declararse publicable sin acta no aprueba nada", () => {
    const m = copia();
    m.publishAllowed = true;
    const issues = checkApprovals({
      manifests: [m],
      approvals: new Map(),
      keyring: LLAVERO,
    });
    expect(codigos(issues)).toEqual([CLI_ERRORS.publishNotAllowed]);
  });

  it("un acta suelta, sin declararlo, también se reporta", () => {
    // No es inofensivo: una aprobación que nadie reconoce se parece demasiado
    // a un descuido —o a un intento— como para dejarla pasar en silencio.
    const m = copia();
    const issues = checkApprovals({
      manifests: [m],
      approvals: new Map([[m.manifestId, actaPara(m)]]),
      keyring: LLAVERO,
    });
    expect(codigos(issues)).toEqual([CLI_ERRORS.approvalUndeclared]);
  });

  it("una instalación sin claves no puede aprobar nada", () => {
    // El estado de hoy. El acta es auténtica; el llavero está vacío.
    const m = copia();
    m.publishAllowed = true;
    const issues = checkApprovals({
      manifests: [m],
      approvals: new Map([[m.manifestId, actaPara(m)]]),
      keyring: new Map(),
    });
    expect(issues[0]?.code).toBe(CLI_ERRORS.approvalInvalid);
    expect(issues[0]?.detail).toContain("APPROVAL_UNKNOWN_KEY");
  });

  it("un acta que no cubre ESTE contenido no sirve", () => {
    // Firmada de verdad, sobre una definición distinta. Es el caso que
    // impide reutilizar una aprobación después de tocar el texto.
    const m = copia();
    m.publishAllowed = true;
    const otraDefinicion = {
      ...toDefinition(m),
      title: "Un título que nadie aprobó",
    };
    const issues = checkApprovals({
      manifests: [m],
      approvals: new Map([[m.manifestId, actaPara(m, otraDefinicion)]]),
      keyring: LLAVERO,
    });
    expect(issues[0]?.detail).toContain("APPROVAL_CONTENT_MISMATCH");
  });

  it("control positivo — declarado y firmado sobre su contenido, pasa", () => {
    const m = copia();
    m.publishAllowed = true;
    expect(
      checkApprovals({
        manifests: [m],
        approvals: new Map([[m.manifestId, actaPara(m)]]),
        keyring: LLAVERO,
      }),
    ).toEqual([]);
  });

  it("y el estado de hoy —sin declarar y sin acta— no genera ruido", () => {
    expect(
      checkApprovals({
        manifests: REALES,
        approvals: new Map(),
        keyring: LLAVERO,
      }),
    ).toEqual([]);
  });
});

describe("reseal — explícito, idempotente y sólo con aprobación", () => {
  let fila: {
    id: string;
    status: string;
    definitionJson: unknown;
    editorialOrigin: unknown;
  };
  let prisma: {
    chapterExperienceVersion: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    fila = {
      id: "row_mg03",
      status: "DRAFT",
      definitionJson: toDefinition(MG03),
      editorialOrigin: { kind: "legacy_unsealed", at: "2026-10-21T00:00:00Z" },
    };
    prisma = {
      chapterExperienceVersion: {
        findUnique: vi.fn(async () => fila),
        update: vi.fn(
          async ({ data }: { data: { editorialOrigin: unknown } }) => {
            fila.editorialOrigin = data.editorialOrigin;
            return fila;
          },
        ),
      },
    };
  });

  const correr = (m: typeof MG03, acta: unknown, apply = true) =>
    resealApproved(
      prisma as never,
      [m],
      acta === null ? new Map() : new Map([[m.manifestId, acta]]),
      LLAVERO,
      apply,
    );

  it("sin acta no sella: salta y lo dice", async () => {
    const r = await correr(copia(), null);
    expect(r.rows[0]).toMatchObject({ action: "SKIPPED" });
    expect(prisma.chapterExperienceVersion.update).not.toHaveBeenCalled();
    // Y la fila sigue siendo la histórica, que es la que no publica.
    expect(fila.editorialOrigin).toMatchObject({ kind: "legacy_unsealed" });
  });

  it("con acta válida sella, y deja la fila en DRAFT", async () => {
    const m = copia();
    m.publishAllowed = true;
    const r = await correr(m, actaPara(m));

    expect(r.outcome).toBe("APPLIED");
    expect(r.rows[0]).toMatchObject({ action: "RESEALED" });
    expect(fila.editorialOrigin).toMatchObject({
      kind: "manifest",
      publishAllowed: true,
      approval: { keyId: KEY_ID, approvedBy: "autora@ejemplo.test" },
    });
    // Sellar no publica. Publicar es otro acto, y vuelve a verificar.
    expect(fila.status).toBe("DRAFT");
  });

  it("sellar dos veces escribe lo mismo", async () => {
    const m = copia();
    m.publishAllowed = true;
    const acta = actaPara(m);
    await correr(m, acta);
    const primero = JSON.stringify({
      ...(fila.editorialOrigin as Record<string, unknown>),
      sealedAt: "fijo",
    });
    await correr(m, acta);
    const segundo = JSON.stringify({
      ...(fila.editorialOrigin as Record<string, unknown>),
      sealedAt: "fijo",
    });
    expect(segundo).toBe(primero);
  });

  it("si la fila guarda otro contenido, se niega", async () => {
    // El acta cubre lo que el manifiesto dice hoy; la fila guarda otra cosa.
    // Sellar aquí sería aprobar un texto que nadie aprobó.
    const m = copia();
    m.publishAllowed = true;
    fila.definitionJson = {
      ...toDefinition(m),
      title: "Editado después de aprobar",
    };

    const r = await correr(m, actaPara(m));
    expect(r.ok).toBe(false);
    expect(r.rows[0]).toMatchObject({ action: "REFUSED" });
    expect(r.rows[0]?.detail).toContain("APPROVAL_CONTENT_MISMATCH");
    expect(prisma.chapterExperienceVersion.update).not.toHaveBeenCalled();
  });

  it("una fila publicada o archivada no se vuelve a sellar", async () => {
    const m = copia();
    m.publishAllowed = true;
    for (const estado of ["PUBLISHED", "ARCHIVED"]) {
      fila.status = estado;
      const r = await correr(m, actaPara(m));
      expect(r.rows[0]).toMatchObject({ action: "REFUSED" });
    }
    expect(prisma.chapterExperienceVersion.update).not.toHaveBeenCalled();
  });

  it("en dry-run no escribe", async () => {
    const m = copia();
    m.publishAllowed = true;
    const r = await correr(m, actaPara(m), false);
    expect(r.applied).toBe(false);
    expect(r.rows[0]).toMatchObject({ action: "NOOP", detail: "dry-run" });
    expect(prisma.chapterExperienceVersion.update).not.toHaveBeenCalled();
  });
});

describe("MG03 sigue sin aprobar, en el disco", () => {
  it("su manifiesto real declara publishAllowed: false y status DRAFT", () => {
    // La garantía que acompaña a todo este bloque: lo de arriba son claves y
    // manifiestos de mentira. El artefacto de verdad no se tocó.
    expect(MG03.publishAllowed).toBe(false);
    expect(MG03.status).toBe("DRAFT");
    expect(MG03.scenes).toHaveLength(7);
  });

  it("y no hay ningún acta en el paquete", () => {
    // Si algún día aparece una, esta prueba falla — y eso es exactamente lo
    // que debe pasar, porque sería una decisión editorial que alguien tomó.
    expect(
      readdirSync(DIR).filter((n) => n.endsWith(".approval.json")),
    ).toEqual([]);
  });
});

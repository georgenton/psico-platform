import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  approvalKeyringFromEnv,
  approvalPayload,
  parseEditorialApproval,
  verifyApproval,
  type EditorialApproval,
} from "./experience-editorial-approval";

/**
 * B4 — qué convierte una decisión autoral en algo comprobable.
 *
 * El encargo pide una decisión **verificable** y pide que tener acceso no
 * convierta a nadie en aprobador. Las claves de este archivo se generan al
 * vuelo y mueren con el proceso: no aprueban nada fuera de él, y eso es
 * precisamente lo que las hace buenas para probar el mecanismo.
 *
 * Lo que más importa aquí son las negativas. Una firma que valide cualquier
 * cosa pasaría el control positivo y no protegería nada.
 */

function nuevaClave(keyId: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    keyId,
    privateKey,
    spki: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

const CLAVE = nuevaClave("autora-2026");
const OTRA = nuevaClave("alguien-mas");

const BASE = {
  schemaVersion: 1 as const,
  manifestId: "EEC-C01-MG03",
  experienceKey: "eec-c1-alarma-antes-del-relato",
  experienceVersion: 1,
  guideKey: "eec-c1-alarma-antes-del-relato",
  guideVersion: 1,
  canonicalVersion: "EEC_C01_v1.0_TEXT_LOCKED_2026-08-20",
  canonicalSha256: "e1".repeat(32),
  manifestSha256: "f0".repeat(32),
  definitionSha256: "a7".repeat(32),
  approvedBy: "marina@ejemplo.test",
  approvedAt: "2026-10-21T10:00:00.000Z",
  keyId: CLAVE.keyId,
};

/** Firma un acta con la clave que se le diga. */
function firmar(
  acta: Omit<EditorialApproval, "signature">,
  clave = CLAVE,
): EditorialApproval {
  const signature = sign(
    null,
    Buffer.from(approvalPayload(acta), "utf8"),
    clave.privateKey,
  ).toString("base64");
  return { ...acta, signature };
}

const LLAVERO = new Map([[CLAVE.keyId, CLAVE.spki]]);
const ESPERADO = {
  manifestId: BASE.manifestId,
  experienceKey: BASE.experienceKey,
  experienceVersion: BASE.experienceVersion,
  guideKey: BASE.guideKey,
  guideVersion: BASE.guideVersion,
  canonicalVersion: BASE.canonicalVersion,
  canonicalSha256: BASE.canonicalSha256,
  manifestSha256: BASE.manifestSha256,
  definitionSha256: BASE.definitionSha256,
};

describe("una firma auténtica sobre lo que se espera", () => {
  it("verifica", () => {
    const v = verifyApproval({
      approval: firmar(BASE),
      keyring: LLAVERO,
      expect: ESPERADO,
    });
    expect(v.valid).toBe(true);
  });
});

describe("lo que NO autoriza", () => {
  it("una clave que esta instalación no reconoce", () => {
    // Firmada de verdad, pero por alguien que no es quien aprueba aquí.
    const v = verifyApproval({
      approval: firmar({ ...BASE, keyId: OTRA.keyId }, OTRA),
      keyring: LLAVERO,
      expect: ESPERADO,
    });
    expect(v).toMatchObject({ code: "APPROVAL_UNKNOWN_KEY" });
  });

  it("una firma hecha con otra clave bajo un keyId conocido", () => {
    // El caso que importa de verdad: alguien copia el `keyId` de la autora y
    // firma con la suya. El llavero decide, no el acta.
    const v = verifyApproval({
      approval: firmar({ ...BASE }, OTRA),
      keyring: LLAVERO,
      expect: ESPERADO,
    });
    expect(v).toMatchObject({ code: "APPROVAL_BAD_SIGNATURE" });
  });

  it("un acta a la que se le cambió un campo después de firmar", () => {
    const autentica = firmar(BASE);
    const manipulada = { ...autentica, approvedBy: "otra-persona@test" };
    const v = verifyApproval({
      approval: manipulada,
      keyring: LLAVERO,
      expect: ESPERADO,
    });
    expect(v).toMatchObject({ code: "APPROVAL_BAD_SIGNATURE" });
  });

  it("un acta auténtica… de otra versión", () => {
    // Subir la versión es cambiar la identidad. La aprobación de la anterior
    // no viaja con ella.
    const v = verifyApproval({
      approval: firmar({ ...BASE, experienceVersion: 2 }),
      keyring: LLAVERO,
      expect: ESPERADO,
    });
    expect(v).toMatchObject({ code: "APPROVAL_IDENTITY_MISMATCH" });
  });

  it("un acta auténtica… de otra experiencia", () => {
    const v = verifyApproval({
      approval: firmar({ ...BASE, experienceKey: "eec-c1-rostro-como-pista" }),
      keyring: LLAVERO,
      expect: ESPERADO,
    });
    expect(v).toMatchObject({ code: "APPROVAL_IDENTITY_MISMATCH" });
  });

  it("un acta auténtica… de otra revisión del manuscrito", () => {
    const v = verifyApproval({
      approval: firmar({ ...BASE, canonicalSha256: "bb".repeat(32) }),
      keyring: LLAVERO,
      expect: ESPERADO,
    });
    expect(v).toMatchObject({ code: "APPROVAL_REVISION_MISMATCH" });
  });

  it("un acta auténtica… del contenido de antes de editarlo", () => {
    // El requisito central: una aprobación no sobrevive al texto que aprobó.
    const v = verifyApproval({
      approval: firmar(BASE),
      keyring: LLAVERO,
      expect: { ...ESPERADO, definitionSha256: "cc".repeat(32) },
    });
    expect(v).toMatchObject({ code: "APPROVAL_CONTENT_MISMATCH" });
  });

  it("cualquier cosa que no tenga forma de acta", () => {
    for (const basura of [
      null,
      undefined,
      "aprobado",
      42,
      [],
      {},
      { ...BASE },
      { ...firmar(BASE), schemaVersion: 2 },
      { ...firmar(BASE), experienceVersion: 0 },
      { ...firmar(BASE), keyId: "" },
    ]) {
      expect(
        verifyApproval({
          approval: basura,
          keyring: LLAVERO,
          expect: ESPERADO,
        }),
      ).toMatchObject({ code: "APPROVAL_MALFORMED" });
    }
  });

  it("un llavero vacío no aprueba nada", () => {
    // El estado de hoy, y el seguro: sin claves configuradas, esta
    // instalación no puede aprobar ninguna experiencia.
    const v = verifyApproval({
      approval: firmar(BASE),
      keyring: new Map(),
      expect: ESPERADO,
    });
    expect(v).toMatchObject({ code: "APPROVAL_UNKNOWN_KEY" });
  });
});

describe("el llavero se lee del entorno, no del repositorio", () => {
  it("vacío por defecto: una instalación sin claves no aprueba", () => {
    expect(approvalKeyringFromEnv({}).size).toBe(0);
    expect(approvalKeyringFromEnv({ EDITORIAL_APPROVAL_KEYS: "  " }).size).toBe(
      0,
    );
  });

  it("admite varias claves, para poder rotar sin invalidar lo anterior", () => {
    const llavero = approvalKeyringFromEnv({
      EDITORIAL_APPROVAL_KEYS: `${CLAVE.keyId}:${CLAVE.spki},${OTRA.keyId}:${OTRA.spki}`,
    });
    expect([...llavero.keys()].sort()).toEqual(
      [CLAVE.keyId, OTRA.keyId].sort(),
    );
  });

  it("y una entrada rota no se lleva por delante a las demás", () => {
    const llavero = approvalKeyringFromEnv({
      EDITORIAL_APPROVAL_KEYS: `sin-dos-puntos,${CLAVE.keyId}:${CLAVE.spki},:sin-id`,
    });
    expect([...llavero.keys()]).toEqual([CLAVE.keyId]);
  });

  it("una clave del entorno sirve de verdad para verificar", () => {
    // Que el formato del entorno y el que espera la verificación son el
    // mismo, probado en vez de supuesto.
    const llavero = approvalKeyringFromEnv({
      EDITORIAL_APPROVAL_KEYS: `${CLAVE.keyId}:${CLAVE.spki}`,
    });
    expect(
      verifyApproval({
        approval: firmar(BASE),
        keyring: llavero,
        expect: ESPERADO,
      }).valid,
    ).toBe(true);
  });
});

describe("el acta se lee entera o no se lee", () => {
  it("no acepta una forma a la que le falte un campo", () => {
    const completa = firmar(BASE) as unknown as Record<string, unknown>;
    for (const campo of [
      "manifestId",
      "canonicalSha256",
      "definitionSha256",
      "approvedBy",
      "keyId",
      "signature",
    ]) {
      const rota = { ...completa };
      delete rota[campo];
      expect(parseEditorialApproval(rota)).toBeNull();
    }
    expect(parseEditorialApproval(completa)).not.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { ChapterExperienceDefinition } from "@psico/types";

import {
  definitionDigest,
  evaluatePublicationGate as evaluarCrudo,
  parseEditorialSeal,
  sealForManifest,
  unsealed,
  type PublicationVerdict,
  type SealableManifest,
} from "./experience-editorial-seal";

/**
 * B4 — este archivo razona sobre el SELLO, no sobre la criptografía.
 *
 * La verificación de la firma tiene sus propias pruebas en
 * `experience-editorial-approval.spec.ts`, con claves de verdad. Aquí se da
 * por verificada para poder preguntar lo que a este módulo le toca: qué
 * autoriza y qué no. Los dos casos en que la verificación falla —ausente y
 * negativa— se comprueban aparte, al final.
 */
function evaluatePublicationGate(input: {
  seal: Parameters<typeof evaluarCrudo>[0]["seal"];
  definition: Parameters<typeof evaluarCrudo>[0]["definition"];
}): PublicationVerdict {
  return evaluarCrudo({ ...input, verifyApproval: () => true });
}

/** Un acta cualquiera: lo que este archivo necesita es que exista. */
const ACTA = {
  keyId: "clave-de-prueba",
  approvedBy: "prueba@feelverse.test",
  approvedAt: "2026-10-21T00:00:00.000Z",
  signature: "firma-que-otro-modulo-verifica",
  canonicalVersion: "TEST_v1",
  canonicalSha256: "ab".repeat(32),
  manifestSha256: "cd".repeat(32),
};

/**
 * B3 · Prioridad A — las pruebas negativas del control de publicación.
 *
 * El ADR 0027 midió que no existía: `publishAllowed: false` lo leía sólo la
 * herramienta que crea borradores y después nadie volvía a mirarlo. Lo que
 * sigue fija cada negativa por separado, porque un gate que negara todo
 * pasaría la mitad de este archivo y rompería el producto — por eso cada
 * afirmación lleva su control positivo al lado.
 */

const DEFINICION: ChapterExperienceDefinition = {
  experienceKey: "eec-c1-alarma-antes-del-relato",
  experienceVersion: 1,
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  title: "Una alarma antes de la historia",
  summary: "Una alarma no cuenta toda la historia.",
  status: "DRAFT",
  guidePin: { guideKey: "eec-c1-alarma-antes-del-relato", guideVersion: 1 },
  scenes: [],
} as unknown as ChapterExperienceDefinition;

const MANIFIESTO: SealableManifest = {
  manifestId: "EEC-C01-MG03",
  canonicalVersion: "EEC_C01_v1.0_TEXT_LOCKED_2026-08-20",
  canonicalSha256: "e10f42ce".padEnd(64, "0"),
  manifestSha256: "aa".repeat(32),
  publishAllowed: false,
  approvalReferences: ["acta-1", "acta-2"],
  experienceKey: DEFINICION.experienceKey,
  experienceVersion: DEFINICION.experienceVersion,
  guideKey: DEFINICION.guidePin.guideKey,
  guideVersion: DEFINICION.guidePin.guideVersion,
};

/** El mismo manifiesto, con la decisión editorial ya tomada. */
const AUTORIZADO: SealableManifest = { ...MANIFIESTO, publishAllowed: true };

describe("el sello cubre identidad, revisión y contenido", () => {
  it("guarda las tres cosas, y el resumen es del contenido aprobado", () => {
    const sello = sealForManifest(MANIFIESTO, DEFINICION);

    expect(sello.manifestId).toBe("EEC-C01-MG03");
    expect(sello.canonicalVersion).toBe("EEC_C01_v1.0_TEXT_LOCKED_2026-08-20");
    expect(sello.experienceKey).toBe(DEFINICION.experienceKey);
    expect(sello.guideKey).toBe(DEFINICION.guidePin.guideKey);
    expect(sello.definitionSha256).toBe(definitionDigest(DEFINICION));
    // El número de aprobaciones, no su contenido: el sello acredita que las
    // hubo, y las actas viven en el expediente.
    expect(sello.approvalCount).toBe(2);
  });

  it("el resumen no depende del orden de las claves", () => {
    // Guardar la misma definición con los campos en otro orden no es una
    // edición. Si lo fuera, cualquier ida y vuelta por JSON dejaría la
    // aprobación obsoleta sin que nadie hubiera tocado el texto.
    const alReves = Object.fromEntries(
      Object.entries(DEFINICION).reverse(),
    ) as unknown as ChapterExperienceDefinition;
    expect(definitionDigest(alReves)).toBe(definitionDigest(DEFINICION));
  });

  it("el resumen ignora el estado, porque publicar lo cambia", () => {
    // La definición viaja como DRAFT y se guarda como PUBLISHED en el mismo
    // acto. Incluir `status` haría que toda aprobación se invalidara justo al
    // usarse.
    const publicada = {
      ...DEFINICION,
      status: "PUBLISHED",
    } as ChapterExperienceDefinition;
    expect(definitionDigest(publicada)).toBe(definitionDigest(DEFINICION));
  });
});

describe("qué se niega, y por qué", () => {
  it("sin procedencia legible, no publica", () => {
    // El caso que el ADR 0027 proponía dejar pasar «para no interrumpir». Es
    // exactamente la puerta que esto cierra: basta con escribir una fila por
    // un camino que no se pronuncie.
    const v = evaluatePublicationGate({ seal: null, definition: DEFINICION });
    expect(v.approved).toBe(false);
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_UNREADABLE" });
  });

  it("una fila histórica se niega, y se la nombra como histórica", () => {
    // Negarla y llamarla irregular serían dos cosas distintas. Esta existía
    // antes del control: lo que necesita es que la herramienta la vuelva a
    // sellar, no una investigación.
    const v = evaluatePublicationGate({
      seal: { kind: "legacy_unsealed", at: "2026-10-21T00:00:00.000Z" },
      definition: DEFINICION,
    });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_ABSENT_LEGACY" });
  });

  it("una creada sin manifiesto se niega, y se distingue de la histórica", () => {
    const v = evaluatePublicationGate({
      seal: unsealed("created_without_manifest"),
      definition: DEFINICION,
    });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_ABSENT" });
  });

  it("clonar hacia adelante no hereda la aprobación de la versión anterior", () => {
    const v = evaluatePublicationGate({
      seal: unsealed("cloned_forward"),
      definition: DEFINICION,
    });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_ABSENT" });
    if (!v.approved) expect(v.message).toMatch(/necesita la suya/i);
  });

  it("MG03 se niega porque su manifiesto lo dice, no porque falte nada", () => {
    const v = evaluatePublicationGate({
      seal: sealForManifest(MANIFIESTO, DEFINICION),
      definition: DEFINICION,
    });
    expect(v).toMatchObject({ code: "EXPERIENCE_NOT_APPROVED" });
    // El mensaje nombra el manifiesto: la decisión se toma ahí.
    if (!v.approved) expect(v.message).toContain("EEC-C01-MG03");
  });

  it("editar el borrador después deja la aprobación obsoleta", () => {
    // El requisito 7 del encargo, en una línea: una aprobación no puede
    // sobrevivir al texto que aprobó.
    const sello = sealForManifest(AUTORIZADO, DEFINICION, undefined, ACTA);
    const editada = {
      ...DEFINICION,
      title: "Otro título que nadie aprobó",
    } as ChapterExperienceDefinition;

    const v = evaluatePublicationGate({ seal: sello, definition: editada });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_STALE" });
  });

  it("un sello de otra experiencia no autoriza esta", () => {
    const ajeno = sealForManifest(
      { ...AUTORIZADO, experienceKey: "eec-c1-rostro-como-pista" },
      DEFINICION,
      undefined,
      ACTA,
    );
    const v = evaluatePublicationGate({ seal: ajeno, definition: DEFINICION });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_IDENTITY_MISMATCH" });
  });

  it("un sello de otra guía tampoco", () => {
    const otraGuia = sealForManifest(
      { ...AUTORIZADO, guideVersion: 2 },
      DEFINICION,
      undefined,
      ACTA,
    );
    const v = evaluatePublicationGate({
      seal: otraGuia,
      definition: DEFINICION,
    });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_IDENTITY_MISMATCH" });
  });
});

describe("control positivo — el gate no es un «no» universal", () => {
  it("aprueba cuando la identidad, la revisión y el contenido coinciden", () => {
    const v = evaluatePublicationGate({
      seal: sealForManifest(AUTORIZADO, DEFINICION, undefined, ACTA),
      definition: DEFINICION,
    });
    expect(v.approved).toBe(true);
  });

  it("y vuelve a aprobar si el borrador se devuelve a lo aprobado", () => {
    // Obsoleto no es terminal: el sello conserva el resumen, así que deshacer
    // la edición restituye la aprobación sin que nadie tenga que re-sellar.
    const sello = sealForManifest(AUTORIZADO, DEFINICION, undefined, ACTA);
    const editada = {
      ...DEFINICION,
      title: "temporal",
    } as ChapterExperienceDefinition;
    expect(
      evaluatePublicationGate({ seal: sello, definition: editada }).approved,
    ).toBe(false);
    expect(
      evaluatePublicationGate({ seal: sello, definition: DEFINICION }).approved,
    ).toBe(true);
  });
});

describe("leer la columna falla cerrado", () => {
  it("cualquier cosa que no sea un sello conocido es null", () => {
    for (const basura of [
      null,
      undefined,
      "manifest",
      42,
      [],
      {},
      { kind: "manifest" },
      { kind: "otra-cosa" },
      { kind: "unsealed", reason: "porque-sí", at: "2026-01-01T00:00:00Z" },
      { kind: "legacy_unsealed" },
    ]) {
      expect(parseEditorialSeal(basura)).toBeNull();
    }
  });

  it("un sello de manifiesto al que le falta un campo no se lee a medias", () => {
    const completo = sealForManifest(
      AUTORIZADO,
      DEFINICION,
    ) as unknown as Record<string, unknown>;
    for (const campo of [
      "manifestId",
      "canonicalSha256",
      "definitionSha256",
      "publishAllowed",
      "experienceVersion",
    ]) {
      const roto = { ...completo };
      delete roto[campo];
      expect(parseEditorialSeal(roto)).toBeNull();
    }
    // Y el completo sí se lee, para que lo anterior signifique algo.
    expect(parseEditorialSeal(completo)).not.toBeNull();
  });

  it("una columna ilegible se niega en el gate, no se ignora", () => {
    const v = evaluatePublicationGate({
      seal: parseEditorialSeal({ kind: "manifest" }),
      definition: DEFINICION,
    });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_UNREADABLE" });
  });
});

/**
 * B4 — una fila que dice «aprobada» no se cree por decirlo.
 *
 * Sin esto, cualquiera con un UPDATE sobre la base podría escribir
 * `publishAllowed: true` y publicar. Es la diferencia entre un sello y una
 * nota adhesiva.
 */
describe("la autorización se vuelve a comprobar, no se hereda de la fila", () => {
  const SELLO_APROBADO = sealForManifest(AUTORIZADO, DEFINICION, undefined, {
    keyId: "clave-de-prueba",
    approvedBy: "prueba@feelverse.test",
    approvedAt: "2026-10-21T00:00:00.000Z",
    signature: "da-igual-aqui",
    canonicalVersion: "TEST_v1",
    canonicalSha256: "ab".repeat(32),
    manifestSha256: "cd".repeat(32),
  });

  it("sin acta, una fila aprobada no publica", () => {
    const { approval: _sin, ...sinActa } = SELLO_APROBADO;
    const v = evaluarCrudo({
      seal: sinActa,
      definition: DEFINICION,
      verifyApproval: () => true,
    });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_UNVERIFIABLE" });
  });

  it("sin verificador, esta instalación no aprueba nada", () => {
    // El estado de hoy: ninguna clave configurada. «No se pudo comprobar»
    // nunca significa «adelante».
    const v = evaluarCrudo({ seal: SELLO_APROBADO, definition: DEFINICION });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_UNVERIFIABLE" });
  });

  it("si la firma no verifica, tampoco", () => {
    const v = evaluarCrudo({
      seal: SELLO_APROBADO,
      definition: DEFINICION,
      verifyApproval: () => false,
    });
    expect(v).toMatchObject({ code: "EXPERIENCE_APPROVAL_UNVERIFIABLE" });
  });

  it("control positivo — con acta y firma válida, aprueba", () => {
    const v = evaluarCrudo({
      seal: SELLO_APROBADO,
      definition: DEFINICION,
      verifyApproval: () => true,
    });
    expect(v.approved).toBe(true);
  });
});

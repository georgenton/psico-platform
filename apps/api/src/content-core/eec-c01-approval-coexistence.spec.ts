import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateKeyPairSync, sign as signEd25519 } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  loadApprovals,
  loadManifests,
  type GuideManifest,
} from "./eec-c01-guides-cli";
import { checkApprovals, toDefinition } from "./eec-c01-guides-apply";
import { approvalPayload } from "../experience/experience-editorial-approval";
import { definitionDigest } from "../experience/experience-editorial-seal";

/**
 * Un artefacto se valida contra **la revisión que declara**, no contra el
 * fichero más reciente del capítulo.
 *
 * Es la propiedad que permite reabrir un manuscrito ya publicado sin invalidar
 * lo que alguien firmó sobre él, y hasta ahora era una consecuencia del diseño
 * en vez de un invariante comprobado. La diferencia importa: una consecuencia
 * se pierde en un refactor y nadie se entera hasta que cinco actas firmadas
 * dejan de autorizar nada.
 *
 * ── El caso concreto que lo trajo aquí ─────────────────────────────────────
 *
 * El capítulo 1 de EEC se reabrió para retirar una nota editorial interna y
 * renombrar un encabezado. Su `canonical_sha256` cambia, y con él la versión
 * editorial del manuscrito. Las cinco microguías de ese capítulo están
 * **publicadas y firmadas** contra el texto anterior: sus cinco manifiestos y
 * sus cinco actas viven congelados en `artifacts/eec/C01/v1.0/`, y ahí siguen.
 *
 * Lo que hace que eso funcione es que `checkApprovals` construye lo que espera
 * **del propio manifiesto** (`m.canonicalVersion`, `m.canonicalSha256`,
 * `m.manifestSha256`) y no del fichero en `content/`. Un manifiesto congelado
 * declara la revisión que aprobó, su acta coincide con él, y el conjunto sigue
 * siendo verdad para siempre.
 *
 * ── Lo que estas pruebas NO hacen ──────────────────────────────────────────
 *
 * **No verifican las cinco firmas reales.** La clave pública vive en
 * `EDITORIAL_APPROVAL_KEYS`, fuera del repositorio, que es donde debe estar;
 * una prueba de CI no puede ni debe tenerla. Lo que sí se puede comprobar sin
 * clave es la **correspondencia**: que cada acta y su manifiesto siguen
 * hablando del mismo paquete y de la misma revisión. Eso es exactamente lo que
 * se rompe si alguien regenera los manifiestos, que es el accidente contra el
 * que esto protege.
 *
 * La mecánica de la firma se prueba con una clave sintética, igual que hace el
 * resto de la suite: generada al vuelo, viva en memoria, muerta con el proceso.
 */

const ROOT = join(__dirname, "../../../..");
const CONGELADO = join(ROOT, "artifacts/eec/C01/v1.0/feelverse/guides");

/** La revisión que las cinco aprobaron, fijada como literal a propósito. */
const REVISION_APROBADA = {
  version: "EEC_C01_v1.0_TEXT_LOCKED_2026-08-20",
  sha256: "e10f42cedf881838578b7337355887c0e8cb2fe37b75dfa4204db509ac023018",
} as const;

const manifiestos = loadManifests(CONGELADO);
const actas = loadApprovals(CONGELADO);

interface ActaLeida {
  manifestId: string;
  experienceKey: string;
  experienceVersion: number;
  guideKey: string;
  guideVersion: number;
  canonicalVersion: string;
  canonicalSha256: string;
  manifestSha256: string;
  definitionSha256: string;
}

const actaDe = (m: GuideManifest): ActaLeida =>
  actas.get(m.manifestId) as unknown as ActaLeida;

describe("C01 · lo firmado coexiste con una revisión nueva del manuscrito", () => {
  it("hay cinco manifiestos y cinco actas, emparejados por identificador", () => {
    expect(manifiestos).toHaveLength(5);
    expect(actas.size).toBe(5);
    for (const m of manifiestos) expect(actaDe(m)).toBeDefined();
  });

  it("cada acta declara la MISMA revisión que su manifiesto", () => {
    // Los tres campos que `verifyApproval` compara bajo
    // `APPROVAL_REVISION_MISMATCH`. Si alguien regenerara los manifiestos, el
    // tercero cambiaría y esto caería.
    for (const m of manifiestos) {
      const a = actaDe(m);
      expect(a.canonicalVersion).toBe(m.canonicalVersion);
      expect(a.canonicalSha256).toBe(m.canonicalSha256);
      expect(a.manifestSha256).toBe(m.manifestSha256);
    }
  });

  it("y la misma identidad: ni otra experiencia, ni otra versión, ni otra guía", () => {
    for (const m of manifiestos) {
      const a = actaDe(m);
      expect(a.manifestId).toBe(m.manifestId);
      expect(a.experienceKey).toBe(m.experienceKey);
      expect(a.experienceVersion).toBe(m.experienceVersion);
      expect(a.guideKey).toBe(m.guideKey);
      expect(a.guideVersion).toBe(m.guideVersion);
    }
  });

  it("las cinco siguen declarando la revisión v1.0, que es la que aprobaron", () => {
    for (const m of manifiestos) {
      expect(m.canonicalVersion).toBe(REVISION_APROBADA.version);
      expect(m.canonicalSha256).toBe(REVISION_APROBADA.sha256);
    }
  });

  it("y eso NO depende de lo que diga el capítulo hoy", () => {
    // El invariante, dicho como lo que permite: el manuscrito puede haberse
    // reabierto —y a partir de la limpieza editorial de C01 lo está— sin que
    // nada de lo de arriba se mueva. La prueba no exige que coincidan; exige
    // que la coincidencia **no haga falta**.
    const unit = JSON.parse(
      readFileSync(join(ROOT, "content/books/eec/C01/unit.json"), "utf8"),
    ) as { canonical_sha256: string; canonical_version: string };
    // Si el fichero vivo YA no es el aprobado, esto es la coexistencia en acto.
    // Si todavía coincide, la propiedad se sigue sosteniendo por construcción:
    // lo demuestra el caso sintético de más abajo, que usa una revisión que no
    // existe en ningún fichero.
    expect(typeof unit.canonical_sha256).toBe("string");
    expect(unit.canonical_sha256).toHaveLength(64);
    // Lo que sí se exige: que los cinco artefactos congelados no se hayan
    // movido al compás del fichero vivo.
    for (const m of manifiestos) {
      expect(m.canonicalSha256).toBe(REVISION_APROBADA.sha256);
    }
  });

  it("los cinco artefactos congelados describen las cinco microguías de C01", () => {
    // Procedencia legible: si esto cambiara, lo congelado ya no sería lo que
    // esta prueba dice que protege.
    expect(manifiestos.map((m) => m.guideKey).sort()).toEqual([
      "eec-c1-alarma-antes-del-relato",
      "eec-c1-construida-no-significa-falsa",
      "eec-c1-emocion-informa-no-manda",
      "eec-c1-rostro-como-pista",
      "eec-c1-teorias-como-lentes",
    ]);
    for (const m of manifiestos) expect(m.guideVersion).toBe(1);
  });
});

/**
 * La mecánica, con una clave sintética: lo que `checkApprovals` compara sale
 * del manifiesto, así que una revisión que no existe en ningún fichero del
 * repositorio valida igual.
 */
describe("checkApprovals valida contra la revisión declarada", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = "coexistencia-sintetica";
  const keyring = new Map([
    [
      keyId,
      publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    ],
  ]);

  /** Un manifiesto real, con la revisión cambiada a una inventada. */
  function conRevisionInventada(sha: string) {
    const base = manifiestos[0] as GuideManifest;
    const m = {
      ...base,
      canonicalVersion: "REVISION_QUE_NO_EXISTE_v9.9",
      canonicalSha256: sha,
      publishAllowed: true,
    } as GuideManifest;
    return m;
  }

  function actaFirmadaPara(m: GuideManifest, definitionSha256: string) {
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
      definitionSha256,
      approvedBy: "prueba",
      approvedAt: "2026-11-13T00:00:00.000Z",
      keyId,
    };
    return {
      ...sinFirma,
      signature: signEd25519(
        null,
        Buffer.from(approvalPayload(sinFirma), "utf8"),
        privateKey,
      ).toString("base64"),
    };
  }

  it("una revisión que no existe en ningún fichero valida igual", () => {
    // Ésta es la propiedad, aislada: la revisión declarada es inventada, no
    // está en `content/` ni en `artifacts/`, y la aprobación es válida. Nada
    // en este camino consulta el manuscrito.
    const m = conRevisionInventada("ff".repeat(32));
    const acta = actaFirmadaPara(m, definitionDigest(toDefinition(m)));
    const issues = checkApprovals({
      manifests: [m],
      approvals: new Map([[m.manifestId, acta]]),
      keyring,
    });
    expect(issues).toEqual([]);
  });

  it("regenerar el manifiesto rompe su acta, y se dice por qué", () => {
    // El accidente contra el que protege todo esto: un `build-guide-manifests`
    // sobre el capítulo reabierto reescribiría el paquete y su `manifestSha256`
    // dejaría de ser el que se firmó.
    const m = conRevisionInventada("ff".repeat(32));
    const acta = actaFirmadaPara(m, definitionDigest(toDefinition(m)));
    const regenerado = {
      ...m,
      manifestSha256: "ab".repeat(32),
    } as GuideManifest;
    const issues = checkApprovals({
      manifests: [regenerado],
      approvals: new Map([[regenerado.manifestId, acta]]),
      keyring,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.detail).toContain("APPROVAL_REVISION_MISMATCH");
  });

  it("y sin llavero no autoriza nada, por mucha revisión que declare", () => {
    const m = conRevisionInventada("ff".repeat(32));
    const acta = actaFirmadaPara(m, definitionDigest(toDefinition(m)));
    const issues = checkApprovals({
      manifests: [m],
      approvals: new Map([[m.manifestId, acta]]),
      keyring: new Map(),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.detail).toContain("APPROVAL_UNKNOWN_KEY");
  });
});

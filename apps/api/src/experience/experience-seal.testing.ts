import { generateKeyPairSync, sign as signEd25519 } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ChapterExperienceDefinition } from "@psico/types";

import {
  definitionDigest,
  sealForManifest,
  type ManifestSeal,
} from "./experience-editorial-seal";
import { approvalPayload } from "./experience-editorial-approval";
import { validateExperienceDefinition } from "./experience-catalog";

/**
 * B3/B4 — marcar algo como APROBADO, para pruebas que no son sobre eso.
 *
 * Publicar exige una procedencia editorial que autorice y una firma que lo
 * acredite, y eso es lo que debe exigir. Pero hay suites —vinculación,
 * linaje, el corte C.3C— cuyo asunto es otro: preguntan si archivar una
 * versión libera su guía, si la siguiente hereda la reserva, si publicar la
 * revalida bajo el candado. Para poder preguntarlo necesitan algo publicable.
 *
 * Esto se lo da **por el camino real**, no por una puerta trasera: genera una
 * clave sintética, la registra en el llavero del proceso y firma un acta de
 * verdad. Así, lo que las pruebas ejercitan es la misma verificación que
 * correrá en producción — y si esa verificación se rompiera, estas suites se
 * enterarían en vez de pasar por un atajo.
 *
 * La clave vive en memoria, se crea al vuelo y muere con el proceso. No
 * aprueba nada fuera de la prueba que la usó.
 */

/** La clave de este proceso. Perezosa: una prueba que no sella no la crea. */
let claveDePruebas: {
  keyId: string;
  publicDer: string;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
} | null = null;

function claveSintetica() {
  if (claveDePruebas !== null) return claveDePruebas;
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = `test-${Math.random().toString(36).slice(2, 10)}`;
  const publicDer = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  // Se AÑADE al llavero en vez de reemplazarlo: una suite que ya hubiera
  // configurado claves propias no debe perderlas por sellar una fila.
  const previo = process.env.EDITORIAL_APPROVAL_KEYS?.trim();
  process.env.EDITORIAL_APPROVAL_KEYS = previo
    ? `${previo},${keyId}:${publicDer}`
    : `${keyId}:${publicDer}`;
  claveDePruebas = { keyId, publicDer, privateKey };
  return claveDePruebas;
}

const REVISION = {
  canonicalVersion: "TEST_v1",
  canonicalSha256: "ab".repeat(32),
  manifestSha256: "cd".repeat(32),
} as const;

/** Un sello de manifiesto con su acta firmada, para una definición concreta. */
export function approvedSealForTests(
  definition: ChapterExperienceDefinition,
  manifestId = "TEST-APPROVED",
): ManifestSeal {
  const { keyId, privateKey } = claveSintetica();
  const sinFirma = {
    schemaVersion: 1 as const,
    manifestId,
    experienceKey: definition.experienceKey,
    experienceVersion: definition.experienceVersion,
    guideKey: definition.guidePin.guideKey,
    guideVersion: definition.guidePin.guideVersion,
    ...REVISION,
    definitionSha256: definitionDigest(definition),
    approvedBy: "prueba@feelverse.test",
    approvedAt: "2026-10-21T00:00:00.000Z",
    keyId,
  };
  const signature = signEd25519(
    null,
    Buffer.from(approvalPayload(sinFirma), "utf8"),
    privateKey,
  ).toString("base64");

  return sealForManifest(
    {
      manifestId,
      ...REVISION,
      publishAllowed: true,
      approvalReferences: ["acta-de-prueba"],
      experienceKey: definition.experienceKey,
      experienceVersion: definition.experienceVersion,
      guideKey: definition.guidePin.guideKey,
      guideVersion: definition.guidePin.guideVersion,
    },
    definition,
    new Date("2026-10-21T00:00:00.000Z"),
    {
      keyId,
      approvedBy: sinFirma.approvedBy,
      approvedAt: sinFirma.approvedAt,
      signature,
      ...REVISION,
    },
  );
}

/**
 * La misma idea, sobre una fila que ya existe: lee su definición real, firma
 * ese contenido y escribe el sello. No toca el estado y no publica.
 */
export async function approveRowForTests(
  prisma: Pick<PrismaClient, "chapterExperienceVersion">,
  id: string,
): Promise<ManifestSeal> {
  const row = await prisma.chapterExperienceVersion.findUnique({
    where: { id },
    select: { definitionJson: true },
  });
  if (!row) throw new Error(`approveRowForTests: no existe la fila ${id}`);
  const seal = approvedSealForTests(
    validateExperienceDefinition(row.definitionJson),
  );
  await prisma.chapterExperienceVersion.update({
    where: { id },
    data: { editorialOrigin: seal as unknown as never },
  });
  return seal;
}

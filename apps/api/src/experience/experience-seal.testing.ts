import type { PrismaClient } from "@prisma/client";

import {
  sealForManifest,
  type ManifestSeal,
} from "./experience-editorial-seal";
import { validateExperienceDefinition } from "./experience-catalog";

/**
 * B3 — marcar una fila como APROBADA, para pruebas que no son sobre eso.
 *
 * Publicar exige ahora una procedencia editorial que autorice, y eso es lo
 * que debe exigir. Pero hay suites —vinculación, linaje, el corte C.3C— cuyo
 * asunto es otro: preguntan si una guía se libera al archivar, si una versión
 * nueva hereda la reserva, si publicar revalida bajo el candado. Para poder
 * preguntarlo necesitan un borrador que se pueda publicar.
 *
 * Esto les da exactamente eso y nada más: un sello de manifiesto, calculado
 * sobre la definición que la fila guarda de verdad, con la decisión editorial
 * ya tomada. No toca el estado, no publica, y no existe fuera de las pruebas.
 *
 * Las negativas del circuito —sin sello, histórica, no aprobada, obsoleta,
 * identidad ajena— viven donde les corresponde: en
 * `experience-editorial-seal.spec.ts` y en el bloque del servicio.
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
  const definition = validateExperienceDefinition(row.definitionJson);
  const seal = sealForManifest(
    {
      manifestId: "TEST-APPROVED",
      canonicalVersion: "TEST_v1",
      canonicalSha256: "ab".repeat(32),
      manifestSha256: "cd".repeat(32),
      publishAllowed: true,
      approvalReferences: ["acta-de-prueba"],
      experienceKey: definition.experienceKey,
      experienceVersion: definition.experienceVersion,
      guideKey: definition.guidePin.guideKey,
      guideVersion: definition.guidePin.guideVersion,
    },
    definition,
  );
  await prisma.chapterExperienceVersion.update({
    where: { id },
    data: { editorialOrigin: seal as unknown as never },
  });
  return seal;
}

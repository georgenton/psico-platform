import { describe, expect, it, vi } from "vitest";

import { ExperienceDiscoveryService } from "./experience-discovery.service";
import type { ExperienceDefinitionRepository } from "./experience-definition.repository";
import type { PrismaService } from "../prisma/prisma.service";
import { EEC_C1_EXPERIENCE } from "./experience-production-catalog";

/**
 * Disponibilidad en el descubrimiento de experiencias.
 *
 * ── Por qué una prueba unitaria y no la matriz por HTTP ───────────────────
 *
 * La matriz (`books-availability.e2e-spec.ts`) cubre esta ruta, pero hoy no
 * puede DISTINGUIR: `ChapterExperienceVersion` está vacía en todos los
 * entornos medidos, así que la lista sale vacía con la condición y sin ella.
 * Una prueba que pasa igual con el defecto no es un control.
 *
 * Aquí el repositorio es un doble que SIEMPRE devuelve una experiencia, de
 * modo que la lista vacía sólo puede venir de la condición. Es la forma de
 * fijar hoy un contrato cuya fuga es latente: se afirma en el código, no en
 * el estado de una tabla.
 */

/** Una definición REAL del catálogo: la vista pública la proyecta entera. */
const UNA_EXPERIENCIA = [EEC_C1_EXPERIENCE];

function montar(libro: { isPublished: boolean } | null) {
  const repository = {
    listPublishedForChapter: vi.fn().mockResolvedValue(UNA_EXPERIENCIA),
  } as unknown as ExperienceDefinitionRepository;
  const prisma = {
    book: { findUnique: vi.fn().mockResolvedValue(libro) },
  } as unknown as PrismaService;
  return {
    repository,
    prisma,
    service: new ExperienceDiscoveryService(repository, prisma),
  };
}

describe("descubrimiento de experiencias · disponibilidad de la obra", () => {
  it("una obra retirada no ofrece sus recorridos", async () => {
    const { service, repository } = montar({ isPublished: false });
    await expect(
      service.listPublishedForChapter({ bookSlug: "retirado", chapterOrder: 1 }),
    ).resolves.toEqual([]);
    // Y ni siquiera se pregunta: la copia editorial del recorrido —títulos y
    // cuerpo de cada escena, notas, y la pregunta y las etiquetas de opción
    // de los RECALL— no llega a leerse.
    expect(repository.listPublishedForChapter).not.toHaveBeenCalled();
  });

  it("una obra publicada los ofrece igual que antes", async () => {
    const { service, repository } = montar({ isPublished: true });
    await expect(
      service.listPublishedForChapter({
        bookSlug: "publicado",
        chapterOrder: 1,
      }),
    ).resolves.toHaveLength(1);
    expect(repository.listPublishedForChapter).toHaveBeenCalledTimes(1);
  });

  it("una obra que este catálogo no conoce no gana una exigencia nueva", async () => {
    // Content Core puede publicar obras sin fila `Book`; su disponibilidad la
    // decide el estado de su revisión, que vive en otro sitio.
    const { service, repository } = montar(null);
    await expect(
      service.listPublishedForChapter({ bookSlug: "pura", chapterOrder: 1 }),
    ).resolves.toHaveLength(1);
    expect(repository.listPublishedForChapter).toHaveBeenCalledTimes(1);
  });
});

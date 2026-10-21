import { describe, expect, it } from "vitest";
import type { ChapterExperienceDefinition } from "@psico/types";

import {
  EXPERIENCE_CODE_OWNED_UNRESOLVED,
  codeOwnedClaimsByUnit,
  type CodeOwnedCatalog,
} from "./experience-code-owned-identity";

/**
 * El caso mínimo del bloqueo de preparación, sin tocar el runtime.
 *
 * `codeOwnedClaimsByUnit` resuelve TODAS las definiciones publicadas que el
 * build envía como un conjunto: si una sola no puede ubicarse, rechaza la
 * operación entera. El docblock del módulo lo llama deliberado y explica por
 * qué —decidir relevancia por posición es el fallo que vino a cerrar—.
 *
 * La consecuencia que esto fija es la que se midió: una instalación nueva no
 * puede crear NINGÚN borrador, de ningún capítulo, mientras el catálogo envíe
 * como PUBLISHED una definición cuyos objetivos esa instalación no debe
 * materializar. El par de ejercicios del piloto está retirado a propósito
 * (`EXERCISE_INGESTION_CATALOG`: «a fresh environment cannot anchor this
 * practice — and must not try»), así que la condición no es transitoria.
 *
 * Fija también el mecanismo que ya existe y que la propuesta usaría: una
 * definición ARCHIVED no entra en el conjunto. Es el tratamiento que ya
 * recibió `pqp-c1-contacto-sostenido`.
 *
 * No cambia comportamiento. Es el caso al que una decisión futura tendrá que
 * responder, escrito para que la respuesta se pueda comprobar.
 */

const definicion = (
  experienceKey: string,
  guideKey: string,
  status: "PUBLISHED" | "ARCHIVED",
): ChapterExperienceDefinition =>
  ({
    experienceKey,
    experienceVersion: 1,
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    status,
    title: experienceKey,
    scenes: [],
    guidePin: { guideKey, guideVersion: 1 },
  }) as unknown as ChapterExperienceDefinition;

/** Un catálogo de prueba: nada aquí toca el de producción. */
function catalogo(
  definiciones: readonly ChapterExperienceDefinition[],
): CodeOwnedCatalog {
  return {
    definitions: definiciones.filter((d) => d.status === "PUBLISHED"),
    // Una guía mínima sin pasos: el resolutor sólo necesita que exista.
    guideFor: () => ({ guideKey: "x", guideVersion: 1, steps: [] }) as never,
  };
}

/**
 * Una base en la que NADA resuelve: es lo que ve una instalación nueva para
 * una definición cuyos objetivos no puede materializar.
 */
const baseQueNoUbica = {
  concept: { findMany: async () => [] },
  exercise: { findMany: async () => [] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("ciclo de vida de una definición histórica que ya no se puede ubicar", () => {
  it("una PUBLISHED sin ubicar rechaza la operación entera, no sólo su capítulo", async () => {
    const cat = catalogo([
      definicion("historica", "guia-historica", "PUBLISHED"),
      definicion("nueva", "guia-nueva", "PUBLISHED"),
    ]);

    await expect(codeOwnedClaimsByUnit(baseQueNoUbica, cat)).rejects.toThrow(
      EXPERIENCE_CODE_OWNED_UNRESOLVED,
    );
  });

  it("el error nombra la definición culpable, para que no haya que adivinar", async () => {
    const cat = catalogo([
      definicion("historica", "guia-historica", "PUBLISHED"),
    ]);

    await codeOwnedClaimsByUnit(baseQueNoUbica, cat).then(
      () => expect.unreachable("debía rechazar"),
      (e: { experienceKey?: string }) =>
        expect(e.experienceKey).toBe("historica"),
    );
  });

  it("una ARCHIVED no entra en el conjunto: el mecanismo ya existe", async () => {
    // Es el tratamiento que `pqp-c1-contacto-sostenido` ya recibe en el
    // catálogo de producción. No se aplica aquí a nada: se fija que funciona.
    const cat = catalogo([
      definicion("historica", "guia-historica", "ARCHIVED"),
    ]);

    await expect(codeOwnedClaimsByUnit(baseQueNoUbica, cat)).resolves.toEqual(
      new Map(),
    );
  });
});

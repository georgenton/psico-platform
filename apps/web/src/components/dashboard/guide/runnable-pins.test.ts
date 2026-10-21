import { describe, expect, it } from "vitest";
import type { ChapterExperiencePublicView } from "@psico/types";

import { runnablePinsFrom } from "./runnable-pins";

/**
 * Los seis casos que distinguen EMPEZAR de continuar o revisar.
 *
 * Esta función contesta una sola pregunta —¿puede empezar una sesión NUEVA
 * en este pin?— y las tres condiciones que la componen son respuestas del
 * servidor, no deducciones del navegador.
 */

const exp = (
  guideKey: string,
  extra: Partial<ChapterExperiencePublicView> = {},
): ChapterExperiencePublicView => ({
  experienceKey: `exp-${guideKey}`,
  experienceVersion: 1,
  title: `Experiencia de ${guideKey}`,
  guidePin: { guideKey, guideVersion: 1 },
  scenes: [],
  startable: true,
  ...extra,
});

describe("runnablePinsFrom", () => {
  it("1 · publicada y permitida, sin sesión: puede empezar", () => {
    expect(runnablePinsFrom([exp("g1")]).has("g1@1")).toBe(true);
  });

  it("2 · retirada para inicios nuevos: no puede empezar", () => {
    expect(
      runnablePinsFrom([exp("g1", { startable: false })]).has("g1@1"),
    ).toBe(false);
  });

  it("5 · campo ausente (API antigua): tampoco, porque no se pudo preguntar", () => {
    const sinCampo = exp("g1");
    delete (sinCampo as { startable?: boolean }).startable;
    expect(runnablePinsFrom([sinCampo]).has("g1@1")).toBe(false);
  });

  it("5b · sin publicación para el pin: no está en el conjunto", () => {
    expect(runnablePinsFrom([exp("otra")]).has("g1@1")).toBe(false);
    expect(runnablePinsFrom([]).size).toBe(0);
  });

  it("6 · dos experiencias para el mismo pin: ninguna oferta, no la primera", () => {
    const dos = [
      exp("g1", { experienceKey: "a" }),
      exp("g1", { experienceKey: "b" }),
    ];
    expect(runnablePinsFrom(dos).has("g1@1")).toBe(false);
  });

  it("6b · la ambigüedad de un pin no arrastra a los demás", () => {
    const mezcla = [
      exp("ambiguo", { experienceKey: "a" }),
      exp("ambiguo", { experienceKey: "b" }),
      exp("limpio"),
    ];
    const r = runnablePinsFrom(mezcla);
    expect(r.has("ambiguo@1")).toBe(false);
    expect(r.has("limpio@1")).toBe(true);
  });

  it("la versión forma parte del pin: v2 no hereda el permiso de v1", () => {
    const v2 = exp("g1", { guidePin: { guideKey: "g1", guideVersion: 2 } });
    const r = runnablePinsFrom([v2]);
    expect(r.has("g1@2")).toBe(true);
    expect(r.has("g1@1")).toBe(false);
  });
});

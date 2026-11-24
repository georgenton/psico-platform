import { describe, expect, it } from "vitest";
import { resolvePurchaseGate } from "./purchase-availability";
import {
  describeTherapyOfferGate,
  resolveTherapyOfferGate,
  therapyOfferForWire,
} from "./therapy-offer";

/**
 * La puerta de la oferta de terapia. Sólo un sí explícito y legible abre.
 *
 * El catálogo completo de valores lo recorre `purchase-availability.spec.ts`
 * sobre el mismo resolutor; aquí se fija lo propio: que abre y cierra en los
 * mismos sitios, qué viaja al cliente y qué lee el operador.
 */
const VALORES = [
  undefined,
  "",
  "   ",
  "off",
  "false",
  "0",
  "cerrado",
  "on",
  "true",
  "1",
  "ABIERTO",
  " open ",
  "si",
  "yes",
  "once",
  "ábrela",
];

describe("resolveTherapyOfferGate", () => {
  it.each(VALORES)("%j se lee igual que en la puerta de las compras", (raw) => {
    expect(resolveTherapyOfferGate(raw)).toEqual(resolvePurchaseGate(raw));
  });

  it("abre si y sólo si el estado es `on`", () => {
    const abren = VALORES.filter((v) => resolveTherapyOfferGate(v).open);
    expect(abren).toEqual(["on", "true", "1", "ABIERTO", " open "]);
  });
});

describe("therapyOfferForWire", () => {
  it("publica sólo `open` — nunca el motivo ni el valor", () => {
    const wire = therapyOfferForWire(resolveTherapyOfferGate("ábrela"));
    expect(wire).toEqual({ open: false });
    expect(therapyOfferForWire(resolveTherapyOfferGate("on"))).toEqual({
      open: true,
    });
  });
});

describe("describeTherapyOfferGate", () => {
  it("las situaciones cerradas nunca dicen ABIERTA, y se distinguen entre sí", () => {
    const lineas = [undefined, "off", "ábrela"].map((v) =>
      describeTherapyOfferGate(resolveTherapyOfferGate(v)),
    );
    for (const l of lineas) expect(l).not.toContain("ABIERTA");
    expect(new Set(lineas).size).toBe(3);
    expect(lineas[2]).toContain("ábrela");
  });

  it("abierta, recuerda que las fichas de demostración siguen fuera", () => {
    expect(describeTherapyOfferGate(resolveTherapyOfferGate("on"))).toContain(
      "demostración",
    );
  });
});

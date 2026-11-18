import { describe, expect, it } from "vitest";
import {
  describePurchaseGate,
  purchaseAvailabilityForWire,
  resolvePurchaseGate,
} from "./purchase-availability";

/**
 * El resolutor de la puerta de las compras.
 *
 * La propiedad que estos casos fijan no es «cierra cuando se le dice que
 * cierre» —eso es trivial— sino la asimétrica: **sólo** un sí explícito y
 * legible abre. Es la lección del agujero que tuvo la guarda del correo, donde
 * «nadie la configuró» y «alguien la configuró mal» compartían estado y en
 * producción eso caía en abierto.
 */
describe("resolvePurchaseGate", () => {
  describe("abre SÓLO con un sí explícito y legible", () => {
    it.each([
      ["on", "on"],
      ["true", "true"],
      ["1", "1"],
      ["open", "open"],
      ["abierto", "abierto"],
      ["mayúsculas", "ON"],
      ["con espacios alrededor", "  true  "],
      ["mezcla de caja", "TrUe"],
    ])("%s → abierta", (_caso, raw) => {
      const gate = resolvePurchaseGate(raw);
      expect(gate.state).toBe("on");
      expect(gate.open).toBe(true);
    });
  });

  describe("la ausencia no es un permiso", () => {
    it.each([
      ["sin definir", undefined],
      ["cadena vacía", ""],
      ["sólo espacios", "    "],
      ["tabulador", "\t"],
    ])("%s → cerrada por ausencia", (_caso, raw) => {
      const gate = resolvePurchaseGate(raw);
      expect(gate.state).toBe("absent");
      expect(gate.open).toBe(false);
    });

    it("la cadena vacía cuenta como ausencia, no como valor ilegible", () => {
      // Coolify guarda una variable borrada como cadena vacía. Tratarla como
      // «hay un valor y no se entiende» convertiría un borrado en una alarma.
      expect(resolvePurchaseGate("").state).toBe("absent");
    });
  });

  describe("un no explícito", () => {
    it.each([
      ["off", "off"],
      ["false", "false"],
      ["0", "0"],
      ["closed", "closed"],
      ["cerrado", "cerrado"],
      ["OFF", "OFF"],
    ])("%s → cerrada a propósito", (_caso, raw) => {
      const gate = resolvePurchaseGate(raw);
      expect(gate.state).toBe("off");
      expect(gate.open).toBe(false);
    });
  });

  describe("un valor ilegible cierra, y se distingue", () => {
    it.each([
      ["frase", "sí, ábrelas"],
      ["prefijo de un afirmativo", "once"],
      ["sufijo de un afirmativo", "noon"],
      ["sí en castellano, que NO está en la lista", "si"],
      ["número distinto de 1", "2"],
      ["yes, que tampoco está", "yes"],
      ["enabled", "enabled"],
    ])("%s → cerrada e ilegible", (_caso, raw) => {
      const gate = resolvePurchaseGate(raw);
      expect(gate.state).toBe("invalid");
      expect(gate.open).toBe(false);
    });

    it("conserva el valor recortado para el mensaje del operador", () => {
      // Sin esto el operador lee «cerradas» y no sabe que fue por su errata.
      expect(resolvePurchaseGate("  ábrelas ya  ").rawWhenInvalid).toBe(
        "ábrelas ya",
      );
    });

    it("no conserva nada cuando el valor sí se entiende", () => {
      expect(resolvePurchaseGate("on").rawWhenInvalid).toBeNull();
      expect(resolvePurchaseGate("off").rawWhenInvalid).toBeNull();
      expect(resolvePurchaseGate(undefined).rawWhenInvalid).toBeNull();
    });
  });

  it("`open` es verdadero si y sólo si el estado es `on`", () => {
    // Invariante del resolutor, escrito una vez en vez de confiar en que cada
    // caso de arriba compruebe las dos cosas.
    for (const raw of [
      undefined,
      "",
      "off",
      "false",
      "0",
      "cualquier cosa",
      "on",
      "true",
      "1",
    ]) {
      const gate = resolvePurchaseGate(raw);
      expect(gate.open).toBe(gate.state === "on");
    }
  });
});

describe("purchaseAvailabilityForWire", () => {
  it("publica sólo `open` — nunca el motivo", () => {
    // El motivo describe la forma de la configuración. Lo lee cualquiera con
    // sesión y ninguna pantalla lo usa.
    expect(purchaseAvailabilityForWire(resolvePurchaseGate("x"))).toEqual({
      open: false,
    });
    expect(purchaseAvailabilityForWire(resolvePurchaseGate("on"))).toEqual({
      open: true,
    });
  });

  it("el contrato no filtra el estado interno", () => {
    const wire = purchaseAvailabilityForWire(resolvePurchaseGate("ábrelas"));
    expect(Object.keys(wire)).toEqual(["open"]);
    expect(JSON.stringify(wire)).not.toContain("invalid");
    expect(JSON.stringify(wire)).not.toContain("ábrelas");
  });
});

describe("describePurchaseGate", () => {
  it("distingue ausente de apagada: la causa y el arreglo son distintos", () => {
    expect(describePurchaseGate(resolvePurchaseGate(undefined))).not.toBe(
      describePurchaseGate(resolvePurchaseGate("off")),
    );
  });

  it("un valor ilegible se dice en voz alta, con el valor", () => {
    const linea = describePurchaseGate(resolvePurchaseGate("ábrelas"));
    expect(linea).toContain("BLOQUEADAS");
    expect(linea).toContain("ábrelas");
  });

  it("las tres situaciones cerradas nunca dicen ABIERTAS", () => {
    for (const raw of [undefined, "", "off", "false", "lo que sea"]) {
      expect(describePurchaseGate(resolvePurchaseGate(raw))).not.toContain(
        "ABIERTAS",
      );
    }
    expect(describePurchaseGate(resolvePurchaseGate("on"))).toContain(
      "ABIERTAS",
    );
  });
});

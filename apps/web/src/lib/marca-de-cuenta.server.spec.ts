import { describe, expect, it, vi } from "vitest";

// `server-only` impide que esto llegue al navegador; aquí se prueba el cálculo.
vi.mock("server-only", () => ({}));

import { deriveGuideRecoveryActorScope } from "./guide-recovery-scope.server";
import { marcaDeCuenta } from "./marca-de-cuenta.server";

const A = "cmb0usuarioalpha01";
const B = "cmb0usuariobeta002";

describe("marcaDeCuenta", () => {
  it("la misma cuenta da la misma marca, y dos cuentas, dos", () => {
    expect(marcaDeCuenta(A)).toBe(marcaDeCuenta(A));
    expect(marcaDeCuenta(A)).not.toBe(marcaDeCuenta(B));
  });

  it("no lleva el identificador dentro, ni coincide con la del guía", () => {
    expect(marcaDeCuenta(A)).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(marcaDeCuenta(A)).not.toContain(A.slice(0, 6));
    expect(deriveGuideRecoveryActorScope(A)).not.toContain(marcaDeCuenta(A)!);
  });

  it("sin identificador no hay marca", () => {
    expect(marcaDeCuenta(undefined)).toBeNull();
    expect(marcaDeCuenta(null)).toBeNull();
    expect(marcaDeCuenta("")).toBeNull();
  });
});

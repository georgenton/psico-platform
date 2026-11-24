import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeConsole } from "./console-probe";

describe("la sonda de la consola", () => {
  const original = console.error;
  afterEach(() => {
    console.error = original;
  });

  it("primero escribe lo de siempre, y después informa del error", () => {
    const escrito = vi.fn();
    console.error = escrito;
    const report = vi.fn();
    probeConsole(report);
    const err = new Error("x");
    console.error(" ⨯", err);
    expect(escrito).toHaveBeenCalledWith(" ⨯", err);
    expect(report.mock.calls).toEqual([[err]]);
  });

  it("el texto suelto no se mira", () => {
    console.error = vi.fn();
    const report = vi.fn();
    probeConsole(report);
    console.error("texto de una persona", { correo: "x" });
    expect(report).not.toHaveBeenCalled();
  });

  it("reconoce un error nacido en otro contexto, como el de Edge", () => {
    console.error = vi.fn();
    const report = vi.fn();
    probeConsole(report);
    const ajeno = runInNewContext("new Error('x')") as Error;
    expect(ajeno instanceof Error).toBe(false);
    console.error(ajeno);
    expect(report).toHaveBeenCalledOnce();
  });

  it("si informar falla, quien escribe no se entera", () => {
    console.error = vi.fn();
    probeConsole(() => {
      throw new Error("el receptor");
    });
    expect(() => console.error(new Error("x"))).not.toThrow();
  });

  it("al retirarse devuelve la consola, salvo que alguien la envolviera después", () => {
    const base = vi.fn();
    console.error = base;
    const retirar = probeConsole(vi.fn());
    const otro = vi.fn();
    console.error = otro;
    retirar();
    expect(console.error).toBe(otro);
  });
});

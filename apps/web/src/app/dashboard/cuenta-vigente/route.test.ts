import { beforeEach, describe, expect, it, vi } from "vitest";

const sesion = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/api.server", () => ({
  getSessionUser: () => (sesion.userId ? { userId: sesion.userId } : null),
}));
vi.mock("server-only", () => ({}));

import { marcaDeCuenta } from "@/lib/marca-de-cuenta.server";
import { GET } from "./route";

describe("GET /dashboard/cuenta-vigente", () => {
  beforeEach(() => {
    sesion.userId = null;
  });

  it("dice la marca de la sesión, la misma que lleva el panel, y nada más", async () => {
    sesion.userId = "usuario-1";
    const res = GET();
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo).toEqual({ marca: marcaDeCuenta("usuario-1") });
    expect(JSON.stringify(cuerpo)).not.toContain("usuario-1");
  });

  it("sin sesión dice null", async () => {
    expect(await GET().json()).toEqual({ marca: null });
  });

  it("dos cuentas, dos marcas", async () => {
    sesion.userId = "usuario-1";
    const una = await GET().json();
    sesion.userId = "usuario-2";
    expect(await GET().json()).not.toEqual(una);
  });

  it("no la guarda nadie por el camino", () => {
    const { headers } = GET();
    expect(headers.get("cache-control")).toBe("no-store, private");
    expect(headers.get("vary")).toBe("Cookie");
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SesionVigenteProvider } from "@/lib/crypto/sesion-vigente";

// `server-only` impide que llegue al navegador; aquí se prueba qué entrega.
vi.mock("server-only", () => ({}));

const sesion = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/api.server", () => ({
  getSessionUser: () => (sesion.userId ? { userId: sesion.userId } : null),
}));

const { marcaDeCuenta } = await import("@/lib/marca-de-cuenta.server");
const { PantallaDeLaSesion } = await import("./PantallaDeLaSesion");

const recargar = vi.fn();

beforeEach(() => {
  recargar.mockReset();
  vi.stubGlobal("location", { ...window.location, reload: recargar });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
});

/** El panel que se quedó montado, y la pantalla que trae una navegación. */
function navegar(panel: string, deLaSesion: string | null) {
  sesion.userId = deLaSesion;
  render(
    <SesionVigenteProvider marca={marcaDeCuenta(panel)}>
      <PantallaDeLaSesion>
        <p>la pantalla</p>
      </PantallaDeLaSesion>
    </SesionVigenteProvider>,
  );
}

describe("PantallaDeLaSesion", () => {
  it("con la sesión de la cuenta del panel, se ve", () => {
    navegar("cuenta-a", "cuenta-a");
    expect(screen.getByText("la pantalla")).toBeInTheDocument();
    expect(recargar).not.toHaveBeenCalled();
  });

  it("con la de otra cuenta no se monta, y se carga de nuevo", () => {
    navegar("cuenta-a", "cuenta-b");
    expect(screen.queryByText("la pantalla")).toBeNull();
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("sin sesión legible no se inventa una cuenta: la deja pasar", () => {
    navegar("cuenta-a", null);
    expect(screen.getByText("la pantalla")).toBeInTheDocument();
    expect(recargar).not.toHaveBeenCalled();
  });
});

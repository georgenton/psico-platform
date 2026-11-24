import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserMeResponse } from "@psico/types";

import { DangerZone } from "./DangerZone";

vi.mock("@/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/actions/profile", () => ({
  getDataExportDownloadAction: vi.fn(),
  requestAccountDeleteAction: vi.fn(),
  requestDataExportAction: vi.fn(),
}));

const me = {
  privacy: { dataExportRequested: null, accountDeleteRequested: null },
} as unknown as UserMeResponse;

describe("DangerZone · la fila de exportar", () => {
  it("dice el formato y el alcance reales, y no un ZIP", () => {
    render(<DangerZone me={me} />);

    const zona = screen.getByTestId("danger-zone");
    expect(zona).toHaveTextContent(
      "Un archivo JSON con tu perfil, tus preferencias y ajustes, tu progreso de lectura, tu suscripción y tus sesiones de guía. No incluye, entre otras cosas, tu Diario ni las conversaciones con Eco. Solo 1 vez cada 30 días.",
    );
    expect(zona).not.toHaveTextContent(/zip|tu actividad/i);
  });

  it("la acción sigue siendo la misma", () => {
    render(<DangerZone me={me} />);
    expect(screen.getByTestId("export-btn")).toHaveTextContent(
      "Solicitar export",
    );
  });
});

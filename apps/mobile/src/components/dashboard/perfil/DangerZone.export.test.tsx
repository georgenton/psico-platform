import { render, screen } from "@testing-library/react-native";
import type { UserMeResponse } from "@psico/types";

import { DangerZone } from "./DangerZone";

jest.mock("@psico/api-client", () => ({
  usersApi: {
    requestDataExport: jest.fn(),
    requestAccountDeletion: jest.fn(),
  },
}));

const me = {
  privacy: { dataExportRequested: null, accountDeleteRequested: null },
} as unknown as UserMeResponse;

describe("DangerZone (móvil) · la fila de exportar", () => {
  it("dice el formato y el alcance reales, y no un ZIP", () => {
    render(<DangerZone me={me} />);

    expect(
      screen.getByText(
        "Un archivo JSON con tu perfil, tus preferencias y ajustes, tu progreso de lectura, tu suscripción y tus sesiones de guía. No incluye, entre otras cosas, tu Diario ni las conversaciones con Eco. Solo 1 vez cada 30 días.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/zip|actividad/i)).toBeNull();
  });

  it("la acción sigue siendo la misma", () => {
    render(<DangerZone me={me} />);
    expect(screen.getByTestId("export-btn")).toHaveTextContent("Solicitar");
  });
});

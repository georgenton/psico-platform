import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserMeResponse, UserPrivacySettings } from "@psico/types";

vi.mock("@/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/actions/profile", () => ({
  cancelAccountDeleteAction: vi.fn(),
  getDataExportDownloadAction: vi.fn(),
  requestAccountDeleteAction: vi.fn(),
  requestDataExportAction: vi.fn(),
}));

import {
  cancelAccountDeleteAction,
  requestAccountDeleteAction,
} from "@/actions/profile";
import { DangerZone } from "./DangerZone";

/**
 * The deletion row of «Zona sensible»: the day it prints and the way out.
 *
 * Dates as they arrive over the wire —ISO strings— and the two of them thirty
 * days apart, so printing the wrong one cannot pass by coincidence.
 */
const REQUESTED = "2026-11-24T14:05:00.000Z";
const DUE = "2026-12-24T14:05:00.000Z";
const DUE_IN_QUITO = "24 de diciembre de 2026 a las 09:05";

function me(
  privacy: Record<string, unknown> = {},
  timezone: string | null = "America/Guayaquil",
): UserMeResponse {
  return {
    user: { timezone },
    privacy: {
      dataExportRequested: null,
      accountDeleteRequested: null,
      accountDeleteScheduledFor: null,
      ...privacy,
    } as unknown as UserPrivacySettings,
  } as UserMeResponse;
}

const scheduled = (over: Record<string, unknown> = {}) =>
  me({
    accountDeleteRequested: REQUESTED,
    accountDeleteScheduledFor: DUE,
    ...over,
  });

const row = () => screen.getByTestId("delete-scheduled");

describe("DangerZone · la baja", () => {
  beforeEach(() => {
    vi.mocked(cancelAccountDeleteAction).mockReset();
    vi.mocked(requestAccountDeleteAction).mockReset();
  });

  it("al recargar dice el día en que se ELIMINA, no el día en que se pidió", () => {
    render(<DangerZone me={scheduled()} />);

    expect(row()).toHaveTextContent(`se eliminará el ${DUE_IN_QUITO}`);
    expect(row()).not.toHaveTextContent(/noviembre/);
  });

  it("lo dice en la zona de la persona, y en UTC avisando si no hay zona", () => {
    const { unmount } = render(
      <DangerZone
        me={me(
          { accountDeleteRequested: REQUESTED, accountDeleteScheduledFor: DUE },
          "Europe/Madrid",
        )}
      />,
    );
    expect(row()).toHaveTextContent("24 de diciembre de 2026 a las 15:05");
    unmount();

    render(
      <DangerZone
        me={me(
          { accountDeleteRequested: REQUESTED, accountDeleteScheduledFor: DUE },
          null,
        )}
      />,
    );
    expect(row()).toHaveTextContent(
      "24 de diciembre de 2026 a las 14:05 (hora UTC)",
    );
  });

  it("contra una API anterior no inventa la fecha: la de la solicitud no sirve", () => {
    render(
      <DangerZone me={scheduled({ accountDeleteScheduledFor: undefined })} />,
    );

    expect(row()).toHaveTextContent(
      "Tu cuenta está programada para eliminarse",
    );
    expect(row()).not.toHaveTextContent(/2026/);
  });

  it("recién pedida enseña la fecha que contesta el servidor", async () => {
    vi.mocked(requestAccountDeleteAction).mockResolvedValue({
      ok: true,
      deleteAt: DUE,
    });
    render(<DangerZone me={me()} />);

    await userEvent.click(screen.getByTestId("delete-toggle"));
    await userEvent.type(screen.getByTestId("delete-password"), "clave");
    await userEvent.click(screen.getByTestId("delete-confirm"));

    await waitFor(() =>
      expect(row()).toHaveTextContent(`se eliminará el ${DUE_IN_QUITO}`),
    );
  });

  it("cancela con confirmación, vuelve al estado normal sin recargar y lo dice", async () => {
    vi.mocked(cancelAccountDeleteAction).mockResolvedValue({ ok: true });
    render(<DangerZone me={scheduled()} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Cancelar la eliminación" }),
    );
    // One tap is not enough.
    expect(cancelAccountDeleteAction).not.toHaveBeenCalled();
    expect(row()).toHaveTextContent("seguirá como está");

    await userEvent.click(screen.getByTestId("delete-cancel-confirm"));

    await waitFor(() =>
      expect(screen.queryByTestId("delete-scheduled")).toBeNull(),
    );
    expect(cancelAccountDeleteAction).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("delete-toggle")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cancelaste la eliminación",
    );
  });

  it("«Volver» no cancela nada", async () => {
    render(<DangerZone me={scheduled()} />);

    await userEvent.click(screen.getByTestId("delete-cancel"));
    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(cancelAccountDeleteAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("delete-cancel")).toBeInTheDocument();
  });

  it.each([
    [409, /Ya pasó el plazo para cancelar/],
    [410, /ya se eliminó/],
    [429, /Espera un momento/],
    [500, /No pudimos confirmar la cancelación/],
    [null, /No pudimos confirmar la cancelación/],
  ])(
    "si el servidor contesta %s lo dice en línea y la baja sigue programada",
    async (status, copy) => {
      vi.mocked(cancelAccountDeleteAction).mockResolvedValue({
        ok: false,
        status,
      });
      render(<DangerZone me={scheduled()} />);

      await userEvent.click(screen.getByTestId("delete-cancel"));
      await userEvent.click(screen.getByTestId("delete-cancel-confirm"));

      expect(await screen.findByRole("alert")).toHaveTextContent(copy);
      expect(row()).toHaveTextContent(DUE_IN_QUITO);
      // And it can be tried again.
      expect(screen.getByTestId("delete-cancel-confirm")).toBeEnabled();
    },
  );

  it("si la acción no llega a contestar, no afirma que se canceló ni que no", async () => {
    vi.mocked(cancelAccountDeleteAction).mockRejectedValue(new Error("red"));
    render(<DangerZone me={scheduled()} />);

    await userEvent.click(screen.getByTestId("delete-cancel"));
    await userEvent.click(screen.getByTestId("delete-cancel-confirm"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos confirmar la cancelación",
    );
    expect(row()).toBeInTheDocument();
  });

  it("no manda a nadie a soporte: ese camino no existía", () => {
    const { container } = render(<DangerZone me={scheduled()} />);
    expect(container.textContent).not.toMatch(/soporte/i);
  });
});

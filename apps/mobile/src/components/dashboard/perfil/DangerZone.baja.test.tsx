import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { UserMeResponse } from "@psico/types";

// jest-expo does not render Modal children; same stand-in `TimezoneCard` uses.
/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  const React = jest.requireActual("react");
  RN.Modal = ({ visible, children }: any) =>
    visible ? React.createElement(RN.View, null, children) : null;
  return RN;
});
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.mock("@psico/api-client", () => ({
  // The real class: `instanceof` is what tells a refusal from no answer.
  ApiError: jest.requireActual("@psico/api-client").ApiError,
  usersApi: {
    cancelAccountDeletion: jest.fn(),
    requestAccountDeletion: jest.fn(),
    requestDataExport: jest.fn(),
  },
}));

import { ApiError, usersApi } from "@psico/api-client";
import { DangerZone } from "./DangerZone";

/** As they arrive over the wire, thirty days apart. */
const REQUESTED = "2026-11-24T14:05:00.000Z";
const DUE = "2026-12-24T14:05:00.000Z";
const DUE_IN_QUITO = "24 de diciembre de 2026 a las 09:05";

function me(privacy: Record<string, unknown> = {}): UserMeResponse {
  return {
    user: { timezone: "America/Guayaquil" },
    privacy: {
      dataExportRequested: null,
      accountDeleteRequested: null,
      accountDeleteScheduledFor: null,
      ...privacy,
    },
  } as unknown as UserMeResponse;
}

const scheduled = (over: Record<string, unknown> = {}) =>
  me({
    accountDeleteRequested: REQUESTED,
    accountDeleteScheduledFor: DUE,
    ...over,
  });

const cancelApi = usersApi.cancelAccountDeletion as jest.Mock;

describe("DangerZone (mobile) · la baja", () => {
  let alert: jest.SpyInstance;

  /** Presses a button of the last system dialog. */
  const press = (label: string) => {
    const buttons = alert.mock.calls.at(-1)![2] as {
      text: string;
      onPress?: () => void;
    }[];
    act(() => buttons.find((b) => b.text === label)!.onPress?.());
  };

  beforeEach(() => {
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    cancelApi.mockReset();
    (usersApi.requestAccountDeletion as jest.Mock).mockReset();
  });
  afterEach(() => alert.mockRestore());

  it("dice el día en que se ELIMINA, no el día en que se pidió", () => {
    const { getByTestId, queryByText } = render(
      <DangerZone me={scheduled()} />,
    );

    expect(getByTestId("delete-scheduled")).toHaveTextContent(
      new RegExp(`se eliminará el ${DUE_IN_QUITO}`),
    );
    expect(queryByText(/noviembre/)).toBeNull();
    expect(queryByText(/soporte/i)).toBeNull();
  });

  it("contra una API anterior no inventa la fecha", () => {
    const { getByTestId, queryByText } = render(
      <DangerZone me={scheduled({ accountDeleteScheduledFor: undefined })} />,
    );

    expect(getByTestId("delete-scheduled")).toHaveTextContent(
      /Tu cuenta está programada para eliminarse/,
    );
    expect(queryByText(/2026/)).toBeNull();
  });

  it("recién pedida dice la fecha que contesta el servidor, en la zona de la persona", async () => {
    (usersApi.requestAccountDeletion as jest.Mock).mockResolvedValue({
      ok: true,
      deleteAt: DUE,
    });
    const { getByTestId } = render(<DangerZone me={me()} />);

    fireEvent.press(getByTestId("delete-toggle"));
    fireEvent.changeText(getByTestId("delete-password"), "clave");
    fireEvent.press(getByTestId("delete-confirm"));

    await waitFor(() =>
      expect(alert).toHaveBeenLastCalledWith(
        "Borrado programado",
        `Tu cuenta se eliminará el ${DUE_IN_QUITO}.`,
      ),
    );
  });

  it("cancela con confirmación y vuelve al estado normal, aunque la recarga falle", async () => {
    cancelApi.mockResolvedValue({ ok: true, cancelled: true });
    const onChanged = jest.fn(); // never brings a fresh `me`
    const { getByTestId, queryByTestId } = render(
      <DangerZone me={scheduled()} onChanged={onChanged} />,
    );

    fireEvent.press(getByTestId("delete-cancel"));
    // The dialog, and nothing sent yet.
    expect(cancelApi).not.toHaveBeenCalled();
    press("Sí, conservarla");

    await waitFor(() => expect(queryByTestId("delete-scheduled")).toBeNull());
    expect(cancelApi).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(getByTestId("danger-zone")).toBeTruthy();
    expect(alert).toHaveBeenLastCalledWith(
      "Eliminación cancelada",
      expect.stringContaining("sigue activa"),
    );
  });

  it("si después se vuelve a pedir, esa solicitud nueva sí se enseña", async () => {
    cancelApi.mockResolvedValue({ ok: true, cancelled: true });
    const view = render(<DangerZone me={scheduled()} />);
    fireEvent.press(view.getByTestId("delete-cancel"));
    press("Sí, conservarla");
    await waitFor(() =>
      expect(view.queryByTestId("delete-scheduled")).toBeNull(),
    );

    view.rerender(
      <DangerZone
        me={scheduled({
          accountDeleteRequested: "2026-11-25T10:00:00.000Z",
          accountDeleteScheduledFor: "2026-12-25T10:00:00.000Z",
        })}
      />,
    );
    expect(view.getByTestId("delete-scheduled")).toHaveTextContent(
      /25 de diciembre de 2026 a las 05:00/,
    );
  });

  it("«Volver» no cancela nada", () => {
    const { getByTestId } = render(<DangerZone me={scheduled()} />);

    fireEvent.press(getByTestId("delete-cancel"));
    press("Volver");

    expect(cancelApi).not.toHaveBeenCalled();
    expect(getByTestId("delete-scheduled")).toBeTruthy();
  });

  it.each([
    [new ApiError(409, "x"), /Ya pasó el plazo para cancelar/],
    [new ApiError(410, "x"), /ya se eliminó/],
    [new ApiError(500, "x"), /No pudimos confirmar la cancelación/],
    [new TypeError("Network request failed"), /No pudimos confirmar/],
  ])(
    "ante %s lo dice en línea y la baja sigue programada",
    async (err, copy) => {
      cancelApi.mockRejectedValue(err);
      const onChanged = jest.fn();
      const { getByTestId, findByTestId } = render(
        <DangerZone me={scheduled()} onChanged={onChanged} />,
      );

      fireEvent.press(getByTestId("delete-cancel"));
      press("Sí, conservarla");

      expect(await findByTestId("delete-cancel-error")).toHaveTextContent(copy);
      expect(getByTestId("delete-scheduled")).toBeTruthy();
      expect(onChanged).not.toHaveBeenCalled();
    },
  );
});

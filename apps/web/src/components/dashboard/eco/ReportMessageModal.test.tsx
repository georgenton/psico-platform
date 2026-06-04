import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportMessageModal } from "./ReportMessageModal";

// We mock the API client at the import path the component uses. This lets
// us assert on the call shape without spinning up a real network mock.
vi.mock("@psico/api-client", () => ({
  ecoApi: {
    reportMessage: vi.fn(),
  },
}));

import { ecoApi } from "@psico/api-client";

describe("ReportMessageModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title + 5 reason options + cancel/submit actions", () => {
    render(<ReportMessageModal messageId="msg-1" onClose={vi.fn()} />);
    expect(screen.getByText(/Reportar respuesta de Eco/i)).toBeInTheDocument();
    // 5 reasons → 5 radios in the radiogroup.
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    // Submit is disabled until a reason is picked.
    expect(
      screen.getByRole("button", { name: /Enviar reporte/i }),
    ).toBeDisabled();
  });

  it("enables submit once a reason is selected and shows the comment counter", async () => {
    render(<ReportMessageModal messageId="msg-1" onClose={vi.fn()} />);

    // Pick the second reason ("El tono no fue apropiado").
    await userEvent.click(
      screen.getByRole("radio", { name: /tono no fue apropiado/i }),
    );

    const submit = screen.getByRole("button", { name: /Enviar reporte/i });
    expect(submit).toBeEnabled();

    // The comment counter starts at 0/500.
    expect(screen.getByText("0/500")).toBeInTheDocument();

    // Type a comment and confirm the counter updates.
    const textarea = screen.getByPlaceholderText(/Qué hubieras necesitado/i);
    await userEvent.type(textarea, "Faltó cariño en la respuesta");
    expect(
      screen.getByText(`${"Faltó cariño en la respuesta".length}/500`),
    ).toBeInTheDocument();
  });

  it("calls ecoApi.reportMessage with the picked reason + comment and closes with sent=true", async () => {
    vi.mocked(ecoApi.reportMessage).mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    render(<ReportMessageModal messageId="msg-1" onClose={onClose} />);

    await userEvent.click(screen.getByRole("radio", { name: /Otra cosa/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/Qué hubieras necesitado/i),
      "Sentí que respondió en piloto automático.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Enviar reporte/i }),
    );

    await waitFor(() => {
      expect(ecoApi.reportMessage).toHaveBeenCalledWith("msg-1", {
        reason: "OTHER",
        comment: "Sentí que respondió en piloto automático.",
      });
    });
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("shows an inline error and stays open when the POST fails", async () => {
    vi.mocked(ecoApi.reportMessage).mockRejectedValue(new Error("network"));
    const onClose = vi.fn();
    render(<ReportMessageModal messageId="msg-1" onClose={onClose} />);

    await userEvent.click(
      screen.getByRole("radio", { name: /hallucination|inventó información/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Enviar reporte/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /No pudimos enviar el reporte/i,
      );
    });
    // The modal does NOT close on error — user can retry.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes with sent=false when the Cancelar button is pressed", async () => {
    const onClose = vi.fn();
    render(<ReportMessageModal messageId="msg-1" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(onClose).toHaveBeenCalledWith(false);
  });
});

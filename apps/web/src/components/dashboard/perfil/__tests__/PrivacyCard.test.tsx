import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserPrivacySettings } from "@psico/types";
import { PrivacyCard } from "../PrivacyCard";

const mockAction = vi.fn();
vi.mock("@/app/dashboard/perfil/actions", () => ({
  updatePrivacyAction: (...args: unknown[]) => mockAction(...args),
  updatePreferencesAction: vi.fn(),
}));

beforeEach(() => {
  mockAction.mockReset();
});

function baseSettings(): UserPrivacySettings {
  return {
    shareDiaryWithTherapist: false,
    anonymizedAnalytics: true,
    marketingEmail: false,
    localTextAnalysis: false,
    dataExportRequested: null,
    accountDeleteRequested: null,
  };
}

describe("PrivacyCard", () => {
  it("renders all 3 toggleable switches with their hints", () => {
    render(<PrivacyCard initial={baseSettings()} />);
    expect(
      screen.getByText(/Permitir compartir Diario con terapeuta/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Analíticas anónimas/i)).toBeInTheDocument();
    expect(screen.getByText(/Correos de novedades/i)).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(3);
  });

  it("reflects initial values in aria-checked", () => {
    render(<PrivacyCard initial={baseSettings()} />);
    const switches = screen.getAllByRole("switch");
    // anonymizedAnalytics is the 2nd toggle in row order
    expect(switches[0]).toHaveAttribute("aria-checked", "false");
    expect(switches[1]).toHaveAttribute("aria-checked", "true");
    expect(switches[2]).toHaveAttribute("aria-checked", "false");
  });

  it("calls updatePrivacyAction when a switch is clicked", async () => {
    mockAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PrivacyCard initial={baseSettings()} />);
    await user.click(screen.getAllByRole("switch")[0]);
    expect(mockAction).toHaveBeenCalledWith({ shareDiaryWithTherapist: true });
  });

  it("rolls back when the action throws", async () => {
    mockAction.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<PrivacyCard initial={baseSettings()} />);
    const sw = screen.getAllByRole("switch")[0];
    await user.click(sw);
    // Optimistic flip then rollback
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("shows the educational E2E footer", () => {
    render(<PrivacyCard initial={baseSettings()} />);
    expect(
      screen.getByText(/cifrado E2E/i, { collapseWhitespace: true } as never),
    ).toBeInTheDocument();
  });
});

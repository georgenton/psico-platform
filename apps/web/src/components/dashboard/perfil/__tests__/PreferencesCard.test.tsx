import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserPreferences } from "@psico/types";
import { PreferencesCard } from "../PreferencesCard";

const mockAction = vi.fn();
vi.mock("@/app/dashboard/perfil/actions", () => ({
  updatePreferencesAction: (...args: unknown[]) => mockAction(...args),
  updatePrivacyAction: vi.fn(),
}));

beforeEach(() => {
  mockAction.mockReset();
});

function basePrefs(): UserPreferences {
  return {
    voicePreference: "marina",
    moodPrompts: true,
    bestTime: "morning",
    weeklyGoalMinutes: 60,
    theme: "system",
    language: "es-419",
  };
}

describe("PreferencesCard", () => {
  it("renders summary row labels when not editing", () => {
    render(<PreferencesCard initial={basePrefs()} />);
    expect(screen.getByText("Voz")).toBeInTheDocument();
    expect(screen.getByText(/Marina/)).toBeInTheDocument();
    expect(screen.getByText("Tema")).toBeInTheDocument();
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByText("Mejor horario")).toBeInTheDocument();
    expect(screen.getByText(/60 min\/sem/)).toBeInTheDocument();
  });

  it("switches to edit mode when 'Editar' is clicked", async () => {
    const user = userEvent.setup();
    render(<PreferencesCard initial={basePrefs()} />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    // Form is visible now
    expect(screen.getByRole("button", { name: /Guardar/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cancelar/i }),
    ).toBeInTheDocument();
  });

  it("calls updatePreferencesAction with the draft values on save", async () => {
    mockAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PreferencesCard initial={basePrefs()} />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    // Click theme=Oscuro
    await user.click(screen.getByRole("button", { name: "Oscuro" }));
    await user.click(screen.getByRole("button", { name: /Guardar/i }));
    expect(mockAction).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "dark" }),
    );
  });

  it("cancel restores initial state without firing the action", async () => {
    const user = userEvent.setup();
    render(<PreferencesCard initial={basePrefs()} />);
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await user.click(screen.getByRole("button", { name: "Oscuro" }));
    await user.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(mockAction).not.toHaveBeenCalled();
    // Back to view mode
    expect(screen.getByText(/Sistema/i)).toBeInTheDocument();
  });
});

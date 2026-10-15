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
    ambient: "calma",
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
    expect(
      screen.getByRole("button", { name: /Guardar/i }),
    ).toBeInTheDocument();
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

/**
 * La voz dice lo que hace, en los dos sitios donde se ve.
 *
 * El expediente lo registra como pendiente demostrado: «tarjeta de voz de
 * perfil sin consumidor real». La respuesta correcta no es retirar la
 * preferencia —está en el modelo y persiste— ni inventarle un consumidor,
 * sino decirlo junto a la elección.
 *
 * Una versión anterior de este trinquete recorría el árbol buscando el
 * literal `voicePreference` y dejaba de exigir el aviso en cuanto encontraba
 * una mención. Eso no demuestra nada: una mención no es un consumidor
 * funcional, y un comentario bastaba para apagar la comprobación. Se sustituye
 * por lo que de verdad importa — que el aviso esté donde la persona mira — y
 * por que decirlo no haya tocado el guardado.
 *
 * El día que la narración use la preferencia, esto se actualiza junto con el
 * comportamiento y el texto. No es algo que un analizador deba adivinar.
 */
describe("la voz dice lo que de verdad hace", () => {
  const AVISO = /por ahora no cambia el audio/i;

  it("lo advierte en el resumen, que es lo que casi todo el mundo mira", () => {
    render(<PreferencesCard initial={basePrefs()} />);
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it("y también al editar, junto al selector", async () => {
    const user = userEvent.setup();
    render(<PreferencesCard initial={basePrefs()} />);
    await user.click(screen.getByRole("button", { name: /editar/i }));

    expect(screen.getByLabelText(/voz de la app/i)).toBeInTheDocument();
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it("no afirma nada sobre el resto del producto", () => {
    // Decir «no hay narración en la app» sería un inventario que nadie hizo.
    render(<PreferencesCard initial={basePrefs()} />);
    const texto = screen.getByText(AVISO).textContent ?? "";
    expect(texto).not.toMatch(/narraci[oó]n/i);
    expect(texto).not.toMatch(/en la app/i);
  });

  it("decirlo no cambió el guardado de la preferencia", async () => {
    const user = userEvent.setup();
    mockAction.mockResolvedValue({ ok: true });
    render(<PreferencesCard initial={basePrefs()} />);

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await user.selectOptions(screen.getByLabelText(/voz de la app/i), "tomas");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(mockAction).toHaveBeenCalledTimes(1);
    const enviado = mockAction.mock.calls[0]?.[0] as {
      voicePreference?: string;
    };
    expect(enviado.voicePreference).toBe("tomas");
  });
});

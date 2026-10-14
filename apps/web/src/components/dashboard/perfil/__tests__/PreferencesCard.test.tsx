import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
 * La voz se ofrece, se guarda… y hoy no la consume nadie.
 *
 * El expediente lo registra como pendiente demostrado: «tarjeta de voz de
 * perfil sin consumidor real». La respuesta correcta no es retirar la
 * preferencia —está en el modelo y persiste— ni inventarle un consumidor para
 * justificarla, sino decir la verdad junto a la elección.
 *
 * Este trinquete ata las dos cosas. Mientras NINGUNA superficie lea
 * `voicePreference`, la nota tiene que estar. El día que exista un consumidor
 * real, este test deja de exigirla — y hasta ese día, quitarla falla.
 */
describe("la voz dice lo que de verdad hace", () => {
  /** Consumidores reales: quien LEE la preferencia para cambiar algo. */
  const consumidores = () => {
    const raiz = join(__dirname, "..", "..", "..", "..");
    const encontrados: string[] = [];
    const visitar = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === "__tests__") continue;
          visitar(ruta);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (/\.test\.|\.spec\./.test(e.name)) continue;
        // Guardarla y volver a mostrarla no es consumirla: el Perfil y el
        // onboarding son las superficies que la EDITAN.
        const rel = ruta.slice(raiz.length);
        if (rel.includes("/perfil/") || rel.includes("/onboarding/")) continue;
        if (readFileSync(ruta, "utf8").includes("voicePreference")) {
          encontrados.push(rel);
        }
      }
    };
    visitar(raiz);
    return encontrados;
  };

  it("mientras nadie la consuma, la pantalla lo advierte", () => {
    const reales = consumidores().filter(
      // `book-access.ts` sólo la menciona en un comentario sobre el contrato
      // de la API; no cambia nada con ella.
      (f) => !f.includes("book-access"),
    );
    if (reales.length > 0) {
      // Hay consumidor: la limitación dejó de ser cierta y la nota sobra.
      // Este test no exige nada más; actualízalo junto con la tarjeta.
      expect(reales.length).toBeGreaterThan(0);
      return;
    }
    render(<PreferencesCard initial={basePrefs()} />);
    expect(
      screen.getByText(/todav[ií]a no hay narraci[oó]n/i),
    ).toBeInTheDocument();
  });
});

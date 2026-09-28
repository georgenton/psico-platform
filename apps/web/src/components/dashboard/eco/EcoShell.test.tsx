import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EcoPersona } from "@psico/types";
import { MASTER_KEY_LEN } from "@psico/crypto";
import { EcoShell } from "./EcoShell";
import * as diaryKeyContext from "@/lib/crypto/diary-key-context";

const PERSONA: EcoPersona = {
  name: "Eco",
  voice: "Companion conversacional",
  caps: [],
};

/**
 * EcoShell tests — Sprint G4.
 *
 * EcoShell decides between three states based on `useDiaryKey()`:
 *   - LegacyFallback when the account predates the E2E rollout.
 *   - An inline UnlockGate (Eco-framed) when the user hasn't unlocked yet —
 *     they unlock in place and stay in Eco, no detour to Diario.
 *   - The actual chat layout when the ecoKey is available.
 *
 * We mock the context (not the children — ChatArea/ThreadRail) and assert
 * each branch surfaces the right copy. The chat layout itself triggers
 * fetches we don't drive here; those are covered in component tests of
 * ChatArea / ThreadRail if/when those land.
 */
describe("EcoShell", () => {
  function mockDiaryKey(
    overrides: Partial<ReturnType<typeof diaryKeyContext.useDiaryKey>> = {},
  ) {
    vi.spyOn(diaryKeyContext, "useDiaryKey").mockReturnValue({
      key: null,
      ecoKey: null,
      masterKey: null,
      isLegacyAccount: false,
      remember: true,
      unlocking: false,
      restoring: false,
      error: null,
      unlock: vi.fn(),
      lock: vi.fn(),
      adoptMasterKey: vi.fn(),
      setRemember: vi.fn(),
      ...overrides,
    });
  }

  it("renders the legacy fallback when the account is pre-E2E", () => {
    mockDiaryKey({ isLegacyAccount: true });
    render(
      <EcoShell
        caps={PERSONA}
        initialRail={[]}
        apiBase="http://api.test"
        token="t"
      />,
    );
    expect(
      screen.getByText(
        /Tu cuenta aún no tiene activada la protección de privacidad/i,
      ),
    ).toBeInTheDocument();
  });

  it("renders an inline Eco-framed unlock gate when ecoKey is null", () => {
    mockDiaryKey();
    render(
      <EcoShell
        caps={PERSONA}
        initialRail={[]}
        apiBase="http://api.test"
        token="t"
      />,
    );
    // Unlock happens in place — Eco-framed copy, no "go to Diario" detour.
    expect(screen.getByText(/Desbloquea Eco/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Ir a Diario/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the eco-layout grid (with rail + disclaimer) when ecoKey is unlocked", () => {
    mockDiaryKey({
      // Las subclaves miden 32; la maestra, 16 (`MASTER_KEY_LEN`, ADR 0007 §G v2).
      // Aquí las tres decían 32 — inofensivo, porque es un doble y nadie valida
      // su longitud, pero repetía justo el número que causó #740.
      key: new Uint8Array(32),
      ecoKey: new Uint8Array(32),
      masterKey: new Uint8Array(MASTER_KEY_LEN),
    });
    const { container } = render(
      <EcoShell
        caps={PERSONA}
        initialRail={[
          {
            id: "t1",
            titleCiphertext: "ct",
            titleNonce: "nn",
            lastMessageAt: new Date("2026-06-21T12:00:00Z"),
            messageCount: 3,
          },
        ]}
        apiBase="http://api.test"
        token="t"
      />,
    );
    // .eco-layout grid present
    expect(container.querySelector(".eco-layout")).not.toBeNull();
    // Disclaimer rendered at the bottom of the rail
    expect(
      screen.getByText(
        /Eco es un acompañante de autoconocimiento — complementa, no reemplaza/i,
      ),
    ).toBeInTheDocument();
  });

  /**
   * #732 — el contrato de títulos de `/dashboard/eco`.
   *
   * Antes de este arreglo la pantalla tenía CERO `<h1>` en sus cuatro estados:
   * bloqueada sólo mostraba la reja (con su propio h2), sin hilo sólo la
   * tarjeta vacía, y con conversación el título «Eco» era un `<p>`.
   *
   * El contrato ahora: exactamente un `<h1>` visible que diga «Eco», en todos.
   * Cuando hay conversación lo da el título del propio chat, que pasa a `<h1>`
   * por prop; cuando no la hay, la cabecera nativa del panel. Nunca los dos, y
   * nunca uno oculto para el lector de pantalla.
   */
  describe("#732 · el título de la pantalla", () => {
    const estados = [
      ["bloqueada", { ecoKey: null }],
      ["cuenta legada", { isLegacyAccount: true }],
      [
        "desbloqueada sin hilo",
        { ecoKey: new Uint8Array(32).fill(7), key: new Uint8Array(32).fill(7) },
      ],
    ] as const;

    for (const [nombre, override] of estados) {
      it(`${nombre}: exactamente un h1 visible que dice «Eco»`, () => {
        mockDiaryKey(override as Parameters<typeof mockDiaryKey>[0]);
        render(
          <EcoShell
            caps={PERSONA}
            initialRail={[]}
            apiBase="http://api.test"
            token="t"
          />,
        );
        const h1s = screen.getAllByRole("heading", { level: 1 });
        expect(h1s).toHaveLength(1);
        expect(h1s[0]).toHaveTextContent("Eco");
        // Visible, no `sr-only`: el título que se anuncia es el que se ve.
        expect(h1s[0].className).not.toMatch(/sr-only/);
      });
    }

    it("bloqueada: la reja queda por debajo, en h2", () => {
      // Su nivel ya venía del caller antes de #732 — es el precedente de la
      // política. Lo que cambia es que ahora hay un h1 encima del que colgar.
      mockDiaryKey({ ecoKey: null });
      render(
        <EcoShell
          caps={PERSONA}
          initialRail={[]}
          apiBase="http://api.test"
          token="t"
        />,
      );
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(
        screen.getAllByRole("heading", { level: 2 }).length,
      ).toBeGreaterThan(0);
    });
  });
});

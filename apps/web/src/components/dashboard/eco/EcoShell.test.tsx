import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EcoPersona } from "@psico/types";
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
 *   - LockedFallback when the user hasn't unlocked the diary.
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

  it("renders the locked fallback with a Diario CTA when ecoKey is null", () => {
    mockDiaryKey();
    render(
      <EcoShell
        caps={PERSONA}
        initialRail={[]}
        apiBase="http://api.test"
        token="t"
      />,
    );
    expect(
      screen.getByText(/Desbloquea tu diario primero/i),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Ir a Diario/i });
    expect(cta.getAttribute("href")).toBe("/dashboard/reflexiones");
  });

  it("renders the eco-layout grid (with rail + disclaimer) when ecoKey is unlocked", () => {
    mockDiaryKey({
      key: new Uint8Array(32),
      ecoKey: new Uint8Array(32),
      masterKey: new Uint8Array(32),
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
});

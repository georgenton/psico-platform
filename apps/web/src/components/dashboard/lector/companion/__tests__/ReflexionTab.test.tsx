import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReflexionTab } from "../ReflexionTab";

// Bypass crypto: encryptString returns predictable ciphertext/nonce.
vi.mock("@psico/crypto", () => ({
  encryptString: (text: string) => ({
    ciphertext: `cipher:${text}`,
    nonce: "nonce:fixed",
  }),
}));

// Unlocked, non-legacy diary key so the composer renders directly.
vi.mock("@/lib/crypto/diary-key-context", () => ({
  useDiaryKey: () => ({ key: new Uint8Array(32), isLegacyAccount: false }),
}));

// Consent OFF → the on-device text-features fetch is skipped; the only fetch we
// assert on is the POST /reflexiones/entries.
vi.mock("@/lib/text-analysis-consent", () => ({
  textAnalysisConsent: () => Promise.resolve(false),
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ id: "entry-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
});

function renderTab() {
  render(
    <ReflexionTab
      apiBase="https://api.test/api"
      token="tok"
      seed={null}
      onSeedConsumed={vi.fn()}
    />,
  );
}

// The mood chip's accessible name is "<emoji> <label>", and "Muy bien" (great)
// contains "Bien" (good) — so match "Bien" while excluding "Muy bien".
const goodChip = {
  name: (n: string) => n.includes("Bien") && !n.includes("Muy bien"),
};

describe("ReflexionTab · mood reset on save (PR-2B, Test B)", () => {
  it("B: after a save, 'Escribir otra' returns a composer with NO chip selected — the next save omits mood + moodSelectionVersion", async () => {
    const user = userEvent.setup();
    renderTab();

    // First reflexión — pick `good`, write, save.
    await user.click(screen.getByRole("button", goodChip));
    // The "no mood" hint is gone once a chip is picked.
    expect(screen.queryByText(/Sin ánimo registrado/i)).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox"),
      "Este pasaje me removió algo.",
    );
    await user.click(
      screen.getByRole("button", { name: /Guardar reflexión/i }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const first = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(first.mood).toBe("good");
    expect(first.moodSelectionVersion).toBe("explicit-v1");

    // Saved view — honest copy, no "sumó a tu Mapa Emocional".
    await waitFor(() =>
      expect(screen.getByText(/Guardado en tu diario/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/quedó cifrada y guardada en tu diario/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Mapa Emocional/i)).not.toBeInTheDocument();

    // "Escribir otra" returns to the composer.
    await user.click(screen.getByRole("button", { name: /Escribir otra/i }));

    // No chip is selected and the "no mood" hint is back — mood was reset.
    await waitFor(() =>
      expect(screen.getByText(/Sin ánimo registrado/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", goodChip)).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Second reflexión — DON'T touch the mood. Write + save.
    await user.type(screen.getByRole("textbox"), "Otra reflexión, sin ánimo.");
    await user.click(
      screen.getByRole("button", { name: /Guardar reflexión/i }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const second = JSON.parse(
      (fetchSpy.mock.calls[1]![1] as RequestInit).body as string,
    );
    // The prior `good` must NOT leak into the second payload.
    expect(second.mood).toBeUndefined();
    expect(second.moodSelectionVersion).toBeUndefined();
    expect(second.textCiphertext).toContain("cipher:Otra reflexión");
  });
});

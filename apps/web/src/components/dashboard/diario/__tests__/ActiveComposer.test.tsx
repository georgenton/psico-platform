import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveComposer } from "../ActiveComposer";

// Bypass crypto: encryptString returns predictable ciphertext/nonce.
vi.mock("@psico/crypto", () => ({
  encryptString: (text: string) => ({
    ciphertext: `cipher:${text}`,
    nonce: "nonce:fixed",
  }),
}));

// Force an unlocked diary key so handleSubmit proceeds.
vi.mock("@/lib/crypto/diary-key-context", () => ({
  useDiaryKey: () => ({ key: new Uint8Array(32), lock: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// No voice handoff to pre-fill the composer.
vi.mock("@/lib/voice/handoff", () => ({
  consumeVoiceHandoff: () => null,
}));

// Consent OFF so the second fetch (on-device text features) is skipped —
// the only fetch we assert on is the POST /reflexiones/entries.
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

function renderComposer() {
  render(
    <ActiveComposer prompt={null} apiBase="https://api.test/api" token="tok" />,
  );
}

async function submittedBody() {
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  const [url, init] = fetchSpy.mock.calls[0];
  expect(url).toBe("https://api.test/api/reflexiones/entries");
  expect((init as RequestInit).method).toBe("POST");
  return JSON.parse(((init as RequestInit).body as string) ?? "{}");
}

describe("ActiveComposer · mood (PR-2B null-capable)", () => {
  it("has no mood highlighted initially", () => {
    renderComposer();
    // No chip is pressed and the "no mood" hint is legible.
    expect(screen.getByRole("button", { name: /Neutral/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText(/Sin ánimo registrado/i)).toBeInTheDocument();
  });

  it("omits mood + moodSelectionVersion when saved without a pick", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.type(screen.getByRole("textbox"), "Hoy llegué cansado.");
    await user.click(screen.getByRole("button", { name: /Guardar entrada/i }));
    const body = await submittedBody();
    expect(body.mood).toBeUndefined();
    expect(body.moodSelectionVersion).toBeUndefined();
    expect(body.textCiphertext).toContain("cipher:Hoy llegué cansado.");
    expect(body.textNonce).toBe("nonce:fixed");
  });

  it("sends mood + moodSelectionVersion:'explicit-v1' after tapping a chip", async () => {
    const user = userEvent.setup();
    renderComposer();
    // "Bajo" is the unique label for the `low` mood.
    await user.click(screen.getByRole("button", { name: /Bajo/i }));
    // Tapping a chip clears the "no mood" hint.
    expect(screen.queryByText(/Sin ánimo registrado/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "Un día difícil.");
    await user.click(screen.getByRole("button", { name: /Guardar entrada/i }));
    const body = await submittedBody();
    expect(body.mood).toBe("low");
    expect(body.moodSelectionVersion).toBe("explicit-v1");
  });

  // Test A (sequential): a successful save must RESET the mood to null so the
  // previous pick never becomes a silent explicit selection for the next entry.
  it("A: resets mood after a successful save — a second entry with no fresh pick omits mood + moodSelectionVersion", async () => {
    const user = userEvent.setup();
    renderComposer();

    // First entry — pick `low`, write, save.
    await user.click(screen.getByRole("button", { name: /Bajo/i }));
    await user.type(screen.getByRole("textbox"), "Un día difícil.");
    await user.click(screen.getByRole("button", { name: /Guardar entrada/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const first = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(first.mood).toBe("low");
    expect(first.moodSelectionVersion).toBe("explicit-v1");

    // The composer stays mounted; after the save the chip must be deselected
    // and the "no mood" hint must be back — the mood reset happened.
    await waitFor(() =>
      expect(screen.getByText(/Sin ánimo registrado/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Bajo/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Second entry — DON'T touch the mood. Write + save.
    await user.type(screen.getByRole("textbox"), "Hoy mejor.");
    await user.click(screen.getByRole("button", { name: /Guardar entrada/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const second = JSON.parse(
      (fetchSpy.mock.calls[1]![1] as RequestInit).body as string,
    );
    // The prior `low` must NOT leak into the second payload.
    expect(second.mood).toBeUndefined();
    expect(second.moodSelectionVersion).toBeUndefined();
    expect(second.textCiphertext).toContain("cipher:Hoy mejor.");
  });
});

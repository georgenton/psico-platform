import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SeedPhraseModal } from "./SeedPhraseModal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// A deterministic 16-byte master key → a valid 12-word BIP39 phrase.
const MASTER_KEY = new Uint8Array(16).fill(0x11);

describe("SeedPhraseModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders exactly 12 numbered words (no 24-word wall)", () => {
    render(
      <SeedPhraseModal
        masterKey={MASTER_KEY}
        apiBase="http://api.test"
        token="t"
        onAcknowledged={vi.fn()}
      />,
    );
    // The header mentions "12 palabras".
    expect(screen.getByText(/estas 12 palabras/i)).toBeInTheDocument();
    // Numbered positions 1..12 exist, but not 13.
    expect(screen.getByText("12.")).toBeInTheDocument();
    expect(screen.queryByText("13.")).not.toBeInTheDocument();
  });

  it("has no re-type quiz — just a save checkbox + Continuar", () => {
    render(
      <SeedPhraseModal
        masterKey={MASTER_KEY}
        apiBase="http://api.test"
        token="t"
        onAcknowledged={vi.fn()}
      />,
    );
    // No "Palabra #" quiz inputs.
    expect(screen.queryByText(/Palabra #/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Ya las guardé en un lugar seguro/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeDisabled();
  });

  it("enables Continuar only after the checkbox, then POSTs the ack", async () => {
    const onAck = vi.fn();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    render(
      <SeedPhraseModal
        masterKey={MASTER_KEY}
        apiBase="http://api.test"
        token="tok"
        onAcknowledged={onAck}
      />,
    );

    const continueBtn = screen.getByRole("button", { name: /Continuar/i });
    expect(continueBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(continueBtn).toBeEnabled();

    fireEvent.click(continueBtn);

    await waitFor(() => expect(onAck).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://api.test/user/crypto-seed-acknowledged",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an inline error if the ack POST fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    render(
      <SeedPhraseModal
        masterKey={MASTER_KEY}
        apiBase="http://api.test"
        token="tok"
        onAcknowledged={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    expect(
      await screen.findByText(/No pudimos guardar la confirmación/i),
    ).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DiaryDetailResponse } from "@psico/types";
import { EntryDetailView } from "../EntryDetailView";

// Bypass crypto: decryptString returns the cipher unchanged, encryptString
// returns predictable ciphertext/nonce we can assert on.
vi.mock("@psico/crypto", () => ({
  decryptString: (cipher: { ciphertext: string }) => cipher.ciphertext,
  encryptString: (text: string) => ({
    ciphertext: `cipher:${text}`,
    nonce: "nonce:fixed",
  }),
}));

// Force the context to return a key so the editor renders directly.
vi.mock("@/lib/crypto/diary-key-context", () => ({
  DiaryKeyProvider: ({ children }: { children: React.ReactNode }) => children,
  useDiaryKey: () => ({ key: new Uint8Array(32), ecoKey: null }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

function makeDetail(
  overrides: Partial<DiaryDetailResponse["entry"]> = {},
): DiaryDetailResponse {
  return {
    entry: {
      id: "entry-1",
      createdAt: new Date(Date.UTC(2026, 5, 1, 12, 0, 0)),
      updatedAt: new Date(Date.UTC(2026, 5, 1, 12, 0, 0)),
      mood: "ok",
      kind: "free",
      promptId: null,
      promptText: null,
      tags: ["sentimientos", "trabajo"],
      excerptCiphertext: "EXC_OLD",
      excerptNonce: "N_OLD",
      audioUrl: null,
      audioDurationSec: null,
      textCiphertext: "Texto desencriptado de prueba",
      textNonce: "N_BODY",
      ...overrides,
    },
    relatedEntryIds: [],
  };
}

function renderDetail(detail = makeDetail()) {
  render(
    <EntryDetailView
      detail={detail}
      cryptoSalt="salt"
      apiBase="https://api.test/api"
      token="tok"
    />,
  );
}

describe("EntryDetailView · edit mode", () => {
  it("renders body in read mode initially", () => {
    renderDetail();
    expect(
      screen.getByText(/Texto desencriptado de prueba/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: /mood/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the editor with mood + tags selectors when 'Editar' is clicked", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    expect(
      screen.getByRole("radiogroup", { name: /mood/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Añadir etiqueta/i)).toBeInTheDocument();
    // Pre-existing tags show up as chips
    expect(screen.getByText("#sentimientos")).toBeInTheDocument();
    expect(screen.getByText("#trabajo")).toBeInTheDocument();
  });

  it("commits a new tag on Enter", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    const input = screen.getByLabelText(/Añadir etiqueta/i);
    await user.type(input, "ansiedad{Enter}");
    expect(screen.getByText("#ansiedad")).toBeInTheDocument();
  });

  it("removes a tag when its × button is clicked", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await user.click(screen.getByRole("button", { name: /Quitar trabajo/i }));
    expect(screen.queryByText("#trabajo")).not.toBeInTheDocument();
  });

  it("sends mood + tags + cipher on save when both changed", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    // Change mood
    await user.click(screen.getByRole("radio", { name: "Bien" }));
    // Add tag
    await user.type(
      screen.getByLabelText(/Añadir etiqueta/i),
      "claridad{Enter}",
    );
    await user.click(screen.getByRole("button", { name: /Guardar cambios/i }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.test/api/reflexiones/entries/entry-1");
    expect((init as RequestInit).method).toBe("PATCH");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body.mood).toBe("good");
    // PR-2B: an explicit pick carries the versioned attestation.
    expect(body.moodSelectionVersion).toBe("explicit-v1");
    expect(body.tags).toEqual(["sentimientos", "trabajo", "claridad"]);
    expect(body.textCiphertext).toContain("cipher:Texto desencriptado");
    expect(body.textNonce).toBe("nonce:fixed");
  });

  it("omits mood and tags when neither changed", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    // Just save without touching mood/tags
    await user.click(screen.getByRole("button", { name: /Guardar cambios/i }));
    const body = JSON.parse(
      ((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string) ?? "{}",
    );
    expect(body.mood).toBeUndefined();
    expect(body.moodSelectionVersion).toBeUndefined();
    expect(body.tags).toBeUndefined();
    expect(body.textCiphertext).toBeDefined();
  });

  it("renders 'Sin ánimo registrado' for a null-mood entry (never a fabricated mood)", () => {
    // PR-2B: a reflexión saved without an explicit pick has mood = null.
    renderDetail(makeDetail({ mood: null }));
    expect(screen.getByText(/Sin ánimo registrado/i)).toBeInTheDocument();
    // The default fixture mood ("ok" → "Ok") must NOT be fabricated.
    expect(screen.queryByText("Ok")).not.toBeInTheDocument();
  });

  it("dedupes a tag that already exists", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    const input = screen.getByLabelText(/Añadir etiqueta/i);
    await user.type(input, "trabajo{Enter}");
    // Only one #trabajo chip remains
    expect(screen.getAllByText("#trabajo")).toHaveLength(1);
  });

  it("normalizes a tag input by stripping leading # and lowercasing", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await user.type(screen.getByLabelText(/Añadir etiqueta/i), "#FOCO{Enter}");
    expect(screen.getByText("#foco")).toBeInTheDocument();
  });

  it("commits a tag on comma keypress", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Editar/i }));
    await user.type(screen.getByLabelText(/Añadir etiqueta/i), "claridad,");
    expect(screen.getByText("#claridad")).toBeInTheDocument();
  });
});

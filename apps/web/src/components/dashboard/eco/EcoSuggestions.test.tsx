import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EcoSuggestion } from "@psico/types";
import { EcoSuggestions } from "./EcoSuggestions";

const SUGGESTIONS: EcoSuggestion[] = [
  {
    id: "continue-chapter",
    title: "Sigue tu lectura",
    prompt: "Estoy leyendo y me quedé pensando…",
    reason: "Vas por “Cómo aprendiste a sentir”",
    scope: { bookSlug: "emociones-en-construccion", chapterOrder: 2 },
  },
  {
    id: "mood-supportive",
    title: "Estoy aquí",
    prompt: "Hoy no ha sido un día fácil…",
    reason: "Marcaste un día difícil",
    scope: null,
  },
];

function mockFetchOnce(suggestions: EcoSuggestion[]) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ suggestions }),
  } as Response);
}

describe("EcoSuggestions (web)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("fetches with the bearer token and renders a chip per suggestion", async () => {
    const spy = mockFetchOnce(SUGGESTIONS);
    render(<EcoSuggestions apiBase="/api" token="tok-1" onPick={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("Sigue tu lectura")).toBeInTheDocument(),
    );
    expect(screen.getByText("Estoy aquí")).toBeInTheDocument();
    expect(screen.getByText(/Vas por/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith("/api/eco/suggestions", {
      headers: { Authorization: "Bearer tok-1" },
    });
  });

  it("calls onPick with the full suggestion (scope included) when tapped", async () => {
    mockFetchOnce(SUGGESTIONS);
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<EcoSuggestions apiBase="/api" token="t" onPick={onPick} />);
    await waitFor(() =>
      expect(screen.getByText("Sigue tu lectura")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Sigue tu lectura"));
    expect(onPick).toHaveBeenCalledWith(SUGGESTIONS[0]);
  });

  it("renders nothing when the endpoint returns no suggestions", async () => {
    mockFetchOnce([]);
    const { container } = render(
      <EcoSuggestions apiBase="/api" token="t" onPick={vi.fn()} />,
    );
    // Give the effect a tick; the strip stays empty.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("hides silently on a fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const { container } = render(
      <EcoSuggestions apiBase="/api" token="t" onPick={vi.fn()} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

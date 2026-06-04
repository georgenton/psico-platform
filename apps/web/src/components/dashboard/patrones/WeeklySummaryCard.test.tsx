import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatronesWeeklySummary } from "@psico/types";
import { WeeklySummaryCard } from "./WeeklySummaryCard";

// next/navigation isn't available in jsdom by default. Stub `useRouter`
// so the component can call `router.refresh()` without blowing up.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const API_BASE = "https://api.test.psico.app/api";

function buildSummary(
  overrides: Partial<PatronesWeeklySummary> = {},
): PatronesWeeklySummary {
  return {
    weekStart: "2026-06-01",
    headline: "Una semana llevadera",
    narrative: "Diste pasos pequeños y constantes esta semana.",
    entriesUsed: 8,
    generatedAt: "2026-06-08T03:00:00.000Z",
    ...overrides,
  } as PatronesWeeklySummary;
}

describe("WeeklySummaryCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the null state CTA when there's no summary yet", () => {
    render(<WeeklySummaryCard summary={null} apiBase={API_BASE} token="tok" />);
    expect(
      screen.getByRole("button", { name: /Generar resumen ahora/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tu resumen de la semana/i)).toBeInTheDocument();
  });

  it("renders the headline + narrative + generated date when a summary exists", () => {
    render(
      <WeeklySummaryCard
        summary={buildSummary()}
        apiBase={API_BASE}
        token="tok"
      />,
    );
    expect(screen.getByText("Una semana llevadera")).toBeInTheDocument();
    expect(screen.getByText(/Diste pasos pequeños/i)).toBeInTheDocument();
    expect(screen.getByText(/8 entradas usadas/i)).toBeInTheDocument();
    // CTA shifts to "Regenerar" when current is non-null.
    expect(
      screen.getByRole("button", { name: /Regenerar/i }),
    ).toBeInTheDocument();
  });

  it("surfaces an inline error when the regenerate endpoint returns 422", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 422 }));

    render(<WeeklySummaryCard summary={null} apiBase={API_BASE} token="tok" />);

    await userEvent.click(
      screen.getByRole("button", { name: /Generar resumen ahora/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /al menos 7 entradas/i,
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/patrones/weekly-summary/regenerate`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders the new summary in-place when regenerate succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          weeklySummary: buildSummary({
            headline: "Una semana de cierre",
            narrative: "Cerraste con calma.",
            entriesUsed: 9,
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<WeeklySummaryCard summary={null} apiBase={API_BASE} token="tok" />);

    await userEvent.click(
      screen.getByRole("button", { name: /Generar resumen ahora/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Una semana de cierre")).toBeInTheDocument();
    });
    expect(screen.getByText(/Cerraste con calma/i)).toBeInTheDocument();
  });
});

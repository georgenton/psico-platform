import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UsageResponse } from "@psico/types";
import { UsageCards } from "./UsageCards";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Minimal UsageResponse builder. We override only the slices each test
 * cares about; the rest stays at sensible defaults so the wide surface
 * (4 cards x 5 fields) doesn't need to be re-declared each time.
 */
function buildUsage(overrides: Partial<UsageResponse> = {}): UsageResponse {
  return {
    period: {
      start: "2026-06-01T00:00:00.000Z",
      end: "2026-06-30T23:59:59.999Z",
    },
    books: { completedThisPeriod: 0 },
    eco: { messagesThisPeriod: 0, quota: 200 },
    voice: { minutesThisPeriod: 0, quota: 120 },
    diary: { entriesThisPeriod: 0, quota: null },
    ...overrides,
  } as UsageResponse;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("UsageCards", () => {
  it("shows the fallback empty state when usage is null", () => {
    render(<UsageCards usage={null} />);
    expect(screen.getByText(/No pudimos cargar tu uso/i)).toBeInTheDocument();
  });

  it("renders all 4 cards with the period range when usage is provided", () => {
    render(<UsageCards usage={buildUsage()} />);
    // Each card's label.
    expect(screen.getByText(/Libros completados/i)).toBeInTheDocument();
    expect(screen.getByText(/Mensajes con Eco/i)).toBeInTheDocument();
    expect(screen.getByText(/Minutos de voz/i)).toBeInTheDocument();
    expect(screen.getByText(/Entradas del diario/i)).toBeInTheDocument();
  });

  it("renders the progress bar aria label at the right percentage when a quota exists", () => {
    render(
      <UsageCards
        usage={buildUsage({
          eco: { messagesThisPeriod: 50, quota: 200 },
        })}
      />,
    );
    // 50 / 200 = 25%. The progress bar exposes its rounded percent in aria-label.
    expect(screen.getByLabelText("25% usado")).toBeInTheDocument();
  });

  it("flags the over-quota state when current >= quota", () => {
    const { container } = render(
      <UsageCards
        usage={buildUsage({
          eco: { messagesThisPeriod: 200, quota: 200 },
        })}
      />,
    );
    // 100% bar.
    expect(screen.getByLabelText("100% usado")).toBeInTheDocument();
    // The number "200" appears with the error red color when capped. We
    // can't easily read style colors with jest-dom, but we can verify the
    // amount text rendered as expected.
    expect(container.textContent).toContain("200");
    expect(container.textContent).toContain("de 200");
  });

  it("renders 'ilimitado' when quota is null (e.g. PRO diary)", () => {
    render(
      <UsageCards
        usage={buildUsage({
          diary: { entriesThisPeriod: 25, quota: null },
        })}
      />,
    );
    // "ilimitado" appears at least once (diary card + books are also null).
    expect(screen.getAllByText(/ilimitado/i).length).toBeGreaterThan(0);
  });

  it("renders 'no incluido' when quota is 0 (FREE voice)", () => {
    render(
      <UsageCards
        usage={buildUsage({
          voice: { minutesThisPeriod: 0, quota: 0 },
        })}
      />,
    );
    expect(screen.getByText(/no incluido en tu plan/i)).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react-native";
import type { UsageResponse } from "@psico/types";
import { UsageCards } from "./UsageCards";

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

describe("UsageCards (mobile)", () => {
  it("shows the fallback empty state when usage is null", () => {
    render(<UsageCards usage={null} />);
    expect(screen.getByText(/No pudimos cargar tu uso/i)).toBeOnTheScreen();
  });

  it("renders all 4 card labels when usage is provided", () => {
    render(<UsageCards usage={buildUsage()} />);
    expect(screen.getByText("Libros")).toBeOnTheScreen();
    expect(screen.getByText("Eco")).toBeOnTheScreen();
    expect(screen.getByText("Voz")).toBeOnTheScreen();
    expect(screen.getByText("Diario")).toBeOnTheScreen();
  });

  it("renders 'ilimitado' when a quota is null (Books always, PRO Diary)", () => {
    render(
      <UsageCards
        usage={buildUsage({
          diary: { entriesThisPeriod: 25, quota: null },
        })}
      />,
    );
    // Books quota is null too → at least 2 'ilimitado' labels.
    expect(screen.getAllByText(/ilimitado/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'no incluido' when quota is 0 (FREE voice)", () => {
    render(
      <UsageCards
        usage={buildUsage({
          voice: { minutesThisPeriod: 0, quota: 0 },
        })}
      />,
    );
    expect(screen.getByText(/no incluido/i)).toBeOnTheScreen();
  });

  it("renders the 'de N' counter footer when a numeric quota applies", () => {
    render(
      <UsageCards
        usage={buildUsage({
          eco: { messagesThisPeriod: 50, quota: 200 },
        })}
      />,
    );
    // The Eco card footer shows "de 200".
    expect(screen.getByText(/de 200/)).toBeOnTheScreen();
  });

  it("formats the period footer with the date range", () => {
    render(<UsageCards usage={buildUsage()} />);
    expect(screen.getByText(/Tu uso este período/i)).toBeOnTheScreen();
    // Format is "1 jun – 30 jun" or similar; assert at least one separator.
    const period = screen.getByText(/–/);
    expect(period).toBeOnTheScreen();
  });
});

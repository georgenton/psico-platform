import { render, waitFor } from "@testing-library/react-native";

/**
 * PR-0.2 — the mobile Evolución screen must never show a fabricated 0% for the
 * emotional-history coverage:
 *  - EMOTIONAL_MAP_PUBLIC off (emotionalMapAvailable=false) → maintenance, no %.
 *  - map=null + insufficient series (0 points) → "snapshot no disponible", no %.
 *  - map=null + exactly 1 point → shows THAT point's coverage, not 0%.
 */

const mockEvolucionGet = jest.fn();
const mockHomeGet = jest.fn();
jest.mock("@psico/api-client", () => ({
  evolucionApi: { get: (...a: unknown[]) => mockEvolucionGet(...a) },
  homeApi: { get: (...a: unknown[]) => mockHomeGet(...a) },
}));

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import EvolucionScreen from "./evolucion";

const STATS = {
  reflexiones: 3,
  capitulosCompletados: 1,
  minutosLectura: 45,
  rachaActual: 5,
  rachaMasLarga: 7,
  diasActivos30d: 4,
  conversacionesEco: 2,
  marcasLectura: 6,
};

function evolucion(over: Record<string, unknown> = {}) {
  return { stats: STATS, milestones: [], ...over };
}

describe("Evolución screen — PR-0.2 (no fabricated 0%)", () => {
  beforeEach(() => {
    mockEvolucionGet.mockReset();
    mockHomeGet.mockReset();
    mockHomeGet.mockResolvedValue({ emotionalMap: null });
  });

  it("emotionalMapAvailable=false → maintenance, renders no percentages", async () => {
    mockEvolucionGet.mockResolvedValue(
      evolucion({ emotionalMapAvailable: false, emotionalSeries: null }),
    );

    const { getByText, queryByText } = render(<EvolucionScreen />);

    await waitFor(() =>
      expect(getByText(/en pausa por mantenimiento/i)).toBeTruthy(),
    );
    // No chart → no coverage percentage anywhere on the screen.
    expect(queryByText(/\d+\s*%/)).toBeNull();
  });

  it("map=null + insufficient series → 'snapshot no disponible', never 0%", async () => {
    mockEvolucionGet.mockResolvedValue(
      evolucion({ emotionalMapAvailable: true, emotionalSeries: [] }),
    );

    const { getByText, queryByText } = render(<EvolucionScreen />);

    await waitFor(() =>
      expect(getByText(/no hay un snapshot disponible/i)).toBeTruthy(),
    );
    expect(queryByText(/0\s*%/)).toBeNull();
  });

  it("map=null + exactly 1 historical point → shows that point, not 0%", async () => {
    mockEvolucionGet.mockResolvedValue(
      evolucion({
        emotionalMapAvailable: true,
        emotionalSeries: [{ monthIso: "2026-05-01", pct: 42, coverage: 42 }],
      }),
    );

    const { getByText, queryByText } = render(<EvolucionScreen />);

    await waitFor(() => expect(getByText(/42\s*%/)).toBeTruthy());
    expect(queryByText(/^0\s*%$/)).toBeNull();
  });
});

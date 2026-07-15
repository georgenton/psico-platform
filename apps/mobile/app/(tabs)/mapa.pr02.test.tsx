import { render, waitFor } from "@testing-library/react-native";

/**
 * PR-0.2 — the mobile map screen shows a "temporarily unavailable" state (never
 * zeros, an empty radar, or "gathering data") when Home returns
 * `emotionalMap: null` — i.e. the EMOTIONAL_MAP_PUBLIC kill switch is off.
 */

const mockHomeGet = jest.fn();
jest.mock("@psico/api-client", () => ({
  homeApi: { get: (...a: unknown[]) => mockHomeGet(...a) },
  resonancesApi: { list: jest.fn(async () => ({ resonances: [] })) },
}));

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import MapaScreen from "./mapa";

// A Home payload whose emotionalMap is null (kill switch off).
function homeWithNullMap() {
  return {
    emotionalMap: null,
    // The screen only reads emotionalMap + resonances on this path.
  };
}

describe("Mapa screen — EMOTIONAL_MAP_PUBLIC off (PR-0.2)", () => {
  beforeEach(() => mockHomeGet.mockReset());

  it("renders the maintenance state, not a radar or 'gathering data'", async () => {
    mockHomeGet.mockResolvedValue(homeWithNullMap());

    const { getByText, queryByText } = render(<MapaScreen />);

    await waitFor(() =>
      expect(getByText(/en pausa por mantenimiento/i)).toBeTruthy(),
    );
    // Never the "no data" / gathering copy on this path.
    expect(queryByText(/Sin datos para mostrar/i)).toBeNull();
    expect(queryByText(/Reuniendo datos/i)).toBeNull();
  });
});

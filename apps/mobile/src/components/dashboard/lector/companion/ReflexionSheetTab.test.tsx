import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { ReflexionSheetTab } from "./ReflexionSheetTab";

// Predictable crypto — ciphertext echoes the plaintext.
jest.mock("@psico/crypto", () => ({
  encryptString: (text: string) => ({
    ciphertext: `cipher:${text}`,
    nonce: "nonce:fixed",
  }),
}));

// Unlocked, non-legacy diary key so the composer renders directly.
jest.mock("@/crypto/diary-key-context", () => ({
  useDiaryKey: () => ({ key: new Uint8Array(32), isLegacyAccount: false }),
}));

// Consent OFF → the on-device text-features upload is skipped.
jest.mock("@/lib/text-analysis-consent", () => ({
  textAnalysisConsent: () => Promise.resolve(false),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@psico/api-client", () => ({
  diarioApi: { create: jest.fn() },
  emotionalMapApi: { logTextFeatures: jest.fn() },
  resonancesApi: { confirm: jest.fn() },
}));

import { diarioApi } from "@psico/api-client";

const create = diarioApi.create as jest.Mock;

// The `good` mood label is "Bien" (capital B); `great` is "Muy bien"
// (lowercase b). A case-sensitive /Bien/ substring regex targets only `good`.
const goodChip = /Bien/;

describe("ReflexionSheetTab · mood reset on save (PR-2B, Test B parity)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({ id: "entry-1" });
  });

  it("B: after a save, 'Escribir otra' returns a composer with no mood — the next save omits mood + moodSelectionVersion", async () => {
    render(<ReflexionSheetTab seed={null} onSeedConsumed={jest.fn()} />);

    // First reflexión — pick `good`, write, save.
    fireEvent.press(screen.getByText(goodChip));
    fireEvent.changeText(
      screen.getByPlaceholderText(/Qué te movió/i),
      "Este pasaje me removió algo.",
    );
    fireEvent.press(screen.getByText(/Guardar reflexión/i));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const first = create.mock.calls[0]![0];
    expect(first.mood).toBe("good");
    expect(first.moodSelectionVersion).toBe("explicit-v1");

    // Saved view — honest copy, no "Mapa Emocional" claim.
    await waitFor(() =>
      expect(screen.getByText(/Guardado en tu diario/i)).toBeTruthy(),
    );
    expect(
      screen.getByText(/quedó cifrada y guardada en tu diario/i),
    ).toBeTruthy();
    expect(screen.queryByText(/Mapa Emocional/i)).toBeNull();

    // "Escribir otra" returns to the composer.
    fireEvent.press(screen.getByText(/Escribir otra/i));

    // Second reflexión — DON'T touch the mood. Write + save.
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Qué te movió/i)).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByPlaceholderText(/Qué te movió/i),
      "Otra reflexión, sin ánimo.",
    );
    fireEvent.press(screen.getByText(/Guardar reflexión/i));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const second = create.mock.calls[1]![0];
    // The prior `good` must NOT leak into the second payload.
    expect(second.mood).toBeUndefined();
    expect(second.moodSelectionVersion).toBeUndefined();
    expect(second.textCiphertext).toContain("cipher:Otra reflexión");
  });
});

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { ActiveDiarioBody } from "./index";

// Predictable crypto — ciphertext echoes the plaintext.
jest.mock("@psico/crypto", () => ({
  encryptString: (text: string) => ({
    ciphertext: `cipher:${text}`,
    nonce: "nonce:fixed",
  }),
  decryptString: (c: { ciphertext: string }) => c.ciphertext,
}));

// Unlocked diary key so the composer renders + handleSave proceeds.
jest.mock("@/crypto/diary-key-context", () => ({
  useDiaryKey: () => ({ key: new Uint8Array(32), lock: jest.fn() }),
}));

jest.mock("@/lib/text-analysis-consent", () => ({
  textAnalysisConsent: () => Promise.resolve(false),
}));

jest.mock("@/lib/voice/handoff", () => ({
  consumeVoiceHandoff: () => null,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  // No-op focus effect — we don't exercise the voice handoff here.
  useFocusEffect: () => undefined,
}));

// The screen module imports these at the top; ActiveDiarioBody doesn't render
// them, so trivial stubs keep their deep imports out of the test.
jest.mock("@/context/auth", () => ({ useAuth: () => ({ user: null }) }));
jest.mock("@/components/dashboard/diario/SeedPhraseModal", () => ({
  SeedPhraseModal: () => null,
}));
jest.mock("@/components/dashboard/diario/UnlockGate", () => ({
  UnlockGate: () => null,
}));

jest.mock("@psico/api-client", () => ({
  diarioApi: { create: jest.fn() },
  emotionalMapApi: { logTextFeatures: jest.fn() },
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { diarioApi } from "@psico/api-client";

const create = diarioApi.create as jest.Mock;

// The `good` mood label is "Bien" (capital B); `great` is "Muy bien"
// (lowercase b). A case-sensitive /Bien/ substring regex targets only `good`.
const goodChip = /Bien/;

describe("ActiveDiarioBody · mood reset on save (PR-2B, Test A parity)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({ id: "entry-1" });
  });

  it("A: resets mood after a successful save — a second entry with no fresh pick omits mood + moodSelectionVersion", async () => {
    render(
      <ActiveDiarioBody
        entries={[]}
        prompt={null}
        loading={false}
        onCreated={jest.fn()}
      />,
    );

    // First entry — pick `good`, write, save.
    fireEvent.press(screen.getByText(goodChip));
    fireEvent.changeText(
      screen.getByPlaceholderText(/Cómo llegas hoy/i),
      "Un día difícil.",
    );
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const first = create.mock.calls[0]![0];
    expect(first.mood).toBe("good");
    expect(first.moodSelectionVersion).toBe("explicit-v1");

    // The composer stays mounted; text is cleared. Write a SECOND entry
    // WITHOUT touching the mood, and save.
    fireEvent.changeText(
      screen.getByPlaceholderText(/Cómo llegas hoy/i),
      "Hoy mejor.",
    );
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const second = create.mock.calls[1]![0];
    // The prior `good` must NOT leak into the second payload.
    expect(second.mood).toBeUndefined();
    expect(second.moodSelectionVersion).toBeUndefined();
    expect(second.textCiphertext).toContain("cipher:Hoy mejor.");
  });
});

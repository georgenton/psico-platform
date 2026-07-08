import { render, fireEvent } from "@testing-library/react-native";
import { DiaryLockCard } from "./DiaryLockCard";
import * as diaryKeyContext from "@/crypto/diary-key-context";

// Mock the context module so the real one (which imports the native
// expo-local-authentication / expo-secure-store) never loads under Jest.
jest.mock("@/crypto/diary-key-context", () => ({
  useDiaryKey: jest.fn(),
}));

const mockUseDiaryKey = diaryKeyContext.useDiaryKey as jest.Mock;

function base(overrides = {}) {
  return {
    key: new Uint8Array(32),
    ecoKey: null,
    masterKey: null,
    isLegacyAccount: false,
    unlocking: false,
    loadingPersisted: false,
    error: null,
    remember: true,
    biometricLock: true,
    biometricAvailable: true,
    biometricLabel: "Face ID",
    needsBiometric: false,
    unlock: jest.fn(),
    adoptMasterKey: jest.fn(),
    lock: jest.fn(),
    authenticateBiometric: jest.fn(),
    setRemember: jest.fn(),
    setBiometricLock: jest.fn(),
    ...overrides,
  };
}

describe("DiaryLockCard (mobile)", () => {
  it("returns null for a legacy (pre-E2E) account", () => {
    mockUseDiaryKey.mockReturnValue(base({ isLegacyAccount: true }));
    const { toJSON } = render(<DiaryLockCard />);
    expect(toJSON()).toBeNull();
  });

  it("renders the remember row and reflects the unlocked status", () => {
    mockUseDiaryKey.mockReturnValue(base());
    const { getByText } = render(<DiaryLockCard />);
    expect(getByText("Recordar en este dispositivo")).toBeTruthy();
    expect(
      getByText("Tu diario está desbloqueado en esta sesión."),
    ).toBeTruthy();
  });

  it("shows the biometric row only when the device supports it", () => {
    mockUseDiaryKey.mockReturnValue(base({ biometricAvailable: false }));
    const { queryByText } = render(<DiaryLockCard />);
    expect(queryByText(/para abrir/)).toBeNull();
  });

  it("labels the biometric row with the modality label", () => {
    mockUseDiaryKey.mockReturnValue(base({ biometricLabel: "huella" }));
    const { getByText } = render(<DiaryLockCard />);
    expect(getByText("Pedir huella para abrir")).toBeTruthy();
  });

  it("calls lock() when 'Bloquear ahora' is pressed", () => {
    const lock = jest.fn();
    mockUseDiaryKey.mockReturnValue(base({ lock }));
    const { getByText } = render(<DiaryLockCard />);
    fireEvent.press(getByText("Bloquear ahora"));
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("disables lock + shows locked status when the diary is locked", () => {
    mockUseDiaryKey.mockReturnValue(base({ key: null }));
    const { getByText } = render(<DiaryLockCard />);
    expect(getByText("Tu diario está bloqueado.")).toBeTruthy();
  });
});

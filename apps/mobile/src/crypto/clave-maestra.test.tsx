import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  bytesToBase64Url,
  decryptString,
  deriveSubKey,
  DIARY_KEY_INFO,
  ECO_KEY_INFO,
  encryptString,
  MASTER_KEY_LEN,
  masterKeyToSeedPhrase,
  randomBytes,
} from "@psico/crypto";

import { UnlockGate } from "../components/dashboard/diario/UnlockGate";
import type { DiaryKeyContextValue } from "./diary-key-context";
import { DiaryKeyProvider, useDiaryKey } from "./diary-key-context";

/**
 * La clave maestra, con la criptografía de verdad y el llavero de verdad: lo
 * único de mentira es lo que guarda el sistema operativo. El otro fichero de
 * pruebas del proveedor sustituye `@psico/crypto`, y por eso nunca pudo ver que
 * esperaba una longitud que las claves dejaron de medir.
 */

const mockLlavero = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  setItemAsync: async (k: string, v: string) => {
    mockLlavero.set(k, v);
  },
  getItemAsync: async (k: string) => mockLlavero.get(k) ?? null,
  deleteItemAsync: async (k: string) => {
    mockLlavero.delete(k);
  },
}));
jest.mock("./biometric", () => ({
  getBiometricCapability: async () => ({ available: false, label: "huella" }),
  promptBiometric: async () => true,
}));

const SAL = "AAAAAAAAAAAAAAAAAAAAAA";
const b64 = (u: Uint8Array) => bytesToBase64Url(u);

// Al azar y no derivada: que Argon2id entregue `MASTER_KEY_LEN` bytes lo fija
// `@psico/crypto`, y aquí tarda cincuenta segundos.
const maestra = randomBytes(MASTER_KEY_LEN);

beforeEach(() => mockLlavero.clear());

async function montar(hijos: ReactNode = null) {
  let ctx: DiaryKeyContextValue | null = null;
  function Sonda() {
    ctx = useDiaryKey();
    return null;
  }
  render(
    <DiaryKeyProvider cryptoSalt={SAL}>
      <Sonda />
      {hijos}
    </DiaryKeyProvider>,
  );
  await waitFor(() => expect(ctx!.loadingPersisted).toBe(false));
  return () => ctx!;
}

/** Lo que de verdad importa: leer lo que ya estaba escrito. */
function leeLoEscrito(clave: Uint8Array | null) {
  const guardado = encryptString(
    "lo que escribí antes",
    deriveSubKey(maestra, DIARY_KEY_INFO),
  );
  return clave && decryptString(guardado, clave);
}

describe("recuperar el Diario con las doce palabras", () => {
  it("abre el Diario, y lee lo que estaba escrito", async () => {
    const ctx = await montar(<UnlockGate />);

    fireEvent.press(screen.getByText(/frase/i));
    fireEvent.changeText(
      screen.getByPlaceholderText(/palabra1/),
      masterKeyToSeedPhrase(maestra),
    );
    fireEvent.press(screen.getByText("Recuperar acceso"));

    await waitFor(() => expect(ctx().key).not.toBeNull());
    expect(leeLoEscrito(ctx().key)).toBe("lo que escribí antes");
    expect(ctx().error).toBeNull();
  });

  it("guarda en el dispositivo las dos claves que abre, y ninguna otra", async () => {
    const ctx = await montar();

    await act(() => ctx().adoptMasterKey(new Uint8Array(maestra)));

    expect(mockLlavero.get("psico_diary_key_v1")).toBe(
      b64(deriveSubKey(maestra, DIARY_KEY_INFO)),
    );
    expect([...mockLlavero.values()]).toContain(
      b64(deriveSubKey(maestra, ECO_KEY_INFO)),
    );
    // La maestra nunca se guarda.
    expect([...mockLlavero.values()]).not.toContain(b64(maestra));
  });

  it("otra frase válida no lee el Diario: la puerta se abre, el texto no", async () => {
    const otra = new Uint8Array(MASTER_KEY_LEN).fill(7);
    const ctx = await montar();

    await act(() => ctx().adoptMasterKey(otra));

    expect(() => leeLoEscrito(ctx().key)).toThrow();
  });
});

describe("lo que no es una clave de este esquema", () => {
  it.each([0, MASTER_KEY_LEN - 1, MASTER_KEY_LEN + 1, 32])(
    "%i bytes: no abre, no guarda y lo dice",
    async (n) => {
      const ctx = await montar();

      await act(() => ctx().adoptMasterKey(new Uint8Array(n).fill(1)));

      expect(ctx().key).toBeNull();
      expect(ctx().masterKey).toBeNull();
      expect(mockLlavero.size).toBe(0);
      expect(ctx().error).toMatch(/tamaño inválido/);
    },
  );
});

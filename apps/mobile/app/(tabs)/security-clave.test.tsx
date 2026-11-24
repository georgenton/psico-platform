import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { PasswordChangeWithRekeyRequest } from "@psico/types";
import {
  bytesToBase64Url,
  decryptString,
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  ECO_KEY_INFO,
  encryptString,
} from "@psico/crypto";

import type { DiaryKeyContextValue } from "@/crypto/diary-key-context";
import { DiaryKeyProvider, useDiaryKey } from "@/crypto/diary-key-context";
import SecurityScreen from "./security";

/**
 * Cambiar la contraseña en el móvil: lo que queda abierto y lo que queda
 * guardado son las claves NUEVAS, que son las que leen lo que el servidor
 * acaba de recibir.
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
jest.mock("@/crypto/biometric", () => ({
  getBiometricCapability: async () => ({ available: false, label: "huella" }),
  promptBiometric: async () => true,
}));

// Todo real menos Argon2id, que aquí tarda cincuenta segundos por contraseña.
// En su lugar, una clave de la longitud del esquema que depende de las dos cosas.
jest.mock("@psico/crypto", () => {
  const real = jest.requireActual("@psico/crypto");
  return {
    ...real,
    deriveMasterKey: async (contrasena: string, sal: string) => {
      const semilla = new Uint8Array(real.MASTER_KEY_LEN);
      [...(contrasena + sal)].forEach((c, i) => {
        semilla[i % semilla.length] =
          (semilla[i % semilla.length]! * 31 + c.charCodeAt(0)) & 0xff;
      });
      return semilla;
    },
  };
});

const mockPost = jest.fn();
const mockCifrados = jest.fn();
jest.mock("@psico/api-client", () => ({
  apiClient: { post: (...a: unknown[]) => mockPost(...a) },
  diarioApi: { listRawCiphers: () => mockCifrados() },
}));
jest.mock("@/context/auth", () => ({
  useAuth: () => ({ user: { id: "yo", email: "yo@psico.test" } }),
}));
jest.mock("@/components/dashboard/security/ShowSeedPhraseCard", () => ({
  ShowSeedPhraseCard: () => null,
}));
jest.mock("@/components/dashboard/security/LocalTextAnalysisCard", () => ({
  LocalTextAnalysisCard: () => null,
}));
jest.mock("@/components/dashboard/security/DiaryLockCard", () => ({
  DiaryLockCard: () => null,
}));

const SAL = "AAAAAAAAAAAAAAAAAAAAAA";
const ANTES = "la contraseña de antes";
const DESPUES = "la contraseña de después";
const b64 = (u: Uint8Array) => bytesToBase64Url(u);

function Sonda({ ver }: { ver: (c: DiaryKeyContextValue) => void }) {
  ver(useDiaryKey());
  return null;
}

async function abrir(hijos: ReactNode) {
  let ctx: DiaryKeyContextValue | null = null;
  render(
    <DiaryKeyProvider cryptoSalt={SAL}>
      <Sonda
        ver={(c) => {
          ctx = c;
        }}
      />
      {hijos}
    </DiaryKeyProvider>,
  );
  await waitFor(() => expect(ctx!.loadingPersisted).toBe(false));
  await act(() => ctx!.unlock(ANTES));
  return () => ctx!;
}

async function cambiar() {
  const campos = screen.UNSAFE_getAllByProps({ secureTextEntry: true });
  // Cada campo sale dos veces: el componente y el nativo que pinta.
  const [actual, nueva, repetida] = campos.filter(
    (c) => typeof c.type === "string",
  );
  fireEvent.changeText(actual!, ANTES);
  fireEvent.changeText(nueva!, DESPUES);
  fireEvent.changeText(repetida!, DESPUES);
  fireEvent.press(screen.getAllByText("Cambiar contraseña").at(-1)!);
  await waitFor(() => expect(mockPost).toHaveBeenCalled());
}

beforeEach(() => {
  mockLlavero.clear();
  mockPost.mockReset();
  mockCifrados.mockReset();
});

describe("tras cambiar la contraseña", () => {
  it("lo abierto y lo guardado son las claves nuevas, y leen lo recifrado", async () => {
    const viejaDiario = deriveSubKey(
      await deriveMasterKey(ANTES, SAL),
      DIARY_KEY_INFO,
    );
    const entrada = encryptString("una entrada de antes", viejaDiario);
    mockCifrados.mockResolvedValue({
      entries: [
        {
          id: "e1",
          textCiphertext: entrada.ciphertext,
          textNonce: entrada.nonce,
          excerptCiphertext: null,
          excerptNonce: null,
        },
      ],
    });
    mockPost.mockResolvedValue({ ok: true, rekeyed: 1 });

    const ctx = await abrir(<SecurityScreen />);
    expect(b64(ctx().key!)).toBe(b64(viejaDiario));
    await cambiar();

    const enviado = mockPost.mock
      .calls[0]![1] as PasswordChangeWithRekeyRequest;
    const maestra = await deriveMasterKey(DESPUES, enviado.newCryptoSalt);
    const diario = deriveSubKey(maestra, DIARY_KEY_INFO);
    const eco = deriveSubKey(maestra, ECO_KEY_INFO);

    await waitFor(() => expect(b64(ctx().key!)).toBe(b64(diario)));
    expect(b64(ctx().ecoKey!)).toBe(b64(eco));
    expect(b64(ctx().masterKey!)).toBe(b64(maestra));
    expect(ctx().error).toBeNull();
    expect(mockLlavero.get("psico_diary_key_v1")).toBe(b64(diario));
    expect(mockLlavero.get("psico_eco_key_v1")).toBe(b64(eco));

    // Lo que el servidor recibió se lee con lo que quedó abierto.
    const recifrada = enviado.reencryptedEntries[0]!;
    expect(
      decryptString(
        { ciphertext: recifrada.textCiphertext, nonce: recifrada.textNonce },
        ctx().key!,
      ),
    ).toBe("una entrada de antes");
  });

  it("si el servidor la rechaza, no cambia ninguna clave", async () => {
    mockCifrados.mockResolvedValue({ entries: [] });
    mockPost.mockRejectedValue(new Error("401"));

    const ctx = await abrir(<SecurityScreen />);
    const antes = { abierta: b64(ctx().key!), guardado: [...mockLlavero] };
    await cambiar();
    await waitFor(() =>
      expect(
        screen.getByText(/contraseña actual no es correcta/i),
      ).toBeTruthy(),
    );

    expect(b64(ctx().key!)).toBe(antes.abierta);
    expect([...mockLlavero]).toEqual(antes.guardado);
  });
});

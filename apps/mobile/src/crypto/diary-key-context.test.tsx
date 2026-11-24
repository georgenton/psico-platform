import { act, render } from "@testing-library/react-native";
import type { DiaryKeyContextValue } from "./diary-key-context";
import { DiaryKeyProvider, useDiaryKey } from "./diary-key-context";

/**
 * Las claves del Diario son de una cuenta, también si el proveedor no se
 * desmonta al cambiar de cuenta. Es la misma regla que en web
 * (`apps/web/src/lib/crypto/__tests__/cambio-de-cuenta.test.tsx`).
 */

const mockGuardado: { d: Uint8Array | null; e: Uint8Array | null } = {
  d: null,
  e: null,
};
const mockAlmacen = {
  save: jest.fn(async (k: Uint8Array) => {
    mockGuardado.d = new Uint8Array(k);
  }),
  saveEco: jest.fn(async (k: Uint8Array) => {
    mockGuardado.e = new Uint8Array(k);
  }),
  load: jest.fn(async () => mockGuardado.d && new Uint8Array(mockGuardado.d)),
  loadEco: jest.fn(
    async () => mockGuardado.e && new Uint8Array(mockGuardado.e),
  ),
  clear: jest.fn(async () => {
    mockGuardado.d = null;
    mockGuardado.e = null;
  }),
};
jest.mock("./diary-key-store", () => ({
  get diaryKeyStore() {
    return mockAlmacen;
  },
}));

const mockPrefs = { biometria: false };
jest.mock("./lock-prefs", () => ({
  lockPrefs: {
    getRemember: async () => true,
    setRemember: async () => undefined,
    getBiometricLock: async () => mockPrefs.biometria,
    setBiometricLock: async () => undefined,
  },
}));

let mockPrompt: () => Promise<boolean> = async () => true;
jest.mock("./biometric", () => ({
  getBiometricCapability: async () => ({ available: true, label: "huella" }),
  promptBiometric: () => mockPrompt(),
}));

/** Cada derivación espera a que la prueba la suelte. */
let mockSoltar: () => void = () => undefined;
let mockEnVuelo = false;
jest.mock("@psico/crypto", () => ({
  DIARY_KEY_INFO: "diario",
  ECO_KEY_INFO: "eco",
  deriveMasterKey: async (_: string, sal: string) => {
    if (mockEnVuelo) {
      await new Promise<void>((r) => {
        mockSoltar = r;
      });
    }
    return new Uint8Array(16).fill(sal.charCodeAt(0));
  },
  deriveSubKey: (m: Uint8Array, info: string) =>
    new Uint8Array(32).fill(m[0]! + (info === "eco" ? 1 : 0)),
}));

const SAL_A = "aaaaaaaaaaaaaaaaaaaaaa";
const SAL_B = "bbbbbbbbbbbbbbbbbbbbbb";

interface Visto {
  cuenta: string | null;
  abierto: boolean;
  esperaHuella: boolean;
}

function Sonda({
  cuenta,
  vistos,
  onCtx,
}: {
  cuenta: string | null;
  vistos: Visto[];
  onCtx: (c: DiaryKeyContextValue) => void;
}) {
  const ctx = useDiaryKey();
  vistos.push({
    cuenta,
    abierto: Boolean(ctx.key || ctx.ecoKey || ctx.masterKey),
    esperaHuella: ctx.needsBiometric,
  });
  onCtx(ctx);
  return null;
}

async function montar(sal: string | null = SAL_A) {
  let ctx: DiaryKeyContextValue | null = null;
  const vistos: Visto[] = [];
  const arbol = (s: string | null) => (
    <DiaryKeyProvider cryptoSalt={s}>
      <Sonda
        cuenta={s}
        vistos={vistos}
        onCtx={(c) => {
          ctx = c;
        }}
      />
    </DiaryKeyProvider>
  );
  const vista = render(arbol(sal));
  await act(async () => undefined);
  return {
    vista,
    vistos,
    ctx: () => ctx as unknown as DiaryKeyContextValue,
    pasarA: (s: string | null) =>
      act(async () => {
        vista.rerender(arbol(s));
      }),
  };
}

const abiertosDe = (v: Visto[], cuenta: string | null) =>
  v.filter((x) => x.cuenta === cuenta && x.abierto);

beforeEach(() => {
  mockGuardado.d = null;
  mockGuardado.e = null;
  mockPrefs.biometria = false;
  mockPrompt = async () => true;
  mockEnVuelo = false;
  jest.clearAllMocks();
});

describe("la cuenta cambia con el proveedor montado", () => {
  it("ningún render con la otra cuenta recibe las claves, y quedan a cero", async () => {
    const p = await montar();
    await act(async () => p.ctx().unlock("la-de-a"));
    const bufers = [p.ctx().key!, p.ctx().ecoKey!, p.ctx().masterKey!];
    await p.pasarA(SAL_B);
    expect(abiertosDe(p.vistos, SAL_B)).toEqual([]);
    for (const b of bufers) expect(b.every((x) => x === 0)).toBe(true);
  });

  it("tampoco con una cuenta sin cifrado, ni al volver a la primera", async () => {
    const p = await montar();
    await act(async () => p.ctx().unlock("la-de-a"));
    await p.pasarA(null);
    expect(abiertosDe(p.vistos, null)).toEqual([]);
    await p.pasarA(SAL_A);
    expect(p.ctx().key).toBeNull();
  });

  it("«Recordar» de la pantalla anterior no guarda nada", async () => {
    const p = await montar();
    await act(async () => p.ctx().unlock("la-de-a"));
    const recordar = p.ctx().setRemember;
    await p.pasarA(SAL_B);
    jest.clearAllMocks();
    await act(async () => {
      recordar(true);
      p.ctx().setRemember(true);
    });
    expect(mockAlmacen.save).not.toHaveBeenCalled();
    expect(mockAlmacen.saveEco).not.toHaveBeenCalled();
  });

  it("lo que esperaba la huella no se enseña con la otra cuenta", async () => {
    mockGuardado.d = new Uint8Array(32).fill(9);
    mockPrefs.biometria = true;
    mockPrompt = async () => false;
    const p = await montar();
    expect(p.ctx().needsBiometric).toBe(true);
    await p.pasarA(SAL_B);
    // Ni en el primer render: la reja de B no ofrece la huella de A.
    expect(
      p.vistos.filter((v) => v.cuenta === SAL_B && v.esperaHuella),
    ).toEqual([]);
    await act(async () => p.ctx().setBiometricLock(false));
    expect(abiertosDe(p.vistos, SAL_B)).toEqual([]);
  });

  it("una clave guardada no se abre en una cuenta sin cifrado", async () => {
    mockGuardado.d = new Uint8Array(32).fill(9);
    const p = await montar(null);
    expect(abiertosDe(p.vistos, null)).toEqual([]);
  });

  it("control contrario: la misma cuenta sigue abierta, y la guardada se restaura", async () => {
    const p = await montar();
    await act(async () => p.ctx().unlock("la-de-a"));
    await p.pasarA(SAL_A);
    expect(p.ctx().key).not.toBeNull();
    expect(mockGuardado.d).not.toBeNull();
    p.vista.unmount();

    const otra = await montar();
    expect(otra.ctx().key).not.toBeNull();
  });
});

describe("un desbloqueo que termina tarde", () => {
  it("no se adopta ni se guarda si la cuenta ya es otra", async () => {
    mockEnVuelo = true;
    const p = await montar();
    let fin!: Promise<void>;
    await act(async () => {
      fin = p.ctx().unlock("la-de-a");
    });
    await p.pasarA(SAL_B);
    await act(async () => {
      mockSoltar();
      await fin;
    });
    expect(abiertosDe(p.vistos, SAL_B)).toEqual([]);
    expect(p.ctx().unlocking).toBe(false);
    expect(mockAlmacen.save).not.toHaveBeenCalled();
  });

  it("ni deja la clave en el dispositivo después de salir", async () => {
    mockEnVuelo = true;
    const p = await montar();
    let fin!: Promise<void>;
    await act(async () => {
      fin = p.ctx().unlock("la-de-a");
    });
    p.vista.unmount();
    await act(async () => {
      mockSoltar();
      await fin;
    });
    expect(mockGuardado).toEqual({ d: null, e: null });
  });

  it("ni a medias: si se sale mientras guarda, se retira lo guardado", async () => {
    const p = await montar();
    let soltar!: () => void;
    mockAlmacen.save.mockImplementationOnce(async (k: Uint8Array) => {
      await new Promise<void>((r) => {
        soltar = r;
      });
      mockGuardado.d = new Uint8Array(k);
    });
    let fin!: Promise<void>;
    await act(async () => {
      fin = p.ctx().unlock("la-de-a");
    });
    p.vista.unmount();
    await act(async () => {
      soltar();
      await fin;
    });
    expect(mockGuardado).toEqual({ d: null, e: null });
  });
});

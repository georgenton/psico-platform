import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type * as Cripto from "@psico/crypto";
import { bytesToBase64Url, encryptString, MASTER_KEY_LEN } from "@psico/crypto";

import {
  DiaryKeyProvider,
  useDiaryKey,
  type DiaryKeyContextValue,
} from "../diary-key-context";
import {
  RetirarMarcaDeCuenta,
  SesionVigenteProvider,
  useSesionVigente,
} from "../sesion-vigente";

/**
 * Dos pestañas, una sesión: la que se quedó atrás se entera y se cierra.
 *
 * La otra pestaña se finge como la finge el navegador: cambia `localStorage` y
 * llega un evento `storage`. Lo que contesta el servidor se suelta cuando la
 * prueba quiere, porque lo que importa es qué pasa MIENTRAS no contesta.
 */

const ir = vi.fn();
/** Las preguntas que hay en el aire, en el orden en que se hicieron. */
let preguntas: {
  url: string;
  init: RequestInit;
  contestar: (r: Partial<Response>) => void;
  fallar: () => void;
}[];

// Aquí no se prueba la derivación, sino qué pasa mientras está en vuelo.
const derivacion = vi.hoisted(() => ({ soltar: () => {} }));
vi.mock("@psico/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof Cripto>()),
  deriveMasterKey: () =>
    new Promise<Uint8Array>((r) => {
      derivacion.soltar = () => r(new Uint8Array(16).fill(3));
    }),
}));

const galleta = { historia: [] as string[] };
vi.mock("@/actions/diary-session", () => ({
  saveDiaryWrapKey: vi.fn(async () => {
    galleta.historia.push("guardar");
  }),
  clearDiaryWrapKey: vi.fn(async () => {
    galleta.historia.push("borrar");
  }),
}));

const CLAVE = "psico:cuenta";
const SOBRE = "psico:diary:wrapped";
const MARCA_A = "marca-de-a-000001";
const MARCA_B = "marca-de-b-000002";
const SAL_A = "YWJjZGVmZ2hpamtsbW5vcA";
const SAL_B = "MTIzNDU2Nzg5MDEyMzQ1Ng";

/** Un sobre guardado en el dispositivo, y la llave de su galleta. */
function sobreDe(sal: string) {
  const envoltorio = new Uint8Array(32).fill(sal.charCodeAt(0));
  const maestra = new Uint8Array(MASTER_KEY_LEN).fill(sal.charCodeAt(1));
  const guardado = JSON.stringify(
    encryptString(`${sal}.${bytesToBase64Url(maestra)}`, envoltorio),
  );
  return { guardado, galleta: bytesToBase64Url(envoltorio) };
}

const json = (cuerpo: unknown): Partial<Response> => ({
  ok: true,
  type: "basic",
  json: async () => cuerpo,
});

/** Contesta la última pregunta. */
async function servidorDice(r: Partial<Response>) {
  await act(async () => {
    preguntas.at(-1)!.contestar(r);
  });
}

function Pantalla({
  onCtx,
  dentro,
  galletaDelHtml = null,
}: {
  onCtx?: (c: DiaryKeyContextValue) => void;
  dentro?: React.ReactNode;
  galletaDelHtml?: string | null;
}) {
  return (
    <SesionVigenteProvider marca={MARCA_A}>
      <DiaryKeyProvider cryptoSalt={SAL_A} initialWrapKey={galletaDelHtml}>
        <Sonda onCtx={onCtx} />
        {dentro}
      </DiaryKeyProvider>
    </SesionVigenteProvider>
  );
}

function Sonda({ onCtx }: { onCtx?: (c: DiaryKeyContextValue) => void }) {
  const vigente = useSesionVigente();
  const ctx = useDiaryKey();
  onCtx?.(ctx);
  return (
    <p data-testid="estado">
      {vigente ? "vigente" : "en duda"} · {ctx.key ? "abierto" : "cerrado"}
    </p>
  );
}

const estado = () => screen.getByTestId("estado").textContent;

/** Otra pestaña del mismo navegador cambia la marca. */
async function otraPestana(marca: string | null, clave = CLAVE) {
  await act(async () => {
    const antes = window.localStorage.getItem(clave);
    if (marca === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, marca);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: clave,
        oldValue: antes,
        newValue: marca,
      }),
    );
  });
}

function montar(dentro?: React.ReactNode, galletaDelHtml?: string) {
  let ctx: DiaryKeyContextValue | null = null;
  render(
    <Pantalla
      onCtx={(c) => {
        ctx = c;
      }}
      dentro={dentro}
      galletaDelHtml={galletaDelHtml}
    />,
  );
  return () => ctx as unknown as DiaryKeyContextValue;
}

async function abrir(ctx: () => DiaryKeyContextValue) {
  await act(async () =>
    ctx().adoptMasterKey(new Uint8Array(MASTER_KEY_LEN).fill(7)),
  );
  expect(estado()).toBe("vigente · abierto");
}

beforeEach(() => {
  window.localStorage.clear();
  // Lo corriente: esta cuenta ya tenía el panel abierto en el navegador.
  window.localStorage.setItem(CLAVE, MARCA_A);
  ir.mockReset();
  galleta.historia = [];
  preguntas = [];
  vi.stubGlobal("location", { ...window.location, replace: ir });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init: RequestInit) =>
        new Promise<Partial<Response>>((contestar, rechazar) => {
          preguntas.push({
            url,
            init,
            contestar,
            fallar: () => rechazar(new TypeError("sin red")),
          });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("la marca", () => {
  it("no se escribe hasta que el servidor la confirma, y no dice nada de la persona", async () => {
    window.localStorage.clear();
    montar();
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
    await servidorDice(json({ marca: MARCA_A }));
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_A);
    expect(estado()).toBe("vigente · cerrado");
  });

  it("sin cuenta conocida no se escribe ni se vigila", async () => {
    window.localStorage.clear();
    render(
      <SesionVigenteProvider marca={null}>
        <DiaryKeyProvider cryptoSalt={SAL_A} initialWrapKey={null}>
          <Sonda />
        </DiaryKeyProvider>
      </SesionVigenteProvider>,
    );
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
    await otraPestana(MARCA_B);
    expect(preguntas).toHaveLength(0);
    // Y no deja a nadie esperando una respuesta que no va a pedir.
    expect(estado()).toBe("vigente · cerrado");
  });
});

describe("el acceso y el registro", () => {
  const marcaAhora = () => window.localStorage.getItem(CLAVE);

  it("mueven la marca a un valor que no es de nadie, distinto cada vez", () => {
    render(<RetirarMarcaDeCuenta />);
    const una = marcaAhora();
    expect(una).toMatch(/^nadie:/);
    render(<RetirarMarcaDeCuenta />);
    expect(marcaAhora()).toMatch(/^nadie:/);
    expect(marcaAhora()).not.toBe(una);
  });

  it("al salir no preguntan si nadie puso la suya después", () => {
    const vista = render(<RetirarMarcaDeCuenta />);
    const mia = marcaAhora();
    vista.unmount();
    expect(preguntas).toHaveLength(0);
    expect(marcaAhora()).toBe(mia);
  });

  it("si otra pestaña puso la suya y la sesión ya es de otra cuenta, la mueven", async () => {
    // El acceso llevaba abierto desde antes; ahí entró B y se fue al onboarding.
    const vista = render(<RetirarMarcaDeCuenta />);
    window.localStorage.setItem(CLAVE, MARCA_A);
    vista.unmount();
    expect(preguntas).toHaveLength(1);
    await servidorDice(json({ marca: MARCA_B }));
    expect(marcaAhora()).toMatch(/^nadie:/);
  });

  it.each([
    ["sigue siendo la de esa cuenta", json({ marca: MARCA_A })],
    ["no contesta", { ok: false, type: "basic" }],
  ] as [string, Partial<Response>][])(
    "si otra pestaña puso la suya y %s, no la tocan",
    async (_, r) => {
      const vista = render(<RetirarMarcaDeCuenta />);
      window.localStorage.setItem(CLAVE, MARCA_A);
      vista.unmount();
      await servidorDice(r);
      expect(marcaAhora()).toBe(MARCA_A);
    },
  );
});

/**
 * Una pestaña que tardó en cargar monta DESPUÉS de que en otra se saliera y se
 * entrara con otra cuenta. No recibió ningún evento: no existía.
 *
 * Hasta que el servidor diga de quién es la sesión, la identidad está pendiente:
 * ni claves, ni reja, ni lo guardado en el dispositivo, ni marca.
 */
describe("al montar", () => {
  it("si la marca ya es la suya —otra pestaña la confirmó—, no pregunta", () => {
    montar();
    expect(estado()).toBe("vigente · cerrado");
    expect(preguntas).toHaveLength(0);
  });

  const SIN_CONFIRMAR: [string, string | null][] = [
    ["no hay ninguna", null],
    ["es la de otra cuenta", MARCA_B],
    ["no es de nadie", "nadie:abc"],
  ];

  describe.each(SIN_CONFIRMAR)("si %s", (_, previa) => {
    beforeEach(() => {
      if (previa === null) window.localStorage.clear();
      else window.localStorage.setItem(CLAVE, previa);
    });

    it("pregunta sin anunciarse, y no abre nada mientras", async () => {
      const ctx = montar();
      expect(estado()).toBe("en duda · cerrado");
      expect(window.localStorage.getItem(CLAVE)).toBe(previa);
      expect(preguntas).toHaveLength(1);

      await act(async () => ctx().unlock("lo-que-sea"));
      await act(async () =>
        ctx().adoptMasterKey(new Uint8Array(MASTER_KEY_LEN).fill(9)),
      );
      expect(estado()).toBe("en duda · cerrado");
      expect(ctx().error).toMatch(/Estamos confirmando tu sesión/);
      expect(window.localStorage.getItem(SOBRE)).toBeNull();
      expect(galleta.historia).toEqual([]);
    });

    it("no abre lo recordado hasta confirmarla, y entonces sí", async () => {
      const { guardado, galleta: k } = sobreDe(SAL_A);
      window.localStorage.setItem(SOBRE, guardado);
      montar(undefined, k);
      expect(estado()).toBe("en duda · cerrado");
      await servidorDice(json({ marca: MARCA_A }));
      expect(estado()).toBe("vigente · abierto");
      expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_A);
      expect(window.localStorage.getItem(SOBRE)).toBe(guardado);
    });

    it("no toca el sobre de otra cuenta, aunque su llave no lo abra", async () => {
      // El HTML es de A; lo que hay en el dispositivo ya es de B.
      const { guardado } = sobreDe(SAL_B);
      window.localStorage.setItem(SOBRE, guardado);
      montar(undefined, sobreDe(SAL_A).galleta);
      await servidorDice(json({ marca: MARCA_B }));
      expect(ir.mock.calls).toEqual([["/dashboard"]]);
      expect(window.localStorage.getItem(SOBRE)).toBe(guardado);
      expect(galleta.historia).toEqual([]);
    });

    it("bloquear o dejar de recordar tampoco lo tocan mientras no se sabe", async () => {
      const { guardado } = sobreDe(SAL_B);
      window.localStorage.setItem(SOBRE, guardado);
      window.localStorage.setItem("psico:diary:remember", "1");
      const ctx = montar();
      await act(async () => ctx().setRemember(false));
      await act(async () => ctx().lock());
      expect(window.localStorage.getItem(SOBRE)).toBe(guardado);
      expect(window.localStorage.getItem("psico:diary:remember")).toBe("1");
      expect(galleta.historia).toEqual([]);
    });

    it("y con «pedir cada vez» no borra lo de nadie hasta saberlo", async () => {
      const { guardado, galleta: k } = sobreDe(SAL_A);
      window.localStorage.setItem(SOBRE, guardado);
      window.localStorage.setItem("psico:diary:remember", "0");
      montar(undefined, k);
      expect(window.localStorage.getItem(SOBRE)).toBe(guardado);
      expect(galleta.historia).toEqual([]);
      await servidorDice(json({ marca: MARCA_A }));
      expect(window.localStorage.getItem(SOBRE)).toBeNull();
      expect(estado()).toBe("vigente · cerrado");
    });

    it("si es otra cuenta, se va sin haberse anunciado", async () => {
      montar();
      await servidorDice(json({ marca: MARCA_B }));
      expect(ir.mock.calls).toEqual([["/dashboard"]]);
      expect(window.localStorage.getItem(CLAVE)).toBe(previa);
      expect(estado()).toBe("en duda · cerrado");
    });

    it("si tarda, falla o reintenta, sigue protegida todo ese rato", async () => {
      vi.useFakeTimers();
      const { guardado, galleta: k } = sobreDe(SAL_A);
      window.localStorage.setItem(SOBRE, guardado);
      const ctx = montar(undefined, k);
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      expect(estado()).toBe("en duda · cerrado");
      expect(preguntas).toHaveLength(1);
      for (let i = 1; i <= 3; i++) {
        await act(async () => preguntas.at(-1)!.fallar());
        await act(async () => ctx().unlock("lo-que-sea"));
        expect(estado()).toBe("en duda · cerrado");
        expect(window.localStorage.getItem(CLAVE)).toBe(previa);
        await act(async () => vi.advanceTimersByTimeAsync(5_000));
        expect(preguntas).toHaveLength(1 + i);
      }
      await servidorDice(json({ marca: MARCA_A }));
      expect(estado()).toBe("vigente · abierto");
    });

    it("y cuando el servidor confirma, se usa como siempre", async () => {
      const ctx = montar();
      await servidorDice(json({ marca: MARCA_A }));
      expect(estado()).toBe("vigente · cerrado");
      expect(ctx().error).toBeNull();
      await abrir(ctx);
      expect(preguntas).toHaveLength(1);
    });
  });

  it("volver a la pestaña mientras se confirma no pregunta de más", async () => {
    window.localStorage.clear();
    montar();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(preguntas).toHaveLength(1);
    await servidorDice(json({ marca: MARCA_A }));
    expect(estado()).toBe("vigente · cerrado");
    expect(preguntas).toHaveLength(1);
  });

  it("una respuesta de antes no la confirma si alguien entró entretanto", async () => {
    window.localStorage.clear();
    montar();
    await otraPestana("nadie:otro-acceso");
    await servidorDice(json({ marca: MARCA_A }));
    expect(estado()).toBe("en duda · cerrado");
    expect(window.localStorage.getItem(CLAVE)).toBe("nadie:otro-acceso");
    expect(preguntas).toHaveLength(2);
    await servidorDice(json({ marca: MARCA_B }));
    expect(ir.mock.calls).toEqual([["/dashboard"]]);
  });
});

describe("otra pestaña cambió de cuenta", () => {
  it("se dejan de entregar claves en el acto y se pregunta al servidor", async () => {
    const ctx = montar();
    await abrir(ctx);
    const clave = ctx().key!;
    await otraPestana(MARCA_B);

    expect(estado()).toBe("en duda · cerrado");
    expect(clave.every((x) => x === 0)).toBe(true);
    expect(preguntas).toHaveLength(1);
  });

  it("salir también cuenta: la marca desaparece", async () => {
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(null);
    expect(estado()).toBe("en duda · cerrado");
    expect(preguntas).toHaveLength(1);
  });

  it("lo guardado en el dispositivo no se toca: puede ser ya de la otra", async () => {
    const ctx = montar();
    await abrir(ctx);
    const sobre = window.localStorage.getItem(SOBRE);
    expect(sobre).not.toBeNull();
    galleta.historia = [];
    await otraPestana(MARCA_B);
    expect(window.localStorage.getItem(SOBRE)).toBe(sobre);
    expect(galleta.historia).toEqual([]);
  });

  it("mientras no se sabe, la reja no abre y dice por qué", async () => {
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(MARCA_B);
    await act(async () => ctx().unlock("lo-que-sea"));
    await act(async () =>
      ctx().adoptMasterKey(new Uint8Array(MASTER_KEY_LEN).fill(9)),
    );
    expect(estado()).toBe("en duda · cerrado");
    expect(ctx().error).toMatch(/Estamos confirmando tu sesión/);
    // Y no se confunde con una cuenta sin cifrado.
    expect(ctx().isLegacyAccount).toBe(false);
  });

  it("un desbloqueo en vuelo no abre nada, y la reja no se queda esperando", async () => {
    const ctx = montar();
    let fin!: Promise<void>;
    await act(async () => {
      fin = ctx().unlock("la-de-a");
    });
    expect(ctx().unlocking).toBe(true);
    await otraPestana(MARCA_B);
    await act(async () => {
      derivacion.soltar();
      await fin;
    });
    expect(estado()).toBe("en duda · cerrado");
    expect(ctx().unlocking).toBe(false);
    expect(galleta.historia).toEqual([]);
    // Era una falsa alarma: la reja vuelve a servir.
    await servidorDice(json({ marca: MARCA_A }));
    expect(ctx().unlocking).toBe(false);
    expect(ctx().error).toBeNull();
    await abrir(ctx);
  });

  it("alcanza al proveedor anidado de la frase de respaldo", async () => {
    let dentro: DiaryKeyContextValue | null = null;
    const ctx = montar(
      <DiaryKeyProvider cryptoSalt={SAL_A} initialWrapKey={null}>
        <Captura
          onCtx={(c) => {
            dentro = c;
          }}
        />
      </DiaryKeyProvider>,
    );
    await abrir(ctx);
    const anidado = () => dentro as unknown as DiaryKeyContextValue;
    await act(async () =>
      anidado().adoptMasterKey(new Uint8Array(MASTER_KEY_LEN).fill(5)),
    );
    expect(anidado().masterKey).not.toBeNull();
    await otraPestana(MARCA_B);
    expect(anidado().masterKey).toBeNull();
  });

  it("si se perdió el evento, se compara al volver a la pestaña", async () => {
    for (const volver of [
      () => window.dispatchEvent(new Event("focus")),
      () => window.dispatchEvent(new Event("pageshow")),
      () => document.dispatchEvent(new Event("visibilitychange")),
    ]) {
      window.localStorage.setItem(CLAVE, MARCA_A);
      preguntas = [];
      const vista = render(<Pantalla />);
      // Sin evento: la pestaña estaba congelada o en la caché de «atrás».
      window.localStorage.setItem(CLAVE, MARCA_B);
      expect(estado()).toBe("vigente · cerrado");
      await act(async () => {
        volver();
      });
      expect(estado()).toBe("en duda · cerrado");
      expect(preguntas).toHaveLength(1);
      vista.unmount();
    }
  });

  it("un `clear()` se lleva la marca aunque el evento no la nombre", async () => {
    montar();
    await act(async () => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(estado()).toBe("en duda · cerrado");
  });

  it("no pregunta dos veces mientras la primera está en el aire", async () => {
    montar();
    await otraPestana(MARCA_B);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await otraPestana(null);
    expect(preguntas).toHaveLength(1);
  });
});

describe("lo que contesta el servidor", () => {
  it("se le pregunta de verdad, sin caché y sin seguir redirecciones", async () => {
    montar();
    await otraPestana(MARCA_B);
    expect(preguntas[0]!.url).toBe("/dashboard/cuenta-vigente");
    expect(preguntas[0]!.init).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    });
  });

  it("es otra cuenta: la pestaña se va, y no abre nada mientras", async () => {
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(MARCA_B);
    await servidorDice(json({ marca: MARCA_B }));

    expect(ir.mock.calls).toEqual([["/dashboard"]]);
    expect(estado()).toBe("en duda · cerrado");
    // La marca ajena no se pisa: es la buena.
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
  });

  it.each([
    ["una redirección del middleware", { type: "opaqueredirect", ok: false }],
    ["la propia ruta, sin sesión", json({ marca: null })],
  ] as [string, Partial<Response>][])(
    "no hay sesión (%s): la pestaña se va",
    async (_, r) => {
      const ctx = montar();
      await abrir(ctx);
      await otraPestana(null);
      await servidorDice(r);
      expect(ir.mock.calls).toEqual([["/dashboard"]]);
      expect(estado()).toBe("en duda · cerrado");
    },
  );

  it("es la misma: se recupera la marca y se puede volver a abrir", async () => {
    // Una pestaña que aún cargaba escribió la suya tarde. La sesión es nuestra.
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(MARCA_B);
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
    await servidorDice(json({ marca: MARCA_A }));

    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_A);
    expect(estado()).toBe("vigente · cerrado");
    expect(ir).not.toHaveBeenCalled();
    await abrir(ctx);
    // Contestada la duda, volver a la pestaña no cierra nada.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(estado()).toBe("vigente · abierto");
    expect(preguntas).toHaveLength(1);
    // Y sigue vigilando.
    await otraPestana(MARCA_B);
    expect(estado()).toBe("en duda · cerrado");
    expect(preguntas).toHaveLength(2);
  });

  it("una respuesta de antes no vale: si entretanto cambió, pregunta otra vez", async () => {
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(null);
    // Mientras contesta, en la otra pestaña ya entró B.
    await otraPestana(MARCA_B);
    expect(preguntas).toHaveLength(1);
    await servidorDice(json({ marca: MARCA_A }));

    expect(estado()).toBe("en duda · cerrado");
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
    expect(preguntas).toHaveLength(2);
    await servidorDice(json({ marca: MARCA_B }));
    expect(ir.mock.calls).toEqual([["/dashboard"]]);
  });

  it("tampoco si el cambio llegó sin avisar", async () => {
    montar();
    await otraPestana(null);
    window.localStorage.setItem(CLAVE, MARCA_B);
    await servidorDice(json({ marca: MARCA_A }));
    expect(estado()).toBe("en duda · cerrado");
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
    expect(preguntas).toHaveLength(2);
  });

  it("tampoco si entró y salió alguien, y la marca quedó como estaba", async () => {
    montar();
    await otraPestana(null);
    await otraPestana(MARCA_B);
    await otraPestana(null);
    await servidorDice(json({ marca: MARCA_A }));
    expect(estado()).toBe("en duda · cerrado");
    expect(preguntas).toHaveLength(2);
  });

  it("y si otra vez dice que es ésta, se sigue", async () => {
    montar();
    await otraPestana(null);
    await otraPestana(MARCA_B);
    await servidorDice(json({ marca: MARCA_A }));
    await servidorDice(json({ marca: MARCA_A }));
    expect(estado()).toBe("vigente · cerrado");
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_A);
    expect(preguntas).toHaveLength(2);
  });

  it("mientras no conteste, la marca ajena no se pisa y nada se abre", async () => {
    montar();
    await otraPestana(MARCA_B);
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
    expect(estado()).toBe("en duda · cerrado");
  });
});

describe("el servidor no contesta: sigue cerrada hasta que lo haga", () => {
  it.each([
    ["sin red", () => preguntas.at(-1)!.fallar()],
    ["un 503", () => preguntas.at(-1)!.contestar({ ok: false, type: "basic" })],
    [
      "algo que no es la respuesta",
      () => preguntas.at(-1)!.contestar(json({ otra: "cosa" })),
    ],
    [
      "una página en vez de JSON",
      () =>
        preguntas.at(-1)!.contestar({
          ok: true,
          type: "basic",
          json: async () => {
            throw new SyntaxError("<");
          },
        }),
    ],
  ] as [string, () => void][])("%s", async (_, pasa) => {
    vi.useFakeTimers();
    montar();
    await otraPestana(MARCA_B);
    await act(async () => pasa());

    expect(estado()).toBe("en duda · cerrado");
    expect(ir).not.toHaveBeenCalled();
    expect(preguntas).toHaveLength(1);

    // Vuelve a preguntar sola, aunque la marca haya vuelto a ser la suya.
    window.localStorage.setItem(CLAVE, MARCA_A);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(preguntas).toHaveLength(2);
    await servidorDice(json({ marca: MARCA_A }));
    expect(estado()).toBe("vigente · cerrado");
  });

  it("no corta una pregunta en vuelo: perdería el token que renueva", async () => {
    vi.useFakeTimers();
    montar();
    await otraPestana(MARCA_B);
    expect(preguntas[0]!.init.signal).toBeUndefined();
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(preguntas).toHaveLength(1);
    expect(estado()).toBe("en duda · cerrado");
    // Y cuando llega, vale.
    await servidorDice(json({ marca: MARCA_A }));
    expect(estado()).toBe("vigente · cerrado");
  });

  it("que la marca vuelva a ser la suya no contesta nada: sigue preguntando", async () => {
    vi.useFakeTimers();
    montar();
    await otraPestana(MARCA_B);
    await act(async () => preguntas[0]!.fallar());
    await otraPestana(MARCA_A);
    expect(estado()).toBe("en duda · cerrado");
    expect(preguntas).toHaveLength(2);
  });

  it("volver muchas veces no multiplica los reintentos", async () => {
    vi.useFakeTimers();
    montar();
    await otraPestana(MARCA_B);
    await act(async () => preguntas.at(-1)!.fallar());
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      await act(async () => preguntas.at(-1)!.fallar());
    }
    expect(preguntas).toHaveLength(6);
    for (let i = 1; i <= 4; i++) {
      await act(async () => vi.advanceTimersByTimeAsync(5_000));
      expect(preguntas).toHaveLength(6 + i);
      await act(async () => preguntas.at(-1)!.fallar());
    }
  });

  it("volver a la pestaña pregunta sin esperar al reintento", async () => {
    vi.useFakeTimers();
    montar();
    await otraPestana(MARCA_B);
    await act(async () => preguntas[0]!.fallar());
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(preguntas).toHaveLength(2);
    // Y el reintento pendiente no hace otra.
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(preguntas).toHaveLength(2);
  });

  it("lo que llega después de irse no hace nada", async () => {
    const vista = render(<Pantalla />);
    await otraPestana(MARCA_B);
    vista.unmount();
    await servidorDice(json({ marca: MARCA_B }));
    expect(ir).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
  });
});

describe("varias pestañas a la vez", () => {
  it("preguntan por turno, si el navegador sabe", async () => {
    const turno = vi.fn(async (_: string, f: () => unknown) => f());
    vi.stubGlobal("navigator", { ...navigator, locks: { request: turno } });
    montar();
    await otraPestana(MARCA_B);
    expect(turno).toHaveBeenCalledTimes(1);
    expect(turno.mock.calls[0]![0]).toBe(CLAVE);
    expect(preguntas).toHaveLength(1);
    await servidorDice(json({ marca: MARCA_A }));
    expect(estado()).toBe("vigente · cerrado");
  });
});

describe("con la sesión confirmada, lo guardado se gobierna como siempre", () => {
  it("bloquear lo retira", async () => {
    const ctx = montar();
    await abrir(ctx);
    expect(window.localStorage.getItem(SOBRE)).not.toBeNull();
    await act(async () => ctx().lock());
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    expect(galleta.historia.at(-1)).toBe("borrar");
  });

  it("dejar de recordar también, y volver a recordar lo guarda", async () => {
    const ctx = montar();
    await abrir(ctx);
    await act(async () => ctx().setRemember(false));
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    await act(async () => ctx().setRemember(true));
    expect(window.localStorage.getItem(SOBRE)).not.toBeNull();
  });
});

describe("lo que NO cierra nada", () => {
  it("otra pestaña de la misma cuenta, u otra clave del almacenamiento", async () => {
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(MARCA_A);
    await otraPestana("lo-que-sea", "psico:diary:remember");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(estado()).toBe("vigente · abierto");
    expect(preguntas).toHaveLength(0);
  });

  it("un navegador que no deja escribir: se confirma una vez y no compara más", async () => {
    window.localStorage.clear();
    const escribir = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      const ctx = montar();
      expect(estado()).toBe("en duda · cerrado");
      await servidorDice(json({ marca: MARCA_A }));
      await abrir(ctx);
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(estado()).toBe("vigente · abierto");
      expect(preguntas).toHaveLength(1);
    } finally {
      escribir.mockRestore();
    }
  });

  it("al desmontar deja de escuchar", async () => {
    const vista = render(<Pantalla />);
    vista.unmount();
    await otraPestana(MARCA_B);
    expect(preguntas).toHaveLength(0);
  });
});

function Captura({ onCtx }: { onCtx: (c: DiaryKeyContextValue) => void }) {
  onCtx(useDiaryKey());
  return null;
}

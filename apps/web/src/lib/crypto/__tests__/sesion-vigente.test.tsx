import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Suspense, useState } from "react";
import type * as Cripto from "@psico/crypto";
import { MASTER_KEY_LEN } from "@psico/crypto";

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
 * llega un evento `storage`. El refresco del layout se finge como lo hace Next:
 * una transición que se queda pendiente hasta que llega el resultado.
 */

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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

interface Layout {
  marca: string;
  sal: string | null;
}
/** Lo que el servidor contestará al próximo refresco, y cuándo. */
let contestar: (l: Layout) => Promise<void>;

function Pantalla({
  inicial,
  onCtx,
  dentro,
}: {
  inicial: Layout;
  onCtx?: (c: DiaryKeyContextValue) => void;
  dentro?: React.ReactNode;
}) {
  const [recurso, setRecurso] = useState<{
    valor?: Layout;
    promesa?: Promise<void>;
  }>({ valor: inicial });

  router.refresh.mockImplementation(() => {
    let soltar!: () => void;
    const nuevo: { valor?: Layout; promesa?: Promise<void> } = {
      promesa: new Promise<void>((r) => {
        soltar = r;
      }),
    };
    contestar = async (l) => {
      await act(async () => {
        nuevo.valor = l;
        soltar();
        await nuevo.promesa;
      });
    };
    setRecurso(nuevo);
  });

  return (
    <Suspense fallback={<p>cargando</p>}>
      <Leido recurso={recurso} onCtx={onCtx} dentro={dentro} />
    </Suspense>
  );
}

function Leido({
  recurso,
  onCtx,
  dentro,
}: {
  recurso: { valor?: Layout; promesa?: Promise<void> };
  onCtx?: (c: DiaryKeyContextValue) => void;
  dentro?: React.ReactNode;
}) {
  if (!recurso.valor) throw recurso.promesa;
  return (
    <SesionVigenteProvider marca={recurso.valor.marca}>
      <DiaryKeyProvider cryptoSalt={recurso.valor.sal} initialWrapKey={null}>
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

function montar(dentro?: React.ReactNode) {
  let ctx: DiaryKeyContextValue | null = null;
  render(
    <Pantalla
      inicial={{ marca: MARCA_A, sal: SAL_A }}
      onCtx={(c) => {
        ctx = c;
      }}
      dentro={dentro}
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
  router.refresh.mockReset();
  galleta.historia = [];
});

// ─────────────────────────────────────────────────────────────────────────────

describe("la marca", () => {
  it("se escribe al montar el panel y no dice nada de la persona", () => {
    montar();
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_A);
    expect(estado()).toBe("vigente · cerrado");
  });

  it("el acceso y el registro la retiran", () => {
    window.localStorage.setItem(CLAVE, MARCA_A);
    render(<RetirarMarcaDeCuenta />);
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
  });

  it("sin cuenta conocida no se escribe ni se vigila", async () => {
    render(
      <SesionVigenteProvider marca={null}>
        <p data-testid="nada" />
      </SesionVigenteProvider>,
    );
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
    await otraPestana(MARCA_B);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("otra pestaña cambió de cuenta", () => {
  it("se dejan de entregar claves en el acto y se refresca el layout", async () => {
    const ctx = montar();
    await abrir(ctx);
    const clave = ctx().key!;
    await otraPestana(MARCA_B);

    expect(estado()).toBe("en duda · cerrado");
    expect(clave.every((x) => x === 0)).toBe(true);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("salir también cuenta: la marca desaparece", async () => {
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(null);
    expect(estado()).toBe("en duda · cerrado");
    expect(router.refresh).toHaveBeenCalledTimes(1);
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
    expect(ctx().error).toMatch(/sesión cambió en otra pestaña/);
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
    await contestar({ marca: MARCA_A, sal: SAL_A });
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
      window.localStorage.clear();
      router.refresh.mockReset();
      const vista = render(
        <Pantalla inicial={{ marca: MARCA_A, sal: SAL_A }} />,
      );
      // Sin evento: la pestaña estaba congelada o en la caché de «atrás».
      window.localStorage.setItem(CLAVE, MARCA_B);
      expect(estado()).toBe("vigente · cerrado");
      await act(async () => {
        volver();
      });
      expect(estado()).toBe("en duda · cerrado");
      expect(router.refresh).toHaveBeenCalledTimes(1);
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
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("lo que contesta el servidor", () => {
  it("es otra cuenta: su marca, y sin claves de nadie", async () => {
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(MARCA_B);
    await contestar({ marca: MARCA_B, sal: "MTIzNDU2Nzg5MDEyMzQ1Ng" });
    expect(estado()).toBe("vigente · cerrado");
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
  });

  it("es la misma: se recupera la marca y se puede volver a abrir", async () => {
    // Una pestaña que aún cargaba escribió la suya tarde. La sesión es nuestra.
    const ctx = montar();
    await abrir(ctx);
    await otraPestana(MARCA_B);
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
    await contestar({ marca: MARCA_A, sal: SAL_A });

    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_A);
    expect(estado()).toBe("vigente · cerrado");
    await abrir(ctx);
    // Y sigue vigilando.
    await otraPestana(MARCA_B);
    expect(estado()).toBe("en duda · cerrado");
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("mientras no conteste, la marca ajena no se pisa", async () => {
    montar();
    await otraPestana(MARCA_B);
    expect(window.localStorage.getItem(CLAVE)).toBe(MARCA_B);
    expect(estado()).toBe("en duda · cerrado");
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
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("un navegador que no deja escribir: no hay con qué comparar", async () => {
    const escribir = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      const ctx = montar();
      await abrir(ctx);
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(estado()).toBe("vigente · abierto");
      expect(router.refresh).not.toHaveBeenCalled();
    } finally {
      escribir.mockRestore();
    }
  });

  it("al desmontar deja de escuchar", async () => {
    const vista = render(<Pantalla inicial={{ marca: MARCA_A, sal: SAL_A }} />);
    vista.unmount();
    await otraPestana(MARCA_B);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

function Captura({ onCtx }: { onCtx: (c: DiaryKeyContextValue) => void }) {
  onCtx(useDiaryKey());
  return null;
}

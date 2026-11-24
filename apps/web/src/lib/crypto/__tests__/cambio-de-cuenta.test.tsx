import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type * as Cripto from "@psico/crypto";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decryptString,
  deriveSubKey,
  DIARY_KEY_INFO,
  ECO_KEY_INFO,
} from "@psico/crypto";

import {
  DiaryKeyProvider,
  useDiaryKey,
  type DiaryKeyContextValue,
} from "../diary-key-context";

/**
 * Cambiar de cuenta con el Diario abierto y el proveedor MONTADO.
 *
 * EL FALLO QUE ESTO IMPIDE. La cookie de sesión es del navegador entero. Si otra
 * pestaña entra con otra cuenta, el panel de ésta puede recibir la sal nueva sin
 * desmontarse —guardar Perfil, repetir el tour, marcar «Recordar» o guardar una
 * reflexión refrescan el layout—. El proveedor actualizaba a quién pertenecía el
 * sobre y conservaba las claves: la segunda persona escribía con la llave de la
 * primera, y «Recordar» guardaba esa llave a su nombre. Reproducido en un
 * navegador: la entrada quedaba en la cuenta B y sólo se abría con la clave de A.
 *
 * Las pruebas de `master-key-lifecycle` cambian de cuenta desmontando, así que no
 * lo veían.
 *
 * Argon2id es el de verdad. Lo único que se añade es memoria —la misma
 * contraseña y sal no se deriva dos veces— y una compuerta, para poder tener una
 * derivación en vuelo mientras la cuenta cambia.
 */

const compuerta = vi.hoisted(() => ({
  esperar: null as Promise<void> | null,
  memo: new Map<string, Uint8Array>(),
}));

vi.mock("@psico/crypto", async (importOriginal) => {
  const real = await importOriginal<typeof Cripto>();
  return {
    ...real,
    deriveMasterKey: async (password: string, sal: string) => {
      const llave = `${password}|${sal}`;
      let clave = compuerta.memo.get(llave);
      if (!clave) {
        clave = await real.deriveMasterKey(password, sal);
        compuerta.memo.set(llave, new Uint8Array(clave));
      }
      // Se captura al empezar: cada derivación espera a SU compuerta.
      if (compuerta.esperar) await compuerta.esperar;
      return new Uint8Array(clave);
    },
  };
});

/** Lo que el servidor habría recibido, en orden. */
const galleta = {
  valor: null as string | null,
  historia: [] as string[],
  /** Si no es null, guardar la mitad de la llave se queda esperando. */
  esperar: null as Promise<void> | null,
};
vi.mock("@/actions/diary-session", () => ({
  saveDiaryWrapKey: vi.fn(async (v: string) => {
    galleta.historia.push("guardar");
    if (galleta.esperar) await galleta.esperar;
    galleta.valor = v;
  }),
  clearDiaryWrapKey: vi.fn(async () => {
    galleta.historia.push("borrar");
    galleta.valor = null;
  }),
}));

const { deriveMasterKey } = await import("@psico/crypto");

const SAL_A = "YWJjZGVmZ2hpamtsbW5vcA";
const SAL_B = "MTIzNDU2Nzg5MDEyMzQ1Ng";
/** La sal nueva de A después de cambiar su contraseña. */
const SAL_A2 = "cXdlcnR5dWlvcGFzZGZnaA";
const CLAVE_A = "contrasena-de-la-cuenta-a";
const CLAVE_B = "contrasena-de-la-cuenta-b";
const CLAVE_A2 = "contrasena-nueva-de-a";
const SOBRE = "psico:diary:wrapped";

/** Lo que un consumidor recibe en CADA render, junto con la cuenta que había. */
interface Visto {
  cuenta: string | null;
  key: number[] | null;
  ecoKey: number[] | null;
  masterKey: number[] | null;
}

const copia = (b: Uint8Array | null) => (b ? Array.from(b) : null);

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
  // En el RENDER, no en un efecto: si las claves sólo se limpian en un efecto,
  // hay un render en el que la pantalla de B tiene las de A, y es éste.
  vistos.push({
    cuenta,
    key: copia(ctx.key),
    ecoKey: copia(ctx.ecoKey),
    masterKey: copia(ctx.masterKey),
  });
  onCtx(ctx);
  return null;
}

function montar(sal: string | null = SAL_A, llave: string | null = null) {
  let ctx: DiaryKeyContextValue | null = null;
  const vistos: Visto[] = [];
  const arbol = (s: string | null, l: string | null) => (
    <DiaryKeyProvider cryptoSalt={s} initialWrapKey={l}>
      <Sonda
        cuenta={s}
        vistos={vistos}
        onCtx={(c) => {
          ctx = c;
        }}
      />
    </DiaryKeyProvider>
  );
  const vista = render(arbol(sal, llave));
  return {
    vista,
    vistos,
    ctx: () => ctx as unknown as DiaryKeyContextValue,
    /** El layout trae otra cuenta, sin desmontar nada. */
    pasarA: (s: string | null, l: string | null = galleta.valor) =>
      act(async () => {
        vista.rerender(arbol(s, l));
      }),
  };
}

async function desbloquear(c: () => DiaryKeyContextValue, clave: string) {
  await act(async () => {
    await c().unlock(clave);
  });
  expect(c().key).not.toBeNull();
}

/** Abre el sobre guardado con una mitad de llave. null si no hay o no abre. */
function abrirSobre(llave: string | null) {
  const crudo = window.localStorage.getItem(SOBRE);
  if (!crudo || !llave) return null;
  try {
    const { ciphertext, nonce } = JSON.parse(crudo);
    const [dueno, clave] = decryptString(
      { ciphertext, nonce },
      base64UrlToBytes(llave),
    ).split(".");
    return { dueno, clave };
  } catch {
    return null;
  }
}

const b64 = async (clave: string, sal: string) =>
  bytesToBase64Url(await deriveMasterKey(clave, sal));

function abrirCompuerta() {
  let soltar!: () => void;
  compuerta.esperar = new Promise<void>((r) => {
    soltar = r;
  });
  return () => {
    compuerta.esperar = null;
    soltar();
  };
}

/** Ningún render de la cuenta `cuenta` recibió nada. */
function sinClaves(vistos: Visto[], cuenta: string | null) {
  const suyos = vistos.filter((v) => v.cuenta === cuenta);
  expect(suyos.length).toBeGreaterThan(0);
  for (const v of suyos) {
    expect(v.key).toBeNull();
    expect(v.ecoKey).toBeNull();
    expect(v.masterKey).toBeNull();
  }
}

beforeEach(() => {
  window.localStorage.clear();
  galleta.valor = null;
  galleta.historia = [];
  galleta.esperar = null;
  compuerta.esperar = null;
});

// ─────────────────────────────────────────────────────────────────────────────

describe("la cuenta cambia con el Diario abierto", () => {
  it("ningún render con la cuenta B recibe las claves de A, ni el primero", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    await p.pasarA(SAL_B);

    sinClaves(p.vistos, SAL_B);
    expect(p.ctx().key).toBeNull();
    expect(p.ctx().error).toBeNull();
    expect(p.ctx().isLegacyAccount).toBe(false);
  }, 30000);

  it("y las de A quedan a cero en memoria", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    const bufers = [p.ctx().key!, p.ctx().ecoKey!, p.ctx().masterKey!];
    await p.pasarA(SAL_B);
    for (const b of bufers) expect(b.every((x) => x === 0)).toBe(true);
  }, 30000);

  it("«Recordar» apagado y encendido no guarda la clave de A a nombre de B", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    await p.pasarA(SAL_B);

    await act(async () => p.ctx().setRemember(false));
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    await act(async () => p.ctx().setRemember(true));

    // No hay clave abierta, así que no hay nada que guardar.
    expect(abrirSobre(galleta.valor)).toBeNull();
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
  }, 30000);

  it("el sobre de A se retira al llegar B: dispositivo y galleta", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    expect(abrirSobre(galleta.valor)?.dueno).toBe(SAL_A);
    await p.pasarA(SAL_B);
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    expect(galleta.valor).toBeNull();
  }, 30000);

  it("también si lo guardó otra pestaña de A, con otra mitad de la llave", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    const otra = montar();
    await desbloquear(otra.ctx, CLAVE_A);
    otra.vista.unmount();
    expect(abrirSobre(galleta.valor)?.dueno).toBe(SAL_A);

    // La galleta que trae el layout de B es todavía la de esa otra pestaña.
    await p.pasarA(SAL_B, galleta.valor);
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    expect(galleta.valor).toBeNull();
  }, 30000);

  it("el error que A dejó en la reja no es de B", async () => {
    const p = montar();
    await act(async () => p.ctx().adoptMasterKey(new Uint8Array(3)));
    expect(p.ctx().error).not.toBeNull();
    await p.pasarA(SAL_B);
    expect(p.ctx().error).toBeNull();
  });

  it("B desbloquea lo suyo: su clave, y un sobre con su dueño y su clave", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    await p.pasarA(SAL_B);
    await desbloquear(p.ctx, CLAVE_B);

    const maestraB = await deriveMasterKey(CLAVE_B, SAL_B);
    expect(copia(p.ctx().masterKey)).toEqual(Array.from(maestraB));
    expect(copia(p.ctx().key)).toEqual(
      Array.from(deriveSubKey(maestraB, DIARY_KEY_INFO)),
    );
    expect(copia(p.ctx().ecoKey)).toEqual(
      Array.from(deriveSubKey(maestraB, ECO_KEY_INFO)),
    );
    expect(abrirSobre(galleta.valor)).toEqual({
      dueno: SAL_B,
      clave: bytesToBase64Url(maestraB),
    });
  }, 30000);

  it("A → cuenta sin cifrado: nada abierto y nada adoptable", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    await p.pasarA(null);
    sinClaves(p.vistos, null);
    expect(p.ctx().isLegacyAccount).toBe(true);

    const suelta = await deriveMasterKey(CLAVE_A, SAL_A);
    await act(async () => p.ctx().adoptMasterKey(suelta));
    sinClaves(p.vistos, null);
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
  }, 30000);

  it("A → B → A: vuelve cerrado; nadie hereda lo que estaba abierto antes", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    await p.pasarA(SAL_B);
    const desde = p.vistos.length;
    await p.pasarA(SAL_A);

    for (const v of p.vistos.slice(desde)) expect(v.key).toBeNull();
    expect(p.ctx().key).toBeNull();
    await desbloquear(p.ctx, CLAVE_A);
  }, 30000);

  it("control contrario: un refresco de la MISMA cuenta no cierra nada", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    const antes = copia(p.ctx().key);
    const desde = p.vistos.length;
    // Guardar el sobre cambia la galleta, así que la prop llega distinta.
    await p.pasarA(SAL_A, galleta.valor);
    await p.pasarA(SAL_A, null);

    for (const v of p.vistos.slice(desde)) expect(v.key).toEqual(antes);
    expect(abrirSobre(galleta.valor)?.dueno).toBe(SAL_A);
  }, 30000);
});

describe("operaciones que empezaron con la cuenta anterior", () => {
  it("un desbloqueo de A que termina con la sesión en B no se adopta ni se guarda", async () => {
    const p = montar();
    const soltar = abrirCompuerta();
    let fin!: Promise<void>;
    await act(async () => {
      fin = p.ctx().unlock(CLAVE_A);
    });
    expect(p.ctx().unlocking).toBe(true);
    await p.pasarA(SAL_B);
    // La reja de B no se queda esperando a la contraseña de otra persona.
    expect(p.ctx().unlocking).toBe(false);

    await act(async () => {
      soltar();
      await fin;
    });
    sinClaves(p.vistos, SAL_B);
    expect(p.ctx().error).toBeNull();
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    expect(galleta.historia).not.toContain("guardar");
  }, 30000);

  it("…ni pisa el que B haya empezado mientras tanto", async () => {
    const p = montar();
    const soltarA = abrirCompuerta();
    let finA!: Promise<void>;
    await act(async () => {
      finA = p.ctx().unlock(CLAVE_A);
    });
    await p.pasarA(SAL_B);

    const soltarB = abrirCompuerta();
    let finB!: Promise<void>;
    await act(async () => {
      finB = p.ctx().unlock(CLAVE_B);
    });
    await act(async () => {
      soltarA();
      await finA;
    });
    // El de B sigue en marcha: terminar el de A no le apaga el indicador.
    expect(p.ctx().unlocking).toBe(true);
    expect(p.ctx().key).toBeNull();

    await act(async () => {
      soltarB();
      await finB;
    });
    expect(p.ctx().unlocking).toBe(false);
    expect(copia(p.ctx().masterKey)).toEqual(
      Array.from(await deriveMasterKey(CLAVE_B, SAL_B)),
    );
    expect(abrirSobre(galleta.valor)?.dueno).toBe(SAL_B);
  }, 30000);

  it("…ni deja un sobre después de salir del panel", async () => {
    const p = montar();
    const soltar = abrirCompuerta();
    let fin!: Promise<void>;
    await act(async () => {
      fin = p.ctx().unlock(CLAVE_A);
    });
    p.vista.unmount();
    await act(async () => {
      soltar();
      await fin;
    });
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    expect(galleta.historia).not.toContain("guardar");
  }, 30000);

  it("un sobre de A a medio guardar no sobrevive a la llegada de B", async () => {
    const p = montar();
    let soltar!: () => void;
    galleta.esperar = new Promise<void>((r) => {
      soltar = r;
    });
    await desbloquear(p.ctx, CLAVE_A);
    expect(window.localStorage.getItem(SOBRE)).not.toBeNull();

    // La mitad de la galleta sigue de camino: el layout de B llega sin ella.
    await p.pasarA(SAL_B, null);
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    expect(galleta.historia).toEqual(["guardar", "borrar"]);
    await act(async () => soltar());
    expect(abrirSobre(galleta.valor)).toBeNull();
  }, 30000);

  it("el cambio de contraseña de A que termina tarde no entra en la sesión de B", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    // `ChangePasswordCard` guarda la función al empezar y la llama al final,
    // después de dos peticiones.
    const adoptarDeA = p.ctx().adoptMasterKey;
    const maestraNueva = await deriveMasterKey(CLAVE_A2, SAL_A2);
    await p.pasarA(SAL_B);
    await desbloquear(p.ctx, CLAVE_B);
    const claveDeB = copia(p.ctx().key);
    const sobreDeB = window.localStorage.getItem(SOBRE);

    await act(async () => adoptarDeA(maestraNueva, SAL_A2));

    expect(copia(p.ctx().key)).toEqual(claveDeB);
    expect(window.localStorage.getItem(SOBRE)).toBe(sobreDeB);
    // Y con B todavía cerrada tampoco.
    await act(async () => p.ctx().lock());
    await act(async () => adoptarDeA(maestraNueva, SAL_A2));
    expect(p.ctx().key).toBeNull();
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
  }, 30000);

  it("un «Recordar» de la pantalla de A, pulsado tarde, no guarda nada", async () => {
    // La función vieja sostiene un búfer que ya está a cero: guardarlo dejaría
    // en el dispositivo un sobre de A con una clave que cualquiera conoce.
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    const recordarDeA = p.ctx().setRemember;
    await p.pasarA(SAL_B);
    await act(async () => recordarDeA(true));
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
    expect(galleta.valor).toBeNull();
  }, 30000);
});

describe("el sobre de B, si ya lo tiene, es suyo", () => {
  it("no se abre solo en el proveedor de A, pero tampoco se borra", async () => {
    // B entró y desbloqueó en OTRA pestaña: el almacenamiento y la galleta ya
    // son los suyos cuando ésta se entera.
    const otra = montar(SAL_B);
    await desbloquear(otra.ctx, CLAVE_B);
    const llaveDeB = galleta.valor;
    const sobreDeB = window.localStorage.getItem(SOBRE);
    otra.vista.unmount();
    window.localStorage.clear();

    const p = montar(SAL_A);
    await desbloquear(p.ctx, CLAVE_A);
    window.localStorage.setItem(SOBRE, sobreDeB!);
    galleta.valor = llaveDeB;
    galleta.historia = [];

    await p.pasarA(SAL_B, llaveDeB);
    sinClaves(p.vistos, SAL_B);
    expect(window.localStorage.getItem(SOBRE)).toBe(sobreDeB);
    expect(galleta.historia).toEqual([]);
    p.vista.unmount();

    // Y en la carga siguiente se restaura, como siempre.
    const despues = montar(SAL_B, llaveDeB);
    expect(copia(despues.ctx().masterKey)).toEqual(
      Array.from(await deriveMasterKey(CLAVE_B, SAL_B)),
    );
  }, 30000);

  it("tampoco si otra pestaña lo cambió después de que el servidor contestara", async () => {
    // Ni la llave de esta pestaña ni la del layout lo abren: no se sabe de quién
    // es, y lo que no se sabe no se borra. Lo decide el arranque siguiente.
    const p = montar(SAL_A);
    await desbloquear(p.ctx, CLAVE_A);
    const llaveDeA = galleta.valor;
    const ajeno = JSON.stringify({
      ciphertext: "de-otra-pestana",
      nonce: "de-otra-pestana",
      savedAt: "x",
    });
    window.localStorage.setItem(SOBRE, ajeno);
    galleta.historia = [];
    await p.pasarA(SAL_B, llaveDeA);
    expect(window.localStorage.getItem(SOBRE)).toBe(ajeno);
    expect(galleta.historia).toEqual([]);
  }, 30000);
});

describe("cambiar la contraseña sigue dejando la sesión abierta", () => {
  it("la sal nueva llega DESPUÉS de adoptar, y el Diario no se cierra nunca", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    const maestraNueva = await deriveMasterKey(CLAVE_A2, SAL_A2);
    const esperada = Array.from(deriveSubKey(maestraNueva, DIARY_KEY_INFO));

    const desde = p.vistos.length;
    await act(async () => p.ctx().adoptMasterKey(maestraNueva, SAL_A2));
    expect(copia(p.ctx().key)).toEqual(esperada);
    // El layout todavía trae la sal anterior…
    await p.pasarA(SAL_A);
    expect(copia(p.ctx().key)).toEqual(esperada);
    // …y por fin la nueva.
    await p.pasarA(SAL_A2);
    expect(copia(p.ctx().key)).toEqual(esperada);
    expect(p.ctx().error).toBeNull();
    for (const v of p.vistos.slice(desde)) expect(v.key).not.toBeNull();
    expect(abrirSobre(galleta.valor)).toEqual({
      dueno: SAL_A2,
      clave: await b64(CLAVE_A2, SAL_A2),
    });
  }, 30000);

  it("antes de que llegue, «Recordar» guarda la clave nueva con su dueño nuevo", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    const maestraNueva = await deriveMasterKey(CLAVE_A2, SAL_A2);
    await act(async () => p.ctx().adoptMasterKey(maestraNueva, SAL_A2));
    await act(async () => p.ctx().setRemember(false));
    await act(async () => p.ctx().setRemember(true));
    expect(abrirSobre(galleta.valor)).toEqual({
      dueno: SAL_A2,
      clave: await b64(CLAVE_A2, SAL_A2),
    });
  }, 30000);

  it("si en ese hueco entra otra cuenta, se cierra igual", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    const maestraNueva = await deriveMasterKey(CLAVE_A2, SAL_A2);
    await act(async () => p.ctx().adoptMasterKey(maestraNueva, SAL_A2));
    await p.pasarA(SAL_B);
    sinClaves(p.vistos, SAL_B);
    expect(window.localStorage.getItem(SOBRE)).toBeNull();
  }, 30000);

  it("y una vez llegada la nueva, la anterior ya no vale", async () => {
    const p = montar();
    await desbloquear(p.ctx, CLAVE_A);
    const maestraNueva = await deriveMasterKey(CLAVE_A2, SAL_A2);
    await act(async () => p.ctx().adoptMasterKey(maestraNueva, SAL_A2));
    await p.pasarA(SAL_A2);
    expect(p.ctx().key).not.toBeNull();
    const desde = p.vistos.length;
    await p.pasarA(SAL_A);
    for (const v of p.vistos.slice(desde)) expect(v.key).toBeNull();
  }, 30000);
});

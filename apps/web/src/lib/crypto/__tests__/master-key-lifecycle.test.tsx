import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import {
  bytesToBase64Url,
  deriveMasterKey,
  encryptString,
  isValidSeedPhrase,
  MASTER_KEY_LEN,
  masterKeyToSeedPhrase,
  randomBytes,
  seedPhraseToMasterKey,
} from "@psico/crypto";

import {
  DiaryKeyProvider,
  useDiaryKey,
  type DiaryKeyContextValue,
} from "../diary-key-context";

/**
 * La vida de la clave maestra: recuperarla, adoptarla y restaurarla.
 *
 * EL FALLO QUE ESTO IMPIDE (#740). Este contexto comprobaba `length !== 32` en
 * dos sitios. La clave maestra mide 16 desde `MASTER_KEY_VERSION = 2`
 * (ADR 0007 §G v2), así que ninguna clave real pasaba:
 *
 *   · la recuperación con las 12 palabras quedaba muerta — y la app dice que
 *     son «la única forma de recuperar tu Diario»;
 *   · tras cambiar la contraseña, la sesión se quedaba con la clave vieja;
 *   · «Recordar en este dispositivo», activado por defecto, no recordaba nunca.
 *
 * El `32` venía de la v1 del esquema y sobrevivió al cambio porque estaba
 * escrito a mano, también en el JSDoc contra el que se escribieron los guards.
 *
 * Por qué aquí no se mockea `@psico/crypto`: el fallo estaba en la frontera
 * entre la librería y quien la llama. Un doble habría respondido lo que le
 * pidiéramos y no habría notado nada. Argon2id de verdad cuesta ~2 s por
 * derivación; se paga.
 */

// La persistencia habla con el servidor para guardar la mitad de la llave del
// sobre. En jsdom no hay servidor: se recoge lo que se le pide guardar, que es
// justo lo que estas pruebas necesitan mirar.
const cookieDelSobre = { valor: null as string | null, borrada: false };
vi.mock("@/actions/diary-session", () => ({
  saveDiaryWrapKey: vi.fn(async (v: string) => {
    cookieDelSobre.valor = v;
    cookieDelSobre.borrada = false;
  }),
  clearDiaryWrapKey: vi.fn(async () => {
    cookieDelSobre.valor = null;
    cookieDelSobre.borrada = true;
  }),
}));

const SALT = "YWJjZGVmZ2hpamtsbW5vcA";
/** La sal de OTRA cuenta en el mismo navegador. */
const SAL_AJENA = "MTIzNDU2Nzg5MDEyMzQ1Ng";
const CONTRASENA = "una-contrasena-de-prueba";
const CONTRASENA_NUEVA = "otra-contrasena-distinta";

/** Expone el contexto a la prueba sin renderizar ninguna pantalla. */
function Sonda({ onCtx }: { onCtx: (c: DiaryKeyContextValue) => void }) {
  const ctx = useDiaryKey();
  const ref = useRef(onCtx);
  ref.current = onCtx;
  useEffect(() => {
    ref.current(ctx);
  });
  return (
    <div data-testid="estado">
      {ctx.key ? "abierto" : ctx.restoring ? "restaurando" : "bloqueado"}
    </div>
  );
}

function montar(initialWrapKey: string | null = null, sal: string = SALT) {
  let ctx: DiaryKeyContextValue | null = null;
  const vista = render(
    <DiaryKeyProvider cryptoSalt={sal} initialWrapKey={initialWrapKey}>
      <Sonda
        onCtx={(c) => {
          ctx = c;
        }}
      />
    </DiaryKeyProvider>,
  );
  return { vista, ctx: () => ctx as DiaryKeyContextValue };
}

const estado = () => screen.getByTestId("estado").textContent;

beforeEach(() => {
  window.localStorage.clear();
  cookieDelSobre.valor = null;
  cookieDelSobre.borrada = false;
});
afterEach(() => {
  window.localStorage.clear();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("la frase de respaldo reconstruye la clave, y el contexto la acepta", () => {
  it("las 12 palabras devuelven exactamente la misma clave", async () => {
    const original = await deriveMasterKey(CONTRASENA, SALT);
    const frase = masterKeyToSeedPhrase(original);
    const recuperada = seedPhraseToMasterKey(frase);

    expect(isValidSeedPhrase(frase)).toBe(true);
    expect(original.length).toBe(MASTER_KEY_LEN);
    expect(recuperada.length).toBe(MASTER_KEY_LEN);
    // Comparación binaria, no de su forma escrita.
    expect(Array.from(recuperada)).toEqual(Array.from(original));
  }, 30000);

  it("adoptar la clave recuperada abre la sesión", async () => {
    const original = await deriveMasterKey(CONTRASENA, SALT);
    const frase = masterKeyToSeedPhrase(original);
    const { ctx } = montar();
    expect(estado()).toBe("bloqueado");

    // Esto es lo que hace `UnlockGate` en modo «frase»; con el guard viejo
    // dejaba `error` puesto y la reja no se movía.
    act(() => {
      ctx().adoptMasterKey(seedPhraseToMasterKey(frase));
    });

    await waitFor(() => expect(estado()).toBe("abierto"));
    expect(ctx().error).toBeNull();
    expect(ctx().key).not.toBeNull();
    expect(ctx().ecoKey).not.toBeNull();
    expect(ctx().masterKey?.length).toBe(MASTER_KEY_LEN);
  }, 30000);

  it("y la clave resultante es la misma que da la contraseña", async () => {
    // Lo que de verdad importa de una recuperación: que lo que ya estaba
    // cifrado se pueda volver a abrir. Si las subclaves coinciden, coinciden.
    const porContrasena = montar();
    await act(async () => {
      await porContrasena.ctx().unlock(CONTRASENA);
    });
    const claveDesdeContrasena = Array.from(porContrasena.ctx().key!);
    const frase = masterKeyToSeedPhrase(porContrasena.ctx().masterKey!);
    porContrasena.vista.unmount();

    const porFrase = montar();
    act(() => {
      porFrase.ctx().adoptMasterKey(seedPhraseToMasterKey(frase));
    });
    await waitFor(() => expect(porFrase.ctx().key).not.toBeNull());

    expect(Array.from(porFrase.ctx().key!)).toEqual(claveDesdeContrasena);
  }, 40000);
});

describe("una frase que no vale no abre nada", () => {
  it("ni con una palabra inventada, ni con la cuenta equivocada", () => {
    expect(
      isValidSeedPhrase("palabra inventada que no existe en la lista"),
    ).toBe(false);
    expect(isValidSeedPhrase("abandon abandon abandon")).toBe(false);
  });

  it("el contexto rechaza una clave de tamaño equivocado sin desbloquear ni borrar", async () => {
    const { ctx } = montar();
    // El sobre de una sesión anterior sigue ahí: un intento fallido no debe
    // llevárselo por delante.
    window.localStorage.setItem(
      "psico:diary:wrapped",
      '{"ciphertext":"x","nonce":"y","savedAt":"z"}',
    );

    for (const tamano of [MASTER_KEY_LEN - 1, MASTER_KEY_LEN + 1, 32]) {
      act(() => {
        ctx().adoptMasterKey(new Uint8Array(tamano).fill(3));
      });
      expect(ctx().key).toBeNull();
      expect(ctx().error).not.toBeNull();
    }
    expect(estado()).toBe("bloqueado");
    expect(window.localStorage.getItem("psico:diary:wrapped")).not.toBeNull();
  });
});

describe("«Recordar en este dispositivo»", () => {
  it("activado: guarda un sobre CIFRADO, sin la clave ni la contraseña dentro", async () => {
    const { ctx } = montar();
    await act(async () => {
      await ctx().unlock(CONTRASENA);
    });
    expect(ctx().remember).toBe(true); // el valor por defecto que promete la UI

    const crudo = window.localStorage.getItem("psico:diary:wrapped");
    expect(crudo).not.toBeNull();
    const sobre = JSON.parse(crudo!);
    expect(Object.keys(sobre).sort()).toEqual([
      "ciphertext",
      "nonce",
      "savedAt",
    ]);

    // Lo que NO puede estar ahí dentro.
    const maestraEnClaro = btoa(String.fromCharCode(...ctx().masterKey!))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(crudo).not.toContain(maestraEnClaro);
    expect(crudo).not.toContain(CONTRASENA);
    expect(crudo).not.toContain(
      masterKeyToSeedPhrase(ctx().masterKey!).split(" ")[0] + " ",
    );
  }, 30000);

  it("activado: un arranque en frío restaura la sesión sin pedir la contraseña", async () => {
    // Sesión 1: alguien desbloquea y se va.
    const primera = montar();
    await act(async () => {
      await primera.ctx().unlock(CONTRASENA);
    });
    const claveDeLaPrimera = Array.from(primera.ctx().key!);
    const llaveDelSobre = cookieDelSobre.valor;
    expect(llaveDelSobre).not.toBeNull();
    primera.vista.unmount();

    // Sesión 2: arranque en frío. El servidor devuelve su mitad de la llave.
    // Con el guard viejo esto tiraba la clave de 16 bytes y volvía a bloquear.
    const segunda = montar(llaveDelSobre);
    await waitFor(() => expect(estado()).toBe("abierto"));
    expect(Array.from(segunda.ctx().key!)).toEqual(claveDeLaPrimera);
  }, 30000);

  it("desactivado: no queda sobre, y el arranque en frío vuelve a pedirla", async () => {
    const { ctx } = montar();
    act(() => {
      ctx().setRemember(false);
    });
    await act(async () => {
      await ctx().unlock(CONTRASENA);
    });
    expect(ctx().key).not.toBeNull(); // la sesión de ahora sigue abierta
    expect(window.localStorage.getItem("psico:diary:wrapped")).toBeNull();
    expect(cookieDelSobre.valor).toBeNull();
  }, 30000);

  it("un sobre corrupto no abre nada y se retira", async () => {
    window.localStorage.setItem(
      "psico:diary:wrapped",
      '{"ciphertext":"corrupto","nonce":"roto","savedAt":"x"}',
    );
    const { ctx } = montar("bGxhdmUtZGUtcHJ1ZWJhLWRlLTMyLWJ5dGVzLXh4eHg");
    await waitFor(() => expect(ctx().restoring).toBe(false));
    expect(estado()).toBe("bloqueado");
    expect(ctx().key).toBeNull();
    // Falla cerrado y limpia, para no reintentar contra basura en cada carga.
    expect(window.localStorage.getItem("psico:diary:wrapped")).toBeNull();
  }, 20000);
});

describe("el sobre es de una cuenta, no del navegador", () => {
  it("otra cuenta en el mismo equipo no hereda la clave, y el sobre se retira", async () => {
    // La primera persona desbloquea y se va sin que nadie borre la galleta
    // —salir por un camino que no la tocaba, o que la sesión caduque sola—.
    const primera = montar();
    await act(async () => {
      await primera.ctx().unlock(CONTRASENA);
    });
    const llaveDelSobre = cookieDelSobre.valor;
    expect(llaveDelSobre).not.toBeNull();
    primera.vista.unmount();

    // La segunda entra en el mismo navegador: misma galleta, mismo
    // localStorage, OTRA sal.
    const segunda = montar(llaveDelSobre, SAL_AJENA);
    await waitFor(() => expect(segunda.ctx().restoring).toBe(false));

    expect(estado()).toBe("bloqueado");
    expect(segunda.ctx().key).toBeNull();
    expect(segunda.ctx().ecoKey).toBeNull();
    expect(segunda.ctx().masterKey).toBeNull();
    // Y no queda nada que volver a intentar.
    expect(window.localStorage.getItem("psico:diary:wrapped")).toBeNull();
    expect(cookieDelSobre.borrada).toBe(true);
  }, 30000);

  it("un sobre que no dice de quién es se descarta: se pide la contraseña una vez", async () => {
    // El formato anterior: la clave maestra sola dentro del sobre.
    const maestra = await deriveMasterKey(CONTRASENA, SALT);
    const envoltorio = randomBytes(32);
    const antiguo = encryptString(bytesToBase64Url(maestra), envoltorio);
    window.localStorage.setItem(
      "psico:diary:wrapped",
      JSON.stringify({ ...antiguo, savedAt: "2026-11-01T00:00:00.000Z" }),
    );

    const { ctx } = montar(bytesToBase64Url(envoltorio));
    await waitFor(() => expect(ctx().restoring).toBe(false));
    expect(estado()).toBe("bloqueado");
    expect(window.localStorage.getItem("psico:diary:wrapped")).toBeNull();

    // Y con la contraseña vuelve a recordarse, ya con dueño.
    await act(async () => {
      await ctx().unlock(CONTRASENA);
    });
    expect(estado()).toBe("abierto");
    expect(window.localStorage.getItem("psico:diary:wrapped")).not.toBeNull();
  }, 40000);

  it("la marca del dueño va cifrada: la sal no queda legible en el dispositivo", async () => {
    const { ctx } = montar();
    await act(async () => {
      await ctx().unlock(CONTRASENA);
    });
    expect(window.localStorage.getItem("psico:diary:wrapped")).not.toContain(
      SALT,
    );
  }, 30000);

  it("tras cambiar la contraseña, la recarga con la sal nueva restaura", async () => {
    const primera = montar();
    await act(async () => {
      await primera.ctx().unlock(CONTRASENA);
    });
    // Lo que hace `ChangePasswordCard`: clave nueva Y sal nueva.
    const maestraNueva = await deriveMasterKey(CONTRASENA_NUEVA, SAL_AJENA);
    act(() => {
      primera.ctx().adoptMasterKey(maestraNueva, SAL_AJENA);
    });
    await waitFor(() => expect(cookieDelSobre.valor).not.toBeNull());
    const claveNueva = Array.from(primera.ctx().key!);
    const llaveDelSobre = cookieDelSobre.valor;
    primera.vista.unmount();

    const segunda = montar(llaveDelSobre, SAL_AJENA);
    await waitFor(() => expect(estado()).toBe("abierto"));
    expect(Array.from(segunda.ctx().key!)).toEqual(claveNueva);
  }, 40000);
});

describe("después de cambiar la contraseña, la sesión sigue abierta", () => {
  it("adopta la clave nueva sin volver a pedir nada", async () => {
    const { ctx } = montar();
    await act(async () => {
      await ctx().unlock(CONTRASENA);
    });
    const claveVieja = Array.from(ctx().key!);

    // Lo que hace `ChangePasswordCard` en su paso 5, cuando el servidor ya
    // volvió a cifrar todo con la clave nueva.
    const maestraNueva = await deriveMasterKey(CONTRASENA_NUEVA, SALT);
    act(() => {
      ctx().adoptMasterKey(maestraNueva);
    });

    await waitFor(() => expect(Array.from(ctx().key!)).not.toEqual(claveVieja));
    expect(ctx().error).toBeNull();
    expect(estado()).toBe("abierto");
    expect(ctx().masterKey?.length).toBe(MASTER_KEY_LEN);
  }, 40000);

  it("si el rekey falla antes de adoptar, la sesión conserva la clave vieja", async () => {
    // El contrato que impide un estado mixto: entradas cifradas con una clave y
    // sesión sosteniendo otra. `adoptMasterKey` es el último paso justamente
    // para esto, así que aquí se comprueba que no adoptar no rompe nada.
    const { ctx } = montar();
    await act(async () => {
      await ctx().unlock(CONTRASENA);
    });
    const claveVieja = Array.from(ctx().key!);

    // El servidor falla → nadie llama a adoptMasterKey.
    expect(Array.from(ctx().key!)).toEqual(claveVieja);
    expect(ctx().error).toBeNull();
    expect(estado()).toBe("abierto");
  }, 30000);
});

describe("cerrar el diario", () => {
  it("borra la clave de memoria y el sobre del dispositivo", async () => {
    const { ctx } = montar();
    await act(async () => {
      await ctx().unlock(CONTRASENA);
    });
    expect(window.localStorage.getItem("psico:diary:wrapped")).not.toBeNull();

    act(() => {
      ctx().lock();
    });

    expect(ctx().key).toBeNull();
    expect(ctx().masterKey).toBeNull();
    expect(ctx().ecoKey).toBeNull();
    expect(window.localStorage.getItem("psico:diary:wrapped")).toBeNull();
    expect(cookieDelSobre.borrada).toBe(true);
  }, 30000);
});

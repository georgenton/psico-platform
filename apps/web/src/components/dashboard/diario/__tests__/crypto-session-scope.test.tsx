import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import type { DiaryDetailResponse } from "@psico/types";
import type * as CryptoModule from "@psico/crypto";

import { DiaryKeyProvider, useDiaryKey } from "@/lib/crypto/diary-key-context";
import { EntryDetailView } from "../EntryDetailView";

/**
 * De quién es la sesión criptográfica.
 *
 * EL FALLO QUE ESTO IMPIDE. `EntryDetailView` montaba su propio
 * `DiaryKeyProvider`. Como un proveedor anidado gana sobre el de arriba, el
 * detalle abría siempre bloqueado: desbloqueabas Reflexiones, pulsabas una
 * entrada —sin recargar, mismo documento, mismo árbol de React— y la reja
 * volvía a pedir la contraseña. Dos mil trescientos milisegundos de Argon2id
 * otra vez, con la lista desbloqueada todavía detrás.
 *
 * POR QUÉ NO LO VIO NINGUNA PRUEBA. La suite del detalle sustituye el módulo
 * del contexto entero, incluido `DiaryKeyProvider`, por un pasa-todo. Con eso
 * no se puede distinguir un proveedor de dos, que es justo lo que había que
 * distinguir. Aquí el contexto es el DE VERDAD: es la única forma de que la
 * prueba note si alguien vuelve a anidar uno.
 *
 * Lo que NO se prueba aquí: el cifrado. Ni los parámetros de Argon2id, ni el
 * formato del sobre, ni la frase de respaldo. Esto es duración y alcance de un
 * estado de React, y nada más.
 */

// La persistencia habla con el servidor (cookie del par envuelto). En jsdom no
// hay servidor; se silencia para que el test mida el contexto, no la red.
vi.mock("@/actions/diary-session", () => ({
  saveDiaryWrapKey: vi.fn().mockResolvedValue(undefined),
  clearDiaryWrapKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const CUERPO = "Cuerpo descifrado de prueba";

vi.mock("@psico/crypto", async (original) => {
  // `deriveSubKey` y compañía son reales: el proveedor los usa de verdad. Sólo
  // el descifrado se vuelve identidad, para poder afirmar sobre el texto.
  const real = await original<typeof CryptoModule>();
  return {
    ...real,
    decryptString: (cipher: { ciphertext: string }) => cipher.ciphertext,
  };
});

/**
 * Abre la sesión por el mismo camino que una persona: `unlock` con la
 * contraseña, Argon2id de verdad incluido. Cuesta un par de segundos y merece
 * la pena, porque es el único camino que deja la clave donde el producto la
 * deja.
 *
 * (`adoptMasterKey` habría sido más rápido, pero hoy no funciona: exige una
 * clave maestra de 32 bytes y las de este producto son de 16. Está registrado
 * aparte; usarlo aquí sólo habría escondido el problema detrás de un mock.)
 */
const SALT = "YWJjZGVmZ2hpamtsbW5vcA";
const CONTRASENA = "una-contrasena-de-prueba";

function AbrirSesion({ activo }: { activo: boolean }) {
  const { unlock } = useDiaryKey();
  useEffect(() => {
    if (activo) void unlock(CONTRASENA);
  }, [activo, unlock]);
  return null;
}

function detalle(): DiaryDetailResponse {
  return {
    entry: {
      id: "entry-1",
      createdAt: new Date(Date.UTC(2026, 5, 1, 12, 0, 0)),
      updatedAt: new Date(Date.UTC(2026, 5, 1, 12, 0, 0)),
      mood: "ok",
      kind: "free",
      promptId: null,
      promptText: null,
      tags: [],
      excerptCiphertext: "EXC",
      excerptNonce: "N_EXC",
      audioUrl: null,
      audioDurationSec: null,
      textCiphertext: CUERPO,
      textNonce: "N_BODY",
    },
    relatedEntryIds: [],
  };
}

function montar({ desbloqueado }: { desbloqueado: boolean }) {
  return render(
    <DiaryKeyProvider cryptoSalt={SALT} initialWrapKey={null}>
      <AbrirSesion activo={desbloqueado} />
      <EntryDetailView detail={detalle()} apiBase="http://api.test" token="t" />
    </DiaryKeyProvider>,
  );
}

const reja = () => document.querySelector("#diary-password");

describe("el detalle de una reflexión usa la sesión que ya está abierta", () => {
  it("con la sesión desbloqueada NO vuelve a pedir la contraseña", async () => {
    montar({ desbloqueado: true });
    // Con el proveedor anidado de antes esto fallaba: el detalle nacía con la
    // clave en null por mucho que la sesión de arriba estuviera abierta, y la
    // reja aparecía en cuanto Argon2id terminaba… en el proveedor equivocado.
    expect(
      await screen.findByText(CUERPO, {}, { timeout: 20000 }),
    ).toBeVisible();
    expect(reja()).toBeNull();
  }, 30000);

  it("y con la sesión bloqueada sí la pide: la reja no se ha quitado", () => {
    // El control que impide «arreglarlo» quitando la puerta. Una sesión
    // realmente bloqueada —primera visita, recarga, pestaña nueva— tiene que
    // seguir topándose con ella.
    montar({ desbloqueado: false });
    expect(reja()).not.toBeNull();
    expect(screen.queryByText(CUERPO)).toBeNull();
  });
});

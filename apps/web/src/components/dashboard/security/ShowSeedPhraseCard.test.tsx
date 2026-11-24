import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as Cripto from "@psico/crypto";
import { MASTER_KEY_LEN, masterKeyToSeedPhrase } from "@psico/crypto";

import { ShowSeedPhraseCard } from "./ShowSeedPhraseCard";

/**
 * La frase de respaldo es de UNA cuenta, también cuando la tarjeta sigue montada.
 *
 * EL FALLO QUE ESTO IMPIDE. La tarjeta monta su propio proveedor a propósito:
 * tener el Diario abierto no basta para ver la frase. Pero si la sesión pasaba a
 * otra cuenta y la página se refrescaba, ese proveedor conservaba la clave: la
 * segunda persona veía «Listo para mostrar» y un toque enseñaba las doce palabras
 * de la primera, sin contraseña. Y si estaban en pantalla, ahí se quedaban.
 * Reproducido en un navegador.
 */

vi.mock("@/actions/diary-session", () => ({
  saveDiaryWrapKey: vi.fn(async () => undefined),
  clearDiaryWrapKey: vi.fn(async () => undefined),
}));

const { claveDe } = vi.hoisted(() => ({
  /** Una clave por cuenta, sin Argon2id: aquí no se prueba la derivación. */
  claveDe: (sal: string) =>
    Uint8Array.from({ length: 16 }, (_, i) => sal.charCodeAt(i % sal.length)),
}));
vi.mock("@psico/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof Cripto>()),
  deriveMasterKey: async (_: string, sal: string) => claveDe(sal),
}));

const SAL_A = "YWJjZGVmZ2hpamtsbW5vcA";
const SAL_B = "MTIzNDU2Nzg5MDEyMzQ1Ng";
const FRASE_A = masterKeyToSeedPhrase(claveDe(SAL_A)).split(" ");
const FRASE_B = masterKeyToSeedPhrase(claveDe(SAL_B)).split(" ");

const enPantalla = (frase: string[]) =>
  frase.every((p) => document.body.textContent!.includes(p));
const pideContrasena = () =>
  screen.queryByLabelText(/Contraseña de tu cuenta/) !== null;
const botonMostrar = () =>
  screen.getAllByRole("button", { name: /^Mostrar mi frase/ })[0]!;

/** A escribe su contraseña en la tarjeta y enseña la frase. */
async function ensenar(u: ReturnType<typeof userEvent.setup>) {
  await u.click(botonMostrar());
  await u.type(screen.getByLabelText(/Contraseña de tu cuenta/), "la-suya");
  await u.click(screen.getByRole("button", { name: "Desbloquear" }));
  await u.click(
    await screen.findByRole("button", { name: /Mostrar mi frase/ }),
  );
}

async function refrescarCon(
  vista: ReturnType<typeof render>,
  sal: string | null,
) {
  await act(async () => {
    vista.rerender(<ShowSeedPhraseCard cryptoSalt={sal} />);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  expect(claveDe(SAL_A)).toHaveLength(MASTER_KEY_LEN);
});

describe("la frase de respaldo, si la sesión cambia de cuenta", () => {
  it("sin desbloquear la tarjeta, pide la contraseña", async () => {
    const u = userEvent.setup();
    render(<ShowSeedPhraseCard cryptoSalt={SAL_A} />);
    await u.click(botonMostrar());
    expect(pideContrasena()).toBe(true);
    expect(enPantalla(FRASE_A)).toBe(false);
  });

  it("la que estaba en pantalla deja de verse", async () => {
    const u = userEvent.setup();
    const vista = render(<ShowSeedPhraseCard cryptoSalt={SAL_A} />);
    await ensenar(u);
    expect(enPantalla(FRASE_A)).toBe(true);

    await refrescarCon(vista, SAL_B);
    expect(enPantalla(FRASE_A)).toBe(false);
    expect(enPantalla(FRASE_B)).toBe(false);
  });

  it("«Mostrar mi frase» pide la contraseña de quien llega, y enseña la suya", async () => {
    const u = userEvent.setup();
    const vista = render(<ShowSeedPhraseCard cryptoSalt={SAL_A} />);
    await ensenar(u);
    await u.click(screen.getByRole("button", { name: "Ocultar" }));
    await refrescarCon(vista, SAL_B);

    await u.click(botonMostrar());
    expect(enPantalla(FRASE_A)).toBe(false);
    expect(pideContrasena()).toBe(true);
    await u.type(screen.getByLabelText(/Contraseña de tu cuenta/), "la-de-b");
    await u.click(screen.getByRole("button", { name: "Desbloquear" }));
    await u.click(
      await screen.findByRole("button", { name: /Mostrar mi frase/ }),
    );
    expect(enPantalla(FRASE_B)).toBe(true);
    expect(enPantalla(FRASE_A)).toBe(false);
  });

  it("control contrario: un refresco de la misma cuenta no la esconde", async () => {
    const u = userEvent.setup();
    const vista = render(<ShowSeedPhraseCard cryptoSalt={SAL_A} />);
    await ensenar(u);
    await refrescarCon(vista, SAL_A);
    expect(enPantalla(FRASE_A)).toBe(true);
  });
});

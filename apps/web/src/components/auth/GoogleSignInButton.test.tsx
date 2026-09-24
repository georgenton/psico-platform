import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * El ancho del botón de Google.
 *
 * El componente pedía `width: 320` fijo. Google dibuja algo más ancho que lo
 * pedido —su propio marco—, así que a 320 px de ventana el resultado medía 340
 * y empujaba el documento 10 px en horizontal: la página se desplazaba de lado,
 * que es justo lo que WCAG 2.1 · 1.4.10 no permite a ese ancho. Y no sólo ahí:
 * a 375 px el hueco real son 279 y el botón seguía midiendo 340.
 *
 * Lo que se comprueba aquí es la decisión, no el píxel: que se le pide a Google
 * el ancho que de verdad hay, que ese ancho se ciñe al rango que su API admite,
 * y que si aun así se pasa, se corrige UNA vez midiendo el exceso en lugar de
 * descontar un número mágico.
 *
 * CONTROL NEGATIVO: volver a un `width: 320` constante hace fallar la primera
 * prueba, que es exactamente la mutación que causó el defecto.
 */

vi.mock("next/script", () => ({
  default: ({ onLoad }: { onLoad?: () => void }) => {
    onLoad?.();
    return null;
  },
}));

vi.mock("@/actions/auth", () => ({ loginWithGoogleAction: vi.fn() }));

/**
 * Dibuja lo que Google dibuja: un hijo dentro de nuestro contenedor. Su ancho
 * lo resuelve el doble de `getBoundingClientRect`.
 */
type ConfigBoton = { width?: number };
const renderButton = vi.fn((host: HTMLElement, _config: ConfigBoton) => {
  // Asíncrono y EN DOS TIEMPOS, como el de verdad: primero los envoltorios de
  // Google, que respetan el ancho pedido, y su iframe —más ancho— después.
  // Un doble que dibujase todo de golpe validaría una carrera que en el
  // navegador no existe, y fue exactamente lo que escondió el fallo.
  setTimeout(() => {
    if (!host.isConnected) return;
    host.appendChild(document.createElement("div"));
    setTimeout(() => {
      if (!host.isConnected) return;
      const marco = document.createElement("div");
      marco.setAttribute("data-google-iframe", "true");
      host.appendChild(marco);
    }, 20);
  }, 20);
});
const initialize = vi.fn();

/** Ancho que devolverá el hueco, y el que "dibujará" Google dentro de él. */
let anchoDelHueco = 0;
let marcoDeGoogle = 0;

beforeEach(() => {
  vi.stubEnv(
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    "prueba.apps.googleusercontent.com",
  );
  renderButton.mockClear();
  initialize.mockReset();
  anchoDelHueco = 224;
  marcoDeGoogle = 20;

  (window as unknown as { google: unknown }).google = {
    accounts: { id: { initialize, renderButton, disableAutoSelect: vi.fn() } },
  };

  // jsdom no hace maquetación, así que las cajas se declaran aquí: el hueco
  // mide lo que diga la prueba y el contenedor mide lo último que se le pidió
  // a Google más el marco que Google añade.
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const caja = (w: number) =>
        ({ ...real.call(this), width: w, height: 40 }) as DOMRect;
      // Google ajusta NUESTRO contenedor —y sus propios envoltorios— al ancho
      // pedido…
      if (
        this.getAttribute("data-testid") === "google-signin-container" ||
        (this.tagName === "DIV" &&
          !this.hasAttribute("data-google-iframe") &&
          this.parentElement?.getAttribute("data-testid") ===
            "google-signin-container")
      ) {
        return caja(ultimoAncho());
      }
      // …y deja que su iframe, más ancho, sobresalga de él. Modelarlo al revés
      // —que era lo que hacía este doble— hacía pasar la prueba mientras en el
      // navegador la pasada de corrección no se ejecutaba nunca.
      if (this.getAttribute("data-google-iframe") === "true") {
        const ultima = ultimoAncho();
        return caja(ultima ? ultima + marcoDeGoogle : 0);
      }
      // El hueco es el envoltorio que el componente marca con `max-w-full`.
      if (this.classList?.contains("max-w-full")) return caja(anchoDelHueco);
      return caja(0);
    },
  );

  // El componente observa su hueco; jsdom no trae ResizeObserver.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class {
      observe() {}
      disconnect() {}
    };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function montar() {
  const { GoogleSignInButton } = await import("./GoogleSignInButton");
  return render(<GoogleSignInButton />);
}

const anchosPedidos = () =>
  renderButton.mock.calls.map((c) => c[1].width as number);
const ultimoAncho = () => renderButton.mock.calls.at(-1)?.[1]?.width ?? 0;

describe("ancho del botón de Google", () => {
  it("pide el ancho que de verdad hay, no un valor fijo", async () => {
    await montar();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(anchosPedidos()[0]).toBe(224);
    expect(anchosPedidos()[0]).not.toBe(320);
  });

  it("espera a que Google dibuje y corrige una sola vez midiendo el exceso", async () => {
    await montar();
    // Primera pasada: pide 224, Google dibuja 244 y se sale del hueco de 224.
    // Segunda: pide 224 − 20 = 204, que ya cabe. Y ahí se detiene.
    await waitFor(() => expect(anchosPedidos().length).toBe(2), {
      timeout: 4000,
    });
    expect(anchosPedidos()).toEqual([224, 204]);
    await new Promise((r) => setTimeout(r, 200));
    expect(anchosPedidos().length).toBe(2);
  });

  it("no corrige cuando lo dibujado ya cabe", async () => {
    marcoDeGoogle = 0;
    await montar();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 200));
    expect(anchosPedidos()).toEqual([224]);
  });

  it("se ciñe al rango que admite la API de Google", async () => {
    // Por arriba: un hueco enorme no puede pedir más de 400.
    anchoDelHueco = 980;
    await montar();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(anchosPedidos()[0]).toBe(400);
  });

  it("no baja de 200 aunque el hueco sea menor", async () => {
    anchoDelHueco = 120;
    await montar();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(Math.min(...anchosPedidos())).toBe(200);
  });

  it("no oculta el desbordamiento: recortar el botón de acceso no es arreglarlo", async () => {
    const { container } = await montar();
    const hueco = container.querySelector<HTMLElement>("div.flex.w-full");
    expect(hueco?.className).toContain("max-w-full");
    expect(hueco?.className).not.toContain("overflow-hidden");
  });
});

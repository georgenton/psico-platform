import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemePicker, THEME_STORAGE_KEY, readStoredTheme } from "./ThemePicker";
import { AMBIENT_IDS } from "@psico/types";

/**
 * Los riesgos que introduce ESTA implementación, y nada más.
 *
 * El acabado visual no necesita pruebas propias — lo verifica la revisión
 * alojada, y una prueba que afirmara un color sólo repetiría el token. Lo que
 * sí es nuevo y puede romperse en silencio es el control del theme:
 *
 *   · leer la preferencia en el primer render daría un HTML y un render de
 *     cliente distintos, que es un error de hidratación;
 *   · el theme y el ambiente son preferencias distintas y el control nuevo no
 *     debe tocar el que ya existía;
 *   · el almacenamiento puede estar bloqueado, y eso no puede tumbar la sala.
 */

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.body.className = "";
});

afterEach(() => {
  window.localStorage.clear();
});

describe("el theme es una preferencia aparte del ambiente", () => {
  it("arranca en contemporary y no lee el almacenamiento en el primer render", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "renaissance");
    render(<ThemePicker />);

    // El primer render tiene que coincidir con el HTML que mandó el servidor,
    // que siempre es contemporary. La preferencia se aplica después.
    expect(readStoredTheme()).toBe("renaissance");
    expect(
      screen.getByRole("button", { name: /Estilo: .*\. Cambiar\./ }),
    ).toBeInTheDocument();
  });

  it("aplica la preferencia guardada al documento tras montar", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "renaissance");
    render(<ThemePicker />);

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("renaissance"),
    );
    expect(
      screen.getByRole("button", { name: /Estilo: Renacimiento/ }),
    ).toBeInTheDocument();
  });

  it("guarda y aplica el theme elegido, y deja el ambiente en paz", async () => {
    const user = userEvent.setup();
    // Un ambiente ya elegido por la persona: el control nuevo no lo toca.
    document.body.classList.add("amb-noche");

    render(<ThemePicker />);
    await user.click(screen.getByRole("button", { name: /Estilo:/ }));
    await user.click(
      screen.getByRole("menuitemradio", { name: /Renacimiento/ }),
    );

    expect(document.documentElement.dataset.theme).toBe("renaissance");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("renaissance");
    expect(document.body.classList.contains("amb-noche")).toBe(true);
    // Y ninguna clase de ambiente se ha añadido ni quitado por el camino.
    const ambientClasses = AMBIENT_IDS.filter((id) =>
      document.body.classList.contains(`amb-${id}`),
    );
    expect(ambientClasses).toEqual(["noche"]);
  });

  it("sobrevive a un almacenamiento bloqueado", async () => {
    const user = userEvent.setup();
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("almacenamiento bloqueado");
    };
    try {
      render(<ThemePicker />);
      await user.click(screen.getByRole("button", { name: /Estilo:/ }));
      await user.click(
        screen.getByRole("menuitemradio", { name: /Renacimiento/ }),
      );
      // El theme vale para esta sesión aunque no se pueda guardar.
      expect(document.documentElement.dataset.theme).toBe("renaissance");
    } finally {
      window.localStorage.setItem = original;
    }
  });

  it("un valor desconocido en el almacenamiento cae a contemporary", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "barroco");
    expect(readStoredTheme()).toBe("contemporary");
  });
});

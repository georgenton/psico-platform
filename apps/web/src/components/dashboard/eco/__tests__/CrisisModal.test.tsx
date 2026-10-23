import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CrisisModal } from "../CrisisModal";

/**
 * El modal de crisis, por lo que HACE.
 *
 * Las pruebas que ya existían sobre esta pantalla son de tokens: comprueban
 * que la losa sale del sistema, que el objetivo táctil llega a 44 y que no se
 * queda blanca sobre pantalla oscura. Son necesarias y no bastan — repiten el
 * CSS. Este PR cambió el marcado del modal, así que lo que falta comprobar es
 * el comportamiento: que el texto del servidor llegue entero, que los dos
 * caminos de ayuda estén donde deben, que se pueda cerrar con el teclado y
 * que el recurso de crisis no haya cambiado de significado por el camino.
 *
 * Ese último punto es el que más importa y el que no se puede delegar a una
 * captura: el número y el enlace internacional se fijan aquí para que
 * retocar la pantalla no pueda alterarlos sin que algo falle.
 */

const TEXTO =
  "Lo que estás sintiendo importa.\nHay gente preparada para acompañarte.";
const LINEA = "171 (opción 6)";

function montar(onClose = vi.fn()) {
  render(
    <CrisisModal
      text={TEXTO}
      hotline={LINEA}
      crisisPath="/dashboard/terapia/crisis"
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("CrisisModal · lo que hace, no cómo se pinta", () => {
  it("se anuncia como diálogo de alerta modal y con su título", () => {
    montar();
    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("heading", { name: /estamos contigo/i }),
    ).toBeInTheDocument();
  });

  it("muestra el texto del servidor tal cual, con sus saltos de línea", () => {
    montar();
    // Verbatim: reescribirlo en el cliente rompería el rastro de auditoría,
    // que es la razón por la que este texto viene del servidor.
    const parrafo = screen.getByText(/Lo que estás sintiendo importa/);
    expect(parrafo.textContent).toBe(TEXTO);
    expect(parrafo).toHaveClass("whitespace-pre-wrap");
  });

  it("el recurso de crisis no cambia: número marcable y línea internacional", () => {
    montar();
    const llamar = screen.getByRole("link", { name: /llamar ahora/i });
    // El `tel:` se limpia de espacios y paréntesis para que el marcador lo
    // entienda, pero el número que se ENSEÑA es el que escribió el servidor.
    expect(llamar).toHaveAttribute("href", "tel:171");
    expect(llamar).toHaveTextContent(LINEA);

    const internacional = screen.getByRole("link", {
      name: /findahelpline\.com/i,
    });
    expect(internacional).toHaveAttribute(
      "href",
      expect.stringContaining("findahelpline.com"),
    );
    // Abre fuera para que el modal siga a la vista mientras se marca.
    expect(internacional).toHaveAttribute("target", "_blank");
    expect(internacional).toHaveAttribute(
      "rel",
      expect.stringContaining("noopener"),
    );
  });

  it("el contenido de ayuda nombra la alternativa para quien no está en Ecuador", () => {
    montar();
    expect(screen.getByText(/si no estás en ecuador/i)).toBeInTheDocument();
  });

  it("se cierra con «Entendido», y con el teclado", async () => {
    const onClose = montar();
    const usuario = userEvent.setup();

    const entendido = screen.getByRole("button", { name: /entendido/i });
    await usuario.click(entendido);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Y por teclado. Un modal del que sólo se sale con el ratón no se puede
    // cerrar con una mano temblando, que es justo el estado en el que esta
    // pantalla aparece.
    //
    // Se tabula hasta encontrarlo en vez de fijar cuántas pulsaciones hacen
    // falta: el número depende del orden de los enlaces y convertiría un
    // cambio de maquetación en un fallo que no dice nada. Lo que se afirma es
    // que es ALCANZABLE y que Enter lo activa.
    const boton = screen.getByRole("button", { name: /entendido/i });
    let alcanzado = false;
    for (let i = 0; i < 6 && !alcanzado; i++) {
      await usuario.tab();
      alcanzado = document.activeElement === boton;
    }
    expect(alcanzado).toBe(true);
    await usuario.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("el teléfono va antes que el cierre; el enlace internacional va después", () => {
    // El orden del DOM es el del lector de pantalla y el del tabulador, así
    // que conviene fijarlo. Y conviene nombrarlo por lo que es: NO es «los
    // dos caminos de ayuda antes que el de cerrar». El orden real es
    // Llamar → Entendido → findahelpline, con el enlace internacional
    // DESPUÉS de la salida.
    //
    // Se fija tal cual en vez de cambiarlo: mover el enlace es una decisión
    // de diseño sobre una pantalla de crisis, y no se toma de paso en una
    // prueba. Queda anotado en el PR como observación.
    montar();
    const dialogo = screen.getByRole("alertdialog");
    const textos = Array.from(dialogo.querySelectorAll("a, button")).map(
      (n) => n.textContent ?? "",
    );
    const iLlamar = textos.findIndex((t) => /llamar ahora/i.test(t));
    const iEntendido = textos.findIndex((t) => /entendido/i.test(t));
    const iInternacional = textos.findIndex((t) => /findahelpline/i.test(t));

    expect(iLlamar).toBeGreaterThanOrEqual(0);
    // Lo que sí se exige: la línea telefónica nunca después de la salida.
    expect(iEntendido).toBeGreaterThan(iLlamar);
    // Y lo que hoy ocurre, fijado para que un cambio sea deliberado.
    expect(iInternacional).toBeGreaterThan(iEntendido);
  });
});

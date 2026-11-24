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
/**
 * Lo que el servidor emite de verdad (`crisisNotice`), no algo inventado: con
 * número acreditado, y sin él. Las dos formas las fija
 * `apps/api/src/eco/crisis-notice.spec.ts`; si cambian allí, cambian aquí.
 *
 * Por qué importa que sea la real: la primera versión de estas pruebas fijaba
 * una línea de fixture con la que el saneador de entonces parecía correcto, y
 * con la que se servía marcaba letras.
 */
const LINEA = "911 (Ecuador)";
const SIN_NUMERO = "número de emergencias de tu país";

function montar(onClose = vi.fn(), hotline: string = LINEA, country?: string) {
  render(
    <CrisisModal
      text={TEXTO}
      hotline={hotline}
      country={country}
      crisisPath="/dashboard/terapia/crisis"
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("CrisisModal · lo que hace, no cómo se pinta", () => {
  it("sin número no hay botón de llamada, ni nada que se le parezca", () => {
    // Un `tel:` muerto en esta pantalla parece ayuda y no hace nada. Y un
    // bloque rojo con un teléfono que no llama, también: qué hacer ya lo dice
    // el texto del servidor.
    montar(vi.fn(), SIN_NUMERO);
    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo.querySelector('a[href^="tel:"]')).toBeNull();
    expect(dialogo.textContent).not.toContain("📞");
    expect(dialogo.textContent).not.toMatch(/llamar|llama al/i);

    // Lo demás sigue: el texto, los recursos, el directorio y la salida.
    expect(screen.getByText(/Lo que estás sintiendo/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /más recursos de ayuda/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /entendido/i }),
    ).toBeInTheDocument();
  });

  it("con número, el botón dice de qué país es", () => {
    montar();
    const llamar = screen.getByRole("link", { name: /llamar ahora/i });
    expect(llamar).toHaveTextContent("📞 Llamar ahora · 911 (Ecuador)");
    expect(llamar).toHaveAttribute("href", "tel:911");
  });

  it("una línea con mnemotecnia sigue marcándose por sus dígitos", () => {
    // Un servidor anterior puede mandarla. La línea es inventada.
    montar(vi.fn(), "0800-4-LETRAS (0800-453872)");
    expect(screen.getByRole("link", { name: /llamar ahora/i })).toHaveAttribute(
      "href",
      "tel:0800-453872",
    );
  });

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
    // El `tel:` lleva la forma que un marcador entiende; lo que se ENSEÑA es
    // lo que escribió el servidor, con su país.
    expect(llamar).toHaveAttribute("href", "tel:911");
    expect(llamar).toHaveTextContent(LINEA);
    // Y nunca letras: un `tel:` con mnemotecnia no se marca de forma fiable.
    expect(llamar.getAttribute("href")?.slice("tel:".length)).not.toMatch(
      /[a-zA-Z]/,
    );

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

  it("nombra la alternativa para quien está en otro país, y como directorio", () => {
    // Antes decía «si no estás en Ecuador» también a quien declaró otro país,
    // y llamaba «números internacionales» a un directorio de líneas.
    montar(vi.fn(), SIN_NUMERO, "CO");
    const pie = screen.getByText(/si estás en otro país/i);
    expect(pie).toHaveTextContent("en el directorio findahelpline.com");
    expect(screen.queryByText(/ecuador/i)).not.toBeInTheDocument();
  });

  it.each([
    ["CO", "/ayuda?pais=CO&desde=eco"],
    ["EC", "/ayuda?pais=EC&desde=eco"],
    [undefined, "/ayuda?desde=eco"],
  ])("la ayuda se abre en el país que dice el servidor (%j)", (pais, href) => {
    montar(vi.fn(), SIN_NUMERO, pais);
    expect(
      screen.getByRole("link", { name: /más recursos de ayuda/i }),
    ).toHaveAttribute("href", href);
  });

  it("lleva a la ayuda pública, sin cerrar este aviso", () => {
    montar();
    const mas = screen.getByRole("link", { name: /más recursos de ayuda/i });
    // La página pública, con su vuelta a Eco; nunca una pantalla con puerta.
    expect(mas).toHaveAttribute("href", "/ayuda?desde=eco");
    expect(mas).toHaveAttribute("target", "_blank");
    expect(mas).toHaveAttribute("rel", expect.stringContaining("noopener"));
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

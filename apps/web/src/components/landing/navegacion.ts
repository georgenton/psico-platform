/**
 * Desplazamiento entre secciones, con el mismo comportamiento de la referencia.
 *
 * Dos detalles que no son adorno:
 *
 * · el desfase de 88 px existe porque la cabecera es fija, y sin él el título
 *   de destino queda debajo de ella;
 * · el foco se mueve DESPUÉS de desplazar y con `preventScroll`, para que
 *   quien navega con teclado o lector de pantalla llegue al sitio y el
 *   navegador no lo arrastre a otro.
 *
 * Con `prefers-reduced-motion` el desplazamiento es instantáneo y el foco no
 * espera: animar es justo lo que esa preferencia pide no hacer.
 */

const DESFASE_CABECERA = 88;

export function movimientoReducido(): boolean {
  // `matchMedia` puede no existir: en el servidor, y también en entornos de
  // prueba sobre jsdom. Sin la comprobación, preguntar por la preferencia
  // rompería el render en vez de limitarse a no saberla.
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Desplaza hasta un selector y, si se indica, mueve el foco al llegar. */
export function desplazarA(selector: string, selectorFoco?: string): void {
  const destino = document.querySelector(selector);
  if (!destino) return;
  const reducido = movimientoReducido();
  window.scrollTo({
    top:
      destino.getBoundingClientRect().top + window.scrollY - DESFASE_CABECERA,
    behavior: reducido ? "auto" : "smooth",
  });
  if (!selectorFoco) return;
  window.setTimeout(
    () => {
      const foco = document.querySelector<HTMLElement>(selectorFoco);
      foco?.focus({ preventScroll: true });
    },
    reducido ? 0 : 420,
  );
}

/** El título visible del paso actual de la microguía. */
export const SELECTOR_PASO_VISIBLE = ".fh-step:not([hidden]) h3";

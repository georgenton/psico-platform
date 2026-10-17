"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Icono } from "./Icono";

/**
 * Diálogo modal, sobre `<dialog>` nativo.
 *
 * Es el elemento nativo y no un div con `role="dialog"` porque trae gratis lo
 * que la referencia exige comprobar: Escape cierra, el foco queda atrapado
 * dentro, y el resto de la página queda inerte. Reimplementarlo a mano sería
 * reimplementar peor.
 *
 * El foco vuelve a quien lo abrió: `showModal()` lo mueve dentro, y si al
 * cerrar no se devuelve, quien navega con teclado aparece al principio de la
 * página. Se guarda el elemento activo al abrir, no el que lanzó el evento,
 * porque algunos diálogos se abren desde otro diálogo.
 */
export function Dialogo({
  id,
  abierto,
  alCerrar,
  etiquetadoPor,
  ancho,
  cabecera,
  children,
  etiquetaCierre = "Cerrar",
}: {
  id: string;
  abierto: boolean;
  alCerrar: () => void;
  etiquetadoPor?: string;
  /** `wide` es la variante ancha de la referencia (ficha y selector). */
  ancho?: boolean;
  /** Lo que va a la izquierda del botón de cierre. Sin esto, el botón se alinea solo a la derecha. */
  cabecera?: ReactNode;
  children: ReactNode;
  etiquetaCierre?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const quienAbrio = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      quienAbrio.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      d.showModal();
    } else if (!abierto && d.open) {
      d.close();
    }
  }, [abierto]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const alCerrarse = () => {
      const previo = quienAbrio.current;
      // Sólo se devuelve el foco si ese elemento sigue en el documento: puede
      // haber desaparecido al re-renderizar lo que había debajo.
      if (previo && document.contains(previo) && !previo.closest("dialog")) {
        previo.focus({ preventScroll: true });
      }
      quienAbrio.current = null;
      alCerrar();
    };
    d.addEventListener("close", alCerrarse);
    return () => d.removeEventListener("close", alCerrarse);
  }, [alCerrar]);

  return (
    <dialog
      className={ancho ? "fh-dlg wide" : "fh-dlg"}
      id={id}
      aria-labelledby={etiquetadoPor}
      ref={ref}
      // Pulsar sobre el fondo cierra, como en la referencia: el objetivo es el
      // propio <dialog> sólo cuando se pulsa fuera de su contenido.
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="fh-dlg-in">
        <div
          className="fh-dlg-head"
          style={cabecera ? undefined : { justifyContent: "flex-end" }}
        >
          {cabecera}
          <button
            className="fh-x"
            type="button"
            aria-label={etiquetaCierre}
            onClick={() => ref.current?.close()}
          >
            <Icono nombre="x" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

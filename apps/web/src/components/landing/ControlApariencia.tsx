"use client";

import { useLanding, type Apariencia } from "./estado";

const OPCIONES: ReadonlyArray<{ valor: Apariencia; etiqueta: string }> = [
  { valor: "contemporary", etiqueta: "Contemporary" },
  { valor: "renaissance", etiqueta: "Renacimiento" },
];

/**
 * Selector de apariencia.
 *
 * Aparece dos veces, igual que en la referencia: en el menú móvil y en la base
 * del pie. Son dos presentaciones del mismo producto, no una prestación de
 * pago, y no tienen nada que ver con los ambientes Calma, Enfoque, Energía y
 * Noche del producto autenticado.
 *
 * Cambiar de tema sólo cambia el atributo: no se pierde el libro elegido, la
 * periodicidad, las preguntas abiertas ni el paso de la demostración.
 */
export function ControlApariencia({ id }: { id: string }) {
  const { apariencia, fijarApariencia } = useLanding();

  return (
    <div className="fh-appear" role="group" aria-labelledby={id}>
      <span id={id}>Apariencia</span>
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={apariencia === o.valor}
          onClick={() => fijarApariencia(o.valor)}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

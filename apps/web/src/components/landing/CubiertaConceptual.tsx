import type { Obra } from "./datos";

/**
 * Cubierta conceptual de una obra.
 *
 * No simula una portada definitiva: no hay ISBN, editorial ni premio, sólo el
 * título y los elementos del sistema. Tampoco rellena la tarjeta con «portada
 * pendiente», que es una nota de trabajo interno.
 *
 * El nombre accesible es el título de la obra y nada más. Decía «Cubierta
 * conceptual de …», y «conceptual» es vocabulario del equipo: a quien usa un
 * lector de pantalla no le dice nada útil y le cuenta en qué punto está la
 * producción. Que la cubierta sea tipográfica y provisional sigue anotado en
 * el inventario interno, que es donde importa.
 *
 * El motivo hexagonal es el del sistema: el mismo que aparece en el pie.
 */
export function CubiertaConceptual({
  obra,
  pequena,
}: {
  obra: Obra;
  /** La variante pequeña se usa en listas y resúmenes; omite el tema. */
  pequena?: boolean;
}) {
  return (
    <div
      className={
        pequena ? `fh-cv ${obra.cubierta} sm` : `fh-cv ${obra.cubierta}`
      }
      role="img"
      aria-label={obra.titulo}
    >
      <span className="b">
        <span>FeelVerse</span>
        {!pequena && <span>{obra.tema}</span>}
      </span>
      <svg
        className="m"
        viewBox="0 0 100 100"
        fill="none"
        stroke="#fff"
        strokeWidth={1.2}
        aria-hidden="true"
      >
        <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" />
        <polygon points="50,24 72,37 72,63 50,76 28,63 28,37" />
        <path d="M50 6v88M12 28l76 44M88 28 12 72" />
      </svg>
      <span className="t">{obra.titulo}</span>
    </div>
  );
}

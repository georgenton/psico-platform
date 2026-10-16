import type { Obra } from "./datos";

/**
 * Cubierta conceptual de una obra.
 *
 * No es una portada definitiva y se dice en voz alta: el texto accesible la
 * nombra «Cubierta conceptual de …». El encargo es explícito en que no se
 * simule una portada real, ni un ISBN, ni una editorial, ni un premio; y
 * también en que no se rellenen las tarjetas con «portada pendiente». Una
 * cubierta tipográfica cuidada, identificada como tal, resuelve las dos cosas.
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
      aria-label={`Cubierta conceptual de ${obra.titulo}`}
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

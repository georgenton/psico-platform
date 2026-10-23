import type { CSSProperties } from "react";

import { SPRITE_ICONOS, type NombreIcono } from "./sprite-iconos";

/**
 * Un icono del sprite aprobado.
 *
 * La referencia los escribe como `<svg class="fh-ico"><use href="#i-x"/></svg>`
 * y la hoja de estilos dimensiona `.fh-ico`, así que aquí no se fija tamaño
 * salvo que el sitio concreto lo pida —como en la referencia, donde unos pocos
 * lo ajustan en línea.
 */
export function Icono({
  nombre,
  clase,
  style,
}: {
  nombre: NombreIcono;
  /** Clase extra; `fh-chev` es la que gira el acordeón. */
  clase?: string;
  style?: CSSProperties;
}) {
  return (
    <svg className={clase ? `fh-ico ${clase}` : "fh-ico"} style={style}>
      <use href={`#i-${nombre}`} />
    </svg>
  );
}

/**
 * El sprite, una vez por página.
 *
 * Se inyecta como marcado porque es SVG propio del repositorio y así queda
 * idéntico a la referencia, sin traducir cada atributo a su forma JSX.
 */
export function SpriteIconos() {
  return (
    <svg
      width={0}
      height={0}
      style={{ position: "absolute" }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: SPRITE_ICONOS }}
    />
  );
}

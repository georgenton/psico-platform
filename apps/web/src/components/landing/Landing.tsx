import { Biblioteca } from "./Biblioteca";
import { Cabecera } from "./Cabecera";
import {
  AparienciaSinDestello,
  APARIENCIA_POR_OMISION,
  ProveedorLanding,
} from "./estado";
import { Hero } from "./Hero";
import { SpriteIconos } from "./Icono";
import { Cierre, PieCorporativo } from "./PieCorporativo";
import { SeccionDuo } from "./SeccionDuo";
import { SeccionFaq } from "./SeccionFaq";
import { SeccionHistoria } from "./SeccionHistoria";
import { SeccionLibro } from "./SeccionLibro";
import { SeccionMapa } from "./SeccionMapa";
import { SeccionPlanes } from "./SeccionPlanes";

/**
 * La home pública, conforme a la referencia aprobada del 27-09-2026 y su
 * ajuste 2.1 (`docs/design/web-publica-f2-1/`).
 *
 * ── Por qué el envoltorio `.fh` lleva los atributos ────────────────────────
 *
 * En el prototipo el tema y el ambiente viven en `<html>`. Aquí el layout raíz
 * es dueño de `<html>` y `<body>`, y además el panel autenticado tiene su
 * propio sistema visual: si la landing escribiera en `<html>`, su tema saldría
 * de la landing. Así que el atributo baja al envoltorio, que es también donde
 * la hoja generada define los tokens.
 *
 * Consecuencia que conviene no perder de vista: los diálogos TIENEN que estar
 * dentro de `.fh`. En el prototipo tres de ellos cuelgan del final del
 * documento y funcionaban porque los tokens estaban en `:root`; al acotarlos,
 * un diálogo fuera del envoltorio se quedaría sin tipografías ni colores. Cada
 * sección monta los suyos dentro, y `<dialog>` se promueve a la capa superior
 * sin cambiar de sitio en el árbol, así que la herencia se mantiene.
 *
 * El orden de las secciones es el de la referencia, y eso es parte del
 * encargo: entrada, libro y modo guiado, biblioteca, mapa, historia, Dúo y
 * Círculos, planes, preguntas y cierre.
 */
export function Landing() {
  return (
    <ProveedorLanding>
      <div
        className="fh"
        id="fh"
        data-theme={APARIENCIA_POR_OMISION}
        data-mood="default"
      >
        {/* Aplica la apariencia guardada antes de pintar. Va aquí, como primer
            hijo, porque para entonces el envoltorio ya existe. */}
        <AparienciaSinDestello />
        <SpriteIconos />

        <a className="fh-skip" href="#main">
          Saltar al contenido
        </a>

        <Cabecera />

        <main id="main">
          <Hero />
          <SeccionLibro />
          <Biblioteca />
          <SeccionMapa />
          <SeccionHistoria />
          <SeccionDuo />
          <SeccionPlanes />
          <SeccionFaq />
          <Cierre />
        </main>

        <PieCorporativo />
      </div>
    </ProveedorLanding>
  );
}

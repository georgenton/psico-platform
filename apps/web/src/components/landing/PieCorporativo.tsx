"use client";

import { ControlApariencia } from "./ControlApariencia";
import { useLanding } from "./estado";
import { FeelVerseLockup } from "@/components/brand/FeelVerse";

/**
 * Cierre y pie corporativo.
 *
 * Dos decisiones que la referencia ya tomaba y aquí se conservan:
 *
 * · Los destinos que todavía no existen —Sobre FeelVerse, Autoría y contenidos,
 *   Contacto, Privacidad, Términos de uso— se marcan «En preparación» y NO son
 *   enlaces. Un `href="#"` aparentaría navegación, y publicar un documento
 *   jurídico generado como si estuviera aprobado sería peor.
 * · No hay razón social, domicilio, correo, redes, sellos de seguridad ni
 *   preferencias de cookies: nada de eso está verificado, y el control de
 *   cookies sólo debe existir si hay un sistema que de verdad las gestione.
 *   FeelVerse tampoco se atribuye a SyntaVera ni a otra marca.
 */

const EXPLORAR: ReadonlyArray<{
  href: string;
  texto: string;
  esGuia?: boolean;
}> = [
  { href: "#biblioteca", texto: "Biblioteca" },
  { href: "#guiado", texto: "Experiencias guiadas", esGuia: true },
  { href: "#mapa", texto: "Eco y Mapa Emocional" },
  { href: "#duo", texto: "Dúo y Círculos" },
];

const EN_PREPARACION_MARCA = [
  "Sobre FeelVerse",
  "Autoría y contenidos",
  "Contacto",
];

const AYUDA: ReadonlyArray<{ href?: string; texto: string }> = [
  { href: "#planes", texto: "Planes" },
  { href: "#faq", texto: "Preguntas frecuentes" },
  { texto: "Privacidad" },
  { texto: "Términos de uso" },
];

export function Cierre() {
  return (
    <section
      className="fh-sec fh-close"
      aria-labelledby="h-close"
      data-screen-label="07 Cierre"
    >
      <div className="fh-wrap">
        <div className="fh-sec-head">
          <h2 className="fh-h2" id="h-close">
            Tu próxima lectura puede ser el comienzo de algo más.
          </h2>
        </div>
        <div className="fh-row">
          <a className="fh-btn fh-btn-1" href="#biblioteca">
            Explorar libros
          </a>
          <a className="fh-btn fh-btn-2" href="#planes">
            Ver planes
          </a>
        </div>
      </div>
    </section>
  );
}

export function PieCorporativo() {
  const { abrirEscenario } = useLanding();
  const anio = new Date().getFullYear();

  return (
    <footer
      className="fh-dark fh-bigfoot"
      aria-label="Pie de página"
      data-screen-label="08 Footer"
    >
      <svg
        className="motif"
        viewBox="0 0 100 100"
        fill="none"
        stroke="#c3baff"
        strokeWidth={0.6}
        aria-hidden="true"
      >
        <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" />
        <polygon points="50,20 76,35 76,65 50,80 24,65 24,35" />
        <polygon points="50,34 64,42 64,58 50,66 36,58 36,42" />
        <path d="M50 6v88M12 28l76 44M88 28 12 72" />
      </svg>

      <div className="fh-wrap">
        <div className="fh-foot-grid">
          <div className="fh-foot-brand">
            <a
              href="#top"
              aria-label="FeelVerse, inicio"
              style={{ color: "#fff", textDecoration: "none" }}
            >
              <FeelVerseLockup size={22} inverted />
            </a>
            <p>
              Psicoeducación para leer, explorar y poner en práctica. Libros,
              experiencias e inteligencia artificial para acompañar tu
              aprendizaje.
            </p>
          </div>

          <nav className="fh-foot-col" aria-labelledby="fc1">
            <h2 id="fc1">Explorar</h2>
            <ul>
              {EXPLORAR.map((e) => (
                <li key={e.texto}>
                  <a
                    href={e.href}
                    onClick={
                      e.esGuia
                        ? (ev) => {
                            ev.preventDefault();
                            abrirEscenario("guia");
                          }
                        : undefined
                    }
                  >
                    {e.texto}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="fh-foot-col" aria-labelledby="fc2">
            <h2 id="fc2">FeelVerse</h2>
            <ul>
              {EN_PREPARACION_MARCA.map((t) => (
                <li key={t}>
                  <span className="pend">
                    {t} <small>En preparación</small>
                  </span>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="fh-foot-col" aria-labelledby="fc3">
            <h2 id="fc3">Ayuda y confianza</h2>
            <ul>
              {AYUDA.map((a) => (
                <li key={a.texto}>
                  {a.href ? (
                    <a href={a.href}>{a.texto}</a>
                  ) : (
                    <span className="pend">
                      {a.texto} <small>En preparación</small>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="fh-foot-base">
          <span>© {anio} FeelVerse</span>
          <ControlApariencia id="ap-f" />
          <span>
            Psicoeducación y aprendizaje. No sustituye la atención profesional.
          </span>
        </div>
      </div>
    </footer>
  );
}

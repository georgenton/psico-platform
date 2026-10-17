"use client";

import { useState } from "react";

import { CubiertaConceptual } from "./CubiertaConceptual";
import { OBRAS, OFERTA, TEXTO_DISPONIBILIDAD, type Obra } from "./datos";
import { Dialogo } from "./Dialogo";
import { useLanding } from "./estado";
import { Icono } from "./Icono";
import { desplazarA } from "./navegacion";

/**
 * Biblioteca y ficha de obra.
 *
 * El apoyo de la sección nombra los temas del catálogo, así que cambia con él:
 * la maqueta decía «Emociones, relaciones, familia y crianza digital» porque
 * listaba cuatro títulos, uno de ellos no confirmado. Aquí nombra los tres que
 * sí lo están.
 *
 * ── Qué se dice cuando un dato no está verificado ─────────────────────────
 *
 * Nada. La maqueta rellenaba esos huecos con avisos que describen el estado
 * del equipo, no lo que puede hacer quien visita: «La ficha publicada
 * presentará esta obra», «indicará sus formatos», «Cubiertas conceptuales y
 * fichas de demostración para revisión». Son notas internas y se han
 * retirado de la página.
 *
 * En su lugar no hay invención: una obra sin frase de orientación no la
 * muestra, y una sin formatos publicados no enumera ninguno. Lo que sí se
 * dice, porque es lo que de verdad importa a quien mira, es si puede usarla
 * ahora: «Puedes probarla en esta página» o «Aún no disponible». Eso ocupa el
 * mismo sitio que ocupaban los formatos, así que el ritmo de la tarjeta no
 * cambia.
 *
 * La ficha sigue siendo UNA plantilla con tantos registros como obras.
 */
export function Biblioteca() {
  const [fichaDe, setFichaDe] = useState<Obra | null>(null);

  return (
    <section
      className="fh-sec"
      id="biblioteca"
      aria-labelledby="h-bib"
      data-screen-label="02b Biblioteca"
    >
      <div className="fh-wrap">
        <div className="fh-sec-head">
          <p className="fh-eyebrow">Biblioteca</p>
          <h2 className="fh-h2" id="h-bib">
            Encuentra el libro por el que quieres empezar
          </h2>
          <p className="fh-lede">
            Emociones, familia y relaciones de pareja. Elige un tema y descubre
            cómo puedes leerlo y explorarlo en FeelVerse.
          </p>
        </div>

        <div className="fh-lib">
          {OBRAS.map((obra) => (
            <article
              className="fh-book"
              key={obra.id}
              aria-labelledby={`bk-${obra.id}`}
            >
              <div className="fh-book-cv">
                <CubiertaConceptual obra={obra} />
              </div>
              <div className="fh-book-body">
                <span className="fh-mono">{obra.tema}</span>
                <h3 id={`bk-${obra.id}`}>{obra.titulo}</h3>
                {obra.autoria && <p className="fh-autoria">{obra.autoria}</p>}
                {obra.frase && <p>{obra.frase}</p>}

                {obra.formatos.length > 0 ? (
                  <div className="fh-fmt" aria-label="Formatos">
                    {obra.formatos.map((f) => (
                      <span key={f.clave}>
                        <Icono nombre={f.icono} />
                        {f.etiqueta}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="fh-estado">
                    {TEXTO_DISPONIBILIDAD[obra.disponibilidad]}
                  </p>
                )}

                <button
                  className="fh-btn fh-btn-2 fh-btn-sm"
                  type="button"
                  onClick={() => setFichaDe(obra)}
                >
                  Conocer el libro
                  <Icono nombre="arrow" style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <FichaDeObra obra={fichaDe} alCerrar={() => setFichaDe(null)} />
    </section>
  );
}

function FichaDeObra({
  obra,
  alCerrar,
}: {
  obra: Obra | null;
  alCerrar: () => void;
}) {
  const { fijarObra, abrirEscenario } = useLanding();
  const puedeLeer = obra?.formatos.some((f) => f.clave === "leer") ?? false;

  return (
    <Dialogo
      id="dlg-book"
      abierto={obra !== null}
      alCerrar={alCerrar}
      etiquetadoPor="db-t"
      ancho
      etiquetaCierre="Cerrar ficha"
    >
      {obra && (
        <div className="fh-detail">
          <CubiertaConceptual obra={obra} />
          <div>
            <span className="fh-tag">
              {TEXTO_DISPONIBILIDAD[obra.disponibilidad]}
            </span>
            <h2 id="db-t">{obra.titulo}</h2>
            {obra.autoria && (
              <p className="fh-autoria" style={{ margin: "2px 0 0" }}>
                {obra.autoria}
              </p>
            )}
            {obra.frase && (
              <p style={{ margin: 0, fontSize: 17 }}>{obra.frase}</p>
            )}

            {obra.explora.length > 0 && (
              <>
                <h3>Temas que explora</h3>
                <ul>
                  {obra.explora.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            )}

            <h3>Cómo puedes usarlo</h3>
            <div className="fh-modes">
              {puedeLeer ? (
                <button
                  className="fh-mode"
                  type="button"
                  onClick={() => {
                    alCerrar();
                    abrirEscenario("leer");
                  }}
                >
                  <b>
                    <Icono nombre="book" />
                    Leer
                  </b>
                  El texto, a tu ritmo.
                </button>
              ) : (
                <div className="fh-mode off">
                  <b>
                    <Icono nombre="book" />
                    Leer
                  </b>
                  Aún no disponible.
                </div>
              )}

              {obra.tieneGuia ? (
                <button
                  className="fh-mode"
                  type="button"
                  onClick={() => {
                    alCerrar();
                    abrirEscenario("guia");
                  }}
                >
                  <b>
                    <Icono nombre="bulb" />
                    Explorar el modo guiado
                  </b>
                  {obra.notaGuia}
                </button>
              ) : (
                <div className="fh-mode off">
                  <b>
                    <Icono nombre="bulb" />
                    Modo guiado
                  </b>
                  Aún no disponible.
                </div>
              )}
            </div>

            <h3>Cómo acceder</h3>
            <div className="fh-modes">
              <button
                className="fh-mode"
                type="button"
                onClick={() => {
                  // La obra elegida se conserva al llegar a Planes: es lo que el
                  // ajuste 2.1 pide explícitamente.
                  fijarObra(obra.id);
                  alCerrar();
                  desplazarA("#planes", "#pl-libro");
                }}
              >
                <b>
                  <Icono nombre="book" />
                  Acceso a este libro
                </b>
                USD {OFERTA.pase.importe}, pago único · propuesta
              </button>
              <button
                className="fh-mode"
                type="button"
                onClick={() => {
                  alCerrar();
                  desplazarA("#planes", "#pl-catalogo");
                }}
              >
                <b>
                  <Icono nombre="list" />
                  Acceso con membresía
                </b>
                Todo el catálogo, mensual o anual · propuesta
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

"use client";

import { useState } from "react";

import { EJEMPLOS_MAPA } from "./datos";
import { Dialogo } from "./Dialogo";
import { Icono } from "./Icono";
import { Radar } from "./Radar";

/**
 * El Mapa Emocional, en la sección oscura.
 *
 * Lo que esta sección promete es exactamente lo que el producto hace: el mapa
 * se forma con lo que la persona registra y confirma. Por eso «De dónde sale
 * cada punta» enumera la procedencia por dimensión, y el diálogo dice en voz
 * alta las tres cosas que el mapa NO hace —no es diagnóstico, no mide cuánto
 * lees, y no hay puntuación global—. Ésas son las afirmaciones que una landing
 * se inventa con facilidad, y las que aquí quedan cerradas.
 */
export function SeccionMapa() {
  const [ejemplo, setEjemplo] = useState<"a" | "b">("b");
  const [comoAbierto, setComoAbierto] = useState(false);

  return (
    <section
      className="fh-sec fh-dark"
      id="mapa"
      aria-labelledby="h-mapa"
      data-screen-label="03 Mapa Emocional"
    >
      <div className="fh-wrap">
        <div className="fh-sec-head">
          <p className="fh-eyebrow">Tu Mapa Emocional</p>
          <h2 className="fh-h2" id="h-mapa">
            Tu Mapa Emocional
          </h2>
          <p className="fh-lede">
            Vuelve a lo que registras y confirmas, y explora cómo cambia con el
            tiempo.
          </p>
        </div>

        <div className="fh-map">
          <figure className="fh-map-fig" style={{ margin: 0 }}>
            <div className="fh-ex" role="group" aria-label="Ejemplos de mapa">
              <button
                type="button"
                aria-pressed={ejemplo === "a"}
                onClick={() => setEjemplo("a")}
              >
                Primeras semanas
              </button>
              <button
                type="button"
                aria-pressed={ejemplo === "b"}
                onClick={() => setEjemplo("b")}
              >
                Con más registros
              </button>
            </div>
            <div className="fh-radar">
              <Radar valores={EJEMPLOS_MAPA[ejemplo].valores} grande oscuro />
            </div>
            <div className="fh-legend">
              <span>
                <i />
                Con lo que ya registraste
              </span>
              <span>
                <i className="gap" />
                Reuniendo datos, sin valor inventado
              </span>
            </div>
            <figcaption className="fh-ex-note" id="ex-note">
              Ejemplo con datos sintéticos. {EJEMPLOS_MAPA[ejemplo].nota}
            </figcaption>
          </figure>

          <div style={{ display: "grid", gap: 18 }}>
            <h3 className="fh-h3" style={{ color: "#fff" }}>
              De dónde sale cada punta
            </h3>
            <div className="fh-src">
              <div className="fh-src-item">
                <span className="i">
                  <Icono nombre="smile" />
                </span>
                <b>Tu ánimo</b>
                <span>
                  <em>Calma</em> · cuando marcas cómo estás
                </span>
              </div>
              <div className="fh-src-item">
                <span className="i">
                  <Icono nombre="list" />
                </span>
                <b>Tus respuestas al check-in</b>
                <span>
                  <em>Claridad · Compasión · Consciencia</em>
                </span>
              </div>
              <div className="fh-src-item">
                <span className="i">
                  <Icono nombre="link" />
                </span>
                <b>Lo que confirmas</b>
                <span>
                  <em>Conexión · Propósito</em> · los temas que tú marcas como
                  propios
                </span>
              </div>
            </div>
            <div className="fh-map-actions">
              <button
                className="fh-btn fh-btn-inv"
                type="button"
                onClick={() => setComoAbierto(true)}
              >
                <Icono nombre="info" />
                ¿Cómo se forma mi mapa?
              </button>
              <p className="fh-map-note">
                <Icono nombre="shield" />
                Un mapa para explorar tus registros, no un diagnóstico.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Dialogo
        id="dlg-map"
        abierto={comoAbierto}
        alCerrar={() => setComoAbierto(false)}
        etiquetadoPor="dm-t"
        cabecera={<h2 id="dm-t">¿Cómo se forma mi mapa?</h2>}
      >
        <p style={{ margin: 0 }}>
          Tu mapa se forma solo con lo que registras y confirmas. Tiene seis
          dimensiones: Calma, Claridad, Conexión, Propósito, Compasión y
          Consciencia.
        </p>
        <dl>
          <div>
            <dt>Qué registros usa</dt>
            <dd>
              Tu ánimo (Calma), tus respuestas al check-in (Claridad, Compasión,
              Consciencia) y los temas que confirmas como propios (Conexión,
              Propósito).
            </dd>
          </div>
          <div>
            <dt>Si faltan datos</dt>
            <dd>
              La dimensión aparece con trazo discontinuo y «Reuniendo datos». No
              se inventa un valor para completar la figura.
            </dd>
          </div>
          <div>
            <dt>Lo que no hace</dt>
            <dd>
              No es un diagnóstico ni una escala clínica. No mide cuánto lees:
              terminar una lectura o una actividad no sube por sí sola ninguna
              dimensión. Tampoco hay una puntuación global.
            </dd>
          </div>
        </dl>
        <button
          className="fh-btn fh-btn-1 fh-btn-sm"
          type="button"
          style={{ justifySelf: "start" }}
          onClick={() => setComoAbierto(false)}
        >
          Entendido
        </button>
      </Dialogo>
    </section>
  );
}

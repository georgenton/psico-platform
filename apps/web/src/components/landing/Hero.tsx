"use client";

import { EJEMPLOS_MAPA } from "./datos";
import { useLanding } from "./estado";
import { Icono } from "./Icono";
import { Radar } from "./Radar";

/**
 * Entrada de la página.
 *
 * La escena de la derecha es una muestra con datos sintéticos y lo dice: el
 * mapa lleva su etiqueta «Ejemplo», la leyenda distingue «Con señal» de
 * «Reuniendo datos», y al pie va «Muestra con datos de ejemplo». No se abre con
 * un formulario que parezca una evaluación de quien visita.
 */
export function Hero() {
  const { abrirEscenario } = useLanding();

  return (
    <section
      className="fh-hero fh-intro"
      id="top"
      aria-labelledby="h1"
      data-screen-label="01 Hero"
    >
      <div className="fh-wrap fh-hero-in">
        <div className="fh-hero-copy">
          <p className="fh-eyebrow">Psicoeducación interactiva</p>
          <h1 className="fh-h1" id="h1">
            Aprende a entender tus emociones y tus relaciones
          </h1>
          <p className="fh-lede">
            Explora libros de psicología y experiencias guiadas con audios,
            videos y ejercicios. Pregunta a Eco, la IA de FeelVerse, sobre lo
            que aprendes y descubre actividades para practicar por tu cuenta o
            con otras personas.
          </p>
          <p className="fh-hero-short">Empieza por un libro o por un tema.</p>
          <div className="fh-row">
            <a
              className="fh-btn fh-btn-1"
              href="#guiado"
              onClick={(e) => {
                e.preventDefault();
                abrirEscenario("guia");
              }}
            >
              Ver una experiencia <Icono nombre="arrow" />
            </a>
            <a className="fh-btn fh-btn-2" href="#biblioteca">
              Explorar libros
            </a>
          </div>
          <p className="fh-note">
            <Icono nombre="shield" />
            Psicoeducación y aprendizaje. No sustituye la atención profesional.
          </p>
        </div>

        <div
          className="fh-scene"
          aria-label="Muestra del producto con datos de ejemplo"
          role="group"
        >
          <article className="fh-scene-map" aria-labelledby="sm-t">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <h3 id="sm-t">Tu Mapa Emocional</h3>
              <span className="fh-tag">Ejemplo</span>
            </div>
            <div className="fh-radar">
              <Radar valores={EJEMPLOS_MAPA.b.valores} />
            </div>
            <div className="fh-mini-leg">
              <span>
                <i />
                Con señal
              </span>
              <span>
                <i className="gap" />
                Reuniendo datos
              </span>
            </div>
          </article>

          <article className="fh-scene-read" aria-labelledby="sr-t">
            <div className="fh-sr-top">
              <span>
                <b>Emociones en construcción</b> · Capítulo 1
              </span>
              <span className="fh-tag lav">Modo guiado</span>
            </div>
            <div className="fh-sr-steps" aria-hidden="true">
              <span className="done" />
              <span className="done" />
              <span className="on" />
              <span />
              <span />
            </div>
            <div className="fh-sr-body">
              <span className="fh-mono">
                <Icono nombre="bulb" style={{ width: 15, height: 15 }} />
                La idea
              </span>
              <h4 id="sr-t">Pista, no diccionario</h4>
              <p>
                Un movimiento facial aporta información, pero su significado
                depende de la persona, la situación y lo ocurrido antes.
              </p>
            </div>
            <div className="fh-sr-foot">
              <span>Siguiente: práctica</span>
              <a
                className="go"
                href="#guiado"
                onClick={(e) => {
                  e.preventDefault();
                  abrirEscenario("guia", 3);
                }}
              >
                Una sonrisa, varios contextos{" "}
                <Icono nombre="arrow" style={{ width: 16, height: 16 }} />
              </a>
            </div>
          </article>

          <aside
            className="fh-scene-eco"
            aria-label="Pregunta de ejemplo a Eco"
          >
            <div className="fh-eco-id">
              <span className="fh-eco-av">
                <Icono nombre="eco" />
              </span>
              Eco
              <span className="fh-tag" style={{ marginLeft: "auto" }}>
                Sobre esta idea
              </span>
            </div>
            <div className="fh-bub-u">
              ¿Puedes explicarme esta idea con una situación cotidiana?
            </div>
          </aside>

          <p className="fh-scene-cap">Muestra con datos de ejemplo.</p>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";

import { CubiertaConceptual } from "./CubiertaConceptual";
import {
  OBRAS,
  OFERTA,
  TEXTO_DISPONIBILIDAD,
  type Disponibilidad,
  type Prestacion,
} from "./datos";
import { Dialogo } from "./Dialogo";
import { useLanding, type Periodicidad } from "./estado";
import { Icono } from "./Icono";
import { desplazarA } from "./navegacion";

/**
 * La oferta: dos alcances, no dos frecuencias.
 *
 * Es el cambio central del ajuste 2.1. La comparación principal es «Un libro»
 * frente a «Todo el catálogo»; mensual y anual son dos formas de pagar la
 * membresía y no afectan al pase por título.
 *
 * ── Lo que esta sección NO hace ────────────────────────────────────────────
 *
 * No vende. Los importes son los de la maqueta, hipótesis sin validar, y la
 * página lo dice arriba con «Propuesta de precios · No disponible para
 * compra». No hay pasarela, ni se piden datos de pago o personales, y el
 * resumen se identifica como simulación. Las condiciones que faltan —duración
 * del acceso, cuota de Eco, participantes, renovación, cancelación,
 * impuestos— aparecen como «Por definir» en vez de rellenarse con algo
 * verosímil: son justamente las que tienen que estar resueltas antes de abrir
 * cobros.
 *
 * En anual el importe principal es el anual. La equivalencia mensual se
 * muestra como dato secundario y aclarando que es un pago único al año, porque
 * presentarla como doce cuotas sería describir mal lo que se cobra.
 */
export function SeccionPlanes() {
  const { obra, fijarObra, periodicidad, fijarPeriodicidad, abrirEscenario } =
    useLanding();
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [resumen, setResumen] = useState<"libro" | "catalogo" | null>(null);

  const p = OFERTA.membresia[periodicidad];

  return (
    <section
      className="fh-sec fh-plans-wrap"
      id="planes"
      aria-labelledby="h-plan"
      data-screen-label="05 Planes"
    >
      <div className="fh-wrap">
        <div className="fh-sec-head">
          <p className="fh-eyebrow sage">Planes</p>
          <h2 className="fh-h2" id="h-plan">
            Elige un libro o explora todo FeelVerse
          </h2>
          <p className="fh-lede">
            Trabaja una obra a tu ritmo o accede al catálogo y a las
            herramientas de la membresía.
          </p>
        </div>

        <div className="fh-flag">
          <span>
            <Icono nombre="info" style={{ width: 15, height: 15 }} />
            Propuesta de precios · No disponible para compra
          </span>
        </div>

        <div className="fh-plans">
          <article
            className="fh-plan"
            id="plan-libro"
            aria-labelledby="pl-libro"
          >
            <div className="fh-plan-top">
              <h3 id="pl-libro" tabIndex={-1}>
                Un libro
              </h3>
              <p className="sub">Elige una obra y trabájala a tu ritmo.</p>
            </div>
            <p className="fh-price">
              <span className="c">{OFERTA.moneda}</span>
              <span className="n">{OFERTA.pase.importe}</span>
              <span className="p">{OFERTA.pase.por}</span>
            </p>
            <p className="eq">{OFERTA.pase.nota}</p>

            <div className="fh-pick" aria-live="polite">
              {obra ? (
                <div className="fh-pick-on">
                  <CubiertaConceptual obra={obra} pequena />
                  <div>
                    <span className="fh-mono">Obra elegida</span>
                    <b>{obra.titulo}</b>
                    <small>{TEXTO_DISPONIBILIDAD[obra.disponibilidad]}</small>
                  </div>
                  <button
                    className="fh-btn fh-btn-3"
                    type="button"
                    onClick={() => setSelectorAbierto(true)}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <p className="fh-pick-empty">
                  <Icono nombre="book" />
                  Todavía no has elegido una obra.
                </p>
              )}
            </div>

            <ListaPrestaciones items={OFERTA.pase.prestaciones} />

            <div className="fh-plan-cta">
              {obra ? (
                <button
                  className="fh-btn fh-btn-1"
                  type="button"
                  onClick={() => setResumen("libro")}
                >
                  Revisar acceso a este libro
                </button>
              ) : (
                <button
                  className="fh-btn fh-btn-1"
                  type="button"
                  onClick={() => setSelectorAbierto(true)}
                >
                  Elegir un libro
                </button>
              )}
            </div>
          </article>

          <article
            className="fh-plan"
            id="plan-catalogo"
            aria-labelledby="pl-catalogo"
          >
            <div className="fh-plan-top">
              <h3 id="pl-catalogo" tabIndex={-1}>
                Todo el catálogo
              </h3>
              <p className="sub">
                Explora el conjunto publicado y sus herramientas.
              </p>
            </div>

            <div
              className="fh-seg fh-period"
              role="group"
              aria-label="Forma de pago de la membresía"
            >
              {(["mensual", "anual"] as const).map((valor: Periodicidad) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={periodicidad === valor}
                  onClick={() => fijarPeriodicidad(valor)}
                >
                  {valor === "mensual" ? "Mensual" : "Anual"}
                </button>
              ))}
            </div>

            <div aria-live="polite">
              <p className="fh-price">
                <span className="c">{OFERTA.moneda}</span>
                <span className="n">{p.importe}</span>
                <span className="p">{p.por}</span>
              </p>
              <p className="eq">{p.equivalencia}</p>
              <p className="billed">{p.cobro}</p>
            </div>

            <ListaPrestaciones items={OFERTA.membresia.prestaciones} />
            <p className="eq" style={{ fontSize: "13.5px" }}>
              {OFERTA.membresia.exclusiones}
            </p>

            <div className="fh-plan-cta">
              <button
                className="fh-btn fh-btn-1"
                type="button"
                onClick={() => setResumen("catalogo")}
              >
                Revisar membresía
              </button>
            </div>
          </article>
        </div>

        <details className="fh-terms">
          <summary>
            Qué incluye y cómo se cobra
            <Icono nombre="arrow" clase="fh-chev" />
          </summary>
          <div className="fh-cmp">
            <div className="fh-cmp-row head" aria-hidden="true">
              <span />
              <span>Un libro</span>
              <span>Todo el catálogo</span>
            </div>
            {OFERTA.comparacion.map((f) => (
              <div className="fh-cmp-row" key={f.concepto}>
                <b>{f.concepto}</b>
                <span>
                  <em>Un libro</em>
                  {f.unLibro}
                </span>
                <span>
                  <em>Todo el catálogo</em>
                  {f.catalogo}
                </span>
              </div>
            ))}
          </div>
        </details>

        <div className="fh-plans-foot">
          <a
            className="fh-btn fh-btn-3"
            href="#guiado"
            onClick={(e) => {
              e.preventDefault();
              abrirEscenario("guia");
            }}
          >
            ¿Aún no lo tienes claro? Ver una demostración
          </a>
          <a
            className="fh-btn fh-btn-3"
            href="#duo"
            onClick={(e) => {
              e.preventDefault();
              desplazarA("#duo", "#h-duo");
            }}
          >
            Dúo y Círculos: cómo funcionan y cómo se accede
          </a>
        </div>
      </div>

      <Dialogo
        id="dlg-pick"
        abierto={selectorAbierto}
        alCerrar={() => setSelectorAbierto(false)}
        etiquetadoPor="dk-t"
        ancho
        etiquetaCierre="Cerrar selector"
        cabecera={
          <div>
            <span className="fh-tag">Propuesta · pase por libro</span>
            <h2 id="dk-t" style={{ marginTop: 10 }}>
              Elige un libro
            </h2>
          </div>
        }
      >
        <div className="fh-picklist">
          {OBRAS.map((o) => (
            <button
              className="fh-pickitem"
              type="button"
              key={o.id}
              aria-pressed={obra?.id === o.id}
              onClick={() => {
                fijarObra(o.id);
                setSelectorAbierto(false);
              }}
            >
              <CubiertaConceptual obra={o} pequena />
              <span>
                <b>{o.titulo}</b>
                <small>{TEXTO_DISPONIBILIDAD[o.disponibilidad]}</small>
              </span>
            </button>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: "13.5px", color: "var(--fv-muted)" }}>
          Elegir una obra no la compra ni abre su lectura.
        </p>
      </Dialogo>

      <Dialogo
        id="dlg-plan"
        abierto={resumen !== null}
        alCerrar={() => setResumen(null)}
        etiquetadoPor="dp-t"
        etiquetaCierre="Cerrar resumen"
      >
        {resumen && (
          <div style={{ display: "grid", gap: 14 }}>
            <span className="fh-tag lav" style={{ justifySelf: "start" }}>
              Simulación · no admite compras
            </span>
            <h2
              id="dp-t"
              style={{
                fontFamily: "var(--fv-font-display)",
                fontWeight: 500,
                fontSize: 28,
                color: "var(--fv-text)",
                margin: 0,
              }}
            >
              Resumen · {resumen === "libro" ? "Un libro" : "Todo el catálogo"}
            </h2>
            <dl className="fh-sum">
              {filasResumen(
                resumen,
                periodicidad,
                obra?.titulo,
                obra?.disponibilidad,
              ).map((f) => (
                <div key={f[0]}>
                  <dt>{f[0]}</dt>
                  <dd>{f[1]}</dd>
                </div>
              ))}
            </dl>
            <p style={{ margin: 0, fontSize: "14.5px" }}>
              No se piden datos de pago ni personales. Mientras falten las
              condiciones comerciales, esta propuesta no puede completarse.
            </p>
          </div>
        )}
        <button
          className="fh-btn fh-btn-2 fh-btn-sm"
          type="button"
          style={{ justifySelf: "start" }}
          onClick={() => setResumen(null)}
        >
          Volver a los planes
        </button>
      </Dialogo>
    </section>
  );
}

function ListaPrestaciones({ items }: { items: readonly Prestacion[] }) {
  return (
    <ul className="fh-scope">
      {items.map((i) => (
        <li key={i.texto} className={i.incluida ? undefined : "no"}>
          <Icono nombre={i.incluida ? "check" : "x"} />
          <span>{i.texto}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Las filas del resumen.
 *
 * Es una simulación, así que muestra moneda, importe, frecuencia y duración tal
 * como se cobrarían — y «Por definir» donde todavía no hay decisión. Cuando la
 * obra elegida no puede adquirirse, el resumen lo dice en su propia fila en vez
 * de dejar que parezca disponible.
 */
function filasResumen(
  alcance: "libro" | "catalogo",
  periodicidad: Periodicidad,
  tituloObra?: string,
  disponibilidadObra?: Disponibilidad,
): ReadonlyArray<readonly [string, string]> {
  if (alcance === "libro") {
    // Que no esté disponible se dice entero, no insinuado: quien revisa un
    // resumen de compra tiene que leer ahí que esa obra todavía no se adquiere.
    const noAdquirible = disponibilidadObra === "aun-no";
    const disponibilidad = disponibilidadObra
      ? TEXTO_DISPONIBILIDAD[disponibilidadObra]
      : "Sin elegir";
    return [
      ["Alcance", "Un libro"],
      ["Obra", tituloObra ?? "Sin elegir"],
      [
        "Disponibilidad",
        `${disponibilidad}${noAdquirible ? ". Esta obra no puede adquirirse todavía." : ""}`,
      ],
      ["Moneda", OFERTA.moneda],
      ["Importe", `${OFERTA.moneda} ${OFERTA.pase.importe}`],
      ["Frecuencia", "Pago único por título"],
      ["Duración del acceso", "Por definir"],
      ["Eco", "Cuota del paquete · cantidad por definir"],
      ["Renovación", "No corresponde (pago único)"],
    ];
  }
  const p = OFERTA.membresia[periodicidad];
  return [
    ["Alcance", "Todo el catálogo"],
    ["Forma de pago", periodicidad === "anual" ? "Anual" : "Mensual"],
    ["Moneda", OFERTA.moneda],
    ["Importe", `${OFERTA.moneda} ${p.importe} ${p.por}`],
    ["Cómo se cobra", p.cobro],
    ["Duración del acceso", "Mientras la membresía esté activa"],
    ["Eco", "Cuota renovable · cantidad por definir"],
    ["Dúo y Círculos", "Modalidades y participantes por definir"],
    ["Renovación y cancelación", "Por definir"],
  ];
}

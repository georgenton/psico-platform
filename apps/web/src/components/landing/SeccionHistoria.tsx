"use client";

import { useEffect, useRef, useState } from "react";

import { useLanding } from "./estado";
import { Icono } from "./Icono";
import { movimientoReducido } from "./navegacion";
import type { NombreIcono } from "./sprite-iconos";

/**
 * Historial y sugerencia de patrón.
 *
 * La sección separa dos cosas que suelen confundirse, y lo dice: el historial
 * es lo que hiciste, y los registros son lo que elegiste anotar o confirmar.
 * La tarjeta de patrón se presenta como «posible conexión · sugerencia», con
 * sus dos respuestas, porque el producto distingue una conexión sugerida de una
 * confirmada por la persona. Una landing que presentara la sugerencia como
 * conclusión estaría prometiendo una medición que no existe.
 */

interface Hito {
  readonly icono: NombreIcono;
  readonly fecha: string;
  readonly tipo: "Actividad" | "Tu registro" | null;
  readonly titulo: string;
  readonly texto: string;
  readonly esActividad: boolean;
  readonly esSiguiente?: boolean;
}

const HITOS: readonly Hito[] = [
  {
    icono: "book",
    fecha: "12 sep",
    tipo: "Actividad",
    titulo: "Terminaste una microguía",
    texto: "El rostro es una pista, no un diccionario · capítulo 1.",
    esActividad: true,
  },
  {
    icono: "note",
    fecha: "15 sep",
    tipo: "Tu registro",
    titulo: "Guardaste una reflexión",
    texto: "Solo tú la ves. No se comparte con nadie.",
    esActividad: false,
  },
  {
    icono: "link",
    fecha: "18 sep",
    tipo: "Tu registro",
    titulo: "Confirmaste un tema como propio",
    texto: "Lo marcaste tú. Por eso aporta señal a Conexión en tu mapa.",
    esActividad: false,
  },
  {
    icono: "back",
    fecha: "Para retomar",
    tipo: null,
    titulo: "La emoción informa; no manda",
    texto: "La siguiente microguía del capítulo 1. Cuando quieras.",
    esActividad: true,
    esSiguiente: true,
  },
];

type RespuestaPatron = "ok" | "no" | null;

export function SeccionHistoria() {
  const { abrirEscenario } = useLanding();
  const [respuesta, setRespuesta] = useState<RespuestaPatron>(null);
  const deshacer = useRef<HTMLButtonElement>(null);
  const primeraOpcion = useRef<HTMLButtonElement>(null);
  const visibles = useRevelado(HITOS.length);

  // El foco sigue a lo que aparece y a lo que vuelve: al responder va a
  // «Deshacer», y al deshacer vuelve a la primera opción. Sin esto, el foco se
  // queda en un botón que acaba de desaparecer.
  useEffect(() => {
    if (respuesta) deshacer.current?.focus();
  }, [respuesta]);

  return (
    <section
      className="fh-sec"
      id="historia"
      aria-labelledby="h-hist"
      data-screen-label="03b Historia"
    >
      <div className="fh-wrap">
        <div className="fh-sec-head">
          <p className="fh-eyebrow sage">Tu historia</p>
          <h2 className="fh-h2" id="h-hist">
            Vuelve a donde lo dejaste.
          </h2>
          <p className="fh-lede">
            Tu historial muestra lo que hiciste. Tus registros, lo que elegiste
            anotar o confirmar. Son dos cosas distintas, y las dos te ayudan a
            retomar.
          </p>
        </div>

        <div className="fh-hist">
          <ol className="fh-tl" aria-label="Ejemplo de historial">
            {HITOS.map((h, i) => {
              const clases = ["fh-reveal"];
              if (h.esActividad) clases.unshift("act");
              if (h.esSiguiente) clases.unshift("next");
              if (visibles > i) clases.push("in");
              return (
                <li
                  key={h.titulo}
                  className={clases.join(" ")}
                  style={{ transitionDelay: `${i * 90}ms` }}
                >
                  <span className="dot">
                    <Icono nombre={h.icono} />
                  </span>
                  <div>
                    <div className="when">
                      <span>{h.fecha}</span>
                      {h.tipo && (
                        <span
                          className={
                            h.tipo === "Actividad"
                              ? "fh-tag sage"
                              : "fh-tag lav"
                          }
                        >
                          {h.tipo}
                        </span>
                      )}
                    </div>
                    <h3>{h.titulo}</h3>
                    <p>{h.texto}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div>
            <article className="fh-pattern" aria-labelledby="pt-t">
              <span className="fh-mono">Posible conexión · sugerencia</span>
              <div className="t">
                <span className="i">
                  <Icono nombre="target" />
                </span>
                <h3 id="pt-t">
                  Las reuniones aparecen en varias de tus reflexiones
                </h3>
              </div>
              <p>
                Es una sugerencia para que la revises, no una conclusión sobre
                ti. Tú decides si te encaja.
              </p>
              <div className="chips" aria-hidden="true">
                <span>Reuniones</span>+<span>Reflexiones guardadas</span>
              </div>
              <div className="fh-row" hidden={respuesta !== null}>
                <button
                  className="fh-btn fh-btn-2 fh-btn-sm"
                  type="button"
                  ref={primeraOpcion}
                  onClick={() => setRespuesta("ok")}
                >
                  Me encaja
                </button>
                <button
                  className="fh-btn fh-btn-3"
                  type="button"
                  onClick={() => setRespuesta("no")}
                >
                  No me encaja
                </button>
              </div>
              <p
                className="fh-status"
                role="status"
                hidden={respuesta === null}
              >
                {respuesta === "ok"
                  ? "La marcarías como confirmada. En esta demostración no se guarda. "
                  : respuesta === "no"
                    ? "La descartarías y dejaría de mostrarse. En esta demostración no se guarda. "
                    : ""}
                {respuesta !== null && (
                  <button
                    className="fh-btn fh-btn-3"
                    type="button"
                    ref={deshacer}
                    onClick={() => {
                      setRespuesta(null);
                      // El foco vuelve al sitio desde el que se respondió.
                      window.setTimeout(
                        () => primeraOpcion.current?.focus(),
                        0,
                      );
                    }}
                  >
                    Deshacer
                  </button>
                )}
              </p>
            </article>

            <div className="fh-return">
              <b>Retomar no es empezar de cero.</b>
              <p style={{ margin: 0 }}>
                Vuelve a una lectura, a una conversación con Eco o a lo que
                confirmaste.
              </p>
              <a
                className="fh-btn fh-btn-2 fh-btn-sm"
                href="#guiado"
                style={{ justifySelf: "start" }}
                onClick={(e) => {
                  e.preventDefault();
                  abrirEscenario("guia");
                }}
              >
                Ver una experiencia
              </a>
            </div>
            <p
              style={{
                fontSize: "13.5px",
                color: "var(--fv-muted)",
                margin: "14px 0 0",
              }}
            >
              Historial y sugerencia de ejemplo, con datos sintéticos.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Revela la línea de tiempo al recorrerla.
 *
 * Con `prefers-reduced-motion`, o sin `IntersectionObserver`, se muestran todos
 * de una vez: el movimiento es un acento, no la forma de acceder al contenido.
 * Devuelve cuántos hitos deben verse para que el estado viva en React y no en
 * clases añadidas al DOM por fuera.
 */
function useRevelado(total: number): number {
  const [visibles, setVisibles] = useState(0);

  useEffect(() => {
    if (movimientoReducido() || !("IntersectionObserver" in window)) {
      setVisibles(total);
      return;
    }
    const lista = document.querySelectorAll(".fh-tl .fh-reveal");
    if (lista.length === 0) {
      setVisibles(total);
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          const i = [...lista].indexOf(e.target);
          setVisibles((v) => Math.max(v, i + 1));
          obs.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    lista.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [total]);

  return visibles;
}

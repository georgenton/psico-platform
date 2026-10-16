"use client";

import { useEffect, useRef, useState } from "react";

import { Dialogo } from "./Dialogo";
import { PASOS_GUIA, useLanding, type ModoLibro } from "./estado";
import { Icono } from "./Icono";
import { desplazarA } from "./navegacion";
import type { NombreIcono } from "./sprite-iconos";

/**
 * Libro y modo guiado: la demostración central de la página.
 *
 * Tres avisos de la referencia se conservan porque son ciertos y protegen al
 * visitante de una promesa falsa: el texto del pasaje es ilustrativo y no es el
 * del libro, la audioguía no reproduce nada, y la práctica no guarda
 * respuestas. Lo que sí se reformuló es el aviso de Eco: decir «en esta muestra
 * no hay IA conectada» describía el prototipo. Aquí Eco existe de verdad en el
 * producto; lo que no hace es responder desde esta página, y eso es lo que
 * dice.
 */

const RECORRIDO: ReadonlyArray<{
  icono: NombreIcono;
  titulo: string;
  texto: string;
}> = [
  {
    icono: "search",
    titulo: "Elige",
    texto: "Un libro o un tema que te interese.",
  },
  {
    icono: "book",
    titulo: "Explora",
    texto: "Léelo o síguelo paso a paso en modo guiado.",
  },
  {
    icono: "msg",
    titulo: "Pregunta",
    texto: "A Eco, sobre lo que estás aprendiendo.",
  },
  {
    icono: "pen",
    titulo: "Practica",
    texto: "Con una actividad breve sobre una escena concreta.",
  },
  {
    icono: "back",
    titulo: "Retoma o comparte",
    texto: "Vuelve más adelante o, si quieres, hazlo con otra persona.",
  },
];

const PESTANAS: ReadonlyArray<{ icono: NombreIcono; etiqueta: string }> = [
  { icono: "info", etiqueta: "Contexto" },
  { icono: "book", etiqueta: "Pasaje" },
  { icono: "bulb", etiqueta: "Idea" },
  { icono: "pen", etiqueta: "Práctica" },
  { icono: "check", etiqueta: "Cierre" },
];

const FORMATOS: ReadonlyArray<{
  icono: NombreIcono;
  titulo: string;
  texto: string;
}> = [
  {
    icono: "head",
    titulo: "Audiolibro",
    texto: "Escuchar el texto del libro.",
  },
  {
    icono: "msg",
    titulo: "Audioguía",
    texto: "Una explicación o una práctica en voz.",
  },
  {
    icono: "video",
    titulo: "Video educativo",
    texto: "Un ejemplo o una demostración.",
  },
  {
    icono: "mic",
    titulo: "Podcast",
    texto: "Una conversación sobre el tema, en audio o video.",
  },
];

/** Las cuatro lecturas posibles de la escena de la práctica. */
const LECTURAS = [
  "Está de acuerdo con la decisión.",
  "Intenta mantener la calma delante del grupo.",
  "Está decepcionada, pero prefiere no mostrarlo.",
  "Le da igual el resultado.",
] as const;

const OPCIONES = ["Más plausible", "Posible", "Falta información"] as const;

/** Las dos preguntas de ejemplo a Eco, con su respuesta. */
const ECO = [
  {
    pregunta: "¿Puedes explicarme esta idea con una situación cotidiana?",
    respuesta:
      "Piensa en alguien que sonríe al abrir un regalo que no le gusta. La sonrisa es real, pero no te dice por sí sola si está contento o solo está siendo amable. Para saberlo necesitas más contexto: qué pasó antes, cómo suele reaccionar esa persona y qué dice después.",
  },
  {
    pregunta:
      "Entonces, ¿las expresiones no sirven para saber qué siente alguien?",
    respuesta:
      "Sí sirven: esta microguía parte de que el rostro aporta información. La idea es tratarlo como una pista y no como un diccionario, en el que cada gesto tendría un único significado. ¿Quieres probarlo con la práctica de la sonrisa?",
  },
] as const;

const MICROGUIAS = [
  { titulo: "Las teorías son lentes, no la escena", esLaMuestra: false },
  { titulo: "El rostro es una pista, no un diccionario", esLaMuestra: true },
  { titulo: "La alarma antes del relato", esLaMuestra: false },
  { titulo: "La emoción informa; no manda", esLaMuestra: false },
  { titulo: "Construida no significa falsa", esLaMuestra: false },
] as const;

export function SeccionLibro() {
  const { modo, paso, abrirEscenario, fijarPaso } = useLanding();
  const [ecoElegida, setEcoElegida] = useState<number | null>(null);
  const [practicaTocada, setPracticaTocada] = useState(false);
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const primeraPintura = useRef(true);

  // Al cambiar de paso, el foco va a su título: sin esto, quien navega con
  // teclado se queda en el botón y no oye lo que acaba de aparecer. No se hace
  // en la primera pintura, que robaría el foco al cargar la página.
  useEffect(() => {
    if (primeraPintura.current) {
      primeraPintura.current = false;
      return;
    }
    document
      .querySelector<HTMLElement>(`#st${paso}`)
      ?.focus({ preventScroll: true });
  }, [paso, modo]);

  const cambiarModo = (m: ModoLibro) => {
    abrirEscenario(m);
  };

  return (
    <section
      className="fh-sec"
      id="libro"
      aria-labelledby="h-libro"
      data-screen-label="02 Libro y modo guiado"
    >
      <div className="fh-wrap">
        <div className="fh-sec-head" id="como">
          <p className="fh-eyebrow sage">Libros y modo guiado</p>
          <h2 className="fh-h2" id="h-libro">
            Un libro para leer. Más formas de aprender.
          </h2>
          <p className="fh-lede">
            Lee a tu ritmo o entra en el modo guiado para explorar sus ideas con
            explicaciones, ejemplos y actividades.
          </p>
        </div>

        <ol className="fh-path" aria-label="Lo que puedes hacer">
          {RECORRIDO.map((r) => (
            <li key={r.titulo}>
              <span className="fh-path-ico">
                <Icono nombre={r.icono} />
              </span>
              <b>{r.titulo}</b>
              <span>{r.texto}</span>
            </li>
          ))}
        </ol>

        <div className="fh-stage" id="guiado">
          <div className="fh-stage-top">
            <div className="fh-stage-id">
              <span className="fh-cover" aria-hidden="true">
                Emociones en construcción
              </span>
              <div>
                <b>Emociones en construcción · Capítulo 1</b>
                <small>
                  El rostro es una pista, no un diccionario · 8–10 minutos
                </small>
              </div>
            </div>
            <div
              className="fh-seg"
              role="group"
              aria-label="Cómo quieres usar este libro"
            >
              <button
                type="button"
                aria-pressed={modo === "leer"}
                onClick={() => cambiarModo("leer")}
              >
                <Icono nombre="book" />
                Lectura
              </button>
              <button
                type="button"
                aria-pressed={modo === "guia"}
                onClick={() => cambiarModo("guia")}
              >
                <Icono nombre="bulb" />
                Modo guiado
              </button>
            </div>
          </div>

          <div className="fh-panel" id="p-leer" hidden={modo !== "leer"}>
            <div className="fh-read">
              <article className="fh-read-page" aria-labelledby="rd-t">
                <p className="kicker">Capítulo 1 · sección</p>
                <h3 id="rd-t" tabIndex={-1}>
                  Paul Ekman: el rostro como pista
                </h3>
                <p>
                  Cuando miramos una cara, la leemos deprisa: una sonrisa nos
                  parece alegría y un ceño fruncido, enfado. Esa lectura rápida
                  aporta algo real, y por eso la hacemos a diario.
                </p>
                <p>
                  Pero la misma expresión puede significar cosas distintas según
                  quién la muestra y en qué momento.{" "}
                  <mark>Lo que ocurrió antes cambia lo que vemos.</mark>
                </p>
                <p>
                  Leer el rostro con atención no consiste en adivinar, sino en
                  reunir más contexto antes de concluir.
                </p>
                <span className="fh-tag">
                  Texto ilustrativo de la demostración · no es el texto del
                  libro
                </span>
              </article>
              <aside className="fh-read-side" aria-label="Opciones de lectura">
                <div className="fh-card">
                  <span className="fh-mono sage">
                    <Icono nombre="book" style={{ width: 15, height: 15 }} />
                    Solo leer
                  </span>
                  <p>
                    Leer a tu ritmo es una forma completa de usar FeelVerse. No
                    tienes que hacer actividades ni hablar con Eco.
                  </p>
                </div>
                <div className="fh-card">
                  <span className="fh-mono">
                    <Icono nombre="bulb" style={{ width: 15, height: 15 }} />
                    Si quieres profundizar
                  </span>
                  <p>
                    Esta sección tiene una microguía: la idea explicada, una
                    práctica y un cierre.
                  </p>
                  <button
                    className="fh-btn fh-btn-2 fh-btn-sm"
                    type="button"
                    style={{ justifySelf: "start" }}
                    onClick={() => cambiarModo("guia")}
                  >
                    Abrir en modo guiado
                  </button>
                </div>
              </aside>
            </div>
          </div>

          <div className="fh-panel" id="p-guia" hidden={modo !== "guia"}>
            <div className="fh-guide">
              <div className="fh-guide-main">
                <ol className="fh-steps" aria-label="Pasos de la microguía">
                  {PESTANAS.map((p, i) => (
                    <li key={p.etiqueta}>
                      <button
                        type="button"
                        className={i < paso ? "seen" : undefined}
                        aria-current={i === paso ? "step" : undefined}
                        onClick={() => fijarPaso(i)}
                      >
                        <span className="dot">
                          <Icono nombre={p.icono} />
                        </span>
                        {p.etiqueta}
                      </button>
                    </li>
                  ))}
                </ol>

                <div aria-live="polite">
                  <PasoContexto visible={paso === 0} />
                  <PasoPasaje
                    visible={paso === 1}
                    alLeer={() => cambiarModo("leer")}
                  />
                  <PasoIdea visible={paso === 2} />
                  <PasoPractica
                    visible={paso === 3}
                    tocada={practicaTocada}
                    alTocar={() => setPracticaTocada(true)}
                  />
                  <PasoCierre
                    visible={paso === 4}
                    alLeer={() => cambiarModo("leer")}
                    alVerCatalogo={() => setCatalogoAbierto(true)}
                  />
                </div>

                <div className="fh-guide-nav">
                  <button
                    className="fh-btn fh-btn-2 fh-btn-sm"
                    type="button"
                    disabled={paso === 0}
                    onClick={() => fijarPaso(paso - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    className="fh-btn fh-btn-1 fh-btn-sm"
                    type="button"
                    hidden={paso === PASOS_GUIA - 1}
                    onClick={() => fijarPaso(paso + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>

              <aside className="fh-eco" aria-labelledby="eco-t">
                <div className="fh-eco-id">
                  <span className="fh-eco-av">
                    <Icono nombre="eco" />
                  </span>
                  <span id="eco-t">Pregunta a Eco</span>
                </div>
                <p className="fh-eco-ctx">
                  Relacionado con: <b>Pista, no diccionario</b> · capítulo 1
                </p>
                <div className="fh-eco-log" id="eco-log" aria-live="polite">
                  {ecoElegida === null ? (
                    <p style={{ margin: 0, fontSize: "14.5px" }}>
                      Eco responde sobre la microguía que estás haciendo. Elige
                      una pregunta de ejemplo.
                    </p>
                  ) : (
                    <>
                      <div className="fh-bub-u">{ECO[ecoElegida].pregunta}</div>
                      <div className="fh-bub-e">
                        <b
                          style={{
                            display: "block",
                            fontSize: "12.5px",
                            marginBottom: 4,
                            color: "#5e42c0",
                          }}
                        >
                          Eco · respuesta de ejemplo
                        </b>
                        {ECO[ecoElegida].respuesta}
                      </div>
                    </>
                  )}
                </div>
                <div className="fh-eco-qs">
                  {ECO.map((e, i) => (
                    <button
                      key={e.pregunta}
                      type="button"
                      aria-pressed={ecoElegida === i}
                      onClick={() => setEcoElegida(i)}
                    >
                      {e.pregunta}
                    </button>
                  ))}
                </div>
                <small>
                  Respuestas de ejemplo: aquí no se consulta a Eco. Eco puede
                  equivocarse y no diagnostica.
                </small>
              </aside>
            </div>
          </div>
        </div>

        <div className="fh-formats" aria-label="Formatos de aprendizaje">
          {FORMATOS.map((f) => (
            <div key={f.titulo}>
              <span className="i">
                <Icono nombre={f.icono} />
              </span>
              <b>{f.titulo}</b>
              <p>{f.texto}</p>
            </div>
          ))}
        </div>
        <p
          style={{
            textAlign: "center",
            fontSize: "14.5px",
            margin: "18px auto 0",
            maxWidth: "60ch",
          }}
        >
          Cada libro y experiencia indica qué formatos incluye. No todos los
          tienen todos.
        </p>
      </div>

      <Dialogo
        id="dlg-cat"
        abierto={catalogoAbierto}
        alCerrar={() => setCatalogoAbierto(false)}
        etiquetadoPor="dc-t"
        cabecera={
          <div>
            <span className="fh-tag">Muestra</span>
            <h2 id="dc-t" style={{ marginTop: 10 }}>
              Otras microguías del capítulo 1
            </h2>
          </div>
        }
      >
        <div className="fh-cat">
          <div className="fh-cat-book">
            <span className="fh-cover" aria-hidden="true">
              Emociones en construcción
            </span>
            <div>
              <b>Emociones en construcción</b>
              <p style={{ margin: "4px 0 0", fontSize: "14.5px" }}>
                Microguías del capítulo 1:
              </p>
              <ul>
                {MICROGUIAS.map((m) => (
                  <li key={m.titulo}>
                    {m.titulo}
                    {m.esLaMuestra && (
                      <span className="fh-tag lav">En esta muestra</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <a
          className="fh-btn fh-btn-2 fh-btn-sm"
          href="#biblioteca"
          style={{ justifySelf: "start" }}
          onClick={() => setCatalogoAbierto(false)}
        >
          Ver la biblioteca
        </a>
        <button
          className="fh-btn fh-btn-1 fh-btn-sm"
          type="button"
          style={{ justifySelf: "start" }}
          onClick={() => {
            setCatalogoAbierto(false);
            abrirEscenario("guia", 0);
          }}
        >
          Probar la microguía de muestra
        </button>
      </Dialogo>
    </section>
  );
}

function PasoContexto({ visible }: { visible: boolean }) {
  return (
    <section className="fh-step" aria-labelledby="st0" hidden={!visible}>
      <span className="fh-mono">Paso 1 de 5 · Contexto</span>
      <h3 id="st0" tabIndex={-1}>
        Una sonrisa, varios contextos
      </h3>
      <p>
        Vas a comparar lecturas posibles de una misma expresión. No se trata de
        acertar la emoción, sino de notar cuánta información aporta un rostro y
        dónde termina.
      </p>
      <p className="fh-note">
        <Icono nombre="info" />
        Usaremos escenas cotidianas y ajenas. No necesitas traer ninguna
        situación tuya.
      </p>
    </section>
  );
}

function PasoPasaje({
  visible,
  alLeer,
}: {
  visible: boolean;
  alLeer: () => void;
}) {
  return (
    <section className="fh-step" aria-labelledby="st1" hidden={!visible}>
      <span className="fh-mono">Paso 2 de 5 · Pasaje</span>
      <h3 id="st1" tabIndex={-1}>
        Paul Ekman: el rostro como pista
      </h3>
      <p>
        Lee la sección sobre Ekman. El capítulo reconoce el aporte del rostro y
        también dónde la lectura directa se queda corta.
      </p>
      <div className="fh-row">
        <button
          className="fh-btn fh-btn-2 fh-btn-sm"
          type="button"
          onClick={alLeer}
        >
          <Icono nombre="book" />
          Ir a la lectura
        </button>
        <span style={{ fontSize: 14, color: "var(--fv-muted)" }}>
          Puedes volver aquí cuando quieras.
        </span>
      </div>
    </section>
  );
}

function PasoIdea({ visible }: { visible: boolean }) {
  return (
    <section className="fh-step" aria-labelledby="st2" hidden={!visible}>
      <span className="fh-mono">Paso 3 de 5 · La idea</span>
      <h3 id="st2" tabIndex={-1}>
        Pista, no diccionario
      </h3>
      <p className="reader">
        Un movimiento facial aporta información, pero su significado depende de
        la persona, la situación y lo ocurrido antes. Un rostro ofrece pistas;
        no entrega una lectura completa de la experiencia.
      </p>
      <div className="fh-format">
        <span className="i">
          <Icono nombre="head" />
        </span>
        <b>Audioguía · ejemplo de formato</b>
        <p>
          Así se presentaría una explicación en voz de esta idea. Esta
          demostración no reproduce audio.
        </p>
        <details>
          <summary>Leer lo que diría</summary>
          <p style={{ fontSize: "14.5px" }}>
            Piensa en la última vez que interpretaste una cara. ¿Qué viste, y
            qué supusiste? La expresión es una pista; el contexto completa la
            lectura.
          </p>
        </details>
      </div>
    </section>
  );
}

function PasoPractica({
  visible,
  tocada,
  alTocar,
}: {
  visible: boolean;
  tocada: boolean;
  alTocar: () => void;
}) {
  return (
    <section className="fh-step" aria-labelledby="st3" hidden={!visible}>
      <span className="fh-mono">Paso 4 de 5 · Práctica</span>
      <h3 id="st3" tabIndex={-1}>
        Una sonrisa, varios contextos
      </h3>
      <div className="fh-scene-box">
        <span className="fh-mono sage">Escena ilustrativa</span>
        <b>
          En una reunión, Marta escucha que su propuesta no fue elegida. Sonríe
          y dice: «Entendido».
        </b>
      </div>
      <p>¿Qué tan plausible es cada lectura con lo que sabes de esta escena?</p>
      <div className="fh-reads" onChange={alTocar}>
        {LECTURAS.map((lectura, i) => (
          <div className="fh-reading" key={lectura}>
            <span id={`rl${i}`}>{lectura}</span>
            <fieldset aria-labelledby={`rl${i}`}>
              <legend>{lectura}</legend>
              {OPCIONES.map((o, k) => (
                <label key={o}>
                  <input type="radio" name={`rd${i}`} value={k} />
                  <span>{o}</span>
                </label>
              ))}
            </fieldset>
          </div>
        ))}
      </div>
      <div className="fh-feedback" role="status" hidden={!tocada}>
        Que haya varias lecturas posibles no significa que todas sean igual de
        probables: unas encajan mejor con el contexto disponible que otras. Aquí
        faltan datos: qué esperaba Marta, cómo suele reaccionar, qué dice
        después.
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--fv-muted)" }}>
        No hay nota ni resultado. Esta demostración no guarda tus respuestas.
      </p>
    </section>
  );
}

function PasoCierre({
  visible,
  alLeer,
  alVerCatalogo,
}: {
  visible: boolean;
  alLeer: () => void;
  alVerCatalogo: () => void;
}) {
  return (
    <section className="fh-step" aria-labelledby="st4" hidden={!visible}>
      <span className="fh-mono">Paso 5 de 5 · Lo que te llevas</span>
      <h3 id="st4" tabIndex={-1}>
        El rostro informa. No cierra la pregunta.
      </h3>
      <p className="reader">
        El rostro informa. Lo que no hace es cerrar por sí solo la pregunta de
        qué está sintiendo alguien, y esa distinción cambia cómo escuchas.
      </p>
      <p>
        <b style={{ color: "var(--fv-text)" }}>¿Cómo quieres seguir?</b>
      </p>
      <div className="fh-choices">
        <button className="fh-choice" type="button" onClick={alLeer}>
          <Icono nombre="book" />
          <b>Volver a la lectura</b>
          Seguir con el capítulo a tu ritmo.
        </button>
        <button className="fh-choice" type="button" onClick={alVerCatalogo}>
          <Icono nombre="search" />
          <b>Explorar otra actividad</b>
          Ver las demás microguías del capítulo.
        </button>
        <a
          className="fh-choice"
          href="#duo"
          onClick={(e) => {
            e.preventDefault();
            desplazarA("#duo", "#h-duo");
          }}
        >
          <Icono nombre="users" />
          <b>Actividades compartidas</b>
          Cómo se hacen algunas actividades con otra persona.
        </a>
      </div>
    </section>
  );
}

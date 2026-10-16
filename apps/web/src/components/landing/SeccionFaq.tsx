import { PREGUNTAS } from "./datos";
import { Icono } from "./Icono";

/**
 * Preguntas frecuentes.
 *
 * Son `<details>` nativos: abren con teclado y los anuncia el lector de
 * pantalla sin que haya que reimplementar nada. No hace falta cliente.
 *
 * La primera queda abierta, como en la referencia. Las dos últimas sobre
 * planes dicen que esto es una propuesta y que no admite compras: son la
 * respuesta honesta mientras las condiciones de cambio y cancelación no estén
 * publicadas, y no se sustituyen por un plazo inventado.
 */
export function SeccionFaq() {
  return (
    <section
      className="fh-sec"
      id="faq"
      aria-labelledby="h-faq"
      data-screen-label="06 Preguntas frecuentes"
    >
      <div className="fh-wrap">
        <div className="fh-sec-head">
          <p className="fh-eyebrow">Preguntas frecuentes</p>
          <h2 className="fh-h2" id="h-faq">
            Antes de empezar, resolvemos tus dudas
          </h2>
        </div>

        <div className="fh-faq">
          {PREGUNTAS.map((q, i) => (
            <details className="fh-q" key={q.pregunta} open={i === 0}>
              <summary>
                <span className="n" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{q.pregunta}</span>
                <Icono
                  nombre="arrow"
                  clase="fh-chev"
                  style={{ width: 18, height: 18 }}
                />
              </summary>
              <div className="a">{q.respuesta}</div>
            </details>
          ))}
        </div>

        <p className="fh-faq-foot">
          <Icono nombre="msg" />
          <span>
            ¿Te queda otra duda? El canal de contacto se publicará junto con la
            web.
          </span>
        </p>
      </div>
    </section>
  );
}

/**
 * Dúo y Círculos · avance.
 *
 * Sección sin interacción, así que no necesita cliente.
 *
 * Dice tres cosas que el producto cumple y que conviene no suavizar: cada quien
 * prepara en privado, se elige qué compartir antes de enviar, y el diario, el
 * mapa y las reflexiones no se comparten. La etiqueta de piloto restringido a
 * personas adultas se conserva porque describe el estado real de acceso, no una
 * promesa de disponibilidad general.
 */
export function SeccionDuo() {
  return (
    <section
      className="fh-sec fh-duo"
      id="duo"
      aria-labelledby="h-duo"
      data-screen-label="04 Dúo y Círculos · avance"
    >
      <div className="fh-wrap">
        <div className="fh-sec-head">
          <p className="fh-eyebrow">Dúo y Círculos · piloto</p>
          <h2 className="fh-h2" id="h-duo">
            Algunas actividades también se hacen con otras personas.
          </h2>
          <p className="fh-lede">
            Cada quien prepara en privado y elige qué compartir. Compartir una
            actividad no significa compartir toda tu intimidad.
          </p>
        </div>

        <div className="fh-duo-grid">
          <article className="fh-duo-card" aria-labelledby="duo-a">
            <span className="fh-mono">Dúo</span>
            <h3 className="fh-h3" id="duo-a">
              Una experiencia para aprender entre dos.
            </h3>
            <ol className="fh-flow">
              <li>
                <span>
                  <b>Eligen una actividad</b> compatible, por ejemplo preparar
                  una conversación.
                </span>
              </li>
              <li>
                <span>
                  <b>Cada quien prepara</b> sus respuestas en privado.
                </span>
              </li>
              <li>
                <span>
                  <b>Eligen qué compartir</b> y lo confirman antes de enviar.
                </span>
              </li>
              <li>
                <span>
                  <b>Conversan</b> y, si quieren, acuerdan un siguiente paso.
                </span>
              </li>
            </ol>
          </article>

          <article className="fh-duo-card" aria-labelledby="duo-b">
            <span className="fh-mono">Círculos</span>
            <h3 className="fh-h3" id="duo-b">
              Aprender y conversar en un grupo de confianza.
            </h3>
            <p>
              La misma lógica, con varias personas adultas que se invitan. Las
              respuestas se muestran cuando todo el grupo ha enviado la suya.
            </p>
            <p style={{ fontSize: "14.5px" }}>
              No es una red social ni terapia de grupo.
            </p>
          </article>
        </div>

        <div className="fh-duo-foot">
          <span className="fh-tag lav">
            Piloto restringido · solo personas adultas
          </span>
          <span style={{ fontSize: "14.5px" }}>
            Tu diario, tu mapa y tus reflexiones no se comparten.
          </span>
        </div>
      </div>
    </section>
  );
}

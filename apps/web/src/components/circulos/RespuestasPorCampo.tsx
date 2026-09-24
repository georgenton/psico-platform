import type {
  CircleConfirmedField,
  CirclePreparationField,
} from "@psico/types";

import { estilos as S } from "./estilos";

/**
 * Answers shown under the question that was actually asked.
 *
 * ── Por qué existe este componente ─────────────────────────────────────────
 *
 * La vista previa y el revelado pintaban la misma lista de respuestas con dos
 * copias del mismo JSX, y sólo una de las dos resolvía el enunciado: el
 * revelado imprimía `fieldKey` tal cual, así que la persona leía «que-ayuda»
 * donde la pantalla anterior le había mostrado «En ese momento, me ayuda que…».
 * Issue #723. Una sola lista, un solo sitio donde se resuelve el enunciado, y
 * la divergencia deja de poder ocurrir.
 *
 * ── La clave interna no cambia ────────────────────────────────────────────
 *
 * `fieldKey` sigue siendo `que-ayuda` en el borrador, en la petición, en la
 * base y en el contrato de la API. Lo único que cambia es qué lee la persona.
 *
 * ── Un enunciado por PLANTILLA, no por clave ──────────────────────────────
 *
 * Es tentador guardar un diccionario `que-ayuda → «…»` en algún sitio y acabar.
 * Sería incorrecto: `que-ayuda` NO significa lo mismo en todas partes. La v1 de
 * `duo-lo-que-me-ayuda` lo enuncia «Cuando estoy así, me ayuda que…» y la v2
 * «En ese momento, me ayuda que…», porque la v2 pregunta antes por el momento.
 * Un diccionario global le pondría a una actividad de la v1 la pregunta de la
 * v2 — es decir, enseñaría una respuesta bajo una pregunta que nadie hizo.
 *
 * Por eso el enunciado viaja como dato: `fields` es el `privatePreparation` de
 * la definición a la que la actividad está ANCLADA, resuelta una sola vez en el
 * servidor con `getExact(templateKey, templateVersion)`. Este componente no
 * conoce ninguna plantilla; sólo busca dentro de la que le dieron.
 *
 * ── Cuando no hay enunciado ───────────────────────────────────────────────
 *
 * Si este build no lleva la plantilla anclada, la sala recibe `fields: []` — es
 * la degradación que ya eligió la página: «better an honest gap than invented
 * fields». Entonces se pintan las respuestas SIN término. Ni la clave interna,
 * que es el fallo que venimos a arreglar, ni un enunciado inventado para
 * rellenar el hueco. En la práctica es inalcanzable con la plantilla resuelta:
 * la API rechaza al confirmar cualquier clave que la plantilla no declare, así
 * que o se conocen todas o no se conoce ninguna.
 */

export function RespuestasPorCampo({
  respuestas,
  fields,
}: {
  readonly respuestas: readonly CircleConfirmedField[];
  /** `privatePreparation` de la plantilla ANCLADA. Copia, nunca respuestas. */
  readonly fields: readonly CirclePreparationField[];
}) {
  const enunciados = respuestas.map(
    (r) => fields.find((f) => f.fieldKey === r.fieldKey)?.label ?? null,
  );

  // Todo o nada, y a propósito: un `<div>` dentro de un `<dl>` tiene que llevar
  // su `<dt>`, así que una lista a medias no sería una lista de definiciones
  // válida. Como el caso mixto no puede darse, la rama sencilla es la correcta.
  if (enunciados.some((e) => e === null)) {
    return (
      <div style={{ display: "grid", gap: ".75rem" }}>
        {respuestas.map((r) => (
          <blockquote key={r.fieldKey} style={S.cita}>
            {r.value}
          </blockquote>
        ))}
      </div>
    );
  }

  return (
    <dl style={{ margin: 0, display: "grid", gap: ".75rem" }}>
      {respuestas.map((r, i) => (
        <div key={r.fieldKey}>
          <dt style={S.label}>{enunciados[i]}</dt>
          <dd style={{ margin: ".25rem 0 0" }}>
            <blockquote style={S.cita}>{r.value}</blockquote>
          </dd>
        </div>
      ))}
    </dl>
  );
}

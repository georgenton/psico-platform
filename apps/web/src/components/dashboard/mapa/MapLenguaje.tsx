/**
 * MapLenguaje — Fase F (V2 section "Patrones de lenguaje").
 *
 * Descriptive-only surface for the on-device text analysis (TXT-L1): under
 * the V2 contract the analyzer no longer scores any axis — it just reports
 * how many reflections it processed, with the privacy story explicit. The
 * card only renders when the user opted in AND there is analyzed data.
 */
export function MapLenguaje({
  lenguaje,
}: {
  lenguaje: { n: number } | null | undefined;
}) {
  if (!lenguaje || lenguaje.n <= 0) return null;

  return (
    <section
      className="card"
      style={{ marginTop: 24, padding: "20px 26px 18px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span className="card-tag">Patrones de lenguaje</span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--color-sage-50, #f0f5f0)",
            color: "var(--color-sage-700, #4d7050)",
          }}
        >
          Analizado en tu dispositivo
        </span>
      </div>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--color-warm-700)",
        }}
      >
        El analizador local procesó{" "}
        <b>
          {lenguaje.n} {lenguaje.n === 1 ? "reflexión" : "reflexiones"}
        </b>{" "}
        en los últimos 30 días. Es descriptivo: acompaña cómo escribes sobre ti,
        pero no puntúa ninguna dimensión de tu mapa.
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 11.5,
          lineHeight: 1.5,
          color: "var(--color-warm-500)",
        }}
      >
        Solo números derivados salen de tu dispositivo — el texto nunca. Puedes
        desactivarlo (y borrar lo derivado) en Seguridad.
      </p>
    </section>
  );
}

/**
 * MapNarrative — Fase F (decision L3): the optional NAR-L1 narrative.
 *
 * Copy over already-computed facts. It renders only when the server produced
 * one (narrator flag on); hiding it — or turning the narrator off — never
 * changes the data above it. That separation is the whole point.
 */
export function MapNarrative({
  narrative,
}: {
  narrative:
    | { headline: string; body: string; modelId: string }
    | null
    | undefined;
}) {
  if (!narrative) return null;

  return (
    <section
      className="card"
      style={{
        marginTop: 24,
        padding: "20px 26px 18px",
        border: "1.5px solid var(--color-lavender-200)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span className="card-tag">Una lectura en palabras</span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--color-lavender-50)",
            color: "var(--color-lavender-700)",
          }}
        >
          Experimental
        </span>
      </div>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1.4,
          color: "var(--color-warm-900)",
        }}
      >
        {narrative.headline}
      </p>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--color-warm-700)",
        }}
      >
        {narrative.body}
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 11.5,
          color: "var(--color-warm-500)",
        }}
      >
        Generada a partir de tus datos ya calculados — no crea números nuevos y
        apagarla no cambia tu mapa.
      </p>
    </section>
  );
}

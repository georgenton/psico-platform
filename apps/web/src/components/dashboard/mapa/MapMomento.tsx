import { DIARY_MOODS } from "@psico/types";

/**
 * MapMomento — Fase F (V2 section "Mi momento").
 *
 * The latest self-reported mood observation, verbatim: what you marked and
 * when. No aggregation, no interpretation — the most honest card on the map.
 */
export function MapMomento({
  momento,
}: {
  momento: { mood: string; at: string } | null | undefined;
}) {
  const option = momento
    ? DIARY_MOODS.find((m) => m.id === momento.mood)
    : undefined;

  return (
    <section
      className="card"
      style={{ marginTop: 24, padding: "20px 26px 18px" }}
    >
      <span className="card-tag">Mi momento</span>
      {momento ? (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 34, lineHeight: 1 }} aria-hidden>
            {option?.emoji ?? "•"}
          </span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: "var(--color-warm-900)",
              }}
            >
              {option?.label ?? momento.mood}
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12.5,
                color: "var(--color-warm-500)",
              }}
            >
              Tu último registro · {formatMomentoDate(momento.at)}
            </p>
          </div>
        </div>
      ) : (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--color-warm-600)",
          }}
        >
          Marca tu ánimo arriba cuando quieras — ese registro es el punto de
          partida de tu mapa.
        </p>
      )}
    </section>
  );
}

function formatMomentoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

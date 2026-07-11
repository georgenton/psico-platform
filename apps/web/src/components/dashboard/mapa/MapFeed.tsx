import Link from "next/link";
import { IconEvolution } from "@/components/dashboard/shell/icons";

/**
 * MapFeed — Fase C (V2 contract).
 *
 * The old block listed engagement counters (reading, streak, Eco chats) under
 * "Qué está alimentando tu mapa" — presenting usage activity as map sources,
 * which the copy contract forbids (learning-vs-emotional-map.md). Those
 * counters now live on the learning surface: Mi Evolución. This block is a
 * quiet pointer there, with no counts on the map page.
 */
export function MapFeed() {
  return (
    <div className="map-feed">
      <div className="sec-label">Tu actividad</div>
      <p
        style={{
          margin: "10px 0 12px",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--color-warm-600)",
        }}
      >
        Los conteos de lectura, escritura y de tus charlas con Eco viven ahora
        en <b>Mi Evolución</b> — son parte de tu recorrido, no una medida de tu
        mundo interior.
      </p>
      <Link
        href="/dashboard/evolucion"
        className="feed-chip"
        style={{ textDecoration: "none" }}
      >
        <IconEvolution size={16} />
        Ver mi actividad en Evolución →
      </Link>
    </div>
  );
}

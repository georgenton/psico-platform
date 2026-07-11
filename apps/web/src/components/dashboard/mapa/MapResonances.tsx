"use client";

import { useState, useTransition } from "react";
import type { ResonanceSummary } from "@psico/types";
import { deleteResonanceAction } from "@/app/dashboard/mapa/actions";

/**
 * MapResonances — Fase E (ARC cycle): the first V2 section of the map.
 *
 * Lists the themes the user EXPLICITLY confirmed ("me resonó") with full
 * provenance — source + chapter + date — and lets them delete any entry for
 * real. Nothing here was inferred: every row is a user tap.
 */
export function MapResonances({ initial }: { initial: ResonanceSummary[] }) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove(id: string) {
    const prev = items;
    setItems((list) => list.filter((r) => r.id !== id));
    setError(null);
    startTransition(async () => {
      try {
        await deleteResonanceAction(id);
      } catch {
        setItems(prev);
        setError("No pudimos quitar la resonancia. Reintenta.");
      }
    });
  }

  return (
    <div className="map-feed" style={{ marginTop: 18 }}>
      <div className="sec-label">Mis resonancias</div>
      <p
        style={{
          margin: "10px 0 12px",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--color-warm-600)",
        }}
      >
        Temas que confirmaste al leer — solo entra a tu mapa lo que tú marcas, y
        puedes quitarlo cuando quieras.
      </p>

      {items.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--color-warm-500)",
          }}
        >
          Aún no confirmaste ninguna. Cuando algo de una lectura te resuene, el
          lector te ofrecerá añadirlo aquí.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((r) => (
            <li
              key={r.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "8px 0",
                borderBottom: "1px solid var(--color-warm-100)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  🌱 {r.conceptLabel}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11.5,
                    color: "var(--color-warm-500)",
                  }}
                >
                  Confirmado por ti · Cap. {r.chapterOrder} ·{" "}
                  {formatDate(r.confirmedAt)}
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(r.id)}
                aria-label={`Quitar resonancia ${r.conceptLabel}`}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--color-warm-500)",
                  textDecoration: "underline",
                }}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12.5,
            color: "var(--color-rose-600, #b25454)",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
  });
}

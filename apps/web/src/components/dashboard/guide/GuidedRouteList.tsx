"use client";

/**
 * The chapter's guided route: one card per reading, in the server's order.
 *
 * ── What each card may say ─────────────────────────────────────────────────
 *
 * The CTA comes from the server's per-pin verdict, exactly as the published
 * experience list does: `Empezar`, `Continuar`, `Revisar`, or — when there is
 * no authoritative answer yet — a disabled control. "We could not ask" and
 * "you have not started" are different facts, and only one of them is safe to
 * offer a click on.
 *
 * ── What it must never do ──────────────────────────────────────────────────
 *
 * Ask once per card. The verdicts arrive in one batched request; five cards
 * making five requests is how a chapter with ten readings becomes a chapter
 * that takes a second to open.
 *
 * Share state between readings. Each card carries its own pin and its own
 * verdict; finishing one says nothing about the next.
 *
 * Show the historical pilot. The route the server returns is the V2 one; the
 * pilot answers the legacy adapter and does not appear here as a sixth card.
 */

import type { CSSProperties } from "react";
import type { GuideRouteItem } from "@psico/types";
import type { GuideRouteState } from "./use-guide-route";

export type RouteCardVerdict = "unknown" | "start" | "continue" | "completed";

const CTA: Record<RouteCardVerdict, string> = {
  unknown: "No disponible ahora",
  start: "Empezar",
  continue: "Continuar",
  completed: "Revisar",
};

const STATUS: Record<RouteCardVerdict, string> = {
  unknown: "",
  start: "Sin empezar",
  continue: "En curso",
  completed: "Completada",
};

export interface GuidedRouteListProps {
  state: GuideRouteState;
  /** The server's verdict per `guideKey@guideVersion`. Absent ⇒ `unknown`. */
  verdicts: ReadonlyMap<string, RouteCardVerdict>;
  onOpen: (item: GuideRouteItem) => void;
  onRetry?: () => void;
}

const pinOf = (i: GuideRouteItem) => `${i.guideKey}@${i.guideVersion}`;

export function GuidedRouteList({
  state,
  verdicts,
  onOpen,
  onRetry,
}: GuidedRouteListProps) {
  // Dark or absent: the section does not exist. No placeholder, no "próximamente".
  if (state.status === "idle" || state.status === "unavailable") return null;

  if (state.status === "loading") {
    return (
      <section style={S.section} aria-busy="true" data-testid="route-loading">
        <h3 style={S.heading}>Recorrido guiado</h3>
        {[0, 1, 2].map((i) => (
          <div key={i} style={S.skeleton} aria-hidden="true" />
        ))}
        <p style={S.srOnly} aria-live="polite">
          Cargando el recorrido guiado…
        </p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section style={S.section} data-testid="route-error">
        <h3 style={S.heading}>Recorrido guiado</h3>
        <p style={S.note}>No se pudo cargar el recorrido.</p>
        {onRetry ? (
          <button
            type="button"
            style={S.ghost}
            onClick={onRetry}
            // Named apart from the other retries a chapter screen can show. Two
            // controls that both read «Reintentar» are ambiguous to a screen
            // reader and to anyone reading the page out of order.
            aria-label="Reintentar cargar el recorrido guiado"
          >
            Reintentar
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section style={S.section} data-testid="route-list">
      <h3 style={S.heading}>Recorrido guiado</h3>
      <ol style={S.list}>
        {state.guides.map((item) => {
          const verdict = verdicts.get(pinOf(item)) ?? "unknown";
          const disabled = verdict === "unknown";
          return (
            <li key={pinOf(item)} style={S.card} data-testid="route-card">
              <div style={S.cardHead}>
                <span style={S.order} aria-hidden="true">
                  {item.order}
                </span>
                <h4 style={S.title}>{item.title}</h4>
              </div>
              <p style={S.description}>{item.description}</p>
              <p style={S.meta}>
                <span>{item.estimatedMinutes} min</span>
                {STATUS[verdict] ? (
                  <>
                    {" · "}
                    <span>{STATUS[verdict]}</span>
                  </>
                ) : null}
              </p>
              <button
                type="button"
                style={disabled ? { ...S.cta, ...S.ctaDisabled } : S.cta}
                disabled={disabled}
                onClick={() => onOpen(item)}
                aria-label={`${CTA[verdict]}: ${item.title}`}
              >
                {CTA[verdict]}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const S: Record<string, CSSProperties> = {
  section: { margin: "24px 0" },
  heading: {
    margin: "0 0 12px",
    font: "600 15px/1.4 var(--font-sans)",
    color: "var(--color-warm-800)",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 12,
    // One column on a phone, two where there is room. No horizontal scroll.
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  },
  card: {
    padding: "14px 16px",
    borderRadius: 14,
    border: "1px solid var(--color-warm-200)",
    background: "var(--color-warm-50)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cardHead: { display: "flex", alignItems: "center", gap: 8 },
  order: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    display: "grid",
    placeItems: "center",
    background: "var(--color-warm-200)",
    font: "600 12px/1 var(--font-sans)",
    color: "var(--color-warm-800)",
  },
  title: {
    margin: 0,
    font: "600 14px/1.4 var(--font-sans)",
    color: "var(--color-warm-800)",
  },
  description: {
    margin: 0,
    font: "400 13px/1.6 var(--font-sans)",
    color: "var(--color-warm-700)",
  },
  meta: {
    margin: 0,
    font: "400 12px/1.4 var(--font-sans)",
    color: "var(--color-warm-600)",
  },
  cta: {
    marginTop: 6,
    alignSelf: "flex-start",
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--color-sage-600)",
    background: "var(--color-sage-600)",
    color: "white",
    cursor: "pointer",
    font: "500 13px/1 var(--font-sans)",
  },
  ctaDisabled: {
    border: "1px solid var(--color-warm-300)",
    background: "var(--color-warm-100)",
    color: "var(--color-warm-600)",
    cursor: "not-allowed",
  },
  note: {
    margin: "0 0 8px",
    font: "400 13px/1.6 var(--font-sans)",
    color: "var(--color-warm-600)",
  },
  ghost: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--color-warm-300)",
    background: "transparent",
    cursor: "pointer",
    font: "500 13px/1 var(--font-sans)",
    color: "var(--color-warm-700)",
  },
  skeleton: {
    height: 84,
    borderRadius: 14,
    background: "var(--color-warm-100)",
    marginBottom: 12,
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
};

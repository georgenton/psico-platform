"use client";

/**
 * The chapter's route, kept inside the reader while one journey is playing.
 *
 * The bug this closes: opening a guide replaced the chapter's five readings
 * with a single player, so finishing one left the reader with no way back to
 * the other four except closing the panel and starting over from Chapter
 * Home. The route belongs to the reader's frame, not to the player — which is
 * why this renders BESIDE `ExperiencePlayer` and never inside it. The player
 * stays agnostic about which chapter it is in and how many journeys exist.
 *
 * It is the compact half of one idea. `GuidedRouteList` draws the same route
 * as full cards on Chapter Home; both read `guide-route-verdict`, so a status
 * cannot mean one thing here and another there.
 *
 * ── What it does not do ────────────────────────────────────────────────────
 *
 * Ask anything. Every verdict arrives in the caller's existing batched
 * request; this component performs no fetch and owns no state about progress.
 *
 * Infer. A guide is «Completada» because the server said COMPLETED, never
 * because the reader just finished something on screen.
 *
 * Start anything by itself. Selecting a reading is an explicit tap, and
 * finishing one never auto-opens the next.
 */

import type { CSSProperties } from "react";
import type { GuideRouteItem } from "@psico/types";
import type { GuideRouteState } from "./use-guide-route";
import type { GuidePin } from "./guide-pin";
import {
  ROUTE_CTA,
  ROUTE_MARK,
  ROUTE_STATUS,
  routeItemPinKey,
  routePinKey,
  type RouteCardVerdict,
} from "./guide-route-verdict";

export interface GuidedRouteNavigatorProps {
  state: GuideRouteState;
  /** The server's verdict per `guideKey@guideVersion`. Absent ⇒ `unknown`. */
  verdicts: ReadonlyMap<string, RouteCardVerdict>;
  /** The reading on screen right now, so it can be marked as such. */
  activePin: GuidePin | null;
  onOpen: (item: GuideRouteItem) => void;
  onRetry?: () => void;
}

export function GuidedRouteNavigator({
  state,
  verdicts,
  activePin,
  onOpen,
  onRetry,
}: GuidedRouteNavigatorProps) {
  // A chapter with no route (or a dark one) shows nothing here. The panel is
  // still perfectly usable: it is the single-journey case it always was.
  if (state.status === "idle" || state.status === "unavailable") return null;

  if (state.status === "loading") {
    return (
      <div style={S.wrap} aria-busy="true" data-testid="rgp-route-loading">
        <p style={S.srOnly} aria-live="polite">
          Cargando el recorrido del capítulo…
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div style={S.wrap} data-testid="rgp-route-error">
        <p style={S.note}>No se pudo cargar el recorrido del capítulo.</p>
        {onRetry ? (
          <button
            type="button"
            style={S.ghost}
            onClick={onRetry}
            aria-label="Reintentar cargar el recorrido del capítulo"
          >
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }

  const activeKey = activePin ? routePinKey(activePin) : null;
  const done = state.guides.filter(
    (g) => verdicts.get(routeItemPinKey(g)) === "completed",
  ).length;

  return (
    // A disclosure, so the sheet on a phone can be folded down to one line
    // without the route leaving the DOM. Open by default: the whole point is
    // that the other readings stay in sight.
    <details open style={S.wrap} data-testid="rgp-route">
      <summary style={S.summary}>
        <span style={S.eyebrow}>Recorrido del capítulo</span>
        <span style={S.count} data-testid="rgp-route-count">
          {done} de {state.guides.length}
        </span>
      </summary>
      <ol style={S.list}>
        {state.guides.map((item) => {
          const key = routeItemPinKey(item);
          const verdict = verdicts.get(key) ?? "unknown";
          const disabled = verdict === "unknown";
          const isActive = activeKey !== null && key === activeKey;
          return (
            <li key={key} data-testid="rgp-route-item">
              <button
                type="button"
                // `aria-current` is the accessible half of "this is the one on
                // screen". The visual ring is the other half; neither is the
                // only signal, and neither is colour alone.
                {...(isActive ? { "aria-current": "true" as const } : {})}
                data-active={isActive ? "true" : undefined}
                disabled={disabled}
                onClick={() => onOpen(item)}
                style={{
                  ...S.row,
                  ...(isActive ? S.rowActive : null),
                  ...(disabled ? S.rowDisabled : null),
                }}
                aria-label={
                  isActive
                    ? `${item.order}. ${item.title} · ${ROUTE_STATUS[verdict] || "estado no disponible"} · en pantalla`
                    : `${ROUTE_CTA[verdict]}: ${item.order}. ${item.title} · ${ROUTE_STATUS[verdict] || "estado no disponible"}`
                }
              >
                <span style={S.mark} aria-hidden="true">
                  {ROUTE_MARK[verdict] || item.order}
                </span>
                <span style={S.rowTitle}>{item.title}</span>
                {/* The word, not just the mark: status is never icon-only. */}
                <span style={S.rowStatus}>{ROUTE_STATUS[verdict]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: {
    borderBottom: "1px solid var(--color-warm-200)",
    padding: "10px 16px 12px",
    background: "var(--color-warm-50)",
  },
  summary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    cursor: "pointer",
    listStyle: "none",
  },
  eyebrow: {
    font: "600 12px/1.3 var(--font-sans)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--color-warm-700)",
  },
  count: {
    font: "600 12px/1.3 var(--font-sans)",
    color: "var(--color-warm-600)",
  },
  list: {
    listStyle: "none",
    margin: "8px 0 0",
    padding: 0,
    display: "grid",
    gap: 2,
  },
  row: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "22px 1fr auto",
    alignItems: "center",
    gap: 8,
    padding: "7px 8px",
    borderRadius: 8,
    border: "1px solid transparent",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    font: "400 13px/1.35 var(--font-sans)",
    color: "var(--color-warm-800)",
  },
  rowActive: {
    border: "1px solid var(--color-lavender-400, #a78bfa)",
    background: "var(--color-lavender-50, #f5f3ff)",
    fontWeight: 600,
  },
  rowDisabled: { opacity: 0.5, cursor: "not-allowed" },
  mark: {
    display: "grid",
    placeItems: "center",
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    background: "var(--color-warm-100)",
    font: "600 11px/1 var(--font-sans)",
  },
  rowTitle: { overflow: "hidden", textOverflow: "ellipsis" },
  rowStatus: {
    font: "400 11px/1.3 var(--font-sans)",
    color: "var(--color-warm-600)",
    whiteSpace: "nowrap",
  },
  note: { margin: 0, font: "400 13px/1.4 var(--font-sans)" },
  ghost: {
    marginTop: 6,
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--color-warm-300)",
    background: "transparent",
    cursor: "pointer",
    font: "500 12px/1 var(--font-sans)",
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

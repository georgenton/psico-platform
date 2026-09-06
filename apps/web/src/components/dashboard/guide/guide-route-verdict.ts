import type { GuideRouteItem } from "@psico/types";

/**
 * ONE semantics for "where is the reader in this guided reading".
 *
 * Both surfaces that draw the chapter's route — the full cards on Chapter Home
 * and the compact navigator inside the reader panel — read these. They were
 * duplicated for exactly as long as there was one surface; a second copy is
 * how «Completada» starts meaning two different things in two places.
 *
 * Every value is SERVER-OWNED. `unknown` is not "not started": it means the
 * batched verdict request has no answer for this pin, and the only safe
 * response to that is a control nobody can click.
 */
export type RouteCardVerdict = "unknown" | "start" | "continue" | "completed";

/** What the control says. */
export const ROUTE_CTA: Record<RouteCardVerdict, string> = {
  unknown: "No disponible ahora",
  start: "Empezar",
  continue: "Continuar",
  completed: "Revisar",
};

/**
 * What the reader's own progress reads as.
 *
 * Deliberately not a score and not a percentage: the ledger knows whether a
 * journey was completed, never how well. A recall answered REVIEW is a
 * completed experience, and calling it anything else would invent a judgement
 * the platform does not make.
 */
export const ROUTE_STATUS: Record<RouteCardVerdict, string> = {
  unknown: "",
  start: "Sin empezar",
  continue: "En curso",
  completed: "Completada",
};

/** A tiny mark beside the number, so status is never colour alone. */
export const ROUTE_MARK: Record<RouteCardVerdict, string> = {
  unknown: "",
  start: "",
  continue: "●",
  completed: "✓",
};

export const routePinKey = (i: {
  guideKey: string;
  guideVersion: number;
}): string => `${i.guideKey}@${i.guideVersion}`;

export const routeItemPinKey = (i: GuideRouteItem): string => routePinKey(i);

"use client";

import { probeConsole } from "@/lib/observability/console-probe";

/**
 * Arranque de la observabilidad en el navegador.
 *
 * El SDK va en un fragmento aparte, así que mientras llega los errores se
 * guardan (hasta diez) y se entregan después.
 *
 * Sin `NEXT_PUBLIC_SENTRY_DSN` en la CONSTRUCCIÓN no queda nada de esto: Next
 * incrusta la variable, la condición es falsa al compilar y el fragmento del SDK
 * ni se genera. Por eso activarlo en el navegador exige reconstruir.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN && typeof window !== "undefined") {
  const pending: unknown[] = [];
  let report: ((error: unknown) => void) | null = null;
  const take = (error: unknown): void => {
    if (report) report(error);
    else if (pending.length < 10) pending.push(error);
  };
  window.addEventListener("error", (e) => take(e.error));
  window.addEventListener("unhandledrejection", (e) => take(e.reason));
  probeConsole(take);
  import("@/lib/observability/browser").then(
    (m) => {
      report = m.startBrowserObservability();
      for (const error of pending.splice(0)) report?.(error);
    },
    () => {
      // Si el fragmento no llega, la página sigue igual.
    },
  );
}

export function ObservabilityBoot(): null {
  return null;
}

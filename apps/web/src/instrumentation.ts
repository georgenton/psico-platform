/**
 * Gancho de arranque de Next (14.2, con `experimental.instrumentationHook`).
 *
 * Vive en `src/` porque la aplicación vive en `src/`: en la raíz Next no lo
 * mira, y durante meses este archivo existió sin ejecutarse nunca.
 *
 * Sólo el servidor de Node se arranca aquí. El middleware corre en Edge y
 * arranca lo suyo cuando hace falta (`middleware.ts`), y el navegador, al cargar
 * (`components/observability/ObservabilityBoot.tsx`).
 */
export async function register(): Promise<void> {
  // La condición tiene que ENVOLVER el import, no salir antes: este archivo se
  // compila también para Edge, y sólo así el empaquetador descarta la rama.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.SENTRY_DSN?.trim()) return;
    const { startServerObservability } =
      await import("./lib/observability/server");
    startServerObservability();
  }
}

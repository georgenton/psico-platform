/**
 * «Este error ya se informó.»
 *
 * La misma marca que usa el SDK para no capturar dos veces un objeto. El
 * middleware la pone al atrapar el error, ANTES de relanzarlo: Next lo escribirá
 * en la consola del servidor de Node, y la sonda que escucha ahí lo vería como
 * un fallo nuevo de otro proceso.
 */
export function markAsReported(error: unknown): void {
  try {
    if (typeof error === "object" && error) {
      Object.defineProperty(error, "__sentry_captured__", {
        value: true,
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // Congelado: se informará dos veces, que no es una fuga.
  }
}

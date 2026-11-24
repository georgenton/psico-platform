/**
 * Las fichas de terapeuta que son de DEMOSTRACIÓN. Una sola lista.
 *
 * La usan la semilla (que sólo puede sembrar fichas declaradas aquí), el
 * servicio de terapia y la guarda del pago. Es una IDENTIDAD, no un estado: no
 * se deduce de `isActive`, que lo cambia cualquiera con acceso a la fila y que
 * ni el reintento de pago ni el cambio de hueco miran.
 *
 * ── Qué implica estar aquí ────────────────────────────────────────────────
 *
 * Nunca se lista, nunca se detalla, nunca se reserva, nunca se mueve a otro
 * hueco, nunca abre sala y nunca se cobra — con la oferta abierta o cerrada. Y
 * si aparece en el historial de alguien, aparece sin credencial, sin licencia
 * verificada, sin puntuación y sin número de reseñas.
 *
 * ── Cómo se añade un profesional real ─────────────────────────────────────
 *
 * Con su propia fila y su propio id, que no puede estar en esta lista. Quitar
 * un id de aquí para «activar» una ficha de demostración convertiría en real a
 * una persona inventada.
 *
 * Sin imports a propósito: `prisma/seed-therapists.ts` carga este fichero con
 * ts-node y no debe arrastrar ningún paquete compilado.
 */
export const DEMO_THERAPIST_IDS = [
  "t_marina",
  "t_andrea",
  "t_diego",
  "t_lucia",
  "t_eduardo",
  "t_camila",
] as const;

export type DemoTherapistId = (typeof DEMO_THERAPIST_IDS)[number];

const DEMO: ReadonlySet<string> = new Set(DEMO_THERAPIST_IDS);

/** ¿Es una ficha de demostración? */
export function isDemoTherapist(therapistId: string): boolean {
  return DEMO.has(therapistId);
}

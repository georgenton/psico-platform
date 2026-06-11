/**
 * Relative time formatter for past dates in es-EC.
 *
 * "hace 3 días", "hace 1 mes", "ayer". Mirrors the web version so card
 * labels stay consistent between platforms.
 */
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function relativeTime(
  iso: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!iso) return null;
  const then = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  const seconds = Math.max(
    1,
    Math.floor((now.getTime() - then.getTime()) / 1000),
  );

  if (seconds < MINUTE) return "hace un momento";
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return `hace ${m} ${m === 1 ? "minuto" : "minutos"}`;
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    if (d === 1) return "ayer";
    return `hace ${d} días`;
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return `hace ${w} ${w === 1 ? "semana" : "semanas"}`;
  }
  if (seconds < YEAR) {
    const mo = Math.floor(seconds / MONTH);
    return `hace ${mo} ${mo === 1 ? "mes" : "meses"}`;
  }
  const y = Math.floor(seconds / YEAR);
  return `hace ${y} ${y === 1 ? "año" : "años"}`;
}

/**
 * What a person reads while their account is scheduled for deletion.
 *
 * Shared by web and mobile because both printed the SAME wrong thing: the day
 * of the request, under the words «Tu cuenta se eliminará el…». The two screens
 * were thirty days early, and they were early together.
 *
 * Only presentation lives here. The instant itself is computed by the server
 * (`UserPrivacySettings.accountDeleteScheduledFor`, and `deleteAt` in the answer
 * to the request), from the number the worker uses. Nothing in this file adds
 * days to anything.
 */

import { ecoResetParts, effectiveTimezone } from "./eco-reset";

/**
 * «24 de diciembre de 2026 a las 09:05», told in the person's zone.
 *
 * The zone is the one declared in their profile, never the machine's: the web
 * row is rendered on the server first, so an undeclared zone there would mean
 * the container's, and the page would say one hour and hydrate to another.
 * Without a valid declared zone it counts in UTC AND SAYS SO — the same rule
 * `eco-reset` applies, and the reason the parts come from it.
 *
 * The year is always there. This is the one date on the screen nobody can get
 * back after it passes, and it crosses a year end every December.
 *
 * `null` when there is no date, or when what arrived is not one.
 */
export function accountDeletionDateLabel(
  at: Date | string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!at) return null;
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;

  const { dayLabel, time, zoneDeclared } = ecoResetParts(when, timezone, when);
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: effectiveTimezone(timezone),
    year: "numeric",
  }).format(when);

  return `${dayLabel} de ${year} a las ${time}${zoneDeclared ? "" : " (hora UTC)"}`;
}

/** The sentence under «Borrado programado». */
export function accountDeletionNotice(
  at: Date | string | null | undefined,
  timezone: string | null | undefined,
): string {
  const label = accountDeletionDateLabel(at, timezone);
  return label
    ? `Tu cuenta se eliminará el ${label}. Puedes cancelarlo hasta ese momento.`
    : "Tu cuenta está programada para eliminarse.";
}

/** What cancelling does, said before asking for confirmation. */
export const ACCOUNT_DELETION_CANCEL_PROMPT =
  "Tu cuenta seguirá como está y no se eliminará.";

/** What the screen says once the server has confirmed it. */
export const ACCOUNT_DELETION_CANCELLED_NOTE =
  "Cancelaste la eliminación. Tu cuenta sigue activa.";

const CANCEL_GENERIC =
  "No pudimos confirmar la cancelación. Inténtalo de nuevo.";

const CANCEL_BY_STATUS: Record<number, string> = {
  409: "Ya pasó el plazo para cancelar la eliminación.",
  410: "Esta cuenta ya se eliminó.",
  429: "Hay muchas solicitudes seguidas. Espera un momento e inténtalo de nuevo.",
};

/**
 * Why a cancellation could not be confirmed.
 *
 * By status, never by the server's `message`: that field is diagnostic, and the
 * rule that keeps it off the screen is written in `error-copy`. `null` is «no
 * answer arrived», which is not «it was not cancelled» — so the generic line
 * says it could not be CONFIRMED, and trying again is safe because cancelling
 * twice answers the same as cancelling once.
 */
export function cancelAccountDeletionErrorCopy(status: number | null): string {
  if (status === null) return CANCEL_GENERIC;
  return CANCEL_BY_STATUS[status] ?? CANCEL_GENERIC;
}

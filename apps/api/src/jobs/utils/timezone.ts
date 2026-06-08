/**
 * Sprint S53 — Timezone-aware notification scheduling.
 *
 * BullMQ crons run with `tz: "UTC"` for predictability. To respect each
 * user's local time without per-user cron jobs, we run an hourly cron
 * and filter users whose local target hour matches the current UTC hour.
 *
 * Strategy: cron fires at 00:00, 01:00, ..., 23:00 UTC. For each user
 * with `Profile.timezone` set and a `reminderTime` (HH:MM), we compute
 * the user's local hour at the cron's `now` and check whether it equals
 * the target local hour (typically 07:00 for the weekly digest, 18:00
 * for the inactive nudge).
 *
 * Users WITHOUT a timezone fall back to UTC — preserves S44/S46
 * behavior for legacy accounts until the client auto-detects and PATCHes
 * `/api/user/timezone` on next login.
 *
 * NO new dependencies — built on `Intl.DateTimeFormat` (Node 20 has
 * full ICU; Railway image confirmed).
 */

/**
 * Returns the user's local hour (0-23) at the given UTC instant for the
 * given IANA timezone. Falls back to UTC hour when timezone is null.
 *
 * @param now      UTC instant (typically the cron's `now`)
 * @param timezone IANA name (e.g. "America/Guayaquil"). null → treat as UTC.
 */
export function userLocalHour(
  now: Date,
  timezone: string | null | undefined,
): number {
  if (!timezone) return now.getUTCHours();
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    // "07" or "23" (string).
    const part = fmt.format(now);
    const parsed = Number(part);
    if (Number.isNaN(parsed)) return now.getUTCHours();
    // Intl emits "24" at midnight for some locales; normalize to 0.
    return parsed === 24 ? 0 : parsed;
  } catch {
    // Unknown IANA name — fall back to UTC. We don't want one bad row
    // to skip the entire cron run.
    return now.getUTCHours();
  }
}

/**
 * True when the user's local time at `now` matches the desired local
 * hour for the given notification (e.g. 7 for weekly digest, 18 for
 * inactive nudge).
 *
 * Use this as the per-user gate inside the hourly cron loop.
 */
export function isUserLocalHour(
  now: Date,
  timezone: string | null | undefined,
  targetLocalHour: number,
): boolean {
  return userLocalHour(now, timezone) === targetLocalHour;
}

/**
 * Returns the user's local day-of-week (0=Sunday, 1=Monday, ..., 6=Saturday)
 * at the given UTC instant. Mirrors `Date.getDay()` semantics.
 *
 * Used to gate the weekly digest: we want it on the user's local Monday,
 * not just any UTC Monday — if a user in Tokyo (UTC+9) gets the digest
 * at Monday 22:00 UTC, their local time is Tuesday 07:00, which is fine,
 * but if the cron fires at Monday 02:00 UTC, their local time is still
 * Sunday — we'd be sending the digest a day early. Filtering on
 * local-weekday + local-hour handles both.
 */
export function userLocalWeekday(
  now: Date,
  timezone: string | null | undefined,
): number {
  if (!timezone) return now.getUTCDay();
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const weekdayShort = fmt.format(now); // "Mon", "Tue", ...
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[weekdayShort] ?? now.getUTCDay();
  } catch {
    return now.getUTCDay();
  }
}

/**
 * Lightweight IANA validator. We delegate to `Intl.DateTimeFormat`:
 * unknown names throw RangeError, valid names construct silently.
 *
 * We DON'T import the full IANA list (4 KB+); the constructor
 * validation is canonical and lives in Node's ICU bundle.
 */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string") return false;
  if (tz.length === 0 || tz.length > 64) return false;
  try {
    // Throws RangeError on invalid IANA names.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

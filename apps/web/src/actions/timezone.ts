"use server";

import type { UserMeResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";

/**
 * Server action — Sprint S53.
 *
 * Auto-detected from the browser via
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` and called once per
 * session when `UserMeResponse.profile.timezone === null`. Idempotent on
 * the backend; safe to retry. Errors are swallowed by the caller (the
 * UI should never break a dashboard load because TZ sync failed).
 */
export async function setTimezoneAction(timezone: string): Promise<void> {
  // Defensive: basic sanity check on the client-supplied IANA name. The
  // backend validates more strictly via `Intl.DateTimeFormat` — this is
  // just to short-circuit obvious garbage before we burn a roundtrip.
  if (
    typeof timezone !== "string" ||
    timezone.length < 1 ||
    timezone.length > 64
  ) {
    return;
  }
  try {
    await serverFetch<UserMeResponse>("/user/timezone", {
      method: "PATCH",
      body: JSON.stringify({ timezone }),
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Silently ignored — the user's notifications will keep firing in
    // UTC until the next probe succeeds. Not a critical path.
  }
}

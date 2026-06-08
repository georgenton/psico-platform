"use server";

import { revalidatePath } from "next/cache";
import type { UserMeResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";

/**
 * Server actions — Sprint S53 (auto probe) + S54 (explicit settings).
 *
 * `setTimezoneAction` is the silent path used by the invisible
 * `_TimezoneSync` probe: any failure is swallowed because the
 * dashboard shouldn't break if TZ sync fails. The probe runs again
 * on the next page load.
 *
 * `setTimezoneActionStrict` is the explicit path used by
 * `TimezoneCard` in /dashboard/notifications: the user clicked or
 * picked something, so they deserve to know if it failed. Errors
 * propagate so the component can render an inline error.
 */
export async function setTimezoneAction(timezone: string): Promise<void> {
  if (!isPlausibleIana(timezone)) return;
  try {
    await serverFetch<UserMeResponse>("/user/timezone", {
      method: "PATCH",
      body: JSON.stringify({ timezone }),
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Silent — invisible probe path.
  }
}

export async function setTimezoneActionStrict(timezone: string): Promise<void> {
  if (!isPlausibleIana(timezone)) {
    throw new Error("INVALID_TIMEZONE");
  }
  await serverFetch<UserMeResponse>("/user/timezone", {
    method: "PATCH",
    body: JSON.stringify({ timezone }),
    headers: { "Content-Type": "application/json" },
  });
  // Refresh the notifications page so the next render shows the new TZ
  // in any SC-rendered card (eg. NotificationsForm and the layout). The
  // TimezoneCard itself uses local state too, but this keeps the SSR
  // path honest.
  revalidatePath("/dashboard/notifications");
}

function isPlausibleIana(tz: unknown): tz is string {
  return typeof tz === "string" && tz.length >= 1 && tz.length <= 64;
}

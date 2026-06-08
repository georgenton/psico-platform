"use client";

import { useEffect, useRef } from "react";
import { setTimezoneAction } from "@/actions/timezone";

/**
 * TimezoneSync — Sprint S53.
 *
 * Invisible Client Component mounted on every /dashboard render. On
 * first mount, if the server-resolved user has no `profile.timezone`,
 * we read `Intl.DateTimeFormat().resolvedOptions().timeZone` from the
 * browser and PATCH it to the API. This is the only path that
 * populates the TZ field — there's no settings UI for it in v1.
 *
 * Properties:
 *   - Idempotent at the backend (upsert on Profile by userId).
 *   - Fire-and-forget: any failure is swallowed by the server action so
 *     the dashboard never breaks because of a TZ probe.
 *   - One-shot per page load — `didProbe` ref prevents a re-render
 *     loop. The probe runs again on the NEXT full page load if the
 *     user happens to fall back to needsProbe (shouldn't happen — TZ
 *     persists on the user once set).
 */
export function TimezoneSync({ needsProbe }: { needsProbe: boolean }) {
  const didProbe = useRef(false);

  useEffect(() => {
    if (!needsProbe || didProbe.current) return;
    didProbe.current = true;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (typeof tz === "string" && tz.length > 0) {
        void setTimezoneAction(tz);
      }
    } catch {
      // Older browsers without Intl support — give up silently.
    }
  }, [needsProbe]);

  return null;
}

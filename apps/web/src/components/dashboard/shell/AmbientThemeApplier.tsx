"use client";

import { useEffect } from "react";
import { AMBIENT_IDS, type AmbientId } from "@psico/types";

/**
 * AmbientThemeApplier — Sprint B2.
 *
 * Idempotent side-effect component: clears any previous `amb-*` class from
 * `<body>` and adds `body.amb-{ambient}` on mount + whenever `ambient`
 * changes. Mounted in the dashboard layout so the chosen palette overrides
 * tokens for every dashboard page.
 *
 * Renders nothing. We deliberately don't ship a context — the AmbiencePicker
 * mutates the class itself on optimistic update, and this component is the
 * authoritative SSR-driven applier for the post-paint state.
 */
export function AmbientThemeApplier({ ambient }: { ambient: AmbientId }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    for (const id of AMBIENT_IDS) {
      document.body.classList.remove(`amb-${id}`);
    }
    document.body.classList.add(`amb-${ambient}`);
    return () => {
      // Cleanup on unmount (navigation away from /dashboard) so the chosen
      // palette doesn't bleed into landing/auth pages.
      document.body.classList.remove(`amb-${ambient}`);
    };
  }, [ambient]);

  return null;
}

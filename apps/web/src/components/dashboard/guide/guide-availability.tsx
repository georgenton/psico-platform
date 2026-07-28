"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * CC-7.R1 — whether Guide V1 is enabled for THIS actor right now.
 *
 * The value is the opaque boolean the server returned from
 * `GET /api/guide/availability`, resolved ONCE by the Exploraciones template
 * (which remounts per navigation) and published here so the Guide mounts read
 * it from context instead of asking again.
 *
 * The default is `false` — fail closed. If the template could not resolve
 * availability (no token, a network blip, the API down), the surface behaves
 * exactly as it would for a user outside the pilot: the entry card is hidden
 * and the player shows the calm unavailable state. It NEVER assumes the guide
 * is on, and it never learns why it is off — just the boolean.
 */
const GuideAvailabilityContext = createContext<boolean>(false);

export function GuideAvailabilityProvider({
  available,
  children,
}: {
  available: boolean;
  children: ReactNode;
}) {
  return (
    <GuideAvailabilityContext.Provider value={available}>
      {children}
    </GuideAvailabilityContext.Provider>
  );
}

/** True only when the server said Guide is enabled for this actor. */
export function useGuideAvailability(): boolean {
  return useContext(GuideAvailabilityContext);
}

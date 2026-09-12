import type { Metadata } from "next";

import { GuidePlayerMount } from "@/components/dashboard/guide/GuidePlayerMount";
import { DuoEntryPoint } from "@/components/circulos/DuoEntryPoint";

export const metadata: Metadata = {
  title: "El cuerpo sabe antes que la mente",
};

/**
 * CC-7.5 — the single published Guide V1 web experience.
 *
 * A STATIC route, not `[guideKey]`: V1 publishes exactly one guide and the API
 * exposes no discovery endpoint, so a dynamic segment would promise a catalog
 * that does not exist and would happily accept a key nothing can resolve.
 *
 * The page fetches NO identity of its own. The dashboard layout already
 * resolved the authenticated user through `/user/me` (a refresh-aware fetch)
 * and published the opaque actor scope through `GuideActorScopeProvider`;
 * `GuidePlayerMount` reads it from context and fails closed when it is absent.
 * Starting a guide stays an explicit act by the person (ADR 0019), never a
 * side effect of opening a page.
 */
export const dynamic = "force-dynamic";

/**
 * The Experience pin this route shows, stated on the SERVER.
 *
 * Written as a literal for the same reason `GuidePlayerMount` writes its own:
 * this route plays one guide and no other, and a default reached for here would
 * be inherited by the next standalone route. `duo-entry-point.pin.test.ts`
 * asserts this stays equal to the pin the player mounts, so the two cannot
 * drift into naming different guides on one screen.
 *
 * `experienceKey` IS the `guideKey`: the manifest builder derives both from the
 * same chapter slug, so this is the existing canonical identity rather than a
 * third one invented for Círculos.
 */
const EXPERIENCE_PIN = {
  experienceKey: "eec-c1-cuerpo-antes-que-mente",
  experienceVersion: 1,
} as const;

export default function GuidePage() {
  return (
    <>
      <GuidePlayerMount />
      {/* Server-resolved. Renders nothing at all unless this exact pin is
          mapped to a PUBLISHED template — which, with an empty catalog, is
          every time. */}
      <DuoEntryPoint pin={EXPERIENCE_PIN} />
    </>
  );
}

import type { Metadata } from "next";

import { GuidePlayerMount } from "@/components/dashboard/guide/GuidePlayerMount";

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

export default function GuidePage() {
  return <GuidePlayerMount />;
}

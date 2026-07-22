import type { Metadata } from "next";

import { GuidePlayer } from "@/components/dashboard/guide/GuidePlayer";

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
 * The server component is deliberately thin. It runs no command, fetches no
 * editorial context and receives no userId — starting a guide is an explicit
 * act by the person (ADR 0019), never a side effect of opening a page.
 */
export default function GuidePage() {
  return <GuidePlayer />;
}

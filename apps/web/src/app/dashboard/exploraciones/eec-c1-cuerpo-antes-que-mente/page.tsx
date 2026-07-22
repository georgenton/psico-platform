import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/api.server";
import { deriveGuideRecoveryActorScope } from "@/lib/guide-recovery-scope.server";
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
 * The server component is deliberately thin. It runs no command and fetches no
 * editorial context — starting a guide is an explicit act by the person
 * (ADR 0019), never a side effect of opening a page.
 *
 * Its one job is the actor partition: the local recovery record is bound to an
 * OPAQUE digest of the user id, derived here so the raw id never crosses into
 * the client. Without an authenticated user there is no scope and no page.
 */
export const dynamic = "force-dynamic";

export default function GuidePage() {
  const user = getSessionUser();
  if (!user) redirect("/login");

  return (
    <GuidePlayer actorScope={deriveGuideRecoveryActorScope(user.userId)} />
  );
}

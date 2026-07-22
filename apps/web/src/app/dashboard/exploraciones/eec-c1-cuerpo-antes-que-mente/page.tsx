import type { Metadata } from "next";
import type { UserMeResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
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
 * the client.
 *
 * The actor comes from `/user/me` through `serverFetch`, NOT from decoding the
 * access cookie. The access token lives 15 minutes and the refresh token 30
 * days, and the middleware treats either one as a session — so a page that
 * read only the access token would send a perfectly recoverable session to
 * `/login`, which the middleware bounces straight back to `/dashboard`.
 * `serverFetch` uses the access token when it is there, refreshes when it is
 * not, and hands off to the global logout convention when no session survives.
 * So `/user/me` returns the id of whoever the API actually authenticated.
 */
export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const me = await serverFetch<UserMeResponse>("/user/me");
  // Only the derived scope crosses to the client — never `me.user.id` itself.
  const actorScope = deriveGuideRecoveryActorScope(me.user.id);

  return <GuidePlayer actorScope={actorScope} />;
}

"use client";

import { GuideEntryCard } from "./GuideEntryCard";
import { useGuideActorScope } from "./guide-actor-scope";
import { useGuideAvailability } from "./guide-availability";

/**
 * CC-7.5 — mounts the Guide entry card with the actor scope from context.
 *
 * The Exploraciones page stays identity-free: the scope was resolved once by
 * the dashboard layout and published through `GuideActorScopeProvider`. A null
 * scope fails closed — the card shows "Empezar", never "Continuar".
 *
 * CC-7.R1 — the card renders ONLY when the server-owned pilot gate said the
 * guide is enabled for this actor. When unavailable, the entry point is hidden
 * entirely (returns null): the rest of Exploraciones is unaffected, so a user
 * outside the pilot simply never sees the guide offered.
 */
export function GuideEntryCardMount() {
  const available = useGuideAvailability();
  const scope = useGuideActorScope();
  if (!available) return null;
  return <GuideEntryCard actorScope={scope} />;
}

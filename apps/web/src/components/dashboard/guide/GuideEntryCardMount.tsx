"use client";

import { GuideEntryCard } from "./GuideEntryCard";
import { useGuideActorScope } from "./guide-actor-scope";

/**
 * CC-7.5 — mounts the Guide entry card with the actor scope from context.
 *
 * The Exploraciones page stays identity-free: the scope was resolved once by
 * the dashboard layout and published through `GuideActorScopeProvider`. A null
 * scope fails closed — the card shows "Empezar", never "Continuar".
 */
export function GuideEntryCardMount() {
  const scope = useGuideActorScope();
  return <GuideEntryCard actorScope={scope} />;
}

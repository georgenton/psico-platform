"use client";

import { GuidePlayer } from "./GuidePlayer";
import { useGuideActorScope } from "./guide-actor-scope";

/**
 * CC-7.5 — mounts the Guide player with the actor scope from context.
 *
 * The scope is resolved ONCE by the dashboard layout and published through the
 * `GuideActorScopeProvider`; this thin client wrapper reads it so the page can
 * stay identity-free.
 *
 * Fail closed: when the scope is null (the layout could not resolve the
 * authenticated identity this render) the player is NOT mounted at all — no
 * recovery read, no START — and a calm temporary-unavailability card shows
 * instead.
 */
export function GuidePlayerMount() {
  const scope = useGuideActorScope();

  if (!scope) {
    return (
      <section
        aria-live="polite"
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", marginBottom: 12 }}>
          No pudimos preparar tu guía
        </h1>
        <p style={{ color: "var(--color-warm-600)", lineHeight: 1.6 }}>
          Vuelve a intentarlo en un momento. Tu avance está a salvo.
        </p>
      </section>
    );
  }

  return <GuidePlayer actorScope={scope} />;
}

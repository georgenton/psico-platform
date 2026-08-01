"use client";

import Link from "next/link";

import { GuidePlayer } from "./GuidePlayer";
import { useGuideActorScope } from "./guide-actor-scope";
import { useGuideAvailability } from "./guide-availability";
import { resolveGuideWebBundle } from "./guide-web-bundle";

/**
 * GR-4 — the pin this STANDALONE route publishes, stated explicitly.
 *
 * The route is `/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente`, so
 * the guide it plays is that one and no other. Written here as a literal
 * rather than reached for as a default: the day a second standalone route
 * exists, each will name its own pin and neither will inherit the other's.
 */
const STANDALONE_PIN = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
} as const;

/**
 * CC-7.5 / CC-7.R1 — mounts the Guide player with the actor scope from context.
 *
 * The scope is resolved ONCE by the dashboard layout and published through the
 * `GuideActorScopeProvider`; this thin client wrapper reads it so the page can
 * stay identity-free.
 *
 * Two fail-closed gates, availability first:
 *
 *   - CC-7.R1: when the server-owned pilot gate says the guide is not enabled
 *     for this actor (e.g. someone opened the guide URL directly from outside
 *     the pilot), the player is NOT mounted — no availability round-trip, no
 *     recovery read, no START — and a calm "not available yet" card offers the
 *     way back. The commands would answer 503 anyway; this avoids the wasted
 *     attempt and states it plainly instead.
 *   - CC-7.5: when the scope is null (the layout could not resolve the
 *     authenticated identity this render) the player is likewise not mounted.
 */
export function GuidePlayerMount() {
  const available = useGuideAvailability();
  const scope = useGuideActorScope();

  if (!available) {
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
          Esta guía no está disponible por ahora
        </h1>
        <p
          style={{
            color: "var(--color-warm-600)",
            lineHeight: 1.6,
            marginBottom: 20,
          }}
        >
          Tu avance sigue guardado. Estará disponible más adelante.
        </p>
        <Link href="/dashboard/exploraciones" className="btn">
          Volver a Exploraciones
        </Link>
      </section>
    );
  }

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

  // A pin with no registered bundle is not a guide this build can play. It
  // fails closed rather than rendering the other guide's copy under this URL.
  const bundle = resolveGuideWebBundle(STANDALONE_PIN);
  if (!bundle) {
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

  return <GuidePlayer actorScope={scope} bundle={bundle} />;
}

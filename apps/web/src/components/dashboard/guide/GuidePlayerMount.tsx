"use client";

import Link from "next/link";

import { ExperiencePlayer } from "../experience/ExperiencePlayer";
import { useChapterExperience } from "../experience/use-chapter-experience";
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
 * CC-7.5 / CC-7.R1 / GR-6 — mounts the Experience Player with the actor scope
 * from context. Same player the reader panel mounts; only the frame differs.
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
/** The chapter this standalone route plays, stated with its pin. */
const STANDALONE_CONTEXT = {
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
} as const;

export function GuidePlayerMount() {
  const available = useGuideAvailability();
  const scope = useGuideActorScope();
  // Hooks run before the gates below return: React requires the call order to
  // be stable, and `enabled` is what keeps a gated-out reader from asking.
  const experience = useChapterExperience({
    ...STANDALONE_CONTEXT,
    pin: STANDALONE_PIN,
    enabled: available && scope !== null,
  });

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

  // A pin with no registered bundle is not a guide this build can play, and a
  // pin with no PUBLISHED experience has no journey to present. Both fail
  // closed rather than rendering the other guide's copy under this URL.
  const bundle = resolveGuideWebBundle(STANDALONE_PIN);
  const definition = experience.definition;
  if (!bundle || definition === null) {
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

  return (
    <ExperiencePlayer
      actorScope={scope}
      definition={definition}
      bundle={bundle}
    />
  );
}

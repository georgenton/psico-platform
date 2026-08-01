"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { guideRecoveryState } from "./guide-recovery";
import { resolveGuideWebBundle } from "./guide-web-bundle";

/**
 * GR-4 — the guide this Exploraciones card advertises, stated explicitly.
 *
 * Exploraciones lists PUBLISHED standalone guides, and there is exactly one.
 * Naming its pin here keeps the card from inheriting "whichever guide the
 * registry happens to hold first" the day a second one is registered.
 */
const CARD_PIN = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
} as const;

/**
 * CC-7.5 — the Guide entry point inside Exploraciones.
 *
 * A Guide is NOT a Journey. It has its own card, its own tag and its own
 * route; it never enters `JourneyListResponse`, and nothing about it is
 * rendered through the Journey components. Mixing them would make a
 * three-step educational guide look like a multi-book path.
 *
 * The card is a client component for one reason: whether this browser can
 * resume is a `localStorage` fact, unreadable on the server. So it renders
 * "Empezar guía" first — the honest default when we cannot know — and only
 * switches to "Continuar guía" after mount, if a valid record exists.
 *
 * There is no progress bar. We could not fill one without a GET, and drawing
 * an empty or invented one would be worse than drawing none.
 */
export interface GuideEntryCardProps {
  /**
   * Opaque partition derived server-side — see `guide-recovery-scope.server`.
   * `null` when the layout could not resolve the authenticated identity this
   * render: the card fails closed to "Empezar", never promising to resume.
   */
  actorScope: string | null;
}

export function GuideEntryCard({ actorScope }: GuideEntryCardProps) {
  const [storage, setStorage] = useState<"empty" | "valid" | "unavailable">(
    "empty",
  );
  const bundle = resolveGuideWebBundle(CARD_PIN);

  useEffect(() => {
    // No scope (identity unresolved) reads as `empty`, exactly like a record
    // belonging to another account — the CTA says "Empezar" because promising
    // to continue a run we cannot attribute would be a lie.
    if (!actorScope || !bundle) {
      setStorage("empty");
      return;
    }
    setStorage(guideRecoveryState(actorScope, bundle.pin, bundle.presentation));
  }, [actorScope, bundle]);

  const canResume = storage === "valid";

  // No bundle, no card. A guide this build cannot render is a guide the
  // catalog must not advertise.
  if (!bundle) return null;
  const { presentation } = bundle;
  const href = presentation.href;

  return (
    <div
      className="card"
      style={{
        padding: 24,
        marginBottom: 26,
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ minWidth: 240, flex: "1 1 320px" }}>
        <span className="card-tag sage">{presentation.tag}</span>
        <h3
          style={{
            font: "700 19px/1.25 var(--font-sans)",
            color: "var(--color-warm-900)",
            margin: "10px 0 8px",
          }}
        >
          {presentation.title}
        </h3>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--color-warm-600)",
            margin: 0,
            maxWidth: 480,
          }}
        >
          {presentation.summary}
        </p>
      </div>
      <Link
        href={href ?? "/dashboard/exploraciones"}
        className="btn primary"
        style={{ minHeight: 44, textDecoration: "none" }}
      >
        {canResume ? presentation.labels.resume : presentation.labels.start}
      </Link>
      {storage === "unavailable" ? (
        // Saying "Empezar" without this would promise something this browser
        // cannot deliver: without storage there is no key to recover with.
        <p
          style={{
            flexBasis: "100%",
            margin: 0,
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--color-warm-500)",
          }}
        >
          Este navegador no puede guardar la recuperación de la guía.
        </p>
      ) : null}
    </div>
  );
}

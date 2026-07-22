"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GUIDE_PRESENTATION } from "./guide-presentation";
import { guideRecoveryState } from "./guide-recovery";

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
  /** Opaque partition derived server-side — see `guide-recovery-scope.server`. */
  actorScope: string;
}

export function GuideEntryCard({ actorScope }: GuideEntryCardProps) {
  const [storage, setStorage] = useState<"empty" | "valid" | "unavailable">(
    "empty",
  );

  useEffect(() => {
    // A record belonging to another account reads as `empty`, so the CTA says
    // "Empezar" — promising to continue someone else's run would be a lie.
    setStorage(guideRecoveryState(actorScope));
  }, [actorScope]);

  const canResume = storage === "valid";

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
        <span className="card-tag sage">{GUIDE_PRESENTATION.tag}</span>
        <h3
          style={{
            font: "700 19px/1.25 var(--font-sans)",
            color: "var(--color-warm-900)",
            margin: "10px 0 8px",
          }}
        >
          {GUIDE_PRESENTATION.title}
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
          {GUIDE_PRESENTATION.summary}
        </p>
      </div>
      <Link
        href={GUIDE_PRESENTATION.href}
        className="btn primary"
        style={{ minHeight: 44, textDecoration: "none" }}
      >
        {canResume
          ? GUIDE_PRESENTATION.labels.resume
          : GUIDE_PRESENTATION.labels.start}
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

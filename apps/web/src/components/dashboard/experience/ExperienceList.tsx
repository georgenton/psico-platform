"use client";

/**
 * GR-7 — the chapter's published experiences, as a list.
 *
 * Cardinality is the whole design here:
 *
 *   0 → this section does not exist. No placeholder, no "próximamente", no
 *       disabled card, no reserved space. A chapter without a journey is a
 *       complete chapter, and saying "there is nothing here" is a worse
 *       answer than saying nothing.
 *   1 → one card. Not a carousel of one, not a tab strip of one.
 *   N → a vertical list in the SERVER's order. No editorial cap: if the
 *       catalog publishes ten, the reader sees ten.
 *
 * Every word on a card came over the wire. The status is the only thing this
 * file computes, and it computes it from the session the server reported —
 * never from a guess about what the reader "probably" did.
 */

import type {
  ChapterExperiencePublicView,
  GuideSessionView,
} from "@psico/types";

/** What the reader can do with this experience, as a fact. */
export type ExperienceCardStatus = "start" | "continue" | "completed";

const CTA: Record<ExperienceCardStatus, string> = {
  start: "Empezar",
  continue: "Continuar",
  completed: "Ver resumen",
};

const BADGE: Record<ExperienceCardStatus, string | null> = {
  start: null,
  continue: "En curso",
  completed: "Completada",
};

/**
 * The status of one experience, from the server's own answer.
 *
 * `session` is the recoverable/open session the server reported, whatever pin
 * it carries; matching happens here so a session belonging to a DIFFERENT
 * journey can never colour this card. When there is no session for this pin
 * the honest answer is `start`, because that is all the server told us.
 */
export function experienceCardStatus(
  experience: ChapterExperiencePublicView,
  session: GuideSessionView | null,
): ExperienceCardStatus {
  if (
    session === null ||
    session.guideKey !== experience.guidePin.guideKey ||
    session.guideVersion !== experience.guidePin.guideVersion
  ) {
    return "start";
  }
  return session.status === "COMPLETED" ? "completed" : "continue";
}

function minutesLabel(minutes: number | undefined): string | null {
  if (minutes === undefined || minutes <= 0) return null;
  return `${minutes} min`;
}

export function ExperienceCard({
  experience,
  status,
  onOpen,
}: {
  experience: ChapterExperiencePublicView;
  status: ExperienceCardStatus;
  onOpen: (experience: ChapterExperiencePublicView) => void;
}) {
  const badge = BADGE[status];
  const minutes = minutesLabel(experience.estimatedMinutes);

  return (
    <li
      data-testid={`experience-card-${experience.experienceKey}`}
      data-status={status}
      className="border-b last:border-b-0"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <div className="min-w-[12rem] flex-1">
          <p
            className="text-[14.5px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {experience.title}
          </p>
          {experience.summary ? (
            <p
              className="mt-1 text-[12.5px] leading-snug"
              style={{ color: "var(--color-warm-500)" }}
            >
              {experience.summary}
            </p>
          ) : null}
          {minutes || badge ? (
            <p
              className="mt-1.5 text-[11.5px]"
              style={{ color: "var(--color-warm-400)" }}
            >
              {[minutes, badge].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="btn"
          style={{ minHeight: 44 }}
          // The accessible name contains the visible word, so somebody using
          // voice control can say what they can read.
          aria-label={`${CTA[status]} · ${experience.title}`}
          onClick={() => onOpen(experience)}
        >
          {CTA[status]}
        </button>
      </div>
    </li>
  );
}

export function ExperienceList({
  experiences,
  session,
  onOpen,
  headingId = "chapter-experiences-heading",
}: {
  experiences: readonly ChapterExperiencePublicView[];
  /** The open session the server reported, or `null`. */
  session: GuideSessionView | null;
  onOpen: (experience: ChapterExperiencePublicView) => void;
  headingId?: string;
}) {
  // Zero is not an empty state. It is the absence of a section.
  if (experiences.length === 0) return null;

  return (
    <section data-testid="chapter-experiences" className="mt-8">
      <h2
        id={headingId}
        className="mb-3.5 text-[13px] font-semibold"
        style={{ color: "var(--color-warm-800)" }}
      >
        Experiencias guiadas
      </h2>
      <ul
        aria-labelledby={headingId}
        className="overflow-hidden rounded-2xl"
        style={{
          background: "#fff",
          border: "1px solid var(--color-warm-200)",
        }}
      >
        {experiences.map((experience) => (
          <ExperienceCard
            key={`${experience.experienceKey}@${experience.experienceVersion}`}
            experience={experience}
            status={experienceCardStatus(experience, session)}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

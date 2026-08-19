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
 * Every word on a card came over the wire — the status included. C.1 moved
 * that verdict to the server, because a chapter has ONE guide pin and two
 * experiences comparing themselves against one session is exactly how
 * finishing one made the other read «Completada» (#639).
 */

import type {
  ChapterExperiencePublicView,
  GuideExperienceCardState,
} from "@psico/types";

/** What the reader can do with this experience, as a fact. */
export type ExperienceCardStatus = "start" | "continue" | "completed";

/** The server's verdict, keyed by published pin. */
export type ExperienceCardStates = ReadonlyMap<
  string,
  GuideExperienceCardState
>;

/** The key both sides agree on: a card is identified by the pin it publishes. */
export function experiencePinKey(pin: {
  guideKey: string;
  guideVersion: number;
}): string {
  return `${pin.guideKey}@${pin.guideVersion}`;
}

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
 * The status of one experience — READ from the server, never derived here.
 *
 * This used to compare one chapter-wide session against each card's pin, and
 * that is precisely the bug in #639: a chapter has one guide pin, so two
 * experiences shared a verdict and finishing one made the other read
 * «Completada». Worse, the comparison demanded an exact version match, so a
 * reader with `A@v1` still running saw «Empezar» the day `A@v2` published.
 *
 * Both questions belong to the server, which can see the lineage and the exact
 * pin separately. Here the only job left is translating its three words into
 * the three the reader sees. An unknown card — the batch failed, or the server
 * said nothing about this pin — reads `start`, which is what an unopened
 * journey looks like anyway.
 */
export function experienceCardStatus(
  experience: ChapterExperiencePublicView,
  states: ExperienceCardStates,
): ExperienceCardStatus {
  const state = states.get(experiencePinKey(experience.guidePin));
  if (!state) return "start";
  if (state.status === "CONTINUE") return "continue";
  if (state.status === "COMPLETED") return "completed";
  return "start";
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
  states,
  onOpen,
  headingId = "chapter-experiences-heading",
}: {
  experiences: readonly ChapterExperiencePublicView[];
  /**
   * The server's verdict per published pin — one entry per card, from ONE
   * batch request. A missing entry is `start`, never a guess.
   */
  states: ExperienceCardStates;
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
            status={experienceCardStatus(experience, states)}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

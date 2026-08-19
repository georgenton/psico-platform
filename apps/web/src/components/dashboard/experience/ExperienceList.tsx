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
 *
 * And a state we do not have is not a state. The list has four load phases,
 * and only one of them shows a CTA: an unknown card cannot be opened, because
 * "we could not ask" and "you have not started" are different facts and only
 * one of them is safe to act on.
 */

import type {
  ChapterExperiencePublicView,
  GuideExperienceCardState,
} from "@psico/types";

/**
 * What the reader can do with this experience, as a fact.
 *
 * `unknown` is a first-class member, not an absence. It used to be spelled
 * «Empezar», which offered a fresh run over a journey that might already be in
 * progress — the exact confusion C.1 exists to end.
 */
export type ExperienceCardStatus =
  | "start"
  | "continue"
  | "completed"
  | "unknown";

/** The server's verdict, keyed by published pin. */
export type ExperienceCardStates = ReadonlyMap<
  string,
  GuideExperienceCardState
>;

/**
 * The load itself, as a state machine.
 *
 * `idle` is before anything was asked; `ready` carries the verdicts; `error`
 * means the question failed and the reader is offered a retry, not a guess.
 */
export type ExperienceStatesLoad =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; states: ExperienceCardStates }
  | { status: "error" };

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
  unknown: "No disponible",
};

const BADGE: Record<ExperienceCardStatus, string | null> = {
  start: null,
  continue: "En curso",
  completed: "Completada",
  unknown: null,
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
 * the three the reader sees.
 *
 * A card the load does not cover reads `unknown` — while the batch is in
 * flight, when it failed, and when the answer said nothing about this pin. It
 * is deliberately NOT `start`: an unanswered question must never look like a
 * fresh journey, because acting on it can strand a session the reader has.
 */
export function experienceCardStatus(
  experience: ChapterExperiencePublicView,
  load: ExperienceStatesLoad,
): ExperienceCardStatus {
  if (load.status !== "ready") return "unknown";
  const state = load.states.get(experiencePinKey(experience.guidePin));
  if (!state) return "unknown";
  if (state.status === "CONTINUE") return "continue";
  if (state.status === "COMPLETED") return "completed";
  if (state.status === "START") return "start";
  return "unknown";
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
  // An unknown card is inert. Not a fallback CTA, not a hidden one: a visible,
  // disabled action says «we asked and could not tell», which is true.
  const actionable = status !== "unknown";

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
          style={{ minHeight: 44, opacity: actionable ? 1 : 0.55 }}
          disabled={!actionable}
          // The accessible name contains the visible word, so somebody using
          // voice control can say what they can read.
          aria-label={`${CTA[status]} · ${experience.title}`}
          onClick={() => {
            // Belt as well as braces: a disabled button cannot be clicked, and
            // a handler that would open an unknown card cannot exist either.
            if (!actionable) return;
            onOpen(experience);
          }}
        >
          {CTA[status]}
        </button>
      </div>
    </li>
  );
}

export function ExperienceList({
  experiences,
  load,
  onOpen,
  onRetry,
  headingId = "chapter-experiences-heading",
}: {
  experiences: readonly ChapterExperiencePublicView[];
  /**
   * The server's verdict per published pin — one entry per card, from ONE
   * batch request — together with whether we have it at all.
   */
  load: ExperienceStatesLoad;
  onOpen: (experience: ChapterExperiencePublicView) => void;
  /** Ask the question again. Shown only when the last attempt failed. */
  onRetry?: () => void;
  headingId?: string;
}) {
  // Zero is not an empty state. It is the absence of a section.
  if (experiences.length === 0) return null;

  const pending = load.status === "idle" || load.status === "loading";
  const failed = load.status === "error";

  return (
    <section data-testid="chapter-experiences" className="mt-8">
      <h2
        id={headingId}
        className="mb-3.5 text-[13px] font-semibold"
        style={{ color: "var(--color-warm-800)" }}
      >
        Experiencias guiadas
      </h2>

      {/* Announced politely: the list is already on screen and its cards are
          inert, so this is an update, not an interruption. */}
      {pending ? (
        <p
          data-testid="chapter-experiences-loading"
          role="status"
          className="mb-2 text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Consultando tu avance…
        </p>
      ) : null}

      {failed ? (
        <div
          data-testid="chapter-experiences-error"
          // An error the reader is expected to act on. `alert` so it is read
          // when it appears, not only when they happen to reach it.
          role="alert"
          className="mb-2 flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5"
          style={{
            background: "var(--color-warm-100)",
            border: "1px solid var(--color-warm-200)",
          }}
        >
          <p
            className="min-w-[12rem] flex-1 text-[12.5px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            No pudimos consultar tu avance en estas experiencias.
          </p>
          {onRetry ? (
            <button
              type="button"
              className="btn"
              style={{ minHeight: 44 }}
              aria-label="Reintentar consultar tu avance en las experiencias"
              onClick={onRetry}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      <ul
        aria-labelledby={headingId}
        // While the answer is in flight the list is stale by definition, and
        // saying so is cheaper than a spinner over every row.
        aria-busy={pending || undefined}
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
            status={experienceCardStatus(experience, load)}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

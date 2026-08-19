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
 * WHERE the reader stands — the server's answer, and only the server's.
 *
 * `unknown` is a first-class member, not an absence: it means no authoritative
 * verdict, which happens while the batch is in flight, when it failed, and
 * when the answer said nothing about this pin. It used to be spelled
 * «Empezar», which offered a fresh run over a journey that might already be in
 * progress — the exact confusion C.1 exists to end.
 */
export type ExperienceCardVerdict =
  | "unknown"
  | "start"
  | "continue"
  | "completed";

/**
 * The two facts a card needs, kept apart on purpose.
 *
 * They were briefly collapsed into one word, and the collapse cost something
 * real: a CONTINUE this build cannot open stopped saying «En curso», and a
 * COMPLETED stopped saying «Completada». Where the reader stands does not
 * change because the app in front of them cannot open the door — it only
 * changes what the door does.
 *
 * `runnable` is decided from `resumePin` and nothing else: when the server
 * answers CONTINUE for `A@v2` because `A@v1` is still open, `A@v1` is the run
 * a click would land in, so `A@v1` is what has to exist here.
 */
export interface ExperienceCardView {
  verdict: ExperienceCardVerdict;
  runnable: boolean;
}

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
 *
 * `ready` and `error` are TAGGED with the question and the asking that produced
 * them. An answer is a fact about a moment, and once the reader asks again —
 * or moves to another chapter — it stops speaking for the screen. Whoever owns
 * the load decides that; this component is only ever handed the answer that
 * still counts.
 */
export type ExperienceStatesLoad =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      /** The question this answers, and which asking of it. */
      requestKey: string;
      generation: number;
      states: ExperienceCardStates;
    }
  | { status: "error"; requestKey: string; generation: number };

/** The key both sides agree on: a card is identified by the pin it publishes. */
export function experiencePinKey(pin: {
  guideKey: string;
  guideVersion: number;
}): string {
  return `${pin.guideKey}@${pin.guideVersion}`;
}

/** What a live card offers. A card that cannot be opened says so instead. */
const CTA: Record<ExperienceCardVerdict, string> = {
  start: "Empezar",
  continue: "Continuar",
  completed: "Ver resumen",
  unknown: "No disponible",
};

const CTA_UNRUNNABLE = "No disponible aquí";

/**
 * Where the reader stands, said plainly — and said even when the journey
 * cannot be opened here, because that is still where they stand.
 */
const BADGE: Record<ExperienceCardVerdict, string | null> = {
  unknown: null,
  start: null,
  continue: "En curso",
  completed: "Completada",
};

/** Said out loud on the card, not only encoded in a disabled button. */
const NOTE_UNKNOWN = "No pudimos consultar tu avance en esta experiencia.";
const NOTE_UNRUNNABLE =
  "Esta experiencia no puede abrirse en este capítulo con esta versión de la app.";

/**
 * The two facts about one experience, answered separately.
 *
 * The verdict is READ from the server, never derived here. This used to
 * compare one chapter-wide session against each card's pin, and that is
 * precisely the bug in #639: a chapter has one guide pin, so two experiences
 * shared a verdict and finishing one made the other read «Completada». Worse,
 * the comparison demanded an exact version match, so a reader with `A@v1`
 * still running saw «Empezar» the day `A@v2` published.
 *
 * Both of those belong to the server, which can see the lineage and the exact
 * pin separately. Here the only job left is translating its three words into
 * the three the reader sees.
 *
 * Runnability is the LOCAL question, and it never rewrites the verdict — an
 * unopenable CONTINUE is still «En curso». An `unknown` verdict is reported as
 * not runnable too, but for a different reason: there is no `resumePin` to ask
 * about, and acting on a question nobody answered can strand a session.
 */
export function experienceCardView(
  experience: ChapterExperiencePublicView,
  load: ExperienceStatesLoad,
  canRun: (pin: { guideKey: string; guideVersion: number }) => boolean,
): ExperienceCardView {
  const unknown: ExperienceCardView = { verdict: "unknown", runnable: false };
  if (load.status !== "ready") return unknown;
  const state = load.states.get(experiencePinKey(experience.guidePin));
  if (!state) return unknown;
  const verdict: ExperienceCardVerdict | null =
    state.status === "CONTINUE"
      ? "continue"
      : state.status === "COMPLETED"
        ? "completed"
        : state.status === "START"
          ? "start"
          : null;
  if (verdict === null) return unknown;
  return { verdict, runnable: canRun(state.resumePin) };
}

function minutesLabel(minutes: number | undefined): string | null {
  if (minutes === undefined || minutes <= 0) return null;
  return `${minutes} min`;
}

export function ExperienceCard({
  experience,
  view,
  onOpen,
}: {
  experience: ChapterExperiencePublicView;
  view: ExperienceCardView;
  onOpen: (experience: ChapterExperiencePublicView) => void;
}) {
  const { verdict, runnable } = view;
  // The badge follows the VERDICT alone. «En curso» is where the reader
  // stands, and that stays true whether or not this build can open the door.
  const badge = BADGE[verdict];
  const minutes = minutesLabel(experience.estimatedMinutes);
  // Two different negatives, two different sentences. Blaming the network for
  // a catalog fact — or the catalog for a network one — is its own small lie.
  const note =
    verdict === "unknown" ? NOTE_UNKNOWN : runnable ? null : NOTE_UNRUNNABLE;
  const noteId = `${experience.experienceKey}-note`;
  // An inert card is visible, disabled and says WHY. Not a fallback CTA, not a
  // hidden one: «we asked and could not tell» and «this cannot open here» are
  // both true statements, and both are better than a button that does nothing.
  const actionable = verdict !== "unknown" && runnable;
  // Three labels for three situations, because they are three situations: an
  // offer, «we could not ask», and «we asked and cannot open it here».
  const cta = actionable
    ? CTA[verdict]
    : verdict === "unknown"
      ? CTA.unknown
      : CTA_UNRUNNABLE;

  return (
    <li
      data-testid={`experience-card-${experience.experienceKey}`}
      // Two attributes because they are two facts. Collapsing them into one
      // combined status is exactly what hid «En curso» from a card this build
      // cannot open.
      data-status={verdict}
      data-runnable={runnable ? "true" : "false"}
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
          {note ? (
            <p
              id={noteId}
              data-testid={`experience-note-${experience.experienceKey}`}
              className="mt-1.5 text-[11.5px]"
              style={{ color: "var(--color-warm-600)" }}
            >
              {note}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="btn"
          style={{ minHeight: 44, opacity: actionable ? 1 : 0.55 }}
          disabled={!actionable}
          // The accessible name contains the visible word, so somebody using
          // voice control can say what they can read; the reason travels with
          // it, so a screen reader gets the explanation and not just «no
          // disponible».
          aria-label={`${cta} · ${experience.title}`}
          {...(note ? { "aria-describedby": noteId } : {})}
          onClick={() => {
            // Belt as well as braces: a disabled button cannot be clicked, and
            // a handler that would open an unknown card cannot exist either.
            if (!actionable) return;
            onOpen(experience);
          }}
        >
          {cta}
        </button>
      </div>
    </li>
  );
}

export function ExperienceList({
  experiences,
  load,
  canRun,
  onOpen,
  onRetry,
  headingId = "chapter-experiences-heading",
}: {
  experiences: readonly ChapterExperiencePublicView[];
  /**
   * The server's verdict per published pin — one entry per card, from ONE
   * batch request — together with whether we have it at all. Only the answer
   * that still speaks for this screen reaches here.
   */
  load: ExperienceStatesLoad;
  /**
   * Whether a `resumePin` can be run on this screen by this build. Required,
   * not optional with a permissive default: forgetting it would re-enable
   * every card that cannot open, which is the defect this closes.
   */
  canRun: (pin: { guideKey: string; guideVersion: number }) => boolean;
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
            view={experienceCardView(experience, load, canRun)}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

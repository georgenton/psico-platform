import type { ChapterMediaSummary } from "@psico/types";

/**
 * Book Experience Standard V1 — how the reader decides what a mode may offer.
 *
 * Product authority: `docs/product/book-experience-standard-v1.md`.
 *
 * This is a VIEW MODEL, not a second editorial authority. It invents nothing:
 * every field is derived from the chapter media manifest the server already
 * returns and from the Guide discovery answer the reader already has. There is
 * no new catalog here, no new endpoint, and no client-side guess about what
 * exists.
 *
 * The problem it solves is the one the author demo exposed. Escuchar and Ver
 * were always enabled, so picking one led to a surface with no media in it —
 * text where a player should be. A mode that cannot play anything must not
 * look published, and the honest place to decide that is here, once, instead
 * of in each media component after the reader already committed to the tab.
 */

export type BookExperienceModeKind =
  | "BOOK"
  | "AUDIOBOOK"
  | "PODCAST"
  | "VIDEO"
  | "GUIDED";

export type BookExperienceModeState = "HIDDEN" | "COMING_SOON" | "PUBLISHED";

export type BookExperienceDisabledReason = "COMING_SOON" | "NO_PLAYABLE_ASSET";

export interface BookExperienceModeView {
  kind: BookExperienceModeKind;
  state: BookExperienceModeState;
  label: string;
  /** How many playable items back this mode. Absent for BOOK and GUIDED. */
  itemCount?: number;
  disabledReason?: BookExperienceDisabledReason;
}

/**
 * What the standard needs to know about ONE media format.
 *
 * Deliberately not the manifest shape. The standard distinguishes «announced
 * but not produced» from «declared published with nothing behind it», and the
 * manifest cannot: the server collapses both into `COMING_SOON` (see
 * `chapter-media.service.ts` — `PUBLISHED && source !== null ? AVAILABLE :
 * COMING_SOON`). Keeping the richer shape here means the fail-closed rule is
 * expressible and testable rather than a sentence in a document, and
 * `mediaModeFromManifest` states plainly what today's manifest can and cannot
 * tell us.
 */
export interface MediaModeFacts {
  kind: Extract<BookExperienceModeKind, "AUDIOBOOK" | "PODCAST" | "VIDEO">;
  /** The catalog declares this format published. */
  declaredPublished: boolean;
  /** Items that can actually play. A transcript is NOT one of them. */
  playableItemCount: number;
  /** Editorially announced — the reader is told it is coming. */
  announced: boolean;
}

const MEDIA_LABEL: Record<MediaModeFacts["kind"], string> = {
  AUDIOBOOK: "🎧 Escuchar",
  PODCAST: "🎙️ Podcast",
  VIDEO: "🎬 Ver",
};

/** The book is the book. It is never gated and never hidden. */
export function bookMode(): BookExperienceModeView {
  return { kind: "BOOK", state: "PUBLISHED", label: "📖 Leer" };
}

/**
 * The four-way rule of §7, in the order the standard states it.
 *
 * The interesting branch is the second: a format the catalog calls published
 * with nothing playable behind it is NOT downgraded to «próximamente» — that
 * would announce something as deliberate when it is actually a broken
 * definition. It is disabled with `NO_PLAYABLE_ASSET`, which is a fault, and
 * the reader simply does not see an offer they cannot take.
 */
export function mediaMode(facts: MediaModeFacts): BookExperienceModeView {
  const label = MEDIA_LABEL[facts.kind];
  const playable = Math.max(0, facts.playableItemCount);

  if (facts.declaredPublished && playable >= 1) {
    return {
      kind: facts.kind,
      state: "PUBLISHED",
      label,
      itemCount: playable,
    };
  }

  if (facts.declaredPublished) {
    return {
      kind: facts.kind,
      state: "COMING_SOON",
      label,
      itemCount: 0,
      disabledReason: "NO_PLAYABLE_ASSET",
    };
  }

  if (facts.announced) {
    return {
      kind: facts.kind,
      state: "COMING_SOON",
      label,
      itemCount: 0,
      disabledReason: "COMING_SOON",
    };
  }

  // Not part of the editorial plan for this chapter yet: no tab, no route, no
  // call. Absence is the default, not an error.
  return { kind: facts.kind, state: "HIDDEN", label, itemCount: 0 };
}

/**
 * Read the facts the manifest CAN state.
 *
 * `AVAILABLE` is unambiguous: published with a source. `COMING_SOON` is not —
 * it is the server's single answer for both «draft, announced» and «published
 * with no source». The reader treats it as announced, because appearing in the
 * manifest at all is an editorial act, and because both cases produce exactly
 * the same behaviour for the person: nothing plays, nothing navigates.
 */
export function mediaModeFromManifest(
  kind: MediaModeFacts["kind"],
  items: readonly ChapterMediaSummary[] | null,
): BookExperienceModeView {
  if (items === null) {
    // Manifest not loaded (or it failed). Fail closed: offer nothing.
    return mediaMode({
      kind,
      declaredPublished: false,
      playableItemCount: 0,
      announced: false,
    });
  }

  const mine = items.filter((i) => i.kind === kind);
  if (mine.length === 0) {
    return mediaMode({
      kind,
      declaredPublished: false,
      playableItemCount: 0,
      announced: false,
    });
  }

  const playable = mine.filter((i) => i.availability === "AVAILABLE").length;
  return mediaMode({
    kind,
    declaredPublished: playable >= 1,
    playableItemCount: playable,
    announced: true,
  });
}

/**
 * The guided experience.
 *
 * Its readiness is the reader's existing six-condition gate — rollout, actor,
 * discovery answered, pin, bundle, anchor — computed in `LectorShell`. This
 * function does not re-derive it and above all does not infer a guide from the
 * book slug: that decision belongs to the server (GR-4).
 *
 * While discovery is still in flight the mode is HIDDEN rather than
 * COMING_SOON. «Próximamente» is a claim about the editorial plan, and we do
 * not have an answer yet.
 */
export function guidedMode(input: {
  runtimeReady: boolean;
  discoveryPending: boolean;
}): BookExperienceModeView {
  const label = "🌱 Experiencia guiada";
  if (input.runtimeReady) return { kind: "GUIDED", state: "PUBLISHED", label };
  if (input.discoveryPending) return { kind: "GUIDED", state: "HIDDEN", label };
  return { kind: "GUIDED", state: "HIDDEN", label };
}

/** Whether the reader may open this mode at all. */
export function isModeEnabled(view: BookExperienceModeView): boolean {
  return view.state === "PUBLISHED";
}

/** Whether the tab is rendered (enabled or explicitly announced). */
export function isModeVisible(view: BookExperienceModeView): boolean {
  return view.state !== "HIDDEN";
}

/** The short, honest reason shown next to a disabled tab. */
export function disabledNotice(view: BookExperienceModeView): string | null {
  if (view.state !== "COMING_SOON") return null;
  return "Próximamente";
}

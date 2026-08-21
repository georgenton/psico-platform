"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  AnnotationSummary,
  BreatheExercise,
  ChapterExperiencePublicView,
  ContentUnitMarks,
  ContentUnitRead,
  GuideApplicability,
  GuideExperienceCardState,
  GuideSessionView,
  HighlightColor,
  HighlightSummary,
  LectorChapterResponse,
  LectorCompleteResponse,
} from "@psico/types";
import {
  reflectExerciseSeed,
  breatheReflectSeed,
  breatheEcoSeed,
  reflexionEcoSeed,
  chapterConcept,
  chapterExercises,
  projectReaderBlocks,
  readerChapterPath,
  highlightWritePayload,
  annotationWritePayload,
  type ReaderMarkSource,
} from "@psico/types";
import {
  ReaderCompanionDock,
  type DockTab,
} from "./companion/ReaderCompanionDock";
import { ChapterMediaListen } from "./media/ChapterMediaListen";
import { ChapterMediaWatch } from "./media/ChapterMediaWatch";
import { modeToStored, storedToMode, type ReaderMode } from "./reader-mode";
import { ChapterExperienceHome } from "./ChapterExperienceHome";
import { guideApi } from "@psico/api-client";
import { useChapterExperience } from "../experience/use-chapter-experience";
import { chapterHeading } from "./chapter-label";
import {
  ReaderExperienceView,
  READER_ACTIVITIES_ANCHOR_ID,
} from "./ReaderExperienceView";
import { BreathingExercise } from "./exercises/BreathingExercise";
import { HighlightPopover } from "./HighlightPopover";
import { ResonanceNudge } from "./ResonanceNudge";
import {
  ReaderPreferencesModal,
  type ReaderPrefs,
} from "./ReaderPreferencesModal";
import { useHeartbeat } from "./use-heartbeat";
import {
  ReaderGuidePanel,
  READER_GUIDE_PANEL_ID,
} from "../guide/ReaderGuidePanel";
import { useMoodCheckin } from "../shell/mood-checkin-context";
import {
  audioFamilyMode,
  bookMode,
  disabledNotice,
  guidedMode,
  isModeEnabled,
  isModeVisible,
  mediaModeFromManifest,
  type BookExperienceModeView,
} from "./book-experience";
import { useChapterMediaManifest } from "./media/use-chapter-media";
import { guideComponentKey, type GuidePin } from "../guide/guide-pin";
import {
  experiencePinKey,
  type ExperienceStatesLoad,
} from "../experience/ExperienceList";
import { resolveGuideWebBundle } from "../guide/guide-web-bundle";
import { useGuideActorScope } from "../guide/guide-actor-scope";
import { useGuideAvailability } from "../guide/guide-availability";
import { useGuideDiscovery } from "../guide/use-guide-discovery";
import {
  guideAnchorRegistry,
  resolveGuideAnchor,
  type GuideAnchorResolution,
} from "../guide/guide-anchor";

interface Props {
  apiBase: string;
  token: string;
  initial: LectorChapterResponse;
  /**
   * CC-6B — the chapter's blocks resolved from Content Core (page.tsx). The
   * lector envelope (`initial`) still owns book/session/prefs/marks/audio; only
   * the block TEXT comes from here. `null` means a genuine content fault we must
   * not mask → the reader shows "contenido temporalmente no disponible".
   */
  unit: ContentUnitRead | null;
  /**
   * CC-6C/CC-6D — the user's marks for a `content-core` unit, from the stable
   * per-unit surface (keyed by blockKey). For a `legacy` unit this is null and
   * the reader uses the lector envelope's marks (`initial.highlights/…`). It is
   * NOT a silent fallback for a content-core read failure — see `marksUnavailable`.
   */
  marks: ContentUnitMarks | null;
  /**
   * CC-6D — a content-core marks read failed (404/500/network). The reader shows
   * a visible "marks unavailable" banner and, fail-closed, does NOT fall back to
   * the envelope's marks. (An auth failure propagates upstream and never reaches
   * here.)
   */
  marksUnavailable?: boolean;
  bookSlug: string;
}

/**
 * LectorShell — the reader's main orchestrator.
 *
 * Owns three state slices:
 *   - `highlights` / `annotations` — optimistic local copies kept in sync
 *     with the server. Each mutation does the network call, then patches
 *     the local copy; on failure we roll back.
 *   - `selection` — the user's current text selection inside a block,
 *     captured on `selectionchange`. Drives the floating popover.
 *   - `session` — the local mirror of progress + lastBlockId, updated by
 *     IntersectionObserver. The heartbeat hook reads from here.
 *
 * Layout
 * ------
 * - Top: progress bar + book title + chapter title + Aa + notes toggle.
 * - Middle: scrollable column of blocks.
 * - Bottom (when scroll reaches the end): "Marcar capítulo como leído" CTA.
 *
 * Why one big component
 * ---------------------
 * Reader interactions are tightly coupled (a selection becomes a highlight
 * becomes an annotation popover anchor). Splitting them into more files
 * would mean passing a dozen props or threading a Context that lives a few
 * levels deep. Single component is easier to read.
 */
export function LectorShell({
  apiBase,
  token,
  initial,
  unit,
  marks,
  marksUnavailable = false,
  bookSlug,
}: Props) {
  const router = useRouter();
  // CC-6D — the reader unit's provenance decides EVERY mark decision (write
  // anchor + where marks are read from). A legacy-served block also carries a
  // blockKey, so the mere presence of a blockKey must never drive this.
  const markSource: ReaderMarkSource = unit?.source ?? "legacy";

  // Reader content (immutable for this render — re-fetch happens via navigation).
  // Blocks come from Content Core (CC-6B); the rest stays on the lector envelope.
  const { book, chapter, lessons, preferences } = initial;
  const blocks = useMemo(() => (unit ? projectReaderBlocks(unit) : []), [unit]);
  // block.id (= legacyBlockId ?? blockKey) → blockKey, so a text selection or a
  // note target can be POSTed by the stable public identity (CC-6B write path).
  const blockKeyById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) if (b.blockKey) m.set(b.id, b.blockKey);
    return m;
  }, [blocks]);
  // block.id → source text version (CC-6C). Sent when creating a highlight so
  // the mark binds to the exact version the user read.
  const blockVersionById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) if (b.blockVersionId) m.set(b.id, b.blockVersionId);
    return m;
  }, [blocks]);

  // Mutable state (CC-6D, source-aware):
  //  - content-core: marks come ONLY from the CC-6C surface. If that read failed
  //    (`marksUnavailable`) we start empty + show a banner — never the envelope.
  //  - legacy: marks come from the lector envelope (`initial.*`).
  const [highlights, setHighlights] = useState<HighlightSummary[]>(
    markSource === "content-core"
      ? marksUnavailable
        ? []
        : (marks?.highlights ?? [])
      : initial.highlights,
  );
  const [annotations, setAnnotations] = useState<AnnotationSummary[]>(
    markSource === "content-core"
      ? marksUnavailable
        ? []
        : (marks?.annotations ?? [])
      : initial.annotations,
  );
  const [progressPct, setProgressPct] = useState<number>(
    initial.session.progressPct,
  );

  // CC-6E/P1 — when a content-core marks read failed, temporarily block creating
  // a new mark (we can't safely place it against marks we couldn't load). This
  // notice shows the reason on an attempt; it auto-clears.
  const [markWriteNotice, setMarkWriteNotice] = useState(false);
  useEffect(() => {
    if (!markWriteNotice) return;
    const t = setTimeout(() => setMarkWriteNotice(false), 4000);
    return () => clearTimeout(t);
  }, [markWriteNotice]);
  function markWritesBlocked(): boolean {
    if (markSource === "content-core" && marksUnavailable) {
      setMarkWriteNotice(true);
      return true;
    }
    return false;
  }

  // Companion dock state (Eco · Notas · Reflexión). The dock is the reader's
  // right-hand panel — it keeps the chapter mounted behind it, so the user
  // never loses their place when they open Eco, a note, or a reflexión.
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("notas");
  const [dockPassage, setDockPassage] = useState<string | null>(null);
  const [dockEcoSeed, setDockEcoSeed] = useState<string | null>(null);
  const [dockReflexionSeed, setDockReflexionSeed] = useState<string | null>(
    null,
  );
  // ARC — was the current Reflexión open triggered by a chapter exercise? If
  // so, the tab offers the chapter concept as a resonance on save.
  const [reflexionFromExercise, setReflexionFromExercise] = useState(false);

  // Breathing exercise overlay (chapter activity).
  const [breatheExercise, setBreatheExercise] =
    useState<BreatheExercise | null>(null);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);

  // Open the dock on a given tool, seeded. Centralises the open pattern so the
  // chapter-topic card, the exercises and the post-exercise nudges all agree.
  function openEcoInDock(seed: string) {
    setDockPassage(null);
    setDockReflexionSeed(null);
    setDockEcoSeed(seed);
    setDockTab("eco");
    setDockOpen(true);
  }
  function openReflexionInDock(seed: string, fromExercise = false) {
    setDockPassage(null);
    setDockEcoSeed(null);
    setDockReflexionSeed(seed);
    setReflexionFromExercise(fromExercise);
    setDockTab("reflexion");
    setDockOpen(true);
  }

  // Prefs modal.
  const [prefsOpen, setPrefsOpen] = useState(false);
  // Fase E (ARC) — offer the chapter concept as a resonance after the first
  // highlight of the session. sessionStorage keeps it to once per chapter.
  const [resonanceOffer, setResonanceOffer] = useState(false);
  const [prefs, setPrefs] = useState<ReaderPrefs>(preferences);
  const prefsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reader mode — GR-2 renames the visible options to Leer · Escuchar · Ver
  // (docs/product/guided-reading-v1.md §3 and §13). «Lectura guiada» stays in
  // the spec and the prototype as GR-3's authority; it is deliberately NOT a
  // fourth button here, because a button that does nothing is worse than an
  // absent one.
  //
  // The STORED values do not change: `"libro"` still means Leer and the legacy
  // `"guia"` still means Escuchar, so nobody's saved preference is migrated
  // (`LEGACY_READER_MODE_LOCALSTORAGE_MIGRATION=false`). Only `"ver"` is new.
  //
  // The initial value must be the one the SERVER renders. Reading
  // `localStorage` inside the `useState` initialiser made the first client
  // render disagree with the server HTML whenever a mode was already saved:
  // React reported a text-content mismatch, threw away the server markup for
  // the whole document, and in development put an error indicator on screen.
  // So the stored preference is adopted in an effect, after hydration.
  const [requestedMode, setRequestedMode] = useState<ReaderMode>("leer");
  useEffect(() => {
    const stored = storedToMode(
      window.localStorage.getItem("psico:lector:mode"),
    );
    if (stored !== "leer") setRequestedMode(stored);
  }, []);
  const changeMode = useCallback((next: ReaderMode) => {
    setRequestedMode(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("psico:lector:mode", modeToStored(next));
    }
  }, []);

  /**
   * Book Experience V2, vertical 1 — which surface of the chapter is on screen.
   *
   * `DIRECT_READER_ACCESS=true`: the initial value is `"reader"`, always. Opening
   * a chapter still lands on the text, so nobody who just wants to read has to
   * pass a menu first, and the value is a constant so it cannot disagree with the
   * server HTML on hydration.
   *
   * `RETURN_TO_CHAPTER_HOME=true`: «Cómo recorrerlo» in the header opens the
   * chapter home, and its primary action brings the reader straight back. It is
   * local state, not a route: the URL keeps meaning «this chapter», the heartbeat
   * keeps running, and progress is never reset by looking at the map of the
   * chapter.
   */
  const [surface, setSurface] = useState<"home" | "reader">("reader");

  /**
   * Set when the reader was opened FROM the «Actividades y ejercicios» row, so
   * the effect below knows to scroll and focus once the section has mounted.
   * A ref, not state: it is a one-shot instruction, not something to render.
   */
  const pendingActivitiesFocus = useRef(false);

  /**
   * WHICH asking this is. Bumped — synchronously, in the same act — by every
   * event that makes the previous answer stale: arriving at the list, coming
   * back to it, the tab regaining focus or visibility, and a manual retry.
   *
   * The ref is the authority and the state is only how the render learns about
   * it. That order matters: a nonce that lived in state alone left a window
   * between «the reader asked for fresh data» and «the effect got around to
   * saying so», and inside that window the previous verdict was still on
   * screen AND still clickable. A stale «Empezar» is exactly the click that
   * can cancel the session C.1 exists to continue, so the window is closed by
   * construction rather than by trusting React's scheduling.
   */
  const experienceGenerationRef = useRef(0);
  const [experienceGeneration, setExperienceGeneration] = useState(0);

  /**
   * Invalidate and ask again — one act, deliberately not two. Splitting them
   * would recreate the window this exists to close.
   */
  const revalidateExperienceStates = useCallback(() => {
    setExperienceGeneration((experienceGenerationRef.current += 1));
  }, []);

  /**
   * Going to the chapter home closes what belongs to reading.
   *
   * Purely visual: the guided panel is hidden, not ended — no session is
   * cancelled, no recovery is dropped, no mark is touched, no progress moves
   * and the route does not change. It is the same «put the book down for a
   * second» gesture the reader already had, applied to every overlay at once
   * so none of them float over a screen they were not designed for.
   */
  const openChapterHome = useCallback(() => {
    setSurface("home");
    setGuideOpen(false);
    setDockOpen(false);
    setPrefsOpen(false);
    setSelection(null);
    // Arriving at the list is a question, not a memory. Whatever the cards
    // said last time was true then; a run may have finished on another device
    // since, so the previous verdict stops counting HERE, in the same act —
    // not whenever an effect happens to run.
    revalidateExperienceStates();
  }, [revalidateExperienceStates]);

  /** «Seguir leyendo» and every format row land back on the reader. */
  const openReaderSurface = useCallback(() => {
    setSurface("reader");
  }, []);

  /**
   * GR-7 — the chapter's published experiences, from the same discovery route
   * the player uses. `pin: null` because Chapter Home wants the list, not one
   * journey; the player still resolves its own by pin.
   */
  const chapterExperiences = useChapterExperience({
    bookSlug,
    chapterOrder: chapter.order,
    pin: null,
    // Only ask when the reader is looking at the list.
    enabled: surface === "home",
  });

  /**
   * The experience the reader picked, at the exact version discovery served.
   * `null` means "not chosen"; picking never resolves "latest" and never falls
   * back to the first card when the chosen one is gone.
   */
  const [pickedExperience, setPickedExperience] =
    useState<ChapterExperiencePublicView | null>(null);

  /**
   * C.1 — the EXACT pin the guide surface runs, once the reader picks a card.
   *
   * The surface used to run whatever pin chapter-level Guide discovery named,
   * so opening experience B ran experience A's guide. It now runs the pin the
   * card resolved: the published one for a fresh start, the open session's own
   * one to continue. `null` until a card is picked, and then the chapter pin is
   * only a fallback for surfaces that never went through a card.
   */
  const [pickedPin, setPickedPin] = useState<GuidePin | null>(null);

  /**
   * The pick is ONE fact in two fields, so it is dropped in one place.
   *
   * Letting them diverge is how the surface ends up running journey A's pin
   * while naming journey B — the shape of #639, rebuilt on the client.
   */
  const clearPick = useCallback(() => {
    setPickedPin(null);
    setPickedExperience(null);
  }, []);

  /**
   * A new chapter is a new catalog. Whatever was picked belonged to the one
   * the reader just left, and carrying it over would run a journey that is not
   * on this screen.
   *
   * Closing the panel is deliberately NOT here. A reader who dismisses the
   * guide to check a paragraph and reopens it expects the same journey — the
   * panel is a surface, not the run.
   */
  useEffect(() => {
    clearPick();
  }, [bookSlug, chapter.order, clearPick]);

  /**
   * The picked experience stopped being published.
   *
   * Only once discovery has actually ANSWERED: an empty list while the request
   * is in flight is not the catalog saying the journey is gone, and dropping
   * the pick on it would eject a reader mid-journey over a slow network. And
   * the match is by exact key AND version — a republished version is a
   * different thing to run, not the same card with new contents.
   */
  useEffect(() => {
    if (!pickedExperience) return;
    if (chapterExperiences.status !== "ready") return;
    const stillPublished = chapterExperiences.items.some(
      (item) =>
        item.experienceKey === pickedExperience.experienceKey &&
        item.experienceVersion === pickedExperience.experienceVersion,
    );
    if (!stillPublished) clearPick();
  }, [
    pickedExperience,
    chapterExperiences.status,
    chapterExperiences.items,
    clearPick,
  ]);

  // Text selection state for the popover.
  const [selection, setSelection] = useState<{
    blockId: string;
    startOffset: number;
    endOffset: number;
    rect: { x: number; y: number };
  } | null>(null);

  // Reading session — owned here for the heartbeat hook to read.
  const lastBlockIdRef = useRef<string>(
    initial.session.lastBlockId ?? blocks[0]?.id ?? "",
  );

  // Refs to block DOM elements (for IntersectionObserver + selection hit-test).
  // ── GR-3 · guided reading ────────────────────────────────────────────────
  // A surface, not a mode: opening it never touches `ReaderMode`, never
  // changes the route, and never starts a session (only the cover's button
  // does). The chapter stays mounted behind it.
  const guideActorScope = useGuideActorScope();
  const { openMoodCheckin, moodCheckinOpen } = useMoodCheckin();
  const guideAvailable = useGuideAvailability();
  const [guideOpen, setGuideOpen] = useState(false);
  const guideTabRef = useRef<HTMLButtonElement>(null);

  /**
   * Close the guide, and decide where focus goes.
   *
   * `restoreFocus: true` is the default for a plain dismissal: without it,
   * closing drops focus onto `<body>` and a keyboard reader has to tab from
   * the top of the page to get back.
   *
   * `restoreFocus: false` is for a close that HANDS OFF to another surface —
   * the check-in. Grabbing focus back to the Guide tab a frame after the
   * dialog opened would yank the reader out of the thing they just asked for.
   */
  const closeGuide = useCallback(
    ({ restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
      setGuideOpen(false);
      if (!restoreFocus) return;
      // After the panel unmounts, or the browser has nothing to focus.
      requestAnimationFrame(() => guideTabRef.current?.focus());
    },
    [],
  );
  const [flashBlockId, setFlashBlockId] = useState<string | null>(null);

  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) blockRefs.current.set(id, el);
    else blockRefs.current.delete(id);
  }, []);

  /**
   * GR-4 — WHICH guide this chapter implies. The server's answer, not ours.
   *
   * Asked only when the pilot gate is on for this actor: a reader outside the
   * pilot has no guide to discover, and the request would be spent to be told
   * so. Everything downstream hangs off this one value.
   */
  const discovery = useGuideDiscovery({
    enabled: guideAvailable === true,
    bookSlug,
    chapterOrder: chapter.order,
  });

  const discoveredPin = discovery.status === "available" ? discovery.pin : null;

  /**
   * The web-side definition of the discovered guide: its presentation and its
   * reader copy, both filed under the EXACT pin.
   *
   * `null` when the server names a guide this build does not ship (a catalog
   * ahead of a deploy). That is a refusal, not a fallback: showing the guide we
   * DO have would narrate the wrong chapter with real progress behind it.
   */
  /**
   * The pin actually being run. A picked card wins over chapter discovery,
   * because "which journey is this" is a property of the card the reader
   * touched, not of the chapter it lives in.
   */
  const runPin = pickedPin ?? discoveredPin;

  const guideBundle = useMemo(
    () => (runPin ? resolveGuideWebBundle(runPin) : null),
    [runPin],
  );

  /**
   * C.1 — the server's verdict for EACH published experience, in one read.
   *
   * This used to ask once, for the chapter's own guide pin, and hand that
   * single answer to every card. A chapter has one pin and can publish several
   * journeys, so the cards shared a state: finishing one made the others read
   * «Completada» without anybody opening them (#639).
   *
   * One request for the whole list, not one per card — the reader should not
   * pay for the catalog's size — and the answer is keyed by published pin, so
   * two experiences deliberately bound to the same guide DO share a verdict.
   * That is not a bug to paper over; it is what the binding says.
   */
  const experiencePins = useMemo(
    () => chapterExperiences.items.map((item) => item.guidePin),
    [chapterExperiences.items],
  );

  /**
   * C.3R — where the reader is, as this screen can honestly describe it.
   *
   * Built from the unit that was actually SERVED, not from the route: the text
   * on screen is the thing a verdict has to be about. `unitKey` is an
   * environment-local locator, never identity — the server re-resolves it
   * inside the published revision and requires `chapterOrder` to agree, so a
   * mixed context describes no real place and is refused.
   *
   * `null` only when no unit was served, and that branch renders an
   * unavailable screen with no cards at all — so a request is never made
   * without a context.
   */
  const readerContext = useMemo(
    () =>
      unit
        ? {
            bookSlug,
            chapterOrder: chapter.order,
            unitKey: unit.unitKey,
          }
        : null,
    [unit, bookSlug, chapter.order],
  );

  /**
   * The identity of the question currently being asked.
   *
   * Two requests can be in flight when the chapter changes or a revalidation
   * overlaps the first read, and they can land out of order. Without this key
   * the older answer wins by arriving last, and the cards describe a chapter
   * the reader already left. Every response is checked against the key that is
   * current when it arrives, not the one it was sent with.
   */
  const experienceRequestKey = useMemo(
    () =>
      [
        bookSlug,
        chapter.order,
        // The context is part of the QUESTION: an answer earned under another
        // unit is not an answer about this screen, even at the same number.
        readerContext?.unitKey ?? "sin-unidad",
        ...experiencePins.map((p) => experiencePinKey(p)),
      ].join("|"),
    [bookSlug, chapter.order, experiencePins, readerContext],
  );

  const currentExperienceKeyRef = useRef(experienceRequestKey);
  currentExperienceKeyRef.current = experienceRequestKey;

  /**
   * The load, exactly as the last accepted answer left it — TAGGED with the
   * question and the generation that produced it.
   *
   * Nothing reads this directly. Whether it still speaks for the screen is a
   * separate question, answered below.
   */
  const [experienceLoad, setExperienceLoad] = useState<ExperienceStatesLoad>({
    status: "idle",
  });

  useEffect(() => {
    if (surface !== "home") return;
    const askedFor = experienceRequestKey;
    const generation = experienceGenerationRef.current;
    // No context, no question. The screen that lacks one renders no cards, so
    // this is a guard rather than a state anybody sees.
    if (!readerContext) return;
    if (experiencePins.length === 0) {
      // Nothing to ask about is a complete answer, not a pending one.
      setExperienceLoad({
        status: "ready",
        requestKey: askedFor,
        generation,
        states: new Map(),
      });
      return;
    }
    // Accepted only while BOTH still hold: the same question, and no newer
    // asking since. The key catches a chapter change; the generation catches
    // two revalidations of the same list answering out of order.
    const isCurrent = () =>
      currentExperienceKeyRef.current === askedFor &&
      experienceGenerationRef.current === generation;
    let cancelled = false;
    void (async () => {
      try {
        const answer = await guideApi.getExperienceCardStates(
          experiencePins,
          readerContext,
        );
        if (cancelled || !isCurrent()) return;
        const states = new Map<string, GuideExperienceCardState>();
        for (const state of answer.items) {
          states.set(experiencePinKey(state.guidePin), state);
        }
        setExperienceLoad({
          status: "ready",
          requestKey: askedFor,
          generation,
          states,
        });
      } catch {
        if (cancelled || !isCurrent()) return;
        // A failed read is NOT a state. It used to fall back to an empty map,
        // and an empty map read as «Empezar» on every card — so a network
        // blip offered a fresh start over a journey already in progress. The
        // honest answer is «no pudimos saberlo», with a way to ask again.
        setExperienceLoad({
          status: "error",
          requestKey: askedFor,
          generation,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    surface,
    experiencePins,
    experienceRequestKey,
    experienceGeneration,
    readerContext,
  ]);

  /**
   * Does the last answer still speak for what is on screen?
   *
   * Derived during render, so the moment the question changes — a new chapter,
   * a new list of pins, or a new asking — the previous `ready` stops being
   * authoritative in the SAME render that changed it. No effect has to run
   * first, and there is no frame in which a superseded verdict is clickable.
   * An answer that has lapsed reads as `loading`, because that is what is
   * true: we are asking again.
   */
  const experienceAuthority: ExperienceStatesLoad = useMemo(() => {
    if (experienceLoad.status === "idle") return experienceLoad;
    if (experienceLoad.status === "loading") return experienceLoad;
    const current =
      experienceLoad.requestKey === experienceRequestKey &&
      experienceLoad.generation === experienceGeneration;
    return current ? experienceLoad : { status: "loading" };
  }, [experienceLoad, experienceRequestKey, experienceGeneration]);

  /**
   * Ask again when the reader comes back to the tab or the window.
   *
   * A card's verdict is decided by a session that can change elsewhere: on the
   * phone, in another tab, or by finishing the journey and returning. A state
   * read once at mount goes stale silently, and a stale «Empezar» over a
   * running session is exactly the confusion this endpoint exists to remove.
   */
  useEffect(() => {
    if (surface !== "home") return;
    const onFocus = () => revalidateExperienceStates();
    const onVisible = () => {
      if (document.visibilityState === "visible") revalidateExperienceStates();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [surface, revalidateExperienceStates]);

  /**
   * C.3R — the SERVER's verdict about one pin, or `null` if nobody answered.
   *
   * Two sources, both server-decided and neither positional:
   *
   *   - the card batch, whose items carry `applicability` bound to the exact
   *     `evaluatedPin` the verdict is about — matched on that pin, never on
   *     the published one, because a CONTINUE card runs the session's version;
   *   - chapter discovery, which since C.3R compares the same identities
   *     server-side and whose `available` IS the verdict for its own pin.
   *
   * `null` is not `UNAVAILABLE`. "Nobody told us" and "this guide is not for
   * here" are different facts, and callers treat the first as «no podemos
   * saberlo» rather than as a denial.
   */
  const serverVerdictFor = useCallback(
    (pin: GuidePin): GuideApplicability | null => {
      if (experienceAuthority.status === "ready") {
        for (const state of experienceAuthority.states.values()) {
          if (
            state.evaluatedPin?.guideKey === pin.guideKey &&
            state.evaluatedPin.guideVersion === pin.guideVersion
          ) {
            return state.applicability ?? null;
          }
        }
      }
      if (
        discoveredPin &&
        discoveredPin.guideKey === pin.guideKey &&
        discoveredPin.guideVersion === pin.guideVersion
      ) {
        // Discovery answered `available` for this exact pin, and since C.3R
        // that answer is an identity comparison made inside one snapshot.
        return "APPLIES";
      }
      return null;
    },
    [experienceAuthority, discoveredPin],
  );

  /**
   * C.2 — can THIS pin actually be run, on this screen, by this build?
   *
   * The same four authorities the guided surface itself consults, asked one
   * screen earlier. A verdict from the server says where the reader stands; it
   * says nothing about whether this bundle ships the journey, or whether the
   * journey's passage belongs to the chapter in front of them. Without asking,
   * a card was enabled on the verdict alone: the click stored a pick, switched
   * surface, opened the panel — and then the panel refused, so the button
   * looked broken and left a selection behind.
   *
   * `resumePin`, never the published pin. When the server answers CONTINUE for
   * `A@v2` because `A@v1` is still running, the thing that has to be runnable
   * is `A@v1` — the run the reader would land in.
   *
   * A fallback to another guide's bundle or anchor is exactly what must never
   * happen here, so nothing is resolved except by exact pin.
   *
   * C.3R — what this NO LONGER asks is whether the guide belongs to this
   * chapter. That was `anchorAppliesTo(bookSlug, chapter.order, locator)`:
   * placement compared against placement, so an editorial reorder moved the
   * guide to whichever unit inherited the number and took it away from the one
   * it is about. The server answers that now, by comparing identities it can
   * see and the browser cannot, and its verdict is applied where the two facts
   * are combined (`experienceCardView`) rather than folded into this one.
   *
   * Two facts, kept apart on purpose: «does this guide belong here» is the
   * server's, «can this build run it» is ours.
   */
  const canRunPin = useCallback(
    (pin: GuidePin): boolean => {
      if (!resolveGuideWebBundle(pin)) return false;
      const locator = guideAnchorRegistry.getExact(pin);
      if (!locator) return false;
      return resolveGuideAnchor(blocks, locator).status === "RESOLVED";
    },
    [blocks],
  );

  /**
   * Where THIS guide's approved passage is in THIS chapter.
   *
   * The locator comes from the registry keyed by the discovered pin — so the
   * Parejas guide can never be handed the Emociones passage — and it is
   * resolved against the blocks the reader was actually served, never from a
   * stored key, because Content Core derives block identity per environment
   * (CC-1). The last guard is the server's verdict (C.3R): a guide whose
   * editorial target is not the unit on screen has no passage here.
   */
  const guideAnchor: GuideAnchorResolution = useMemo(() => {
    // Keyed by the pin being RUN: a picked card may run a different journey
    // than chapter discovery named, and handing it another guide's passage is
    // the failure this registry exists to make impossible.
    if (!runPin) return { status: "UNRESOLVED" };
    // C.3R — the last guard is the SERVER's verdict about this pin, not a
    // comparison of the anchor's own book and chapter with the screen. The
    // resolution below would usually fail on the wrong chapter anyway, since
    // the passage is not in those blocks — "usually" being exactly the word
    // that does not belong in a guard.
    if (serverVerdictFor(runPin) !== "APPLIES") return { status: "UNRESOLVED" };
    const locator = guideAnchorRegistry.getExact(runPin);
    if (!locator) return { status: "UNRESOLVED" };
    return resolveGuideAnchor(blocks, locator);
  }, [blocks, runPin, serverVerdictFor]);

  /**
   * Scroll the anchored paragraph into view and focus it. Deliberately does
   * NOT create a highlight, does not touch progress, does not close the panel
   * and does not change the route — it moves the page, and nothing else. The
   * tint is visual only and fades on its own.
   */
  const goToGuidePassage = useCallback(() => {
    if (guideAnchor.status !== "RESOLVED") return;
    const el = blockRefs.current.get(guideAnchor.renderBlockId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    setFlashBlockId(guideAnchor.renderBlockId);
  }, [guideAnchor]);

  /**
   * The single authority for whether the guide can RUN on this screen.
   *
   * Six conditions, all of them, or nothing:
   *
   *   1. the pilot gate is on for this actor;
   *   2. the actor scope exists (a session needs an owner);
   *   3. discovery ANSWERED — `available`, not `loading`, `unavailable` or
   *      `error`. `loading` matters as much as the rest: showing a guide while
   *      the question is in flight means showing the wrong one;
   *   4. a pin came back;
   *   5. this build ships that pin's presentation and copy;
   *   6. the pin's passage is locatable in the chapter on screen.
   *
   * Anything less and the reader offers no guide at all. It never falls back
   * to another book's guide to fill the gap.
   *
   * Condition 3 applies to the CHAPTER's pin only. A picked card already
   * carries a pin the server decided for that exact experience, so making it
   * wait on chapter-level discovery would gate a journey on an unrelated
   * question — and a chapter whose discovery says «no guide here» would refuse
   * to run an experience it publishes itself. What the pin must never be is
   * unresolved: conditions 4, 5 and 6 still hold for both paths.
   */
  const guideRuntimeReady =
    guideAvailable === true &&
    guideActorScope !== null &&
    (pickedPin !== null || discovery.status === "available") &&
    runPin !== null &&
    guideBundle !== null &&
    guideAnchor.status === "RESOLVED";

  /**
   * Book Experience Standard V1 — which formats this chapter may actually
   * offer. Authority: `docs/product/book-experience-standard-v1.md`.
   *
   * The manifest is metadata only: it signs nothing and carries no URL, so
   * asking for it up front is cheap and is what lets the selector be honest
   * BEFORE the reader commits to a tab. The playback call (`/media/:key/access`)
   * still happens only inside the surface, and a disabled mode never mounts
   * that surface — so a mode with nothing behind it makes no playback request
   * at all.
   */
  const { items: mediaItems, error: mediaError } = useChapterMediaManifest({
    apiBase,
    token,
    bookId: book.id,
    chapterOrder: chapter.order,
    enabled: true,
  });

  const modeViews = useMemo(
    () => ({
      leer: bookMode(),
      escuchar: audioFamilyMode(mediaItems),
      ver: mediaModeFromManifest("VIDEO", mediaItems),
    }),
    [mediaItems],
  );

  const guidedView = useMemo(
    () =>
      guidedMode({
        runtimeReady: guideRuntimeReady,
        discoveryPending: discovery.status === "loading",
      }),
    [guideRuntimeReady, discovery.status],
  );

  /**
   * What the reader ASKED for and what the chapter can actually give them.
   *
   * Two different questions, and collapsing them into one state was the bug.
   * `requestedMode` is restored from `localStorage`, so it can name a format
   * this chapter does not have — or one whose manifest has not arrived yet.
   * Rendering from it directly mounted the media surface over an empty mode
   * and made the tab look selected while nothing could play.
   *
   * `effectiveMode` is what the UI renders: the request, but only while the
   * standard says that mode is open. Everything else falls back to Leer, the
   * one mode that is always there. Deriving it means there is no window — not
   * even one frame, not even during the manifest request — in which a mode
   * with nothing behind it is on screen.
   */
  const effectiveMode: ReaderMode = isModeEnabled(modeViews[requestedMode])
    ? requestedMode
    : "leer";

  /**
   * Is the chapter text on screen right now?
   *
   * Not the same question as «is Leer the chosen mode». The guided panel is a
   * SURFACE that narrates the chapter and sends the reader to a passage inside
   * it, so the text has to be mounted behind it — and it has to be mounted no
   * matter which format the reader had chosen before opening the guide.
   * Deriving that from `effectiveMode === "leer"` alone left a reader who
   * opened the guide from Escuchar or Ver with a panel over nothing: «Ir al
   * pasaje» had no block to find.
   *
   * The mode itself is untouched. Opening the guide does not call
   * `changeMode`, does not write `localStorage`, and does not cancel a session
   * — so closing the panel puts the requested format back on screen by simply
   * ceasing to override it. The media surfaces read the same authority from
   * the other side: while the guide is open they step aside, because the guide
   * is about the text.
   *
   * It is also what tells the IntersectionObserver whether there is anything
   * to observe. See the observer effect below.
   */
  const readerContentMounted =
    surface === "reader" && (effectiveMode === "leer" || guideOpen);

  /**
   * If the guided mode stops being offered, the panel cannot stay open.
   *
   * The reader can be inside the panel when the context changes underneath
   * them: a new chapter, a discovery answer that says this passage has no
   * guide, a pin that no longer resolves. Leaving the panel mounted would show
   * a cover for a guide the server has not confirmed.
   *
   * Closing is all this does. It starts nothing and cancels nothing: a Guide
   * session is created only by the cover's own button and ended only by the
   * reader, and an unmount is not a decision about their progress
   * (GUIDE_LIFECYCLE_CHANGED=false).
   */
  useEffect(() => {
    if (!guideOpen) return;
    if (isModeVisible(guidedView)) return;
    setGuideOpen(false);
  }, [guideOpen, guidedView]);

  /**
   * A mode the standard disabled must not stay REMEMBERED either.
   *
   * The fallback above already protects the render. This clears the stored
   * preference so the next chapter, and the next visit, do not keep asking for
   * a format that is gone — and it persists through `changeMode` so the reset
   * is not silently undone by the value still sitting in `localStorage`.
   */
  useEffect(() => {
    if (requestedMode === "leer") return;
    // Only once the manifest has actually ANSWERED. Resetting on a null
    // manifest would destroy a saved preference for a chapter that does have
    // the format — the tab is correctly disabled while we wait, but the
    // reader's choice is not ours to discard over a request in flight.
    if (mediaItems === null) return;
    if (isModeEnabled(modeViews[requestedMode])) return;
    changeMode("leer");
  }, [requestedMode, modeViews, mediaItems, changeMode]);

  // The tint is a hint, not a mark: it clears itself.
  useEffect(() => {
    if (!flashBlockId) return;
    const t = setTimeout(() => setFlashBlockId(null), 2600);
    return () => clearTimeout(t);
  }, [flashBlockId]);

  // ── IntersectionObserver: track currently visible block ────────────────

  /**
   * The observer has to be rebuilt every time the text is remounted.
   *
   * `blocks` alone was the wrong authority. Leaving «Leer» for the chapter
   * home, for Escuchar, for Ver — or opening the guide from a media mode —
   * unmounts every block element and `registerRef(id, null)` empties the map;
   * coming back mounts brand-new elements. The array of blocks is identical
   * through all of that, so the effect never re-ran and the observer was left
   * holding references to nodes that are no longer in the document. Reading
   * resumed and nothing moved: no visible block, no progress, and every
   * heartbeat afterwards repeated the block from before the round trip.
   *
   * `readerContentMounted` is the fact that actually changed, so it belongs in
   * the dependency list. The cleanup disconnects before each rebuild, which is
   * what keeps this to a single live observer
   * (`ACTIVE_READER_INTERSECTION_OBSERVERS<=1`) instead of one per visit.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Nothing is rendered, so there is nothing to observe — and the previous
    // observer is already disconnected by this effect's own cleanup.
    if (!readerContentMounted) return;
    const io = new IntersectionObserver(
      (entries) => {
        // The block that has the most intersection ratio wins.
        let best: { id: string; ratio: number } | null = null;
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset["blockId"];
          if (!id) continue;
          const ratio = e.intersectionRatio;
          if (!best || ratio > best.ratio) best = { id, ratio };
        }
        if (best && best.ratio > 0) {
          lastBlockIdRef.current = best.id;
        }
        // Update progressPct from the index of the last visible block.
        const idx = blocks.findIndex((b) => b.id === lastBlockIdRef.current);
        if (idx >= 0) {
          const ratio = (idx + 1) / blocks.length;
          setProgressPct((prev) => (ratio > prev ? ratio : prev));
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    // The children mounted (and registered their refs) before this parent
    // effect runs, so the map already holds the CURRENT elements.
    for (const el of blockRefs.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [blocks, readerContentMounted]);

  /**
   * How many activities and exercises this chapter really shows.
   *
   * Two collections feed one section: the curated catalog and the chapter's own
   * exercise list. They can name the same thing, so a naive sum would tell the
   * reader «3» and then show two cards. Titles are compared case- and
   * accent-insensitively, which is enough for a catalog an editor maintains by
   * hand.
   */
  const activityCount = useMemo(() => {
    const seen = new Set<string>();
    const norm = (t: string) =>
      t
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
    for (const ex of chapterExercises(bookSlug, chapter.order)) {
      seen.add(norm(ex.title));
    }
    for (const l of lessons) seen.add(norm(l.title));
    return seen.size;
  }, [bookSlug, chapter.order, lessons]);

  /**
   * Finish the «Actividades y ejercicios» jump once the section is on screen.
   *
   * Scroll AND focus: scrolling alone moves the eyes of people who can see it
   * and nobody else, so the heading takes focus too and a screen reader lands
   * where the row promised.
   */
  useEffect(() => {
    if (!pendingActivitiesFocus.current) return;
    if (surface !== "reader" || effectiveMode !== "leer") return;
    const el = document.getElementById(READER_ACTIVITIES_ANCHOR_ID);
    if (!el) return;
    pendingActivitiesFocus.current = false;
    el.scrollIntoView({ block: "start" });
    el.focus({ preventScroll: true });
  }, [surface, effectiveMode, blocks]);

  // ── Heartbeat ──────────────────────────────────────────────────────────

  /**
   * What «reading time» means here, exactly:
   *
   *   foreground time, in the Reader Experience, with no competing
   *   interactive surface open.
   *
   * It is a measure of a SITUATION, not of the person. It does not claim
   * attention, comprehension or feeling — `BEHAVIOR_IS_NOT_EMOTION` — and
   * `Mi Evolución` presents it as what it is.
   *
   * So the gate names every surface that competes for the same minutes. The
   * chapter home, the audio surface and the video surface replace the text;
   * the guided panel, the companion dock, the preferences sheet, the breathing
   * overlay and the check-in dialog sit over it. Writing a note is not reading
   * either, even though it happens with the chapter open.
   *
   * Two things deliberately do NOT pause it. Selecting text is how a person
   * highlights, which is reading. And the resonance nudge is an invitation
   * beside the text, not a modal over it.
   */
  const readingHeartbeatEnabled =
    surface === "reader" &&
    effectiveMode === "leer" &&
    !guideOpen &&
    !dockOpen &&
    !prefsOpen &&
    breatheExercise === null &&
    !moodCheckinOpen;

  useHeartbeat({
    apiBase,
    token,
    bookId: book.id,
    chapterOrder: chapter.order,
    // The envelope's own statement of which chapter this is and which
    // structure serves it — the hook sends the matching write identity.
    readerRef: chapter.readerRef,
    onProgress: setProgressPct,
    read: () => ({
      lastBlockId: lastBlockIdRef.current,
      progressPct,
    }),
    enabled: readingHeartbeatEnabled,
  });

  // ── Selection → popover ───────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Find the closest [data-block-id] ancestor of the selection's common ancestor.
      const container =
        range.commonAncestorContainer.nodeType === 1
          ? (range.commonAncestorContainer as Element)
          : range.commonAncestorContainer.parentElement;
      const blockEl = container?.closest(
        "[data-block-id]",
      ) as HTMLElement | null;
      if (!blockEl) {
        setSelection(null);
        return;
      }
      const blockId = blockEl.dataset["blockId"]!;
      // Compute offsets relative to the block's text content. We use a
      // Range on the .reader-text span to get a stable origin.
      const textNode = blockEl.querySelector(".reader-text");
      if (!textNode) {
        setSelection(null);
        return;
      }
      const preRange = document.createRange();
      preRange.selectNodeContents(textNode);
      preRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preRange.toString().length;
      const endOffset = startOffset + range.toString().length;
      if (endOffset === startOffset) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelection({
        blockId,
        startOffset,
        endOffset,
        rect: { x: rect.left + rect.width / 2, y: rect.top },
      });
    }

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);

  // ── Highlight mutations ───────────────────────────────────────────────

  async function createHighlight(color: HighlightColor) {
    if (!selection) return;
    if (markWritesBlocked()) {
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      return;
    }
    const optimisticId = `optimistic-${Date.now()}`;
    const blockKey = blockKeyById.get(selection.blockId);

    // CC-6D — anchor by the unit's SOURCE, not the presence of a blockKey: a
    // content-core write sends blockKey + the read version; a legacy write sends
    // the legacy blockId.
    //
    // Built BEFORE the optimistic insert (#579): the helper refuses an anchor it
    // cannot complete, and a refusal after the insert would leave a highlight
    // tinted on screen that was never written anywhere.
    let payload;
    try {
      payload = highlightWritePayload({
        source: markSource,
        blockKey: blockKey ?? null,
        // The version the reader is LOOKING AT — read off the rendered block,
        // never re-resolved after the selection and never "whatever is newest".
        blockVersionId: blockVersionById.get(selection.blockId) ?? null,
        legacyBlockId: selection.blockId,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        color,
      });
    } catch {
      // The same outcome a rejected POST already produces in this component:
      // no highlight appears. Nothing was inserted yet, so there is nothing to
      // roll back — which is exactly why the payload is built first.
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    const optimistic: HighlightSummary = {
      id: optimisticId,
      blockKey: blockKey ?? "",
      blockId: selection.blockId,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      color,
      note: null,
      createdAt: new Date(),
    };
    setHighlights((prev) => [...prev, optimistic]);
    setSelection(null);
    window.getSelection()?.removeAllRanges();

    try {
      const res = await fetch(`${apiBase}/highlights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { highlight: HighlightSummary };
      // Swap the optimistic id for the canonical one.
      setHighlights((prev) =>
        prev.map((h) => (h.id === optimisticId ? body.highlight : h)),
      );
      // Fase E (ARC) — the highlight is the ANCHOR; offer the chapter concept
      // once per chapter+session. Only an explicit tap persists anything.
      const nudgeKey = `resonance-nudge-${bookSlug}-${chapter.order}`;
      try {
        if (!sessionStorage.getItem(nudgeKey)) {
          sessionStorage.setItem(nudgeKey, "1");
          setResonanceOffer(true);
        }
      } catch {
        // sessionStorage unavailable — skip the nudge quietly
      }
    } catch {
      setHighlights((prev) => prev.filter((h) => h.id !== optimisticId));
    }
  }

  // ── Annotation mutations ──────────────────────────────────────────────

  async function createAnnotation(blockId: string, text: string) {
    if (markWritesBlocked()) return;
    const optimisticId = `optimistic-${Date.now()}`;
    const blockKey = blockKeyById.get(blockId);
    const optimistic: AnnotationSummary = {
      id: optimisticId,
      blockKey: blockKey ?? "",
      blockId,
      text,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setAnnotations((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`${apiBase}/annotations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // CC-6D — anchor by the unit's SOURCE (see createHighlight).
        body: JSON.stringify(
          annotationWritePayload({
            source: markSource,
            blockKey: blockKey ?? null,
            legacyBlockId: blockId,
            text,
          }),
        ),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { annotation: AnnotationSummary };
      setAnnotations((prev) =>
        prev.map((a) => (a.id === optimisticId ? body.annotation : a)),
      );
    } catch {
      setAnnotations((prev) => prev.filter((a) => a.id !== optimisticId));
    }
  }

  async function updateAnnotation(id: string, text: string) {
    const prevSnapshot = annotations.find((a) => a.id === id);
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, text, updatedAt: new Date() } : a,
      ),
    );
    try {
      const res = await fetch(`${apiBase}/annotations/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      if (prevSnapshot) {
        setAnnotations((prev) =>
          prev.map((a) => (a.id === id ? prevSnapshot : a)),
        );
      }
    }
  }

  async function deleteAnnotation(id: string) {
    const prevSnapshot = annotations.find((a) => a.id === id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    try {
      const res = await fetch(`${apiBase}/annotations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    } catch {
      if (prevSnapshot) setAnnotations((prev) => [...prev, prevSnapshot]);
    }
  }

  // ── Reader preferences ────────────────────────────────────────────────

  async function pushPrefs(next: ReaderPrefs) {
    setPrefs(next);
    // Debounce server write.
    if (prefsDebounceRef.current) clearTimeout(prefsDebounceRef.current);
    prefsDebounceRef.current = setTimeout(async () => {
      try {
        await fetch(`${apiBase}/user/reader-preferences`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(next),
        });
      } catch {
        // Tolerated — settings revert on next /lector fetch.
      }
    }, 500);
  }

  // ── Complete CTA ──────────────────────────────────────────────────────

  async function markComplete() {
    try {
      const res = await fetch(
        `${apiBase}/lector/${encodeURIComponent(bookSlug)}/${chapter.order}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          // Complete the chapter that was OPENED. The route still carries the
          // position, but a structural publish can move the chapter while this
          // page is up, and completing by position would mark the wrong one —
          // for a legacy chapter just as much as a native one.
          body: JSON.stringify(
            chapter.readerRef.kind === "unit"
              ? { contentUnitId: chapter.readerRef.id }
              : { chapterId: chapter.readerRef.id },
          ),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as LectorCompleteResponse;
      // Navigate by identity, never by `body.nextChapter`. The order is what
      // the next chapter is CALLED; the ref is which chapter it IS, and only
      // one of those survives the book being restructured mid-session.
      if (body.nextReaderRef) {
        router.push(readerChapterPath(bookSlug, body.nextReaderRef));
      } else {
        router.push(`/dashboard/biblioteca/${bookSlug}`);
      }
    } catch {
      // Surface gently — keep user where they are.
    }
  }

  // ── Annotations count per block ───────────────────────────────────────

  // Marks bucket by the stable blockKey (falling back to the legacy blockId for
  // a mark that predates CC-6B). Blocks are looked up by `b.blockKey ?? b.id`,
  // which is identical for legacy books and correct for pure-core blocks too.
  const annotationsByBlock = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of annotations) {
      const key = a.blockKey || a.blockId;
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [annotations]);

  const highlightsByBlock = useMemo(() => {
    const map = new Map<string, HighlightSummary[]>();
    for (const h of highlights) {
      const key = h.blockKey || h.blockId;
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(h);
      map.set(key, list);
    }
    return map;
  }, [highlights]);

  // ── Theme + font styles ───────────────────────────────────────────────

  const containerStyle = themeStyle(prefs.theme);
  const proseStyle: React.CSSProperties = {
    fontFamily: prefs.font === "serif" ? "serif" : "system-ui, sans-serif",
    fontSize: `${prefs.fontSize}px`,
    lineHeight: prefs.lineHeight,
  };

  // CC-6B fail-closed: a genuine content fault (integrity error, retired unit)
  // is never masked with the legacy blocks — we show an unavailable state and
  // a way back to the book detail. All hooks above run unconditionally.
  if (!unit) {
    return (
      <div className="min-h-screen" style={containerStyle}>
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-4xl">📖</div>
          <h1 className="text-lg font-semibold">
            Contenido temporalmente no disponible
          </h1>
          <p className="text-sm opacity-70">
            No pudimos cargar el texto de este capítulo en este momento. Vuelve
            a intentarlo en un rato — tus notas y marcas siguen guardadas.
          </p>
          <Link
            href={`/dashboard/biblioteca/${encodeURIComponent(bookSlug)}`}
            className="rounded-full px-4 py-2 text-sm font-medium underline"
          >
            ← Volver al libro
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      // GR-3 — while the guided-reading drawer is open on desktop, the reader
      // RESERVES its width instead of being covered by it. The rule lives in
      // the panel's own stylesheet, so it only exists while the panel does.
      className={`min-h-screen${guideOpen ? " reader-guide-open" : ""}`}
      data-guide-open={guideOpen ? "true" : "false"}
      style={containerStyle}
    >
      {/* Top bar */}
      <header
        className="sticky top-0 z-30 backdrop-blur"
        style={{
          background: "var(--reader-bg-tint, rgba(250, 250, 248, 0.92))",
          borderBottom: "1px solid var(--reader-border, rgba(0,0,0,0.06))",
          position: "sticky",
        }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/dashboard/biblioteca/${bookSlug}`}
            className="text-[18px]"
            aria-label="Volver al libro"
            style={{ color: "var(--reader-text, var(--color-warm-700))" }}
          >
            ←
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <div
              className="truncate text-[11px] uppercase tracking-[0.14em]"
              style={{ color: "var(--reader-muted, var(--color-warm-500))" }}
            >
              {chapter.partNumber != null
                ? `${book.title} · Parte ${romanize(chapter.partNumber)}`
                : book.title}
            </div>
            <div
              className="truncate text-[13px] font-semibold"
              style={{ color: "var(--reader-text, var(--color-warm-900))" }}
            >
              {chapterHeading({ title: chapter.title })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Book Experience V2 — the way back to «Cómo recorrerlo». It is a
                toggle, not a gate: the reader chose to look at the chapter's
                shape and can leave it with the same button. */}
            <button
              type="button"
              data-testid="reader-open-chapter-home"
              onClick={() =>
                surface === "home" ? openReaderSurface() : openChapterHome()
              }
              aria-pressed={surface === "home"}
              // The accessible name has to contain the visible one, or a
              // voice-control user who says "Recorrido" — the word on the
              // button — activates nothing (WCAG 2.5.3, Label in Name).
              aria-label={
                surface === "home"
                  ? "Volver al lector"
                  : "Recorrido: cómo recorrerlo"
              }
              className="rounded-full px-4 text-[13px] font-semibold"
              // The one control that is on BOTH surfaces, so it is the one that
              // has to be reachable with a thumb.
              style={{
                minHeight: 44,
                minWidth: 44,
                background:
                  surface === "home"
                    ? "var(--color-lavender-100)"
                    : "var(--reader-chip-bg, var(--color-warm-100))",
                color:
                  surface === "home"
                    ? "var(--color-lavender-700)"
                    : "var(--reader-text, var(--color-warm-700))",
              }}
            >
              {surface === "home" ? "Volver" : "Recorrido"}
            </button>
            <button
              type="button"
              hidden={surface === "home"}
              onClick={() => setPrefsOpen(true)}
              aria-label="Preferencias de lectura"
              className="rounded-full px-3 py-1 text-[14px] font-semibold"
              style={{
                background: "var(--reader-chip-bg, var(--color-warm-100))",
                color: "var(--reader-text, var(--color-warm-700))",
              }}
            >
              Aa
            </button>
            {/* The header used to carry a mini-pill that opened the FULL
                chapter audiobook while «Leer» was on screen. It is gone, and
                its absence is the point: Escuchar is a mode with its own
                surface, its own subformats and its own completion, so a second
                entry point in the reading header meant the same audiobook had
                two homes and the mode selector was not telling the truth about
                where audio lives.

                Nothing was lost with it — playback, signed access, completion,
                transcript, speed and the sleep timer all live inside
                `ChapterMediaListen`, which mounts the same `AudioBar`. The
                reader reaches them by choosing Escuchar. */}
            <button
              type="button"
              hidden={surface === "home"}
              onClick={() => {
                setDockTab("notas");
                setFocusBlockId(null);
                setPendingBlockId(null);
                setDockPassage(null);
                setDockOpen(true);
              }}
              aria-label="Abrir panel del lector"
              className="rounded-full px-3 py-1 text-[13px] font-semibold"
              style={{
                background: "var(--reader-chip-bg, var(--color-warm-100))",
                color: "var(--reader-text, var(--color-warm-700))",
              }}
            >
              ✎ {annotations.length}
            </button>
          </div>
        </div>
        <div
          className="h-[3px] w-full"
          style={{ background: "var(--reader-track, var(--color-warm-100))" }}
        >
          <div
            className="h-full transition-[width] duration-300"
            style={{
              width: `${Math.round(progressPct * 100)}%`,
              background: "var(--color-lavender-500)",
            }}
          />
        </div>
      </header>

      {/* Mode selector — Leer · Escuchar · Ver (GR-2). It sits right below the
          sticky header so switching never costs a scroll, and so the choice is
          visible: the chapter is the unit, the format is the reader's call
          (docs/product/guided-reading-v1.md GR-001).

          Hidden on the chapter home, which lists the same formats as rows with
          their state spelled out. Two selectors for one decision would be two
          places to disagree. */}
      <div
        hidden={surface === "home"}
        className="mx-auto mt-4 flex max-w-full items-center justify-center gap-1 overflow-x-auto rounded-full p-1"
        style={{
          background: "var(--reader-chip-bg, var(--color-warm-100))",
          // `fit-content` capped by the viewport: the pill hugs its three tabs
          // on desktop and scrolls inside itself on a narrow phone, so it can
          // never be what makes the page wider than the screen.
          width: "fit-content",
          maxWidth: "calc(100% - 32px)",
          flexWrap: "nowrap",
          scrollbarWidth: "none",
        }}
        role="tablist"
        aria-label="Modo de lectura"
      >
        {(["leer", "escuchar", "ver"] as const)
          // Book Experience Standard V1 §3.2 — HIDDEN means no tab at all: no
          // route, no call, nothing to click. A format outside this chapter's
          // editorial plan is simply absent.
          .filter((value) => isModeVisible(modeViews[value]))
          .map((value) => {
            const view: BookExperienceModeView = modeViews[value];
            const enabled = isModeEnabled(view);
            const notice = disabledNotice(view);
            const selected = !guideOpen && effectiveMode === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                data-testid={`reader-mode-${value}`}
                data-mode-state={view.state}
                // While the guided-reading panel is open it is the selected
                // surface; a mode tab still marked selected would tell assistive
                // technology that two tabs are current at once.
                aria-selected={selected}
                // The disabled reason is announced, not implied by colour —
                // a greyer chip alone is not a message.
                aria-disabled={!enabled}
                aria-label={notice ? `${view.label} · ${notice}` : undefined}
                onClick={() => {
                  // Fail closed at the click too, not only in the styling: a
                  // tab the standard disabled must not switch mode and must not
                  // mount a media surface that would then request playback.
                  if (!enabled) return;
                  setGuideOpen(false);
                  changeMode(value);
                }}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
                style={
                  !enabled
                    ? {
                        background: "transparent",
                        color: "var(--reader-muted, var(--color-warm-500))",
                        opacity: 0.55,
                        cursor: "not-allowed",
                        textDecoration: "underline dotted",
                        textUnderlineOffset: "3px",
                      }
                    : selected
                      ? {
                          background: "var(--reader-bg, var(--color-warm-50))",
                          color: "var(--reader-text, var(--color-warm-900))",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                        }
                      : {
                          background: "transparent",
                          color: "var(--reader-muted, var(--color-warm-600))",
                        }
                }
              >
                {view.label}
                {notice ? (
                  <span className="ml-1.5 text-[11px] font-medium opacity-90">
                    · {notice}
                  </span>
                ) : null}
              </button>
            );
          })}
        {/* GR-3 — the fourth modality. It is a SURFACE: picking it opens the
            panel over the chapter and leaves `ReaderMode` (and therefore the
            stored preference) exactly where it was. `aria-selected` tracks
            whether the panel is open, which is what the reader sees.

            It is rendered only once the standard makes it visible, which for a
            guide means PUBLISHED: discovery answered, pin parsed, bundle and
            anchor resolved. While any of that is pending — and on every chapter
            that simply has no guide — there is no tab, because a tab is an
            offer and we cannot yet make one. */}
        {isModeVisible(guidedView) ? (
          <button
            type="button"
            role="tab"
            ref={guideTabRef}
            aria-selected={guideOpen}
            aria-controls={READER_GUIDE_PANEL_ID}
            data-testid="reader-mode-guiada"
            data-mode-state={guidedView.state}
            onClick={() => setGuideOpen((v) => !v)}
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
            style={
              guideOpen
                ? {
                    background: "var(--reader-bg, var(--color-warm-50))",
                    color: "var(--reader-text, var(--color-warm-900))",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  }
                : {
                    background: "transparent",
                    color: "var(--reader-muted, var(--color-warm-600))",
                  }
            }
          >
            {guidedView.label}
          </button>
        ) : null}
      </div>

      {/* GR-4 — the two «not yet» panels that used to live here are gone, and
          their absence is the point. The tab above is now rendered only when
          the standard makes the guided mode visible, which for a guide means
          discovery answered, pin parsed, bundle and anchor resolved. There is
          therefore no way to open this surface while the answer is pending or
          missing, so a «buscando…» or «no disponible» panel could never be
          reached — and unreachable reassurance is worse than none: it reads
          like a state the product has when it does not. */}
      {/* GR-4 — PIN_CHANGE_REQUIRES_COMPONENT_REMOUNT=true.
          The `key` is the pin, always. A guide run holds a session, a scene, a
          recall verdict and a timer that mean nothing under another pin; giving
          the same component a different bundle would reinterpret all of them
          instead of discarding them. Clearing that in an effect is not the
          same — the stale state would render for one frame first.
          The pin now comes from `GET /api/guide/discovery/:slug/:order`, so it
          really does change when the reader walks from an Emociones chapter to
          a Parejas one — which is exactly the case this key exists for. */}
      {guideOpen && guideRuntimeReady && guideActorScope && guideBundle ? (
        <ReaderGuidePanel
          key={guideComponentKey(guideBundle.pin)}
          actorScope={guideActorScope}
          bundle={guideBundle}
          anchor={guideAnchor}
          concept={chapterConcept(bookSlug, chapter.order, chapter.title)}
          bookSlug={bookSlug}
          chapterOrder={chapter.order}
          apiBase={apiBase}
          token={token}
          experience={pickedExperience}
          {...(chapterExperiences.items.length > 1
            ? {
                onPickAnotherExperience: () => {
                  closeGuide({ restoreFocus: false });
                  // ABANDONING the selection, not closing the panel: both
                  // halves of the pick go. Dropping only the experience left
                  // `pickedPin` behind, so the generic guided tab would
                  // silently reopen the journey the reader just walked away
                  // from — with the chapter's own guide nowhere in sight.
                  clearPick();
                  openChapterHome();
                },
              }
            : {})}
          onClose={() => closeGuide()}
          onGoToPassage={goToGuidePassage}
          /**
           * «Continuar leyendo» is not «Cerrar».
           *
           * Closing is a dismissal: the reader is done with the panel and gets
           * back whatever they were doing, which may well have been listening.
           * That is why `closeGuide` alone never touches the mode.
           *
           * This button says something else. The reader finished the guide and
           * asked to go on READING — so it names Leer explicitly instead of
           * dropping them back into the audiobook they had left. It goes
           * through `changeMode`, the one place that persists a mode, because a
           * choice the reader made out loud should still be theirs on the next
           * chapter.
           *
           * It ends nothing: no session cancel, no recovery clear, no route
           * change, no progress reset. It changes which surface is on screen.
           */
          onContinueReading={() => {
            changeMode("leer");
            closeGuide();
          }}
          onOpenExplicitCheckin={() => {
            // The existing check-in surface, reached as itself and IN PLACE:
            // the chapter stays open and the route does not change. The guide
            // does not preselect an emotion, does not submit anything, and
            // does not claim it caused whatever the reader records there.
            // The check-in is the destination now, so the Guide does not take
            // focus back — `openMoodCheckin` moves it into the dialog.
            closeGuide({ restoreFocus: false });
            openMoodCheckin();
          }}
        />
      ) : null}

      {/* Book Experience V2 — «Cómo recorrerlo». One surface, mounted instead of
          the formats, never over them: the chapter home is a place you go, not
          an overlay that hides where you were. */}
      {surface === "home" ? (
        <ChapterExperienceHome
          book={{
            title: book.title,
            authorName: book.authorName,
            slug: bookSlug,
          }}
          chapter={{
            order: chapter.order,
            title: chapter.title,
            durationMinutes: chapter.durationMinutes,
            partNumber: chapter.partNumber,
            partTitle: chapter.partTitle,
          }}
          progressPct={progressPct}
          modeViews={modeViews}
          guidedView={guidedView}
          // The pilot gate and an owner for a session — not the guided tab.
          // A chapter can publish journeys whose own pins resolve perfectly
          // while chapter-level discovery names none of them.
          experiencesEnabled={
            guideAvailable === true && guideActorScope !== null
          }
          experiences={chapterExperiences.items}
          experienceStates={experienceAuthority}
          canRunResumePin={canRunPin}
          onRetryExperienceStates={revalidateExperienceStates}
          onOpenExperience={(experience) => {
            // C.1 — the pin the server says to run: the open session's own pin
            // when there is one to continue, the published pin otherwise. A
            // run is never migrated to another version behind the reader.
            //
            // Every guard the render applied, applied again here — against the
            // LIVE key and generation, not the ones this closure captured. A
            // handler is reachable from a render that has already been
            // superseded (a focus event, a chapter change), and «the button was
            // enabled a moment ago» is not permission to start a run.
            //
            // No verdict, no opening. The published pin used to be the
            // fallback, which quietly turned «we could not ask» into «start a
            // fresh run» — and starting fresh is the one thing that can strand
            // a session the reader already has.
            if (experienceLoad.status !== "ready") return;
            if (experienceLoad.requestKey !== currentExperienceKeyRef.current) {
              return;
            }
            if (experienceLoad.generation !== experienceGenerationRef.current) {
              return;
            }
            const state = experienceLoad.states.get(
              experiencePinKey(experience.guidePin),
            );
            if (!state) return;
            // And the pin has to be runnable HERE. Storing a pick the panel
            // will refuse is worse than doing nothing: the button reads as
            // broken and the selection lingers.
            if (!canRunPin(state.resumePin)) return;
            setPickedPin(state.resumePin);
            setPickedExperience(experience);
            openReaderSurface();
            setGuideOpen(true);
          }}
          activityCount={activityCount}
          onContinueReading={() => {
            changeMode("leer");
            openReaderSurface();
          }}
          onPickMode={(mode) => {
            changeMode(mode);
            openReaderSurface();
          }}
          onOpenActivities={() => {
            // The section only exists in «Leer», so the row takes us there and
            // an effect finishes the job once it has actually mounted.
            pendingActivitiesFocus.current = true;
            changeMode("leer");
            openReaderSurface();
          }}
        />
      ) : null}

      {/* The media surfaces step aside while the guide is open — the guide is
          about the TEXT, and two players competing for the same chapter is not
          a state we want a reader to be in. `requestedMode` is untouched, so
          closing the panel brings the format straight back. */}
      {surface === "reader" && !guideOpen && effectiveMode === "escuchar" ? (
        <ChapterMediaListen
          apiBase={apiBase}
          token={token}
          bookId={book.id}
          chapterOrder={chapter.order}
          audioAvailable={chapter.audioAvailable}
          chapterTitle={chapter.title}
          bookSlug={bookSlug}
          // The manifest this reader already asked for. The surfaces do NOT ask
          // again: one chapter, one manifest. Anything else made the tab and
          // the surface disagree for a moment, which is how «Audio en
          // producción» could flash over a chapter that has audio.
          items={mediaItems}
          manifestError={mediaError}
        />
      ) : null}

      {surface === "reader" && !guideOpen && effectiveMode === "ver" ? (
        <ChapterMediaWatch
          apiBase={apiBase}
          token={token}
          bookSlug={bookSlug}
          items={mediaItems}
          manifestError={mediaError}
        />
      ) : null}

      {/* Book Experience V2 §18 — the reading composition is mounted ONLY in
          «Leer». Before this, the chapter text, its activities, its exercises
          list and «Marcar capítulo como leído» rendered unconditionally, so a
          person who picked Escuchar got the player with the whole chapter under
          it. Reading lives in one surface now, and the other formats are the
          only thing on screen when they are chosen.

          `readerContentMounted` — not `effectiveMode === "leer"` — because the
          guided panel needs the chapter behind it whichever format the reader
          came from. See the derivation above. */}
      {readerContentMounted ? (
        <ReaderExperienceView
          bookSlug={bookSlug}
          chapterOrder={chapter.order}
          chapterTitle={chapter.title}
          blocks={blocks}
          highlightsByBlock={highlightsByBlock}
          annotationsByBlock={annotationsByBlock}
          lessons={lessons}
          progressPct={progressPct}
          proseStyle={proseStyle}
          marksUnavailable={markSource === "content-core" && marksUnavailable}
          markWriteNotice={markWriteNotice}
          flashBlockId={flashBlockId}
          registerRef={registerRef}
          onAnnotateBlock={(id) => {
            setFocusBlockId(id);
            setPendingBlockId(null);
            setDockPassage(null);
            setDockTab("notas");
            setDockOpen(true);
          }}
          onOpenEco={(prompt) => openEcoInDock(prompt)}
          onReflectExercise={(prompt) =>
            openReflexionInDock(reflectExerciseSeed(prompt), true)
          }
          onBreathe={(ex) => setBreatheExercise(ex)}
          onMarkComplete={markComplete}
        />
      ) : null}

      {/* Fase E — resonance offer after the first highlight */}
      {resonanceOffer ? (
        <ResonanceNudge
          concept={chapterConcept(bookSlug, chapter.order, chapter.title)}
          bookSlug={bookSlug}
          chapterOrder={chapter.order}
          apiBase={apiBase}
          token={token}
          onClose={() => setResonanceOffer(false)}
        />
      ) : null}

      {/* Selection popover */}
      {selection && (
        <HighlightPopover
          x={selection.rect.x}
          y={selection.rect.y}
          onPick={createHighlight}
          onAnnotate={() => {
            setPendingBlockId(selection.blockId);
            setFocusBlockId(null);
            setDockPassage(null);
            setDockTab("notas");
            setDockOpen(true);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
          onReflect={() => {
            const passage = window.getSelection()?.toString() ?? "";
            setDockPassage(passage.trim() || null);
            setReflexionFromExercise(false);
            setDockTab("reflexion");
            setDockOpen(true);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
          onAskEco={() => {
            // Open Eco IN the dock — no navigation, the chapter stays put.
            const passage = window.getSelection()?.toString() ?? "";
            setDockPassage(passage.trim() || null);
            setDockTab("eco");
            setDockOpen(true);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
          onDismiss={() => {
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {/* Companion dock — Eco · Notas · Reflexión (right-hand panel) */}
      <ReaderCompanionDock
        open={dockOpen}
        tab={dockTab}
        onTabChange={setDockTab}
        onClose={() => {
          setDockOpen(false);
          setFocusBlockId(null);
          setPendingBlockId(null);
          setDockPassage(null);
          setDockEcoSeed(null);
          setDockReflexionSeed(null);
        }}
        passage={dockPassage}
        ecoSeed={dockEcoSeed}
        reflexionSeedOverride={dockReflexionSeed}
        reflexionFromExercise={reflexionFromExercise}
        concept={chapterConcept(bookSlug, chapter.order, chapter.title)}
        onPassageConsumed={() => {
          setDockPassage(null);
          setDockEcoSeed(null);
          setDockReflexionSeed(null);
        }}
        onReflexionAskEco={() => openEcoInDock(reflexionEcoSeed())}
        annotations={annotations}
        focusBlockId={focusBlockId}
        pendingBlockId={pendingBlockId}
        onClearPending={() => setPendingBlockId(null)}
        onCreateNote={createAnnotation}
        onUpdateNote={updateAnnotation}
        onDeleteNote={deleteAnnotation}
        apiBase={apiBase}
        token={token}
        scope={{ bookSlug, chapterOrder: chapter.order }}
      />

      {breatheExercise ? (
        <BreathingExercise
          exercise={breatheExercise}
          onClose={() => setBreatheExercise(null)}
          onReflect={() => openReflexionInDock(breatheReflectSeed(), true)}
          onAskEco={() => openEcoInDock(breatheEcoSeed())}
        />
      ) : null}

      <ReaderPreferencesModal
        isOpen={prefsOpen}
        initial={prefs}
        onClose={() => setPrefsOpen(false)}
        onChange={pushPrefs}
      />
    </div>
  );
}

// ── Theme style mapping ─────────────────────────────────────────────────
//
// Reader themes override a small handful of CSS variables. We do this here
// (not in global CSS) so the theme is scoped to the reader and doesn't
// affect the rest of the dashboard.

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function romanize(n: number): string {
  return ROMAN[n] ?? String(n);
}

function themeStyle(theme: ReaderPrefs["theme"]): React.CSSProperties {
  switch (theme) {
    case "sepia":
      return {
        background: "#F8F1E3",
        ["--reader-bg-tint" as string]: "rgba(248, 241, 227, 0.92)",
        ["--reader-text" as string]: "#3E2F1C",
        ["--reader-muted" as string]: "#8C7758",
        ["--reader-border" as string]: "rgba(124, 95, 62, 0.18)",
        ["--reader-chip-bg" as string]: "rgba(124, 95, 62, 0.1)",
        ["--reader-track" as string]: "rgba(124, 95, 62, 0.15)",
        color: "#3E2F1C",
      };
    case "dark":
      return {
        background: "#1B1B1F",
        ["--reader-bg-tint" as string]: "rgba(27, 27, 31, 0.92)",
        ["--reader-text" as string]: "#E5E5EA",
        ["--reader-muted" as string]: "#8E8E93",
        ["--reader-border" as string]: "rgba(255, 255, 255, 0.08)",
        ["--reader-chip-bg" as string]: "rgba(255, 255, 255, 0.08)",
        ["--reader-track" as string]: "rgba(255, 255, 255, 0.1)",
        color: "#E5E5EA",
      };
    case "light":
      return {
        background: "#FFFFFF",
        ["--reader-bg-tint" as string]: "rgba(255, 255, 255, 0.92)",
      };
    case "system":
    default:
      return {};
  }
}

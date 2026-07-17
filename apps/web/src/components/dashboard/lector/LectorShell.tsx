"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  AnnotationSummary,
  BreatheExercise,
  ContentUnitMarks,
  ContentUnitRead,
  HighlightColor,
  HighlightSummary,
  LectorChapterResponse,
} from "@psico/types";
import {
  reflectExerciseSeed,
  breatheReflectSeed,
  breatheEcoSeed,
  reflexionEcoSeed,
  chapterConcept,
  projectReaderBlocks,
} from "@psico/types";
import {
  ReaderCompanionDock,
  type DockTab,
} from "./companion/ReaderCompanionDock";
import { AudioBar } from "./AudioBar";
import { BlockRenderer } from "./BlockRenderer";
import { EcoTopicCard } from "./EcoTopicCard";
import { ChapterExercises } from "./exercises/ChapterExercises";
import { BreathingExercise } from "./exercises/BreathingExercise";
import { HighlightPopover } from "./HighlightPopover";
import { ResonanceNudge } from "./ResonanceNudge";
import {
  ReaderPreferencesModal,
  type ReaderPrefs,
} from "./ReaderPreferencesModal";
import { useHeartbeat } from "./use-heartbeat";

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
   * CC-6C — the user's marks for this unit from the stable per-unit surface
   * (keyed by blockKey). When present the reader seeds its marks from here; when
   * null it falls back to the lector envelope's marks (`initial.highlights/…`).
   */
  marks: ContentUnitMarks | null;
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
  bookSlug,
}: Props) {
  const router = useRouter();

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

  // Mutable state. Marks come from the CC-6C surface when available, else the
  // lector envelope (backward compatible).
  const [highlights, setHighlights] = useState<HighlightSummary[]>(
    marks?.highlights ?? initial.highlights,
  );
  const [annotations, setAnnotations] = useState<AnnotationSummary[]>(
    marks?.annotations ?? initial.annotations,
  );
  const [progressPct, setProgressPct] = useState<number>(
    initial.session.progressPct,
  );

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

  // Reader mode — "libro" (default, text-only) vs "guia" (audio prominent).
  // Persisted in localStorage so the user's choice survives reloads of the
  // same chapter. Per design `docs/design/handoff/05-lector.md`, Modo Guía
  // is the audio-narrated experience.
  type ReaderMode = "libro" | "guia";
  const [mode, setMode] = useState<ReaderMode>(() => {
    if (typeof window === "undefined") return "libro";
    const stored = window.localStorage.getItem("psico:lector:mode");
    return stored === "guia" ? "guia" : "libro";
  });
  function changeMode(next: ReaderMode) {
    setMode(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("psico:lector:mode", next);
    }
  }

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
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) blockRefs.current.set(id, el);
    else blockRefs.current.delete(id);
  }, []);

  // ── IntersectionObserver: track currently visible block ────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
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

    for (const el of blockRefs.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [blocks]);

  // ── Heartbeat ──────────────────────────────────────────────────────────

  useHeartbeat({
    apiBase,
    token,
    bookId: book.id,
    chapterOrder: chapter.order,
    onProgress: setProgressPct,
    read: () => ({
      lastBlockId: lastBlockIdRef.current,
      progressPct,
    }),
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
    const optimisticId = `optimistic-${Date.now()}`;
    const blockKey = blockKeyById.get(selection.blockId);
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
    // Prefer the stable public identity; fall back to the legacy anchor. On the
    // Content Core path the source version is required (CC-6C).
    const blockVersionId = blockVersionById.get(selection.blockId);
    const payload = {
      ...(blockKey ? { blockKey } : { blockId: selection.blockId }),
      ...(blockVersionId ? { blockVersionId } : {}),
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      color,
    };
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
        // Prefer the stable public identity; fall back to the legacy anchor.
        body: JSON.stringify(blockKey ? { blockKey, text } : { blockId, text }),
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
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { nextChapter: number | null };
      if (body.nextChapter !== null) {
        router.push(
          `/dashboard/biblioteca/${bookSlug}/lector/${body.nextChapter}`,
        );
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
    <div className="min-h-screen" style={containerStyle}>
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
              Cap. {chapter.order} · {chapter.title}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
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
            {/* Mini-pill audio entry kept in Modo Libro for users who
                want a quick listen without switching the whole reading
                experience. In Modo Guía the audio lives in the banner
                below, so we hide the pill to avoid duplicating it. */}
            {chapter.audioAvailable && mode === "libro" ? (
              <AudioBar
                apiBase={apiBase}
                token={token}
                bookId={book.id}
                chapterOrder={chapter.order}
              />
            ) : null}
            <button
              type="button"
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

      {/* Mode toggle — Modo Libro vs Modo Guía. The toggle lives right
          below the sticky header so the user can always switch without
          scrolling, and so the choice is visible (it's the flagship feature
          per the design source-of-truth, docs/design/handoff/05-lector.md). */}
      <div
        className="mx-auto mt-4 flex max-w-3xl items-center justify-center gap-1 rounded-full p-1"
        style={{
          background: "var(--reader-chip-bg, var(--color-warm-100))",
          width: "fit-content",
        }}
        role="tablist"
        aria-label="Modo de lectura"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "libro"}
          onClick={() => changeMode("libro")}
          className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
          style={
            mode === "libro"
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
          📖 Modo Libro
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "guia"}
          onClick={() => changeMode("guia")}
          className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
          style={
            mode === "guia"
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
          🎧 Modo Guía
        </button>
      </div>

      {/* Modo Guía banner — audio player area or empty state when the audio
          isn't published yet. The author's audio rollout is happening in
          batches (ffmpeg embed + R2 upload, see docs/v1-freeze-ops-checklist.md
          §3), so chapters can land in production before their audio does. */}
      {mode === "guia" ? (
        <div className="mx-auto mt-4 max-w-3xl px-4">
          {chapter.audioAvailable ? (
            <div
              className="rounded-2xl border-[1.5px] bg-white p-4"
              style={{ borderColor: "var(--color-warm-200)" }}
            >
              <AudioBar
                apiBase={apiBase}
                token={token}
                bookId={book.id}
                chapterOrder={chapter.order}
              />
            </div>
          ) : (
            <div
              className="rounded-2xl border-[1.5px] p-5 text-center"
              style={{
                background: "var(--color-warm-50)",
                borderColor: "var(--color-warm-200)",
              }}
            >
              <p
                className="text-[20px]"
                style={{ color: "var(--color-warm-500)" }}
                aria-hidden
              >
                🎧
              </p>
              <p
                className="mt-2 text-[13.5px] font-semibold"
                style={{ color: "var(--color-warm-800)" }}
              >
                Audio en producción
              </p>
              <p
                className="mt-1 text-[12.5px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                Este capítulo aún no tiene narración disponible. Puedes cambiar
                a Modo Libro mientras tanto.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Sprint B — contextual Eco topic for this chapter (dismissible). */}
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <EcoTopicCard
          bookSlug={bookSlug}
          chapterOrder={chapter.order}
          chapterTitle={chapter.title}
          onOpen={(prompt) => openEcoInDock(prompt)}
        />
      </div>

      {/* Reading area */}
      <main className="mx-auto max-w-3xl px-4 pb-8" style={proseStyle}>
        {blocks.map((b) => (
          <BlockRenderer
            key={b.id}
            block={b}
            highlights={highlightsByBlock.get(b.blockKey ?? b.id) ?? []}
            annotationCount={annotationsByBlock.get(b.blockKey ?? b.id) ?? 0}
            onAnnotateClick={(id) => {
              setFocusBlockId(id);
              setPendingBlockId(null);
              setDockPassage(null);
              setDockTab("notas");
              setDockOpen(true);
            }}
            registerRef={registerRef}
          />
        ))}

        {/* Interactive activities (backlog: actividades reales) */}
        <ChapterExercises
          bookSlug={bookSlug}
          chapterOrder={chapter.order}
          onReflect={(prompt) =>
            openReflexionInDock(reflectExerciseSeed(prompt), true)
          }
          onBreathe={(ex) => setBreatheExercise(ex)}
        />

        {/* Lessons list */}
        {lessons.length > 0 && (
          <section
            className="mt-12 rounded-2xl p-5"
            style={{
              background: "var(--color-lavender-50)",
              border: "1.5px solid var(--color-lavender-200)",
            }}
          >
            <h3
              className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-lavender-700)" }}
            >
              Ejercicios de este capítulo
            </h3>
            <ul className="flex flex-col gap-2">
              {lessons.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 text-[13px]"
                  style={{ color: "var(--color-warm-800)" }}
                >
                  <span>{l.title}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                    style={{
                      background:
                        l.status === "completed"
                          ? "var(--color-sage-100)"
                          : "var(--color-warm-100)",
                      color:
                        l.status === "completed"
                          ? "var(--color-sage-700)"
                          : "var(--color-warm-500)",
                    }}
                  >
                    {l.status === "completed" ? "Hecho" : "Disponible"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Complete CTA */}
        <footer className="mt-12 flex flex-col items-center gap-3 pb-12">
          <p
            className="text-[12px]"
            style={{ color: "var(--reader-muted, var(--color-warm-500))" }}
          >
            {progressPct >= 0.9
              ? "Estás casi al final de este capítulo."
              : "Sigue leyendo a tu ritmo."}
          </p>
          <button
            type="button"
            onClick={markComplete}
            className="rounded-2xl px-6 py-3 text-[13px] font-semibold text-white"
            style={{ background: "var(--color-sage-500)" }}
          >
            ✓ Marcar capítulo como leído
          </button>
        </footer>
      </main>

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

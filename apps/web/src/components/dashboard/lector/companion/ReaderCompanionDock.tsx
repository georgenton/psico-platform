"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AnnotationSummary, ChapterConcept, EcoScope } from "@psico/types";
import { passageToPrompt } from "@/lib/eco/reader-handoff";
import { EcoTab } from "./EcoTab";
import { NotesTab } from "./NotesTab";
import { ReflexionTab, reflexionSeed } from "./ReflexionTab";

export type DockTab = "eco" | "notas" | "reflexion";

/**
 * ReaderCompanionDock — the right-hand companion panel of the reader.
 *
 * One docked surface, three tools (Copilot-style):
 *   - 🌿 Eco       — chat with the companion without leaving the chapter.
 *   - ✎ Notas      — plaintext margin notes about the text.
 *   - 🪷 Reflexión — an E2E-encrypted diary entry about the reader (may feed the
 *                    Mapa, only via signals the user explicitly provides).
 *
 * The reader stays mounted behind the dock, so the user never loses their
 * place. When opened from a highlighted passage, the active tab is seeded with
 * that passage (a lead-in prompt for Eco, a quoted lead-in for Reflexión).
 *
 * Only the active tab is mounted — this keeps Eco's SSE / diary crypto from
 * running in the background, and lets each tab consume the passage seed fresh
 * when the user switches to it.
 */
export function ReaderCompanionDock({
  open,
  tab,
  onTabChange,
  onClose,
  passage,
  ecoSeed,
  reflexionSeedOverride,
  onPassageConsumed,
  onReflexionAskEco,
  reflexionFromExercise = false,
  concept,
  annotations,
  focusBlockId,
  pendingBlockId,
  onClearPending,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  apiBase,
  token,
  scope,
}: {
  open: boolean;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  onClose: () => void;
  /** Raw highlighted passage (wrapped per-tab), or null. */
  passage: string | null;
  /** A ready-made Eco prompt (e.g. a chapter topic) that overrides `passage`. */
  ecoSeed?: string | null;
  /** A ready-made Reflexión seed (e.g. a chapter exercise) overriding `passage`. */
  reflexionSeedOverride?: string | null;
  onPassageConsumed: () => void;
  /** After saving a reflexión, jump to Eco seeded (post-exercise nudge). */
  onReflexionAskEco?: () => void;
  /**
   * ARC — true when the Reflexión tab was opened from a chapter exercise. On
   * save the tab offers the chapter `concept` as a confirmable resonance
   * (`source: "exercise"`).
   */
  reflexionFromExercise?: boolean;
  concept?: ChapterConcept;
  annotations: AnnotationSummary[];
  focusBlockId: string | null;
  pendingBlockId: string | null;
  onClearPending: () => void;
  onCreateNote: (blockId: string, text: string) => Promise<void>;
  onUpdateNote: (id: string, text: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  apiBase: string;
  token: string | null;
  /** Fase H — reading context passed to the Eco tab (RAG scope + offer). */
  scope?: EcoScope;
}) {
  /**
   * Where the focus came from, so it has somewhere to go back to.
   *
   * Closing the panel used to leave the focus on `<body>`: the reader kept its
   * scroll position, but whoever navigates by keyboard was returned to the top
   * of the tab order and had to walk the whole chapter again to reach the
   * passage they were on. Scroll and focus are two different kinds of "your
   * place", and only one of them was being kept.
   *
   * The opener is preferred, but it is often gone: the selection popover
   * unmounts as soon as the dock takes over, so the very button that was
   * pressed no longer exists. The passage's own block is then the honest
   * destination — it is what the person was reading. The reader region is the
   * last resort.
   *
   * `preventScroll` throughout: the position is already correct, and focusing
   * normally would scroll the element to the top of the viewport — the
   * accidental jump this is meant to avoid.
   */
  const abridor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const activo = document.activeElement;
    // `document.activeElement` is `<body>` when nothing holds the focus, and
    // `<body>` is always connected — so treating it as an opener would
    // "restore" the focus to exactly the state this is here to fix, and do it
    // silently. Only a real control counts.
    abridor.current =
      activo instanceof HTMLElement &&
      activo !== document.body &&
      activo !== document.documentElement
        ? activo
        : null;
  }, [open]);

  const devolverFoco = useCallback(() => {
    const previo = abridor.current;
    if (previo?.isConnected) {
      previo.focus({ preventScroll: true });
      return;
    }
    // Two names for "the block this panel is about": the reader sets
    // `focusBlockId` when it sends the person to a passage, and
    // `pendingBlockId` when a note is being written against one. The note path
    // clears the first and fills the second, so reading only one of them left
    // the destination to chance — it happened to be right because the passage
    // was also the chapter's first block.
    const anclaje = focusBlockId ?? pendingBlockId;
    const bloque = anclaje
      ? document.querySelector<HTMLElement>(
          `[data-block-id="${CSS.escape(anclaje)}"]`,
        )
      : null;
    // No passage recorded — the chapter's first block is still inside the
    // text, which is nearer than `<body>` and keeps the tab order forward.
    const destino =
      bloque ?? document.querySelector<HTMLElement>("[data-block-id]");
    if (!destino) return;
    // A block is not focusable on its own; make it so for this one move.
    if (!destino.hasAttribute("tabindex")) destino.tabIndex = -1;
    destino.focus({ preventScroll: true });
  }, [focusBlockId, pendingBlockId]);

  const cerrar = useCallback(() => {
    onClose();
    // AFTER React has flushed the close, not before. `onClose` only schedules
    // the state change; focusing in the same tick puts the focus on a node the
    // imminent re-render then tears down, and the browser answers an unmounted
    // focus by falling back to `<body>` — the exact outcome this avoids.
    // Measured: focusing inline left the focus on `<body>` in the real reader
    // while passing in jsdom, where nothing re-renders.
    requestAnimationFrame(devolverFoco);
  }, [onClose, devolverFoco]);

  // Escape closes the dock.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, cerrar]);

  if (!open) return null;

  const ecoSeedText = ecoSeed ?? (passage ? passageToPrompt(passage) : null);
  const reflexionSeedText =
    reflexionSeedOverride ?? (passage ? reflexionSeed(passage) : null);

  const TABS: Array<{ id: DockTab; icon: string; label: string }> = [
    { id: "eco", icon: "🌿", label: "Eco" },
    { id: "notas", icon: "✎", label: "Notas" },
    { id: "reflexion", icon: "🪷", label: "Reflexión" },
  ];

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col overflow-hidden border-l-[1.5px] bg-white shadow-xl"
      style={{ borderColor: "var(--color-warm-200)" }}
      aria-label="Panel del lector: Eco, Notas y Reflexión"
    >
      <header
        className="flex items-center justify-between border-b-[1.5px] px-4 py-3"
        style={{ borderColor: "var(--color-warm-100)" }}
      >
        <div
          className="flex items-center gap-1 rounded-full p-1"
          style={{ background: "var(--color-warm-100)" }}
          role="tablist"
          aria-label="Herramientas del lector"
        >
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(t.id)}
                className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
                style={
                  active
                    ? {
                        background: "white",
                        color: "var(--color-warm-900)",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                      }
                    : {
                        background: "transparent",
                        color: "var(--color-warm-600)",
                      }
                }
              >
                <span aria-hidden>{t.icon}</span> {t.label}
                {t.id === "notas" && annotations.length > 0 ? (
                  <span
                    className="ml-1 rounded-full px-1.5 text-[10px]"
                    style={{
                      background: active
                        ? "var(--color-warm-100)"
                        : "var(--color-warm-200)",
                      color: "var(--color-warm-700)",
                    }}
                  >
                    {annotations.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar panel"
          className="text-[18px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          ×
        </button>
      </header>

      {tab === "eco" ? (
        <EcoTab
          apiBase={apiBase}
          token={token}
          seed={ecoSeedText}
          onSeedConsumed={onPassageConsumed}
          scope={scope}
        />
      ) : tab === "reflexion" ? (
        <ReflexionTab
          apiBase={apiBase}
          token={token}
          seed={reflexionSeedText}
          onSeedConsumed={onPassageConsumed}
          onAskEco={onReflexionAskEco}
          fromExercise={reflexionFromExercise}
          concept={concept}
          bookSlug={scope?.bookSlug}
          chapterOrder={scope?.chapterOrder}
        />
      ) : (
        <NotesTab
          annotations={annotations}
          focusBlockId={focusBlockId}
          pendingBlockId={pendingBlockId}
          onClearPending={onClearPending}
          onCreate={onCreateNote}
          onUpdate={onUpdateNote}
          onDelete={onDeleteNote}
        />
      )}
    </aside>
  );
}

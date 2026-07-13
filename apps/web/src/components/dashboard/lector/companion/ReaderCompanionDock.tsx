"use client";

import { useEffect } from "react";
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
 *   - 🪷 Reflexión — an E2E-encrypted diary entry about the reader (feeds the Mapa).
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
  // Escape closes the dock.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
          onClick={onClose}
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

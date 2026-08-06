"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ChapterConcept } from "@psico/types";
import type { GuideWebBundle } from "./guide-web-bundle";
import type { GuideAnchorResolution } from "./guide-anchor";
import { ExperiencePlayer } from "../experience/ExperiencePlayer";
import { useChapterExperience } from "../experience/use-chapter-experience";

/**
 * GR-3 / GR-6 — guided reading, inside the reader.
 *
 * The chapter stays mounted behind this panel. That is the whole point of the
 * feature: an earlier version navigated away to `/dashboard/exploraciones`,
 * and the reader lost their place to answer three questions about the page
 * they were on.
 *
 * GR-6 emptied this file of everything except that idea. It used to hold a
 * second player — its own eight scenes, its own cursor, its own copy of the
 * cover and the finish — beside the standalone route's. Two players of the
 * same run is how two screens start disagreeing about what a person has done,
 * so there is now exactly one: `ExperiencePlayer`, mounted here and mounted by
 * the standalone route, with the same registry and the same rules.
 *
 * What remains here is genuinely reader-specific and belongs to no other
 * surface:
 *
 *   - the drawer itself, and the fact that it takes focus without trapping it;
 *   - the anchor precondition — no located passage, no offer;
 *   - the way back to the book, in the two forms the reader expects.
 *
 * It is NOT a modal: the chapter behind it stays readable and reachable.
 */

/** The reader's tab points at this with `aria-controls`. */
export const READER_GUIDE_PANEL_ID = "reader-guide-panel";

export interface ReaderGuidePanelProps {
  actorScope: string;
  /**
   * GR-4 — the EXACT guide this panel renders, resolved by the caller from
   * the server's pin. The panel holds no default and no book-slug branch: it
   * renders the bundle it is handed, or nothing.
   */
  bundle: GuideWebBundle;
  /** Where the approved passage is in THIS chapter, or why it is not. */
  anchor: GuideAnchorResolution;
  concept: ChapterConcept;
  bookSlug: string;
  chapterOrder: number;
  apiBase: string;
  token: string;
  onClose: () => void;
  /** Scroll + focus the anchored paragraph. The panel stays open. */
  onGoToPassage: () => void;
  onContinueReading: () => void;
  onOpenExplicitCheckin: () => void;
}

export function ReaderGuidePanel({
  actorScope,
  bundle,
  anchor,
  concept,
  bookSlug,
  chapterOrder,
  apiBase,
  token,
  onClose,
  onGoToPassage,
  onContinueReading,
  onOpenExplicitCheckin,
}: ReaderGuidePanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  /**
   * The explicit resonance write.
   *
   * It lives here because this is where the chapter context is: the concept,
   * the book and the chapter the reader is actually in. The scene decides
   * WHEN (an explicit tap) and this decides WHAT — a `POST /resonances` with
   * `source: "guide"`, the same path the panel has used since GR-3.
   *
   * It is NOT the check-in. `onOpenExplicitCheckin` remains a separate prop
   * for a separate act; wiring one to the other is exactly the mistake this
   * callback exists to prevent.
   */
  const confirmResonance = useCallback(async () => {
    const res = await fetch(`${apiBase}/resonances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conceptKey: concept.key,
        conceptLabel: concept.label,
        bookSlug,
        chapterOrder,
        source: "guide",
      }),
    });
    // The scene renders "no pudimos guardarla" from this rejection; a silent
    // failure would tell somebody their resonance was saved when it was not.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, [apiBase, token, concept, bookSlug, chapterOrder]);

  // Escape closes, from anywhere inside the panel or after it took focus. The
  // reader keeps the shortcut they already expect from every other dismissible
  // surface in the dashboard.
  //
  // It closes the SURFACE and nothing else: no command is sent, the session is
  // not cancelled, the recovery record is not cleared and the route does not
  // change. Leaving is not abandoning — the run is exactly where it was, and
  // reopening the panel finds it there.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus enters the panel once, when it opens, because there is new content
  // to read. Not a trap — Tab still walks out into the chapter, which is the
  // point of a non-modal surface. Handing focus back on close is the caller's
  // half, and the reader does it.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // GR-6 — server-owned. The panel does not know which journey presents this
  // chapter until the API says so, which is what lets a CMS change the answer
  // without a deploy.
  const { status, definition } = useChapterExperience({
    bookSlug,
    chapterOrder,
    pin: bundle.pin,
  });

  // Defence in depth. The reader already refuses to mount this panel without a
  // located passage; the panel refuses on its own too, because a cover with a
  // working «Empezar» would record progress through a journey whose passage
  // cannot be shown. No session is created, so nothing has to be undone.
  //
  // A pin with no published experience fails the same way and for the same
  // reason: there is nothing honest to render.
  if (
    anchor.status !== "RESOLVED" ||
    status === "loading" ||
    definition === null
  ) {
    return (
      <aside
        id={READER_GUIDE_PANEL_ID}
        aria-label="Recorrido guiado del capítulo"
        data-testid="reader-guide-panel"
        className="reader-guide-panel"
        tabIndex={-1}
      >
        <style>{PANEL_CSS}</style>
        <div className="rgp-head">
          <span className="rgp-eyebrow">Recorrido guiado</span>
          <button type="button" onClick={onClose} className="rgp-close">
            Cerrar
          </button>
        </div>
        <div className="rgp-body">
          <p
            className="rgp-text"
            role="status"
            data-testid="rgp-anchor-unresolved"
          >
            {status === "loading"
              ? "Preparando el recorrido…"
              : "No pudimos preparar el recorrido de este capítulo. Puedes seguir leyendo con normalidad."}
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      id={READER_GUIDE_PANEL_ID}
      ref={panelRef}
      aria-label="Recorrido guiado del capítulo"
      data-testid="reader-guide-panel"
      className="reader-guide-panel"
      tabIndex={-1}
    >
      <style>{PANEL_CSS}</style>

      <div className="rgp-head">
        <span className="rgp-badges">
          <span className="rgp-eyebrow">Recorrido guiado</span>
          {/* What the guide covers is part of the offer, not a footnote. */}
          <span className="rgp-scope" data-testid="rgp-scope">
            Registra avance educativo
          </span>
        </span>
        <button type="button" onClick={onClose} className="rgp-close">
          Cerrar
        </button>
      </div>

      <div className="rgp-body">
        <ExperiencePlayer
          actorScope={actorScope}
          definition={definition}
          bundle={bundle}
          anchor={anchor}
          concept={concept}
          media={{ bookSlug, chapterOrder, apiBase, token }}
          onGoToPassage={onGoToPassage}
          onContinueReading={onContinueReading}
          onClose={onClose}
          onConfirmResonance={confirmResonance}
        />
      </div>
    </aside>
  );
}

/**
 * Two presentations, one breakpoint.
 *
 * **≥1024px** — a drawer on the right, and the reader RESERVES its width
 * (`.reader-guide-open`) instead of letting it float on top. A drawer that
 * covers the paragraph the guide just pointed at defeats the whole feature.
 *
 * **<1024px** — a bottom sheet, capped so the chapter stays visible behind it.
 * A 380px side panel on a 768px tablet would cover half the column, so the
 * phone presentation is the right one there too.
 *
 * Both cap their own size: the panel is never what makes the page scroll
 * sideways.
 */
const PANEL_CSS = `
.reader-guide-panel {
  position: fixed;
  z-index: 60;
  background: var(--bg-surface, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: 0 -8px 30px rgba(60, 45, 90, 0.16);
}
.reader-guide-panel:focus { outline: none; }
@media (max-width: 1023px) {
  .reader-guide-panel {
    left: 0; right: 0; bottom: 0;
    /* Capped so the chapter is never fully hidden behind the sheet — on a
       390×844 phone this leaves roughly a third of the screen reading. */
    max-height: 62vh;
    border-radius: 18px 18px 0 0;
  }
}
@media (min-width: 1024px) {
  .reader-guide-panel {
    top: 0; right: 0; bottom: 0;
    width: min(380px, 100vw);
    border-left: 1px solid var(--color-warm-200, #e7e2dc);
    box-shadow: -8px 0 30px rgba(60, 45, 90, 0.12);
  }
  /* The reader gives up the width rather than being covered. Its column is
     centred inside what remains, so the anchored paragraph stays fully
     visible after «Ir al pasaje». */
  .reader-guide-open {
    padding-right: 380px;
  }
}
.rgp-head { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px 0; }
.rgp-badges { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.rgp-scope { font-size: 11.5px; color: var(--color-warm-600); white-space: nowrap; }
.rgp-eyebrow { font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  font-weight: 700; color: var(--color-lavender-500, #8a7ab8); }
.rgp-close { min-height: 44px; background: none; border: 0; cursor: pointer;
  font-size: 13px; color: var(--color-warm-600, #7a7069); }
.rgp-progress { margin: 4px 18px 0; font-size: 12px;
  color: var(--color-warm-500, #8d857d); }
.rgp-live { margin: 0 18px; font-size: 12.5px; }
.rgp-error { color: var(--color-warm-800, #4a423c); }
.rgp-error-text { margin: 6px 0 0; font-size: 12px;
  color: var(--color-rose-600, #b25454); }
.rgp-body { overflow-y: auto; padding: 10px 18px 4px; flex: 1; }
.rgp-title { font: 700 19px/1.25 var(--font-sans); margin: 8px 0 10px;
  color: var(--color-warm-900, #2f2a26); outline-offset: 4px; }
.rgp-duration { margin: 0 0 10px; font-size: 12.5px;
  color: var(--color-warm-500, #8d857d); }
.rgp-text { font-size: 14px; line-height: 1.6; margin: 0 0 10px;
  color: var(--color-warm-700, #5f574f); }
.rgp-note { font-size: 12px; line-height: 1.5; margin: 6px 0 12px;
  color: var(--color-warm-500, #8d857d); }
.rgp-btn { display: block; width: 100%; min-height: 44px; margin: 8px 0;
  border-radius: 12px; font-size: 13.5px; font-weight: 700; cursor: pointer; }
.rgp-btn.primary { border: 0; color: #fff;
  background: var(--color-lavender-500, #8a7ab8); }
.rgp-btn.ghost { background: transparent;
  border: 1px solid var(--color-warm-200, #e7e2dc);
  color: var(--color-warm-700, #5f574f); }
.rgp-btn:disabled { opacity: .6; cursor: default; }
.rgp-fieldset { border: 0; margin: 0; padding: 0; }
.rgp-legend { font-size: 14px; line-height: 1.55; font-weight: 600;
  margin-bottom: 8px; color: var(--color-warm-800, #4a423c); }
.rgp-option { display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px; min-height: 44px; border-radius: 12px;
  border: 1px solid var(--color-warm-200, #e7e2dc); margin-bottom: 8px;
  font-size: 13.5px; line-height: 1.5; cursor: pointer; }
.rgp-clip { display: flex; flex-direction: column; gap: 4px; padding: 18px;
  border-radius: 14px; text-align: center; font-size: 13.5px;
  background: var(--color-warm-100, #f3efe9); }
.rgp-banner { font: 700 12px/1.4 var(--font-sans); letter-spacing: .1em;
  margin: 8px 0 12px; color: var(--color-sage-600, #5f7a63); }
.rgp-resonance { padding: 12px; border-radius: 14px; margin-bottom: 10px;
  background: var(--color-lavender-50, #f4f1fa); }
.rgp-actions { margin-top: 14px; }
.rgp-scope { margin: 0; padding: 10px 18px 16px; font-size: 11.5px;
  line-height: 1.5; color: var(--color-warm-500, #8d857d); }
`;

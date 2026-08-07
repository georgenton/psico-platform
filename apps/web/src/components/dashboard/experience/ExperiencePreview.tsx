"use client";

/**
 * CMS V1 (#637) — what an editor sees before publishing.
 *
 * The real surface, the real registry, the real twelve renderers. Only the run
 * is different, and only because a preview must not record anything.
 *
 * The disclaimer lives OUTSIDE the player. Changing the renderers' own copy to
 * say "this is a preview" would mean the editor is no longer looking at what a
 * reader gets, which is the one thing a preview is for.
 */

import type { ChapterConcept, ChapterExperiencePublicView } from "@psico/types";
import { ExperiencePlayerSurface } from "./ExperiencePlayer";
import { useExperiencePreviewRun } from "./use-experience-preview-run";
import type { GuideWebBundle } from "../guide/guide-web-bundle";

/** Preview writes nothing, so it needs no identity to write as. */
const PREVIEW_SCOPE = "preview";

export function ExperiencePreview({
  definition,
  bundle,
  concept = null,
}: {
  definition: ChapterExperiencePublicView;
  bundle: GuideWebBundle;
  concept?: ChapterConcept | null;
}) {
  const run = useExperiencePreviewRun(bundle.presentation);

  return (
    <div data-testid="experience-preview">
      <p
        className="mb-3 rounded-xl px-4 py-2.5 text-[12.5px]"
        style={{
          background: "var(--color-lavender-50)",
          color: "var(--color-lavender-700)",
        }}
      >
        Vista previa: no registra avance, respuestas ni resonancias.
      </p>

      <ExperiencePlayerSurface
        actorScope={PREVIEW_SCOPE}
        definition={definition}
        bundle={bundle}
        // No anchor: the chapter is not mounted behind this, and duplicating it
        // inside the CMS would be a second reader to keep in step.
        anchor={null}
        concept={concept}
        media={null}
        run={run}
        // The reader's place in this experience is not the editor's to move.
        persistSceneCursor={false}
        // `onConfirmResonance` is the ONLY path to a resonance write, and it is
        // deliberately absent: the scene then offers «Ahora no» alone, so there
        // is no button that could claim something was saved when nothing was.
      />
    </div>
  );
}

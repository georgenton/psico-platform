"use client";

/**
 * GR-6 — the two panels backed by a produced asset.
 *
 * Both reuse the chapter media pipeline that GR-2 already ships: the same
 * manifest hook, the same mode view model, the same `AudioBar`, the same
 * `ComingSoonNotice`. Nothing here re-implements access, signing or the
 * published/announced distinction.
 *
 * Three properties hold for both, and they are the reason these are separate
 * from every other scene:
 *
 *   - **never autoplay.** A guided reading that starts making noise on its own
 *     is not guiding anyone.
 *   - **never complete a guide step.** Neither kind can bind (ADR 0021), so
 *     there is no confirmation control to press and no command to send.
 *   - **`chapter_media_completed` stays independent.** Finishing the audiobook
 *     is a media event the reader's own surface already records; emitting it
 *     again from inside the player would double-count the same act.
 *
 * When a format has no master, the panel says so and asks for NOTHING: no
 * iframe, no signed URL, no disabled control implying an asset behind it.
 */

import { AudioBar } from "../../lector/AudioBar";
import { ComingSoonNotice } from "../../lector/media/ComingSoonNotice";
import { useChapterMediaManifest } from "../../lector/media/use-chapter-media";
import {
  isModeEnabled,
  mediaModeFromManifest,
} from "../../lector/book-experience";
import type { ExperienceSceneContext } from "../scene-contract";
import {
  SceneAction,
  SceneActions,
  SceneBody,
  SceneHeading,
  SceneNote,
} from "./scene-ui";

/**
 * The manifest answer for ONE format, or a fail-closed `false` while it is
 * unknown. Offering a player before the manifest lands would be offering
 * something we cannot yet keep.
 */
function useFormatAvailability(
  kind: "AUDIOBOOK" | "PODCAST" | "VIDEO",
  media: ExperienceSceneContext["media"],
): { ready: boolean; enabled: boolean } {
  const { items } = useChapterMediaManifest({
    apiBase: media?.apiBase ?? "",
    token: media?.token ?? "",
    // The route resolves id-or-slug; the slug is what this surface holds.
    bookId: media?.bookSlug ?? "",
    chapterOrder: media?.chapterOrder ?? 0,
    // Only ask once a media panel is actually on screen.
    enabled: media !== null,
  });
  if (media === null) return { ready: false, enabled: false };
  const view = mediaModeFromManifest(kind, items);
  return { ready: items !== null, enabled: isModeEnabled(view) };
}

export function AudioScene({
  scene,
  media,
  goForward,
}: ExperienceSceneContext) {
  const { enabled } = useFormatAvailability(
    scene.payload.mediaKind ?? "AUDIOBOOK",
    media,
  );
  return (
    <div data-testid="scene-audio">
      <SceneHeading>{scene.payload.title}</SceneHeading>
      {scene.payload.body.map((line) => (
        <SceneBody key={line}>{line}</SceneBody>
      ))}

      {enabled && media ? (
        // The real player, closed. Opening it is the reader's decision.
        <AudioBar
          apiBase={media.apiBase}
          token={media.token}
          bookId={media.bookSlug}
          chapterOrder={media.chapterOrder}
          initialOpen={false}
          inline
        />
      ) : (
        <ComingSoonNotice
          icon="🎧"
          title="Audio en producción"
          hint="Cuando esté listo aparecerá aquí, sin que tengas que hacer nada."
        />
      )}

      <SceneActions>
        <SceneAction label="Continuar" onClick={goForward} />
      </SceneActions>
    </div>
  );
}

export function VideoScene({
  scene,
  media,
  goForward,
}: ExperienceSceneContext) {
  const { enabled } = useFormatAvailability(
    scene.payload.mediaKind ?? "VIDEO",
    media,
  );
  return (
    <div data-testid="scene-video">
      <SceneHeading>{scene.payload.title}</SceneHeading>
      {scene.payload.body.map((line) => (
        <SceneBody key={line}>{line}</SceneBody>
      ))}

      {enabled ? (
        <SceneNote>
          El video está disponible en el modo Ver de este capítulo.
        </SceneNote>
      ) : (
        <ComingSoonNotice
          icon="🎬"
          title="Video en producción"
          hint="Todavía no existe el archivo. Cuando exista, se verá aquí."
        />
      )}

      <SceneActions>
        <SceneAction label="Continuar" onClick={goForward} />
      </SceneActions>
    </div>
  );
}

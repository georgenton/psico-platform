"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChapterExperienceDefinition } from "@psico/types";

import { createDraftAction } from "../../actions";

/**
 * CMS V1 (#637) — start a new experience.
 *
 * Disabled, with the reason visible, when the chapter publishes no guide. An
 * experience only means something bound to a guide's steps, and inventing one
 * so the button stays enabled would be worse than saying there is nothing to
 * bind to.
 *
 * The new draft is the smallest thing the validator accepts: one INTRO scene.
 * Editors add the rest in the editor, where they can see what each kind needs.
 */
export function NewExperienceButton({
  bookSlug,
  chapterOrder,
  guideAvailable,
  lineageExists,
  contentUnitId,
}: {
  bookSlug: string;
  chapterOrder: number;
  guideAvailable: boolean;
  /**
   * Whether this chapter already has an experience bound to its guide.
   *
   * CMS V1 allows one lineage per guide, because GuideSession is the progress
   * authority: a second key on the same pin would share Start / Continue /
   * Completed with the first. The server refuses it; this stops the UI from
   * offering it in the first place.
   */
  lineageExists: boolean;
  /** The chapter this page was rendered against. See `createDraftAction`. */
  contentUnitId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (guideAvailable && lineageExists) {
    return (
      <span
        className="text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
        data-testid="new-experience-lineage-exists"
      >
        Este capítulo ya tiene una experiencia para su guía. Para cambiarla,
        crea una nueva versión.
      </span>
    );
  }

  if (!guideAvailable) {
    return (
      <span
        className="text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
        data-testid="new-experience-unavailable"
      >
        No hay una guía base disponible para este capítulo.
      </span>
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    // The server overwrites key collisions, status, version and guide pin, so
    // this only has to be a shape the validator accepts.
    const stamp = Date.now().toString(36);
    const definition = {
      experienceKey: `cms-${bookSlug}-c${chapterOrder}-${stamp}`,
      experienceVersion: 1,
      bookSlug,
      chapterOrder,
      title: "Experiencia sin título",
      status: "DRAFT",
      guidePin: { guideKey: "placeholder", guideVersion: 1 },
      scenes: [
        {
          sceneKey: "intro",
          order: 1,
          kind: "INTRO",
          copy: {
            title: "Antes de empezar",
            body: ["Escribe aquí la introducción."],
          },
        },
      ],
    } as unknown as ChapterExperienceDefinition;

    try {
      const created = await createDraftAction(definition, contentUnitId);
      router.push(
        `/dashboard/admin/experiencias/${bookSlug}/${chapterOrder}/borrador/${created.id}`,
      );
    } catch {
      setError("No pudimos crear el borrador.");
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-3">
      {error ? (
        <span className="text-[12.5px]" style={{ color: "#B91C1C" }}>
          {error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => void create()}
        disabled={busy}
        className="rounded-full px-4 text-[13px] font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--color-lavender-500)", minHeight: 44 }}
        data-testid="new-experience"
      >
        {busy ? "Creando…" : "Nueva experiencia"}
      </button>
    </span>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChapterExperienceDefinition } from "@psico/types";

import { createDraftAction } from "../../actions";
import { GuideSelector } from "./GuideSelector";

/**
 * CMS V1 (#637) · C.4 (#639) — start a new experience, on a guide the editor
 * chooses.
 *
 * ── What changed, and why the old gate is gone ──────────────────────────────
 *
 * This used to refuse a second experience in a chapter outright, because the
 * chapter resolved exactly one guide pin and two lineages on it would share
 * progress. C.1 made each card carry its own verdict and C.3A made the
 * reservation structural, so the rule is now the honest one: **one experience
 * per guide**, as many experiences as the chapter has guides. The button no
 * longer decides that — the selector shows which guides are free, and the
 * server decides again under the chapter lock.
 *
 * The pin used to be a `placeholder` string the server overwrote. It is now the
 * editor's choice, sent explicitly, and a choice the server cannot honour is
 * refused rather than silently replaced.
 *
 * The new draft is still the smallest thing the validator accepts: one INTRO
 * scene. Editors add the rest in the editor, where they can see what each kind
 * needs.
 */
export function NewExperienceButton({
  bookSlug,
  chapterOrder,
  contentUnitId,
  bindableGuides,
}: {
  bookSlug: string;
  chapterOrder: number;
  /** The chapter this page was rendered against. See `createDraftAction`. */
  contentUnitId: string | null;
  /**
   * How many guides this chapter could actually bind right now — AVAILABLE or
   * already this chapter's, as the server decided.
   *
   * Zero is a real state with the current catalog: a chapter may have exactly
   * one guide and a definition the build ships may already hold it. Offering a
   * button that opens a form where nothing is selectable would be promising an
   * operation that cannot complete.
   */
  bindableGuides: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pin, setPin] = useState<{
    guideKey: string;
    guideVersion: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    // Guarded in the handler, not only by `disabled`: a double click or a
    // replayed event must not create two drafts and burn two version numbers.
    if (busy || pin === null) return;
    setBusy(true);
    setError(null);

    const stamp = Date.now().toString(36);
    const definition = {
      experienceKey: `cms-${bookSlug}-c${chapterOrder}-${stamp}`,
      experienceVersion: 1,
      bookSlug,
      chapterOrder,
      title: "Experiencia sin título",
      status: "DRAFT",
      guidePin: pin,
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
      // The selection survives the failure: the editor picked a guide, and
      // making them pick it again would punish them for our error.
      setError(
        "No pudimos crear el borrador. Puede que otra persona haya tomado esa guía.",
      );
      setBusy(false);
    }
  }

  if (bindableGuides === 0) {
    return (
      <span
        className="text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
        data-testid="new-experience-no-guide"
      >
        Ninguna guía de este capítulo está libre: o no hay ninguna cuyo pasaje
        viva aquí, o las que hay ya pertenecen a otra experiencia.
      </span>
    );
  }

  if (!choosing) {
    return (
      <button
        type="button"
        onClick={() => setChoosing(true)}
        className="rounded-full px-4 text-[13px] font-semibold text-white"
        style={{ background: "var(--color-lavender-500)", minHeight: 44 }}
        data-testid="new-experience"
      >
        Nueva experiencia
      </button>
    );
  }

  return (
    <div data-testid="new-experience-form">
      <GuideSelector
        bookSlug={bookSlug}
        chapterOrder={chapterOrder}
        experienceKey={null}
        value={pin}
        onChange={setPin}
        disabled={busy}
      />

      {error ? (
        <p
          role="alert"
          className="mt-2 text-[12.5px]"
          style={{ color: "#B91C1C" }}
        >
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || pin === null}
          className="rounded-full px-4 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--color-lavender-500)", minHeight: 44 }}
          data-testid="new-experience-create"
        >
          {busy ? "Creando…" : "Crear borrador"}
        </button>
        <button
          type="button"
          onClick={() => setChoosing(false)}
          disabled={busy}
          className="text-[13px] disabled:opacity-60"
          style={{ color: "var(--color-warm-600)", minHeight: 44 }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

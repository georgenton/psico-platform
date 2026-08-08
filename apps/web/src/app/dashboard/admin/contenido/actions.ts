"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { serverFetch } from "@/lib/api.server";
import type {
  ChapterPreview,
  SaveResult,
  PublishResult,
  StudioBlockInput,
} from "./contracts";

/**
 * Content Studio — the write actions.
 *
 * Thin on purpose. The server resolves the edition, the unit, the placement and
 * the revision from the route; there is nothing here to decide and so nothing
 * that could be decided wrongly.
 *
 * The one thing these DO own is turning a 409 into something the editor can act
 * on. A conflict means somebody else's save landed first, and the correct
 * response is never to retry — retrying is how you overwrite work you never
 * saw. It surfaces as a flag the UI turns into "reload", and the local edits
 * stay exactly where they are.
 */

export interface ActionOutcome<T> {
  ok: boolean;
  data?: T;
  /** The draft moved. Do not retry; reload. */
  conflict?: boolean;
  error?: string;
}

function bookPath(bookSlug: string): string {
  return `/dashboard/admin/contenido/${bookSlug}`;
}

function asOutcome<T>(err: unknown): ActionOutcome<T> {
  if (err instanceof ApiError && err.status === 409) {
    return { ok: false, conflict: true };
  }
  return {
    ok: false,
    error:
      err instanceof ApiError
        ? err.message
        : "No pudimos completar la operación.",
  };
}

export async function saveChapterDraftAction(
  bookSlug: string,
  chapterOrder: number,
  input: {
    expectedRevisionId: string;
    title: string;
    summary: string | null;
    durationMinutes: number | null;
    blocks: StudioBlockInput[];
  },
): Promise<ActionOutcome<SaveResult>> {
  try {
    const saved = await serverFetch<SaveResult>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/draft`,
      { method: "PUT", body: JSON.stringify(input) },
    );
    // The book page shows "N capítulos con cambios"; it just changed.
    revalidatePath(bookPath(bookSlug));
    return { ok: true, data: saved };
  } catch (err) {
    return asOutcome<SaveResult>(err);
  }
}

/** Read the chapter as it would appear, from the draft. Never writes. */
export async function previewChapterAction(
  bookSlug: string,
  chapterOrder: number,
  revisionId: string,
): Promise<ActionOutcome<ChapterPreview>> {
  try {
    const preview = await serverFetch<ChapterPreview>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/preview?revisionId=${encodeURIComponent(revisionId)}`,
    );
    return { ok: true, data: preview };
  } catch (err) {
    return asOutcome<ChapterPreview>(err);
  }
}

/**
 * Publish the BOOK's draft.
 *
 * Edition-scoped, and the wording everywhere says so. A draft accumulates edits
 * across chapters, so "publish this chapter" would be a promise the data model
 * cannot keep.
 */
export async function publishBookAction(
  bookSlug: string,
  expectedDraftRevisionId: string,
): Promise<ActionOutcome<PublishResult>> {
  try {
    const published = await serverFetch<PublishResult>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/publish`,
      { method: "POST", body: JSON.stringify({ expectedDraftRevisionId }) },
    );
    revalidatePath(bookPath(bookSlug));
    return { ok: true, data: published };
  } catch (err) {
    return asOutcome<PublishResult>(err);
  }
}

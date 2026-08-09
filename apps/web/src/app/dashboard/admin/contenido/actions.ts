"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { serverFetch } from "@/lib/api.server";
import type {
  ChapterMediaList,
  MediaCard,
  MediaDraftRef,
  MediaPublishResult,
  MediaUploadResult,
  VideoUploadIntent,
  VideoUploadStatus,
  ChapterImageResult,
  CoverResult,
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
  /**
   * The API envelope's machine-readable code, so the UI can say something
   * specific. `message` is human copy that may change; this is what to switch
   * on.
   */
  code?: string;
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
    code: err instanceof ApiError ? err.code : undefined,
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

/**
 * Upload the catalog cover. Immediate — this is metadata, not content, so there
 * is no draft for it to wait in.
 */
export async function uploadCoverAction(
  bookSlug: string,
  form: FormData,
): Promise<ActionOutcome<CoverResult>> {
  try {
    const uploaded = await serverFetch<CoverResult>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/cover`,
      { method: "POST", body: form },
    );
    revalidatePath(bookPath(bookSlug));
    return { ok: true, data: uploaded };
  } catch (err) {
    return asOutcome<CoverResult>(err);
  }
}

/**
 * Store an illustration's bytes.
 *
 * Deliberately does NOT revalidate anything: no block exists yet and no draft
 * has moved. The image becomes part of the chapter only when the editor saves.
 */
export async function uploadChapterImageAction(
  bookSlug: string,
  chapterOrder: number,
  form: FormData,
): Promise<ActionOutcome<ChapterImageResult>> {
  try {
    const uploaded = await serverFetch<ChapterImageResult>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/images`,
      { method: "POST", body: form },
    );
    return { ok: true, data: uploaded };
  } catch (err) {
    return asOutcome<ChapterImageResult>(err);
  }
}

// ── Chapter media (C2A) ─────────────────────────────────────────────────────
//
// Definitions, not bytes. Nothing here uploads or signs anything.

function chapterPath(bookSlug: string, chapterOrder: number): string {
  return `/dashboard/admin/contenido/${bookSlug}/${chapterOrder}`;
}

export async function listChapterMediaAction(
  bookSlug: string,
  chapterOrder: number,
): Promise<ActionOutcome<ChapterMediaList>> {
  try {
    return {
      ok: true,
      data: await serverFetch<ChapterMediaList>(
        `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/media`,
      ),
    };
  } catch (err) {
    return asOutcome<ChapterMediaList>(err);
  }
}

/**
 * Take over a code-owned definition. The clone keeps the same key and version,
 * so nothing a reader has already completed changes meaning.
 */
export async function adoptChapterMediaAction(
  bookSlug: string,
  chapterOrder: number,
  mediaKey: string,
): Promise<ActionOutcome<MediaDraftRef>> {
  try {
    const data = await serverFetch<MediaDraftRef>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/media/${encodeURIComponent(mediaKey)}/adopt`,
      { method: "POST" },
    );
    revalidatePath(chapterPath(bookSlug, chapterOrder));
    return { ok: true, data };
  } catch (err) {
    return asOutcome<MediaDraftRef>(err);
  }
}

export async function createChapterMediaAction(
  bookSlug: string,
  chapterOrder: number,
  body: { kind: string; title: string; description: string },
): Promise<ActionOutcome<MediaDraftRef>> {
  try {
    const data = await serverFetch<MediaDraftRef>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/media`,
      { method: "POST", body: JSON.stringify(body) },
    );
    revalidatePath(chapterPath(bookSlug, chapterOrder));
    return { ok: true, data };
  } catch (err) {
    return asOutcome<MediaDraftRef>(err);
  }
}

export async function updateMediaDraftAction(
  draftId: string,
  body: {
    title: string;
    description: string;
    durationSec: number | null;
    chapters: Array<{ startSec: number; label: string }>;
  },
): Promise<ActionOutcome<MediaCard>> {
  try {
    return {
      ok: true,
      data: await serverFetch<MediaCard>(
        `/pulso/content/media/drafts/${encodeURIComponent(draftId)}`,
        { method: "PUT", body: JSON.stringify(body) },
      ),
    };
  } catch (err) {
    return asOutcome<MediaCard>(err);
  }
}

export async function publishMediaDraftAction(
  draftId: string,
  bookSlug: string,
  chapterOrder: number,
): Promise<ActionOutcome<MediaPublishResult>> {
  try {
    const data = await serverFetch<MediaPublishResult>(
      `/pulso/content/media/drafts/${encodeURIComponent(draftId)}/publish`,
      { method: "POST" },
    );
    revalidatePath(chapterPath(bookSlug, chapterOrder));
    return { ok: true, data };
  } catch (err) {
    return asOutcome<MediaPublishResult>(err);
  }
}

// ── Media masters (C2B) ─────────────────────────────────────────────────────
//
// Upload NEVER publishes. Bytes are staged privately and a reader hears nothing
// until `publishMediaMasterAction` runs.

export async function uploadAudiobookAction(
  bookSlug: string,
  chapterOrder: number,
  form: FormData,
): Promise<ActionOutcome<MediaUploadResult>> {
  try {
    const data = await serverFetch<MediaUploadResult>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/media/audiobook/upload`,
      { method: "POST", body: form },
    );
    revalidatePath(chapterPath(bookSlug, chapterOrder));
    return { ok: true, data };
  } catch (err) {
    return asOutcome<MediaUploadResult>(err);
  }
}

export async function uploadPodcastAction(
  bookSlug: string,
  chapterOrder: number,
  form: FormData,
): Promise<ActionOutcome<MediaUploadResult>> {
  try {
    const data = await serverFetch<MediaUploadResult>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/media/podcast/upload`,
      { method: "POST", body: form },
    );
    revalidatePath(chapterPath(bookSlug, chapterOrder));
    return { ok: true, data };
  } catch (err) {
    return asOutcome<MediaUploadResult>(err);
  }
}

/**
 * Publish a staged master. For an audiobook the server also freezes the
 * previous version to its exact bytes before moving the pointer — the editor
 * never sees that, and does not need to.
 */
export async function publishMediaMasterAction(
  draftId: string,
  bookSlug: string,
  chapterOrder: number,
): Promise<ActionOutcome<MediaPublishResult>> {
  try {
    const data = await serverFetch<MediaPublishResult>(
      `/pulso/content/media/drafts/${encodeURIComponent(draftId)}/publish-master`,
      { method: "POST" },
    );
    revalidatePath(chapterPath(bookSlug, chapterOrder));
    return { ok: true, data };
  } catch (err) {
    return asOutcome<MediaPublishResult>(err);
  }
}

// ── Chapter video (C3) ──────────────────────────────────────────────────────
//
// The file does NOT pass through the server or through here. This asks the API
// for a one-time destination; the browser posts the bytes straight to the
// provider and then polls `videoUploadStatusAction` until it lands.

export async function createVideoUploadIntentAction(
  bookSlug: string,
  chapterOrder: number,
  input: { mediaKey?: string; title?: string; description?: string },
): Promise<ActionOutcome<VideoUploadIntent>> {
  try {
    const data = await serverFetch<VideoUploadIntent>(
      `/pulso/content/books/${encodeURIComponent(bookSlug)}/chapters/${chapterOrder}/media/video/upload-intent`,
      { method: "POST", body: JSON.stringify(input) },
    );
    revalidatePath(chapterPath(bookSlug, chapterOrder));
    return { ok: true, data };
  } catch (err) {
    return asOutcome<VideoUploadIntent>(err);
  }
}

/**
 * Ask whether the file landed. This is also what attaches the video to the
 * draft once the provider confirms it — so the editor polling is the same act
 * as the draft becoming publishable.
 */
export async function videoUploadStatusAction(
  draftId: string,
  bookSlug: string,
  chapterOrder: number,
): Promise<ActionOutcome<VideoUploadStatus>> {
  try {
    const data = await serverFetch<VideoUploadStatus>(
      `/pulso/content/media/drafts/${encodeURIComponent(draftId)}/video-status`,
    );
    // Only once it is ready: revalidating on every poll would refetch the whole
    // chapter every two seconds for no change.
    if (data.state === "READY") {
      revalidatePath(chapterPath(bookSlug, chapterOrder));
    }
    return { ok: true, data };
  } catch (err) {
    return asOutcome<VideoUploadStatus>(err);
  }
}

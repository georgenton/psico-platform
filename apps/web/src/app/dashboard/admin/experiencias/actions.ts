"use server";

import { revalidatePath } from "next/cache";
import type {
  ChapterExperienceDefinition,
  ChapterExperiencePublicView,
  SelectableGuideOption,
} from "@psico/types";

import { serverFetch } from "@/lib/api.server";

/**
 * CMS V1 (#637) — the write actions.
 *
 * Every one of them is a thin pass-through. The server owns status, version,
 * `publishedAt`, the acting user and the guide binding, so there is nothing for
 * this layer to decide and nothing it could get wrong by deciding it.
 *
 * ── `expectedContentUnitId` ─────────────────────────────────────────────────
 *
 * C.3A added one field, and it is the opposite of a shortcut. It carries the
 * chapter the page was RENDERED against, so the server can compare it with the
 * chapter it re-derives and refuse when they differ. It is never used as the
 * answer: sending a unit id does not bind anything to it. What it buys is that
 * an editor pressing publish on a page opened before a reorder gets a refusal
 * they can see, instead of a write against whichever chapter now answers to
 * that number.
 */

function chapterPath(bookSlug: string, chapterOrder: number): string {
  return `/dashboard/admin/experiencias/${bookSlug}/${chapterOrder}`;
}

/**
 * The hint, or nothing at all.
 *
 * Omitted rather than sent as `null` when the page had no identity to echo —
 * a chapter that resolves to no unit, or a legacy row the backfill has not
 * reached. The DTO treats absent as "no claim"; sending an explicit null would
 * mean the same thing while looking like an assertion.
 */
function hint(expectedContentUnitId?: string | null): {
  expectedContentUnitId?: string;
} {
  return expectedContentUnitId ? { expectedContentUnitId } : {};
}

export async function createDraftAction(
  definition: ChapterExperienceDefinition,
  expectedContentUnitId?: string | null,
): Promise<{ id: string }> {
  const created = await serverFetch<{ id: string }>(
    "/pulso/experiences/drafts",
    {
      method: "POST",
      body: JSON.stringify({ definition, ...hint(expectedContentUnitId) }),
    },
  );
  revalidatePath(chapterPath(definition.bookSlug, definition.chapterOrder));
  return created;
}

/**
 * C.4 — the guides this chapter may bind, with availability from the SERVER.
 *
 * Not filtered in the browser. A list narrowed here would be a suggestion the
 * server has to re-derive anyway, and the two could disagree for exactly as
 * long as it takes a colleague to reserve the same guide.
 */
export async function listSelectableGuidesAction(
  bookSlug: string,
  chapterOrder: number,
  experienceKey: string | null,
): Promise<SelectableGuideOption[]> {
  const query = new URLSearchParams({
    bookSlug,
    chapterOrder: String(chapterOrder),
  });
  if (experienceKey) query.set("experienceKey", experienceKey);
  return serverFetch<SelectableGuideOption[]>(
    `/pulso/experiences/guides?${query.toString()}`,
  );
}

/** C.4 — move a draft to another guide. Refused once anything was published. */
export async function rebindDraftAction(
  bookSlug: string,
  chapterOrder: number,
  id: string,
  guidePin: { guideKey: string; guideVersion: number },
): Promise<{ id: string }> {
  const result = await serverFetch<{ id: string }>(
    `/pulso/experiences/drafts/${id}/binding`,
    { method: "PATCH", body: JSON.stringify({ guidePin }) },
  );
  revalidatePath(chapterPath(bookSlug, chapterOrder));
  return result;
}

/**
 * C.4 — archive a draft: terminal, and not a delete.
 *
 * The row stays, its version number is never reused, and its definition keeps
 * the guide it was bound to. What the chapter gets back is the guide itself.
 */
export async function archiveDraftAction(
  bookSlug: string,
  chapterOrder: number,
  id: string,
): Promise<{ id: string }> {
  const result = await serverFetch<{ id: string }>(
    `/pulso/experiences/drafts/${id}/archive`,
    { method: "POST" },
  );
  revalidatePath(chapterPath(bookSlug, chapterOrder));
  return result;
}

/** Clone a published version — database or code-owned — forward as a draft. */
export async function createNextDraftAction(
  bookSlug: string,
  chapterOrder: number,
  experienceKey: string,
  experienceVersion: number,
  expectedContentUnitId?: string | null,
): Promise<{ id: string }> {
  const created = await serverFetch<{ id: string }>(
    `/pulso/experiences/${encodeURIComponent(experienceKey)}/${experienceVersion}/draft`,
    {
      method: "POST",
      body: JSON.stringify(hint(expectedContentUnitId)),
    },
  );
  revalidatePath(chapterPath(bookSlug, chapterOrder));
  return created;
}

export async function saveDraftAction(
  id: string,
  definition: ChapterExperienceDefinition,
  expectedContentUnitId?: string | null,
): Promise<{ id: string }> {
  const saved = await serverFetch<{ id: string }>(
    `/pulso/experiences/drafts/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify({ definition, ...hint(expectedContentUnitId) }),
    },
  );
  revalidatePath(chapterPath(definition.bookSlug, definition.chapterOrder));
  return saved;
}

export async function publishDraftAction(
  bookSlug: string,
  chapterOrder: number,
  id: string,
  expectedContentUnitId?: string | null,
): Promise<{ id: string; publishedAt: string }> {
  const published = await serverFetch<{ id: string; publishedAt: string }>(
    `/pulso/experiences/drafts/${encodeURIComponent(id)}/publish`,
    { method: "POST", body: JSON.stringify(hint(expectedContentUnitId)) },
  );
  // The reader's chapter surface changes the moment this succeeds.
  revalidatePath(chapterPath(bookSlug, chapterOrder));
  revalidatePath(`/dashboard/biblioteca/${bookSlug}/lector/${chapterOrder}`);
  return published;
}

/**
 * The draft as a reader would receive it. Saves first, so what is previewed is
 * what is on screen — and mapped by the server, so RECALL options come from the
 * same catalog the reader's copy does.
 */
export async function previewDraftAction(
  id: string,
  definition: ChapterExperienceDefinition,
  expectedContentUnitId?: string | null,
): Promise<ChapterExperiencePublicView> {
  await saveDraftAction(id, definition, expectedContentUnitId);
  return serverFetch<ChapterExperiencePublicView>(
    `/pulso/experiences/drafts/${encodeURIComponent(id)}/preview`,
  );
}

"use server";

import { revalidatePath } from "next/cache";
import type { ChapterExperienceDefinition } from "@psico/types";

import { serverFetch } from "@/lib/api.server";

/**
 * CMS V1 (#637) — the write actions.
 *
 * Every one of them is a thin pass-through. The server owns status, version,
 * `publishedAt`, the acting user and the guide binding, so there is nothing for
 * this layer to decide and nothing it could get wrong by deciding it.
 */

function chapterPath(bookSlug: string, chapterOrder: number): string {
  return `/dashboard/admin/experiencias/${bookSlug}/${chapterOrder}`;
}

export async function createDraftAction(
  definition: ChapterExperienceDefinition,
): Promise<{ id: string }> {
  const created = await serverFetch<{ id: string }>(
    "/pulso/experiences/drafts",
    {
      method: "POST",
      body: JSON.stringify({ definition }),
    },
  );
  revalidatePath(chapterPath(definition.bookSlug, definition.chapterOrder));
  return created;
}

/** Clone a published version — database or code-owned — forward as a draft. */
export async function createNextDraftAction(
  bookSlug: string,
  chapterOrder: number,
  experienceKey: string,
  experienceVersion: number,
): Promise<{ id: string }> {
  const created = await serverFetch<{ id: string }>(
    `/pulso/experiences/${encodeURIComponent(experienceKey)}/${experienceVersion}/draft`,
    { method: "POST" },
  );
  revalidatePath(chapterPath(bookSlug, chapterOrder));
  return created;
}

export async function saveDraftAction(
  id: string,
  definition: ChapterExperienceDefinition,
): Promise<{ id: string }> {
  const saved = await serverFetch<{ id: string }>(
    `/pulso/experiences/drafts/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify({ definition }) },
  );
  revalidatePath(chapterPath(definition.bookSlug, definition.chapterOrder));
  return saved;
}

export async function publishDraftAction(
  bookSlug: string,
  chapterOrder: number,
  id: string,
): Promise<{ id: string; publishedAt: string }> {
  const published = await serverFetch<{ id: string; publishedAt: string }>(
    `/pulso/experiences/drafts/${encodeURIComponent(id)}/publish`,
    { method: "POST" },
  );
  // The reader's chapter surface changes the moment this succeeds.
  revalidatePath(chapterPath(bookSlug, chapterOrder));
  revalidatePath(`/dashboard/biblioteca/${bookSlug}/lector/${chapterOrder}`);
  return published;
}

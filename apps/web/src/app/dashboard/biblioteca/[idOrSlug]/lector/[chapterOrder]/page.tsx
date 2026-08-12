import { notFound, redirect } from "next/navigation";
import type { ReaderChapterRef } from "@psico/types";
import { readerChapterPath } from "@psico/types";

import { ApiError } from "@/lib/api";
import { isNextThrow, serverFetch } from "@/lib/api.server";

export const dynamic = "force-dynamic";

type Params = { idOrSlug: string; chapterOrder: string };

/**
 * The positional reader URL — a LOCATOR now, not an identity (Phase B.A).
 *
 * Kept working for every link and bookmark that already exists. It resolves
 * whatever currently sits at that position and redirects once to that chapter's
 * canonical URL. It does not remember history: if a chapter later moves away
 * from position 2, `/lector/2` means whatever is at 2 now — which is exactly
 * what a locator should mean, and why identity had to move into the path.
 *
 * Resolved through the READ-ONLY locator endpoint rather than the reader:
 * the reader upserts a `ReadingSession` and `ReaderPreferences`, so redirecting
 * through it would record that somebody started a chapter they only passed
 * through, and it would surface in their history and Continue Reading.
 */
export default async function PositionalChapterPage({
  params,
}: {
  params: Params;
}) {
  const order = Number(params.chapterOrder);
  if (!Number.isInteger(order) || order < 1) notFound();

  let readerRef: ReaderChapterRef;
  let bookSlug = params.idOrSlug;
  try {
    const located = await serverFetch<{
      readerRef: ReaderChapterRef;
      bookSlug: string;
    }>(`/lector/${encodeURIComponent(params.idOrSlug)}/locator/${order}`);
    readerRef = located.readerRef;
    // `idOrSlug` may be an id; the canonical URL should carry the slug.
    bookSlug = located.bookSlug ?? params.idOrSlug;
  } catch (err) {
    if (isNextThrow(err)) throw err;
    if (err instanceof ApiError && err.status === 404) notFound();
    // 403 (PRO_REQUIRED) bubbles to the dashboard error boundary, exactly as it
    // did when this route rendered the reader itself.
    throw err;
  }

  redirect(readerChapterPath(bookSlug, readerRef));
}

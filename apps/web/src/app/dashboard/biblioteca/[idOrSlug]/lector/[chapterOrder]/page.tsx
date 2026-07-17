import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type {
  BookManifest,
  ContentUnitRead,
  LectorChapterResponse,
} from "@psico/types";

import { ApiError } from "@/lib/api";
import { getAccessToken, isNextThrow, serverFetch } from "@/lib/api.server";
import { LectorShell } from "@/components/dashboard/lector/LectorShell";

export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

type Params = { idOrSlug: string; chapterOrder: string };

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  try {
    const order = Number(params.chapterOrder);
    const detail = await serverFetch<LectorChapterResponse>(
      `/lector/${encodeURIComponent(params.idOrSlug)}/${order}`,
    );
    return {
      title: `${detail.chapter.title} · ${detail.book.title}`,
      description: detail.chapter.subtitle ?? undefined,
    };
  } catch (err) {
    if (isNextThrow(err)) throw err;
    return { title: "Lector" };
  }
}

/**
 * Resolve a chapter's blocks from Content Core (CC-6B).
 *
 * The lector envelope still owns the book/session/prefs/marks/audio, but the
 * block TEXT is now sourced from the canonical store: manifest (slug → server
 * editionKey + ordered units) → the unit at this reading order → its blocks.
 * The dual-read is fail-closed server-side, so a book never backfilled to
 * Content Core is served from legacy transparently (`source: "legacy"`).
 *
 * Returns `null` (→ "contenido temporalmente no disponible") only on a genuine
 * fault we must not mask: a CONTENT_CORE_INTEGRITY_ERROR (500), a retired/
 * missing unit (404), or a manifest whose order doesn't include this chapter.
 * We NEVER silently fall back to the lector's own blocks.
 */
async function resolveContentUnit(
  bookSlug: string,
  order: number,
): Promise<ContentUnitRead | null> {
  try {
    const manifest = await serverFetch<BookManifest>(
      `/content/books/${encodeURIComponent(bookSlug)}/manifest`,
    );
    const mu = manifest.units.find((u) => u.order === order);
    if (!mu) return null; // manifest inconsistency — fail closed, no legacy fallback.
    return await serverFetch<ContentUnitRead>(
      `/content/editions/${encodeURIComponent(manifest.editionKey)}/units/${encodeURIComponent(mu.unitKey)}`,
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    // 404 (retired unit) or 500 (CONTENT_CORE_INTEGRITY_ERROR) → unavailable,
    // never legacy. Any auth error would have already tripped the lector fetch.
    if (err instanceof ApiError) return null;
    throw err;
  }
}

/**
 * Lector route — Sprint S6-front, CC-6B block source.
 *
 * The server fetches the chapter envelope once at SSR time so the first paint
 * shows real content (helps Lighthouse, helps perceived speed, lets users
 * without JS at least see the text) and resolves the block text from Content
 * Core in the same request. All interactivity — highlights, annotations,
 * heartbeat, preferences — moves to the `LectorShell` client component.
 *
 * We deliberately pass the access token as a prop. The client component
 * uses it to call the API directly from the browser; that's the only way
 * to share the user's session with our client-side fetch without going
 * through Next.js Server Actions for every interaction (annotation create,
 * highlight delete, heartbeat tick — those happen too often).
 */
export default async function LectorPage({ params }: { params: Params }) {
  const order = Number(params.chapterOrder);
  if (!Number.isInteger(order) || order < 1) notFound();

  const accessToken = getAccessToken();
  if (!accessToken) notFound(); // Middleware should redirect; this is belt-and-suspenders.

  let chapter: LectorChapterResponse;
  try {
    chapter = await serverFetch<LectorChapterResponse>(
      `/lector/${encodeURIComponent(params.idOrSlug)}/${order}`,
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    if (err instanceof ApiError && err.status === 404) notFound();
    // For 403 (PRO_REQUIRED on chapter 2+ of a PRO book) we let the error
    // bubble — the dashboard error boundary shows the user-facing message.
    throw err;
  }

  // Use the canonical book slug from the envelope (params.idOrSlug may be an id).
  const unit = await resolveContentUnit(
    chapter.book.slug,
    chapter.chapter.order,
  );

  return (
    <LectorShell
      apiBase={API_BASE}
      token={accessToken}
      initial={chapter}
      unit={unit}
      bookSlug={params.idOrSlug}
    />
  );
}

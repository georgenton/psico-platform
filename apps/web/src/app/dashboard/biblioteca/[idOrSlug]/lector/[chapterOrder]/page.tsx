import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { LectorChapterResponse } from "@psico/types";

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
 * Lector route — Sprint S6-front.
 *
 * The server fetches the chapter once at SSR time so the first paint shows
 * real content (helps Lighthouse, helps perceived speed, lets users without
 * JS at least see the text). All interactivity — highlights, annotations,
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

  return (
    <LectorShell
      apiBase={API_BASE}
      token={accessToken}
      initial={chapter}
      bookSlug={params.idOrSlug}
    />
  );
}

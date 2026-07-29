"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChapterMediaAccessResponse,
  ChapterMediaManifestResponse,
  ChapterMediaSummary,
} from "@psico/types";

/**
 * GR-2 — the reader's data access for chapter media.
 *
 * Three calls, in the order the person's attention moves:
 *
 *   1. the manifest, once, when they open Escuchar or Ver — metadata only;
 *   2. the access, only after they pick a format — this is the only response
 *      that carries a signed URL, so it is never requested during render and
 *      never cached;
 *   3. the completion, once, when the player reports it reached the end.
 *
 * Plain `fetch` with the Bearer the reader already holds, matching `AudioBar`.
 * A failed completion is a SECONDARY failure: playback must not break because
 * a bookkeeping call did not land, so the caller gets a retry affordance
 * instead of an error state over the player.
 */

export type MediaFetchError = "pro_required" | "not_found" | "other";

function classify(status: number): MediaFetchError {
  if (status === 403) return "pro_required";
  if (status === 404) return "not_found";
  return "other";
}

export function useChapterMediaManifest(input: {
  apiBase: string;
  token: string;
  bookId: string;
  chapterOrder: number;
  /** Only fetch once the person actually opened a media surface. */
  enabled: boolean;
}) {
  const { apiBase, token, bookId, chapterOrder, enabled } = input;
  const [items, setItems] = useState<ChapterMediaSummary[] | null>(null);
  const [error, setError] = useState<MediaFetchError | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${apiBase}/lector/${encodeURIComponent(bookId)}/${chapterOrder}/media`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (cancelled) return;
        if (!res.ok) {
          setError(classify(res.status));
          return;
        }
        const body = (await res.json()) as ChapterMediaManifestResponse;
        if (cancelled) return;
        setItems(body.items);
      } catch {
        if (!cancelled) setError("other");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, apiBase, token, bookId, chapterOrder]);

  return { items, error };
}

/** Requests a signed URL for one media, on demand. */
export function useChapterMediaAccess(input: {
  apiBase: string;
  token: string;
}) {
  const { apiBase, token } = input;

  return useCallback(
    async (
      mediaKey: string,
    ): Promise<
      | { ok: true; access: ChapterMediaAccessResponse }
      | { ok: false; error: MediaFetchError }
    > => {
      try {
        const res = await fetch(
          `${apiBase}/lector/media/${encodeURIComponent(mediaKey)}/access`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return { ok: false, error: classify(res.status) };
        const access = (await res.json()) as ChapterMediaAccessResponse;
        return { ok: true, access };
      } catch {
        return { ok: false, error: "other" };
      }
    },
    [apiBase, token],
  );
}

/**
 * Reports one completion. No body, no context: the server derives the kind,
 * the version, the editorial unit and the idempotency key from `mediaKey`.
 *
 * Safe to call more than once — a replay returns 200 and writes no second row,
 * which is exactly why the retry button below is harmless.
 */
export function useChapterMediaCompletion(input: {
  apiBase: string;
  token: string;
}) {
  const { apiBase, token } = input;
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const report = useCallback(
    async (mediaKey: string): Promise<boolean> => {
      try {
        const res = await fetch(
          `${apiBase}/lector/media/${encodeURIComponent(mediaKey)}/complete`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          setFailedKey(mediaKey);
          return false;
        }
        setFailedKey(null);
        return true;
      } catch {
        setFailedKey(mediaKey);
        return false;
      }
    },
    [apiBase, token],
  );

  return { report, failedKey };
}

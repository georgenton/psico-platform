import type { UserMeResponse } from "@psico/types";
import { apiClient } from "@psico/api-client";

/**
 * Fase D (V2, decision L4) — client-side consent check for the on-device
 * reflection text analysis (TXT-L1). Twin of the web helper
 * (apps/web/src/lib/text-analysis-consent.ts).
 *
 * The REAL gate is server-side (403 without opt-in); this just avoids
 * analyzing/uploading when the user never consented. Cached in RAM for the
 * app session; the settings toggle updates the cache. Fails CLOSED.
 */

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function setTextAnalysisConsentCache(value: boolean): void {
  cached = value;
  inflight = null;
}

export async function textAnalysisConsent(): Promise<boolean> {
  if (cached !== null) return cached;
  if (!inflight) {
    inflight = apiClient
      .get<UserMeResponse>("/user/me")
      .then((me) => Boolean(me?.privacy?.localTextAnalysis))
      .catch(() => false)
      .then((value) => {
        cached = value;
        return value;
      });
  }
  return inflight;
}

/**
 * Fase D (V2, decision L4) — client-side consent check for the on-device
 * reflection text analysis (TXT-L1).
 *
 * The REAL gate is server-side (`POST /emotional-map/text-features` → 403
 * without opt-in); this helper just avoids analyzing/uploading when the user
 * never consented. Cached per tab session; the settings toggle updates the
 * cache so composers react without a reload. Fails CLOSED (no token / fetch
 * error → false), matching the default-off consent.
 */

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function setTextAnalysisConsentCache(value: boolean): void {
  cached = value;
  inflight = null;
}

export async function textAnalysisConsent(
  apiBase: string,
  token: string | null,
): Promise<boolean> {
  if (cached !== null) return cached;
  if (!token) return false;
  if (!inflight) {
    inflight = fetch(`${apiBase}/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const me = (await res.json().catch(() => null)) as {
          privacy?: { localTextAnalysis?: boolean };
        } | null;
        return Boolean(me?.privacy?.localTextAnalysis);
      })
      .catch(() => false)
      .then((value) => {
        cached = value;
        return value;
      });
  }
  return inflight;
}

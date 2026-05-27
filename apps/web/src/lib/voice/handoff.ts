/**
 * Voice → Diario handoff (Sprint front-voz).
 *
 * The Voz screen is a separate route. When the user clicks "Usar este texto"
 * we stash the transcript in sessionStorage and navigate to `?return=…`.
 * The destination page (Diario composer) reads + clears the key on mount.
 *
 * Why sessionStorage and not query params:
 *   - Transcripts can be hundreds of chars; URL length caps + URL-encoding
 *     them produces ugly history entries that show plaintext.
 *   - sessionStorage is per-tab, cleared on close — no cross-tab leakage.
 *   - The transcript NEVER touches Next.js routing layer (no server prerender).
 *
 * Why NOT localStorage:
 *   - The transcript is private content. localStorage persists across tabs
 *     and survives reloads; if the user closes the Diario tab before they
 *     encrypt the entry, the plaintext would linger. sessionStorage is
 *     scoped to the tab — closing it drops the data.
 *
 * Threat model: a malicious extension or XSS could still read sessionStorage.
 * That's acceptable for v1 — the same attacker would also see the typed
 * plaintext in the composer's React state. sessionStorage doesn't widen the
 * surface.
 */

const HANDOFF_KEY = "psico_voice_transcript_handoff";

export interface VoiceTranscriptHandoff {
  /** Plaintext transcript returned by /voz/transcribe + optionally edited. */
  text: string;
  /** ISO timestamp — useful if the consumer wants to expire stale handoffs. */
  createdAt: string;
}

export function setVoiceHandoff(text: string): void {
  try {
    sessionStorage.setItem(
      HANDOFF_KEY,
      JSON.stringify({
        text,
        createdAt: new Date().toISOString(),
      } satisfies VoiceTranscriptHandoff),
    );
  } catch {
    // sessionStorage can throw in private-mode Safari. Swallow — user will
    // see the transcript on the next screen as empty and can retake or
    // type. Better than a crash.
  }
}

/**
 * Reads + clears the handoff. Returns null if absent or unparseable.
 * Designed to be called in a `useEffect` once per mount; do NOT call
 * during render or you'll re-trigger React's strict-mode double-fire.
 */
export function consumeVoiceHandoff(): VoiceTranscriptHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as VoiceTranscriptHandoff;
    if (typeof parsed?.text !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

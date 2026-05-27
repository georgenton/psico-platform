/**
 * Voice → Diario handoff (Sprint front-voz, mobile).
 *
 * In-memory singleton for cross-screen state passing on a single navigation
 * hop. The transcript lives in JS heap only — it's gone when the app
 * process exits, the user backgrounds the app long enough to be killed, or
 * either screen calls `consumeVoiceHandoff`.
 *
 * Why not AsyncStorage:
 *   - AsyncStorage is async and persists across launches. We don't want a
 *     transcript to survive an app kill — privacy-friendly default.
 *   - The handoff lifecycle is "Voz screen → push → Diario screen mount":
 *     both live in the same JS context, no need to serialise to disk.
 *
 * Threat model: a debugger attached to the running app could read the
 * module state. Same threat as React `useState`; we're not making it worse.
 */

export interface VoiceTranscriptHandoff {
  text: string;
  createdAt: string;
}

let pending: VoiceTranscriptHandoff | null = null;

export function setVoiceHandoff(text: string): void {
  pending = { text, createdAt: new Date().toISOString() };
}

/**
 * Read + clear. Designed for `useEffect(() => { ... }, [])` on the Diario
 * screen mount. Returns null when there's nothing waiting.
 */
export function consumeVoiceHandoff(): VoiceTranscriptHandoff | null {
  const v = pending;
  pending = null;
  return v;
}

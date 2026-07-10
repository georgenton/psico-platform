/**
 * Reader → Eco handoff (Sprint B — Eco contextual).
 *
 * When the user highlights a passage in the reader (or taps a chapter's
 * suggested topic), we stash a short prompt in sessionStorage and navigate to
 * `/dashboard/eco`. EcoShell reads + clears it on mount and pre-fills the
 * composer, so the conversation starts already grounded in what they were
 * reading.
 *
 * Same rationale as the voice→Diario handoff (see lib/voice/handoff.ts):
 * sessionStorage is per-tab and cleared on close; the text never hits the
 * routing layer. Book text is licensed PUBLIC content (not the E2E-encrypted
 * Diario), so there is no privacy concern in carrying a passage this way.
 */

const HANDOFF_KEY = "psico_eco_reader_handoff";

export interface EcoReaderHandoff {
  /** Composer text to pre-fill (passage quote + a lead-in question). */
  text: string;
  /** Where it came from — book slug + chapter, for lightweight analytics. */
  source: {
    bookSlug: string;
    chapterOrder: number;
    kind: "highlight" | "topic";
  };
  createdAt: string;
}

/** Build the pre-fill text from a highlighted passage. */
export function passageToPrompt(passage: string): string {
  const clean = passage.trim().replace(/\s+/g, " ");
  const quote =
    clean.length > 280 ? `${clean.slice(0, 280).trimEnd()}…` : clean;
  return `Estoy leyendo y me quedé pensando en esto:\n\n«${quote}»\n\n¿Me ayudas a profundizarlo?`;
}

export function setEcoReaderHandoff(
  text: string,
  source: EcoReaderHandoff["source"],
): void {
  try {
    sessionStorage.setItem(
      HANDOFF_KEY,
      JSON.stringify({
        text,
        source,
        createdAt: new Date().toISOString(),
      } satisfies EcoReaderHandoff),
    );
  } catch {
    // private-mode Safari can throw — swallow; user just lands on an empty
    // Eco composer, no crash.
  }
}

/**
 * Reads + clears the handoff. Call once in a `useEffect` on the Eco screen.
 * Returns null if absent or unparseable.
 */
export function consumeEcoReaderHandoff(): EcoReaderHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as EcoReaderHandoff;
    if (typeof parsed?.text !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

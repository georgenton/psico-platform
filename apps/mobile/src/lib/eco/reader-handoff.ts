/**
 * Reader → Eco handoff (Sprint B — Eco contextual, mobile).
 *
 * In-memory singleton for a single navigation hop, same pattern as the
 * voice→Diario handoff. When the user taps "Conversar con Eco" on a paragraph
 * or a chapter's suggested topic, we stash a composer prompt here and navigate
 * to the Eco tab, which consumes it on focus.
 *
 * Book text is licensed PUBLIC content (not the E2E-encrypted Diario), so
 * carrying a passage in memory is fine — nothing sensitive, gone on app kill.
 */

import type { EcoScope } from "@psico/types";

export interface EcoReaderHandoff {
  /** Composer text to pre-fill (passage quote + a lead-in question). */
  text: string;
  /** Where it came from — book slug + chapter, for lightweight analytics. */
  source?: {
    bookSlug: string;
    chapterOrder: number;
    kind: "highlight" | "topic";
  };
  /** Optional reading scope carried alongside a chapter-anchored opener. */
  scope?: EcoScope;
  createdAt: string;
}

let pending: EcoReaderHandoff | null = null;

/** Build the composer prompt from a highlighted/tapped passage. */
export function passageToEcoPrompt(passage: string): string {
  const clean = passage.trim().replace(/\s+/g, " ");
  const quote =
    clean.length > 280 ? `${clean.slice(0, 280).trimEnd()}…` : clean;
  return `Estoy leyendo y me quedé pensando en esto:\n\n«${quote}»\n\n¿Me ayudas a profundizarlo?`;
}

export function setEcoReaderHandoff(
  text: string,
  source?: EcoReaderHandoff["source"],
  scope?: EcoScope,
): void {
  pending = {
    text,
    ...(source ? { source } : {}),
    ...(scope ? { scope } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** Read + clear. Call in a `useFocusEffect` on the Eco screen. */
export function consumeEcoReaderHandoff(): EcoReaderHandoff | null {
  const v = pending;
  pending = null;
  return v;
}

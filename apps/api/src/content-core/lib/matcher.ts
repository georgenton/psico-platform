import { similarity } from "./content-hash";

/**
 * Content Core — conservative block matcher (CC-1, pure).
 *
 * Closed decisions (ADR 0016): auto-match ONLY on exact `contentHash` or exact
 * carried `blockKey`; fuzzy accepted ONLY at >= 0.95 AND ONLY when it yields a
 * single candidate. Zero candidates OR two-plus candidates ⇒ no auto-match (the
 * incoming block is treated as new; the unmatched previous block tombstones).
 * There is deliberately NO 0.8 tier.
 */

export const FUZZY_MIN = 0.95;

export interface PrevBlock {
  blockKey: string;
  contentHash: string;
  content: string;
}

export interface NewBlockInput {
  contentHash: string;
  content: string;
  /** Present only when the caller already carries a stable key (e.g. an editor). */
  blockKey?: string;
}

export type MatchResult =
  | { kind: "exact-key"; blockKey: string }
  | { kind: "exact-hash"; blockKey: string }
  | { kind: "fuzzy-unique"; blockKey: string; score: number }
  | { kind: "none" };

export function matchBlock(nb: NewBlockInput, prev: PrevBlock[]): MatchResult {
  if (nb.blockKey) {
    const byKey = prev.find((p) => p.blockKey === nb.blockKey);
    if (byKey) return { kind: "exact-key", blockKey: byKey.blockKey };
  }

  const byHash = prev.find((p) => p.contentHash === nb.contentHash);
  if (byHash) return { kind: "exact-hash", blockKey: byHash.blockKey };

  const candidates = prev
    .map((p) => ({ p, score: similarity(nb.content, p.content) }))
    .filter((s) => s.score >= FUZZY_MIN)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 1) {
    return {
      kind: "fuzzy-unique",
      blockKey: candidates[0].p.blockKey,
      score: candidates[0].score,
    };
  }

  // zero OR ambiguous (>= 2) → never a coin-flip re-attach
  return { kind: "none" };
}

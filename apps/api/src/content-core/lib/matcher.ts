import { similarity } from "./content-hash";

/**
 * Content Core — conservative, FAIL-CLOSED block matcher (CC-1, pure).
 *
 * Closed decisions (ADR 0016) + fail-closed rule: content-based matching is
 * scoped to the SAME `kind`, and any ambiguity yields `none` (the incoming block
 * is treated as new; the unmatched previous block tombstones). Order:
 *   1. exact carried `blockKey` (identity — wins unconditionally);
 *   2. exact `contentHash`, ONLY if exactly one available same-kind candidate;
 *   3. fuzzy >= 0.95, ONLY if exactly one same-kind candidate;
 *   4. anything else (zero OR ambiguous) → none.
 *
 * `.find()` is NEVER used to disambiguate duplicate hashes — duplicates fail closed.
 */

export const FUZZY_MIN = 0.95;

export interface PrevBlock {
  blockKey: string;
  kind: string;
  contentHash: string;
  content: string;
}

export interface NewBlockInput {
  kind: string;
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
  // 1. Carried stable key is identity — wins regardless of kind/content.
  //    blockKey is unique, so at most one can match.
  if (nb.blockKey) {
    const byKey = prev.find((p) => p.blockKey === nb.blockKey);
    if (byKey) return { kind: "exact-key", blockKey: byKey.blockKey };
  }

  // Content-based matching is scoped to the SAME kind (a HEADING never matches a
  // PARAGRAPH, even with identical text).
  const sameKind = prev.filter((p) => p.kind === nb.kind);

  // 2. Exact contentHash — ONLY if exactly one same-kind candidate. Two or more
  //    same-hash blocks are ambiguous → fail closed (never .find() the first).
  const hashMatches = sameKind.filter((p) => p.contentHash === nb.contentHash);
  if (hashMatches.length > 1) return { kind: "none" };
  if (hashMatches.length === 1) {
    return { kind: "exact-hash", blockKey: hashMatches[0].blockKey };
  }

  // 3. Fuzzy >= 0.95 — ONLY if exactly one same-kind candidate.
  const fuzzy = sameKind
    .map((p) => ({ p, score: similarity(nb.content, p.content) }))
    .filter((s) => s.score >= FUZZY_MIN)
    .sort((a, b) => b.score - a.score);
  if (fuzzy.length === 1) {
    return {
      kind: "fuzzy-unique",
      blockKey: fuzzy[0].p.blockKey,
      score: fuzzy[0].score,
    };
  }

  // 4. Zero OR ambiguous (>= 2) → none.
  return { kind: "none" };
}

import { createHash } from "node:crypto";

/**
 * Content Core — canonical normalization, hashing, and similarity (CC-1, pure).
 *
 * `contentHash` is the exact-match key for the ingest diff; `similarity` is the
 * conservative fuzzy fallback (see matcher.ts). Normalization is NFC + collapsed
 * internal whitespace + trim; casing is PRESERVED (editorial casing is meaningful).
 */

export function normalizeContent(content: string): string {
  return content.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function contentHash(content: string): string {
  return createHash("sha256")
    .update(normalizeContent(content), "utf8")
    .digest("hex");
}

/** Levenshtein edit distance (iterative, O(n) memory). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

/** Normalized similarity in [0,1] over normalized text. 1 = identical. */
export function similarity(a: string, b: string): number {
  const x = normalizeContent(a);
  const y = normalizeContent(b);
  if (x === y) return 1;
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(x, y) / longest;
}

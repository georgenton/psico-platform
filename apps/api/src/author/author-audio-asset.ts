/**
 * Serving an author's own chapter audio out of a private bucket.
 *
 * The cover next to it goes through `/api/content-assets`, which is
 * unauthenticated — fine for a picture printed in a book. Audio does not go
 * there. An author's audio master is the product, so it is read only through
 * `AuthorService.getChapter`, which has already established that this user owns
 * this book, and is signed for an hour at a time.
 *
 * What is PERSISTED in the block is the object key under `meta.key`. What is
 * SENT is `meta.url`, a signed GET minted on the way out. The stored value never
 * expires and the sent one always does.
 *
 * ── Why `meta.url` rows still have to work ────────────────────────────────
 *
 * Before this, the uploader persisted `${R2_PUBLIC_URL}/${key}` into `meta.url`
 * — and that base is the AUTHENTICATED S3 endpoint, so the browser's GET was
 * refused and the audio never played. Those rows exist. Their key is recoverable
 * from the URL, so they are resolved rather than abandoned.
 *
 * The recovery is deliberately narrow: the key must sit under THIS book's audio
 * prefix. Signing whatever a stored string decodes to would turn an author's own
 * chapter into a way to read any object in the bucket, which is the mistake the
 * cover route avoids with its shape allowlist.
 */

/** How long a playable URL lives. Long enough to listen through a chapter. */
export const AUTHOR_AUDIO_SIGNED_TTL_SEC = 60 * 60;

/** The only prefix a given book's audio may live under. */
export function authorAudioPrefix(bookId: string): string {
  return `autor-books/${bookId}/audio/`;
}

/** A block as it sits in the chapter's `blocks` JSON. */
interface AuthorBlock {
  kind?: unknown;
  meta?: unknown;
}

function isAudioBlock(block: unknown): block is AuthorBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as AuthorBlock).kind === "audio"
  );
}

/**
 * The object key behind an audio block, or null when there is nothing we are
 * willing to sign.
 *
 * Two shapes, and only two:
 *   1. `meta.key` — what uploads persist now
 *   2. `meta.url` holding an absolute URL on OUR R2 base — the legacy rows
 *
 * Anything else, including a bare `meta.url` path or a URL on another host, is
 * not ours to sign.
 */
export function authorAudioKeyFrom(
  block: unknown,
  bookId: string,
  r2PublicBase: string | undefined,
): string | null {
  if (!isAudioBlock(block)) return null;
  const meta = (block.meta ?? null) as Record<string, unknown> | null;
  if (!meta) return null;

  const prefix = authorAudioPrefix(bookId);
  const underThisBook = (key: string): string | null => {
    // A traversal segment would let a key climb back out of the prefix it just
    // matched, so it is refused before the prefix is even considered.
    if (!key || key.includes("..") || key.includes("\\")) return null;
    return key.startsWith(prefix) && key.length > prefix.length ? key : null;
  };

  if (typeof meta.key === "string" && meta.key.trim()) {
    return underThisBook(meta.key.trim());
  }

  const stored = typeof meta.url === "string" ? meta.url.trim() : "";
  if (!stored || !/^https?:\/\//i.test(stored) || !r2PublicBase) return null;

  let url: URL;
  let base: URL;
  try {
    url = new URL(stored);
    base = new URL(r2PublicBase);
  } catch {
    return null;
  }
  // Compared on the parsed ORIGIN: a prefix match on the string would accept
  // `https://ours.example.attacker.test/...`.
  if (url.origin !== base.origin) return null;

  const basePath = base.pathname.replace(/\/+$/, "");
  const path = url.pathname;
  if (basePath && !path.startsWith(`${basePath}/`)) return null;

  let key: string;
  try {
    key = decodeURIComponent(
      basePath ? path.slice(basePath.length + 1) : path.replace(/^\/+/, ""),
    );
  } catch {
    // Malformed percent-encoding. Falling back to the raw string is how encoded
    // traversal gets past a check, so this value is simply not served.
    return null;
  }
  return underThisBook(key);
}

/**
 * Replace every audio block's `meta.url` with something the editor can play.
 *
 * Applied where blocks LEAVE the server. A block we cannot resolve loses its
 * `url` rather than keeping one that would fail — the editor already renders a
 * placeholder when a block has no playable source.
 */
export async function withResolvedAudioUrls<T>(
  blocks: T[],
  bookId: string,
  r2PublicBase: string | undefined,
  sign: (key: string) => Promise<string>,
): Promise<T[]> {
  return Promise.all(
    blocks.map(async (block) => {
      if (!isAudioBlock(block)) return block;

      const key = authorAudioKeyFrom(block, bookId, r2PublicBase);
      const meta = {
        ...((block.meta ?? {}) as Record<string, unknown>),
      };
      if (key) {
        meta.url = await sign(key);
        // The key stays on the way out too: the editor round-trips blocks on
        // save, and dropping it would replace a stable identity with an
        // expiring URL the next write would persist.
        meta.key = key;
      } else {
        delete meta.url;
      }
      return { ...block, meta } as T;
    }),
  );
}

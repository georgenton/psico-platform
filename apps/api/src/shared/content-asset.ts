/**
 * Serving chapter illustrations and book covers from a PRIVATE bucket.
 *
 * ── What went wrong ───────────────────────────────────────────────────────
 *
 * `StorageService.uploadFile` returns `${R2_PUBLIC_URL}/${key}` and its
 * docstring says that base is for assets "meant to be public". In production
 * `R2_PUBLIC_URL` is the AUTHENTICATED S3 endpoint
 * (`https://<account>.r2.cloudflarestorage.com/<bucket>`), so the write — which
 * carries SigV4 credentials — succeeds, and the browser GET of that same URL —
 * which carries none — is refused. An editor uploads a JPG, the block appears,
 * and the image never loads.
 *
 * The bucket is right to be private: the same bucket holds audiobook and
 * podcast masters. Making it public to fix an illustration would hand out
 * protected media.
 *
 * ── The shape of the fix ──────────────────────────────────────────────────
 *
 * A first-party route on our own API mints a short-lived signed GET and
 * redirects to it. What we PERSIST is a stable, non-expiring path; what the
 * browser follows expires in minutes. Neither the bucket nor its credentials
 * are exposed, and nothing stored can go stale.
 *
 * The path is RELATIVE (`/api/content-assets/...`) because the API's own public
 * base is not in its environment, and inventing one would mean a config change
 * to fix a rendering bug. Every client already knows where the API lives — it
 * is how they made the request that returned this path.
 *
 * ── The security boundary ─────────────────────────────────────────────────
 *
 * This route signs keys. If it signed ANY key it would be a way to read the
 * whole bucket, audiobook masters included. So it matches keys against the two
 * shapes our own uploaders mint and refuses everything else — not a prefix
 * check but the full shape, which makes traversal, protected prefixes and
 * anything hand-written fail by construction rather than by a blocklist
 * somebody has to remember to update.
 */

/** Where the asset route lives, including the global `api` prefix. */
export const CONTENT_ASSET_ROUTE = "/api/content-assets";

/**
 * How long a redirect target lives.
 *
 * Long enough for a page to finish loading its images, short enough that a URL
 * copied out of devtools is useless by the time it is pasted anywhere. Images
 * are re-requested through the stable path, so this never has to cover a
 * reading session the way the audiobook TTL does.
 */
export const CONTENT_ASSET_SIGNED_TTL_SEC = 5 * 60;

/**
 * The only keys this route will ever sign.
 *
 * Full-shape matches of what `imageObjectKey` produces under the two prefixes
 * `ContentStudioAssetsService` writes. The filename is the 16-hex name the
 * server minted; an uploader's filename never reaches a key, so nothing here
 * has to tolerate arbitrary text.
 */
const ALLOWED_ASSET_KEY = [
  /^catalog-books\/[a-z0-9][a-z0-9-]*\/cover\/[0-9a-f]{16}\.(png|jpg|webp)$/,
  /^content\/[a-z0-9][a-z0-9-]*\/chapter-\d+\/images\/[0-9a-f]{16}\.(png|jpg|webp)$/,
];

/** Is this a key the asset route may sign? */
export function isAllowedAssetKey(key: string): boolean {
  // Belt and braces before the shape check: a key containing a traversal
  // segment or a backslash is refused outright rather than relying on the
  // patterns to have excluded it.
  if (!key || key.includes("..") || key.includes("\\")) return false;
  if (key.startsWith("/")) return false;
  return ALLOWED_ASSET_KEY.some((re) => re.test(key));
}

/** The stable, non-expiring path a client can render or store. */
export function contentAssetPath(key: string): string {
  return `${CONTENT_ASSET_ROUTE}/${key}`;
}

/**
 * The object key behind a value we stored at some point, or null.
 *
 * Three shapes are recognised, and only three:
 *
 *   1. a bare key                     — what uploads persist now
 *   2. our own asset path             — what read surfaces emit
 *   3. an absolute URL on OUR R2 base — what the canary's JPG persisted, and
 *                                       every image uploaded before this fix
 *
 * The third is why this exists. Those rows point at an endpoint no browser can
 * read, and telling the editor to upload the picture again would be hiding the
 * bug rather than fixing it. The URL came from our own uploader, so the key is
 * recoverable from it — but ONLY when the origin is the base we configured. A
 * URL on any other host is not ours to sign and returns null.
 */
export function contentAssetKeyFrom(
  stored: string,
  r2PublicBase: string | undefined,
): string | null {
  const value = stored.trim();
  if (!value) return null;

  // (2) our own route
  const routePrefix = `${CONTENT_ASSET_ROUTE}/`;
  if (value.startsWith(routePrefix)) {
    const key = decodeURIComponent(value.slice(routePrefix.length));
    return isAllowedAssetKey(key) ? key : null;
  }

  // (3) an absolute URL — ours, or nobody's
  if (/^https?:\/\//i.test(value)) {
    if (!r2PublicBase) return null;
    let url: URL;
    let base: URL;
    try {
      url = new URL(value);
      base = new URL(r2PublicBase);
    } catch {
      return null;
    }
    if (url.origin !== base.origin) return null;

    const basePath = base.pathname.replace(/\/+$/, "");
    const path = url.pathname;
    if (basePath && !path.startsWith(`${basePath}/`)) return null;

    const key = decodeURIComponent(
      basePath ? path.slice(basePath.length + 1) : path.replace(/^\/+/, ""),
    );
    return isAllowedAssetKey(key) ? key : null;
  }

  // (1) a bare key
  return isAllowedAssetKey(value) ? value : null;
}

/**
 * What a read surface should hand a client for a stored image value.
 *
 * Null when the value is not something we are willing to serve — a foreign
 * host, a protected-media key, anything malformed. Callers drop the image
 * rather than emitting a URL that would fail or, worse, one that would work
 * when it should not.
 */
export function resolveStoredImageUrl(
  stored: string,
  r2PublicBase: string | undefined,
): string | null {
  const key = contentAssetKeyFrom(stored, r2PublicBase);
  return key ? contentAssetPath(key) : null;
}

/** The shape every block surface shares, whatever else it carries. */
interface BlockWithMeta {
  kind: string;
  meta?: unknown;
}

/**
 * Rewrite the image URL on IMAGE blocks so a client can actually fetch them.
 *
 * Applied where blocks LEAVE the server, not where they are stored: what is
 * stored stays a stable identity, and what is sent is something the browser can
 * follow. It is also what makes the images uploaded before this fix work — they
 * persisted an absolute R2 URL, and their key is recovered here.
 *
 * An image we will not serve has its URL removed rather than passed through.
 * `imageBlockInfo` returns null without one, so every renderer already falls
 * back instead of emitting a broken `<img>`.
 */
export function withResolvedImageUrls<T extends BlockWithMeta>(
  blocks: T[],
  r2PublicBase: string | undefined,
): T[] {
  return blocks.map((block) => {
    if (block.kind !== "IMAGE") return block;

    const meta = (block.meta ?? null) as Record<string, unknown> | null;
    const stored = typeof meta?.imageUrl === "string" ? meta.imageUrl : null;
    if (!stored) return block;

    const resolved = resolveStoredImageUrl(stored, r2PublicBase);
    // Every other `meta` key round-trips untouched — an IMAGE's alt text and
    // credit are not this function's business.
    const next = { ...meta } as Record<string, unknown>;
    if (resolved) next.imageUrl = resolved;
    else delete next.imageUrl;

    return { ...block, meta: next };
  });
}

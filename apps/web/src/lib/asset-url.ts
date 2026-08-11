// The API root — the origin, without the "/api" segment, which asset paths
// already carry.
const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Make a stored image reference loadable in a browser.
 *
 * Chapter illustrations and covers live in a PRIVATE bucket, so what the API
 * returns is a path on the API itself (`/api/content-assets/...`) which
 * redirects to a short-lived signed URL. The path is relative because the API
 * does not know its own public hostname — but every client does, since that is
 * where it just made the request.
 *
 * Absolute URLs pass through untouched: a value already resolved elsewhere, or
 * a legacy row the server chose to leave alone, is not this function's to
 * rewrite.
 */
export function assetUrl(value: string): string {
  if (!value.startsWith("/")) return value;
  return `${API_ROOT.replace(/\/$/, "")}${value}`;
}

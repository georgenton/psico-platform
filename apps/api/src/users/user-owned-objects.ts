/**
 * The R2 objects that belong to ONE person, and how to name them safely.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * `AccountDeletionProcessor` used to call `prisma.user.delete()` and touch
 * storage not at all. Prisma cascades the rows, which takes the KEYS with them —
 * so the objects were left both unreachable and un-deletable by any code path.
 * A person exercised their right to erasure and a complete dump of their data
 * stayed in the bucket forever. That is the hole this closes, and it is an
 * erasure problem rather than a housekeeping one.
 *
 * ── Inventory ─────────────────────────────────────────────────────────────
 *
 * Exactly two prefixes in the bucket are owned by a USER. Established by reading
 * every write path: eight call sites reach `putObject`, and the other six write
 * content the catalog or an author owns, which outlives any single reader.
 *
 *   avatars/<userId>/<16hex>.<ext>          UsersService.uploadAvatar
 *   data-exports/<userId>/<requestId>.json  DataExportProcessor
 *
 * Deliberately NOT here, and not deleted when a reader leaves:
 *
 *   catalog-books/ · content/ · media/ · audio/   the catalog's own content
 *   autor-books/                                  an author's book
 *
 * The voice module stores nothing (`07-voz.md` discards the audio once the
 * transcript is extracted), and `DiaryEntry.audioUrl` is a client-supplied
 * string that no uploader of ours backs with an object.
 *
 * ── Two different derivations, for one concrete reason ─────────────────────
 *
 * An EXPORT key is deterministic — `data-exports/<userId>/<requestId>.json`,
 * the same template before and after the private-bucket migration — so it can be
 * COMPUTED, which is what makes legacy rows (whose `fileUrl` holds an
 * unreadable absolute URL) cleanable at all.
 *
 * An AVATAR key ends in 16 random characters, so it can only be READ back out of
 * `User.avatarUrl`. That column holds four different things, and three of them
 * must never be turned into a delete: a Google `claims.picture`, a pasted
 * third-party URL, and a legacy key whose shape predates the current one. So the
 * parser proves ownership or returns null, and null means we leave it alone.
 */
import {
  CONTENT_ASSET_ROUTE,
  isAvatarAssetPath,
} from "../shared/content-asset";

/** The prefix a given user's avatars live under, and nothing else. */
export function avatarPrefixFor(userId: string): string {
  return `avatars/${userId}/`;
}

/** The prefix a given user's exports live under, and nothing else. */
export function dataExportPrefixFor(userId: string): string {
  return `data-exports/${userId}/`;
}

/**
 * Where one export's bytes live.
 *
 * Computed rather than read from `DataExportRequest.fileUrl`, because the
 * template has never changed: rows written before the migration hold
 * `${R2_PUBLIC_URL}/${key}` for this very key. Computing it is what lets those
 * objects be erased, where parsing their unreadable URL would not.
 *
 * The caller still has to establish that an object was ever written — a PENDING
 * or FAILED request has no bytes — which is what `fileUrl != null` means.
 */
export function dataExportObjectKey(userId: string, requestId: string): string {
  return `${dataExportPrefixFor(userId)}${requestId}.json`;
}

/**
 * The avatar object this user owns, or null when there is nothing of OURS to
 * delete.
 *
 * Returns a key only when the stored value proves, by its full shape, that it is
 * an avatar we minted for THIS user. Everything else is somebody else's bytes or
 * nothing at all:
 *
 *   - an absolute third-party URL (Google, a pasted host) → null
 *   - an absolute URL into our own R2 → null. The key is technically derivable,
 *     but every one of those is a LEGACY avatar whose name was
 *     `<timestamp>.<ext-from-filename>`, a shape the current rules reject. We do
 *     not widen a security boundary to reach them; they need a one-off ops sweep
 *     (reported, not improvised here).
 *   - a path under a different user's prefix → null, and the caller treats that
 *     as a bug rather than a no-op.
 *   - a path in another asset category → null. A cover is a signable asset and
 *     still is not an avatar.
 */
export function avatarObjectKeyFor(
  userId: string,
  storedAvatarUrl: string | null,
): string | null {
  if (!storedAvatarUrl) return null;
  const value = storedAvatarUrl.trim();
  if (!value) return null;

  // Reuses the one definition of what an avatar path looks like, so this and
  // the uploader cannot drift into disagreeing about the same string.
  if (!isAvatarAssetPath(value)) return null;

  const key = value.slice(`${CONTENT_ASSET_ROUTE}/`.length);
  // `isAvatarAssetPath` proved it is SOME user's avatar. This proves it is
  // THIS user's — the difference between erasing one account and reaching into
  // another.
  return key.startsWith(avatarPrefixFor(userId)) ? key : null;
}

/** One object to erase, with the reason it was selected. */
export interface UserOwnedObject {
  key: string;
  kind: "avatar" | "data-export";
}

/**
 * Everything of this user's that lives in the bucket.
 *
 * Takes already-read rows rather than a Prisma client: the account-deletion path
 * reads them inside the locked transaction that decides the deletion, and a
 * helper that opened its own connection would read outside that lock and miss a
 * write the lock was there to serialise.
 */
export function collectUserOwnedObjects(input: {
  userId: string;
  avatarUrl: string | null;
  dataExports: { id: string; fileUrl: string | null }[];
}): UserOwnedObject[] {
  const objects: UserOwnedObject[] = [];

  const avatar = avatarObjectKeyFor(input.userId, input.avatarUrl);
  if (avatar) objects.push({ key: avatar, kind: "avatar" });

  for (const row of input.dataExports) {
    // `fileUrl != null` is the record that bytes were written. PENDING and
    // FAILED requests never uploaded anything, and EXPIRED ones have already
    // had their object deleted and the column cleared.
    if (!row.fileUrl) continue;
    objects.push({
      key: dataExportObjectKey(input.userId, row.id),
      kind: "data-export",
    });
  }

  return objects;
}

/**
 * Last line before a delete: does this key sit inside one of THIS user's two
 * prefixes?
 *
 * Every key reaching the deleter was built by the functions above, so this
 * should never fire. It exists because the cost of being wrong is deleting
 * somebody else's object, and a cheap assertion is a better place to find that
 * out than a bucket.
 */
export function isUserOwnedKey(key: string, userId: string): boolean {
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    return false;
  }
  return (
    key.startsWith(avatarPrefixFor(userId)) ||
    key.startsWith(dataExportPrefixFor(userId))
  );
}

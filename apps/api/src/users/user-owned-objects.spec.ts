import { describe, expect, it } from "vitest";
import {
  avatarObjectKeyFor,
  avatarPrefixFor,
  collectUserOwnedObjects,
  dataExportObjectKey,
  dataExportPrefixFor,
  isUserOwnedKey,
} from "./user-owned-objects";
import { contentAssetPath } from "../shared/content-asset";

/**
 * Which objects an account deletion is allowed to erase.
 *
 * Every refusal here is a delete we are declining to perform on somebody else's
 * bytes — another user's avatar, the catalog's own audio, an author's cover, or
 * a picture hosted by Google. A false positive is unrecoverable: the object is
 * gone and it was not ours to take.
 */

const U = "cmql4vasx0000abcdefghijkl";
const OTHER = "cmqlzzzzz0009abcdefghijkl";
const AVATAR_KEY = `avatars/${U}/0123456789abcdef.png`;

describe("data export keys are computed, not parsed", () => {
  it("derives the key from the owner and the request", () => {
    expect(dataExportObjectKey(U, "req-1")).toBe(
      `data-exports/${U}/req-1.json`,
    );
  });

  it("is why legacy rows are cleanable at all", () => {
    // Rows written before the private-bucket migration hold
    // `${R2_PUBLIC_URL}/${key}` in `fileUrl` — a URL no browser could load.
    // The key template never changed, so it is recoverable WITHOUT parsing that
    // URL, which is the only reason those objects can be erased.
    const objects = collectUserOwnedObjects({
      userId: U,
      avatarUrl: null,
      dataExports: [
        {
          id: "legacy-1",
          fileUrl: `https://acct.r2.cloudflarestorage.com/bucket/data-exports/${U}/legacy-1.json`,
        },
      ],
    });
    expect(objects).toEqual([
      { key: `data-exports/${U}/legacy-1.json`, kind: "data-export" },
    ]);
  });
});

describe("which avatar may be deleted", () => {
  it("accepts our own path for THIS user", () => {
    expect(avatarObjectKeyFor(U, contentAssetPath(AVATAR_KEY))).toBe(
      AVATAR_KEY,
    );
  });

  it("refuses another user's avatar — the difference between erasing and reaching", () => {
    const foreign = contentAssetPath(`avatars/${OTHER}/0123456789abcdef.png`);
    expect(avatarObjectKeyFor(U, foreign)).toBeNull();
  });

  it("refuses a third-party URL, which is somebody else's bytes", () => {
    // Google sign-in writes `claims.picture` into this column. Deleting there
    // is not ours to attempt, and would fail anyway.
    expect(
      avatarObjectKeyFor(U, "https://lh3.googleusercontent.com/a/abc123"),
    ).toBeNull();
    expect(avatarObjectKeyFor(U, "https://cdn.example.test/me.png")).toBeNull();
  });

  it("refuses a legacy absolute URL into our own R2", () => {
    // The key is technically derivable, but every one of these is a legacy
    // avatar named `<timestamp>.<ext-from-filename>` — a shape the current
    // rules reject. Widening the boundary to reach them is the wrong trade; they
    // need a one-off ops pass instead.
    expect(
      avatarObjectKeyFor(
        U,
        `https://acct.r2.cloudflarestorage.com/bucket/avatars/${U}/1759300000000.png`,
      ),
    ).toBeNull();
  });

  it("refuses another asset category", () => {
    expect(
      avatarObjectKeyFor(
        U,
        contentAssetPath(
          "catalog-books/emociones-en-construccion/cover/a1b2c3d4e5f60718.jpg",
        ),
      ),
    ).toBeNull();
  });

  it("refuses traversal and malformed values", () => {
    expect(
      avatarObjectKeyFor(U, `/api/content-assets/avatars/../media/x.m4a`),
    ).toBeNull();
    expect(avatarObjectKeyFor(U, "")).toBeNull();
    expect(avatarObjectKeyFor(U, "   ")).toBeNull();
    expect(avatarObjectKeyFor(U, null)).toBeNull();
  });
});

describe("the whole inventory for one account", () => {
  it("collects the avatar and every export that has bytes", () => {
    const objects = collectUserOwnedObjects({
      userId: U,
      avatarUrl: contentAssetPath(AVATAR_KEY),
      dataExports: [
        { id: "req-1", fileUrl: `data-exports/${U}/req-1.json` },
        { id: "req-2", fileUrl: `data-exports/${U}/req-2.json` },
      ],
    });
    expect(objects).toEqual([
      { key: AVATAR_KEY, kind: "avatar" },
      { key: `data-exports/${U}/req-1.json`, kind: "data-export" },
      { key: `data-exports/${U}/req-2.json`, kind: "data-export" },
    ]);
  });

  it("skips exports that never wrote bytes", () => {
    // PENDING and FAILED requests uploaded nothing; EXPIRED ones already had
    // their object deleted and the column cleared. `fileUrl != null` is the
    // record that bytes exist.
    const objects = collectUserOwnedObjects({
      userId: U,
      avatarUrl: null,
      dataExports: [
        { id: "pending", fileUrl: null },
        { id: "failed", fileUrl: null },
      ],
    });
    expect(objects).toEqual([]);
  });

  it("collects nothing for an account with no objects", () => {
    expect(
      collectUserOwnedObjects({
        userId: U,
        avatarUrl: null,
        dataExports: [],
      }),
    ).toEqual([]);
  });

  it("never collects content, author or another user's keys", () => {
    const objects = collectUserOwnedObjects({
      userId: U,
      // A catalog cover sitting in the avatar column is refused above; this
      // asserts the inventory as a whole emits nothing for it.
      avatarUrl: contentAssetPath(
        "autor-books/cmql4vbi0001abcdefghijkl/cover-fedcba9876543210.jpg",
      ),
      dataExports: [],
    });
    expect(objects).toEqual([]);
  });
});

describe("the last check before a delete", () => {
  it("accepts only this user's two prefixes", () => {
    expect(isUserOwnedKey(AVATAR_KEY, U)).toBe(true);
    expect(isUserOwnedKey(`data-exports/${U}/req-1.json`, U)).toBe(true);
    expect(avatarPrefixFor(U)).toBe(`avatars/${U}/`);
    expect(dataExportPrefixFor(U)).toBe(`data-exports/${U}/`);
  });

  it("refuses every other prefix in the bucket", () => {
    // These are the objects a reader leaving must never take with them.
    for (const key of [
      "media/eec/c1/audiobook/0123456789abcdef.m4a",
      "audio/emociones-en-construccion/1/0123456789abcdef.mp3",
      "catalog-books/eec/cover/a1b2c3d4e5f60718.jpg",
      "content/eec/chapter-1/images/0123456789abcdef.png",
      "autor-books/cmql4vbi0001abcdefghijkl/cover-fedcba9876543210.jpg",
      `avatars/${OTHER}/0123456789abcdef.png`,
      `data-exports/${OTHER}/req-1.json`,
    ]) {
      expect(isUserOwnedKey(key, U)).toBe(false);
    }
  });

  it("refuses traversal, backslashes and absolute paths", () => {
    expect(isUserOwnedKey(`avatars/${U}/../../media/x.m4a`, U)).toBe(false);
    expect(isUserOwnedKey(`avatars\\${U}\\x.png`, U)).toBe(false);
    expect(isUserOwnedKey(`/avatars/${U}/x.png`, U)).toBe(false);
    expect(isUserOwnedKey("", U)).toBe(false);
  });
});

import { registerDecorator, type ValidationOptions } from "class-validator";
import { isAvatarAssetPath } from "../../shared/content-asset";

/**
 * What `User.avatarUrl` is allowed to be.
 *
 * The column legitimately holds two unrelated shapes, which is why a plain
 * `@IsUrl` was the wrong tool:
 *
 *   1. one of OUR paths — `/api/content-assets/avatars/<userId>/<16hex>.<ext>`,
 *      written by `POST /user/avatar` since the bucket went private. `@IsUrl`
 *      rejects it, so a client that round-tripped its own profile would have
 *      been told its own avatar was invalid.
 *   2. an absolute third-party URL — Google sign-in stores `claims.picture`
 *      here, and a user may paste a hosted image.
 *
 * ── Why not simply loosen it ──────────────────────────────────────────────
 *
 * Accepting "any relative string" would be the easy fix and the wrong one. This
 * value is rendered as the `src` of an `<img>` next to a person's name, so what
 * it accepts is what somebody else's browser will fetch. The measured behaviour
 * of the old decorator is the warning: `@IsUrl({ require_tld: false })` already
 * accepted the bare strings `evil.com` and `foo` — no protocol, no host we chose
 * — which resolve against whatever origin renders them. This validator requires
 * an explicit http(s) protocol, so that class of value is refused too. It is
 * stricter than what it replaces on absolute URLs and looser only on the exact
 * path shape this API itself produces.
 */

/** The two accepted shapes, and nothing else. */
export function isAcceptableAvatarValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;

  // (1) our own avatar path. Checked first and by shape, so a cover key, a
  // traversal segment or another category never reaches the URL branch.
  if (isAvatarAssetPath(v)) return true;

  // (2) an absolute URL, parsed rather than pattern-matched. `new URL` is what
  // makes `javascript:alert(1)` and `data:text/html,…` legible as what they are
  // — they parse fine and are rejected on their protocol, which a regex over
  // the string tends to miss. A relative path throws here and is refused.
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Accepts an absolute http(s) URL or one of our own avatar paths.
 *
 * `null` is handled by the DTO's `@ValidateIf`, which is how every other
 * nullable field on that DTO expresses "pass null to clear".
 */
export function IsAvatarUrlOrAssetPath(opts?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: "isAvatarUrlOrAssetPath",
      target: target.constructor,
      propertyName,
      options: opts,
      validator: {
        validate(value: unknown) {
          return isAcceptableAvatarValue(value);
        },
        defaultMessage() {
          // Says what is accepted without echoing the rejected value: the
          // global filter returns this straight to the caller.
          return "avatarUrl must be an absolute http(s) URL or an avatar path issued by POST /user/avatar";
        },
      },
    });
  };
}

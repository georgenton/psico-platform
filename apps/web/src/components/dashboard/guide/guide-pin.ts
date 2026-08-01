/**
 * GR-4 — the web's handle on ONE exact guide.
 *
 * The server decides WHICH guide a reading context implies
 * (`GET /api/guide/discovery/:bookSlug/:chapterOrder`). This module is the
 * shape the web uses to carry that answer around: a `guideKey` and the exact
 * `guideVersion`, together, always.
 *
 * Two things are deliberately absent:
 *
 *   - no "latest version" and no "first registered guide". A pin names one
 *     immutable definition, and a version this build does not know is a
 *     `null`, never a nearby one;
 *   - no inference. Nothing here looks at a `bookSlug` or a `stepKey` prefix
 *     to guess a pin — that decision belongs to the server, and reproducing it
 *     in the browser would create a second authority that can disagree.
 *
 * `guidePinKey` validates SHAPE only: a code-owned key looks like our other
 * catalog keys (lowercase kebab-case) and a version is a positive integer.
 * Whether that shape names a guide this build actually has is the REGISTRY's
 * question, answered by `getExact` returning `null`.
 */

export interface GuidePin {
  guideKey: string;
  guideVersion: number;
}

/** The grammar every code-owned catalog key in this repo follows. */
const GUIDE_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether a value has the shape of a pin. Says nothing about membership. */
export function isGuidePinShape(value: unknown): value is GuidePin {
  if (typeof value !== "object" || value === null) return false;
  const pin = value as Record<string, unknown>;
  return (
    typeof pin.guideKey === "string" &&
    GUIDE_KEY_RE.test(pin.guideKey) &&
    typeof pin.guideVersion === "number" &&
    Number.isInteger(pin.guideVersion) &&
    pin.guideVersion > 0
  );
}

/**
 * The canonical `guideKey@guideVersion` string — the key every per-pin
 * registry and every per-pin storage slot is filed under.
 *
 * `null` for a malformed pin. Callers must treat that as "no guide", never as
 * a reason to reach for a default: a storage key built from a half-valid pin
 * would collide across guides, which is exactly the bug isolation exists to
 * prevent.
 */
export function guidePinKey(pin: unknown): string | null {
  if (!isGuidePinShape(pin)) return null;
  return `${pin.guideKey}@${pin.guideVersion}`;
}

/** Whether two pins name the same immutable definition. */
export function samePin(a: GuidePin, b: GuidePin): boolean {
  return a.guideKey === b.guideKey && a.guideVersion === b.guideVersion;
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guideReaderCopyRegistry } from "./guide-reader-copy";
import type { GuidePin } from "@psico/types";
import { EEC_PIN, PQP_PIN } from "./guide-test-fixtures";

/**
 * Book Experience Standard V1 §7 — the guide says how much of the chapter it
 * covers.
 *
 * The badge already says the FORM («Guía breve»). What it does not say is the
 * SCOPE, and that is the gap the author demo exposed: a reader opening a
 * guided mode on a long chapter reasonably expects the chapter, and finding
 * out afterwards that it was one idea is a disappointment we chose, not one
 * they signed up for.
 *
 * The scope is per pin. Sharing one constant would be convenient today and
 * wrong the moment one guide grows into several micro-guides: its line has to
 * change without touching anyone else's.
 */

const MICRO_GUIDE_SCOPE = "1 idea del capítulo";

/** The registry answers `null` for an unknown pin; a missing guide is a bug. */
function requireCopy(pin: GuidePin) {
  const copy = guideReaderCopyRegistry.getExact(pin);
  if (copy === null) throw new Error(`no reader copy for ${pin.guideKey}`);
  return copy;
}

describe("cover.scope — how much of the chapter this guide covers", () => {
  it("the Emociones guide declares its scope alongside the badge", () => {
    const copy = requireCopy(EEC_PIN);
    expect(copy.cover.eyebrow).toBe("Guía breve");
    expect(copy.cover.scope).toBe(MICRO_GUIDE_SCOPE);
  });

  it("the Parejas guide declares its own, independently", () => {
    const copy = requireCopy(PQP_PIN);
    expect(copy.cover.eyebrow).toBe("Guía breve");
    expect(copy.cover.scope).toBe(MICRO_GUIDE_SCOPE);
  });

  it("scope is per pin, not a shared constant", () => {
    // Both guides happen to say the same thing today, and that is fine — what
    // must not be true is that they say it from the same place. If the scope
    // moved into `SHARED`, one guide growing to three micro-guides would
    // silently rewrite the other's promise.
    const source = readFileSync(
      join(__dirname, "guide-reader-copy.ts"),
      "utf8",
    );
    const shared = source.slice(
      source.indexOf("const SHARED"),
      source.indexOf("// ─── Emociones"),
    );
    expect(shared).not.toContain("scope:");
    // …and it appears once per guide.
    expect(source.match(/^\s+scope: "/gm) ?? []).toHaveLength(2);
  });

  it("every guide the reader can open has a scope", () => {
    for (const pin of [EEC_PIN, PQP_PIN]) {
      const { scope } = requireCopy(pin).cover;
      expect(
        scope.trim().length,
        `${pin.guideKey} has no scope`,
      ).toBeGreaterThan(0);
      // It states an amount, not a mood: the point is what the reader gets.
      expect(scope).toMatch(/capítulo/);
    }
  });
});

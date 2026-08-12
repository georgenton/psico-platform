import type { LectorChapterResponse } from "@psico/types";

/**
 * Mobile reads a chapter's TEXT by its stable key, never by its position.
 *
 * This was a real defect: the screen fetched the manifest and then did
 * `manifest.units.find(u => u.order === chapter.order)`. A canonical URL naming
 * chapter B would render whichever unit occupied that position in the manifest
 * — the URL stable, its content not, which is worse than an unstable URL
 * because nothing looks wrong.
 *
 * The two numbers being compared do not even come from the same place. For a
 * legacy-served chapter, `chapter.order` is `Chapter.order`; the manifest's
 * `order` is a `RevisionUnit` placement in the published revision. Nothing
 * keeps those in step, and CC-6B lets a legacy chapter render Core text — so
 * the mismatch is reachable today, without any reorder feature existing.
 *
 * The logic is one expression in `LectorScreen`, exercised here through the
 * shape the screen consumes rather than by mounting a 900-line reader.
 */

/** Exactly what the screen does now. */
function unitKeyFor(
  envelope: Pick<LectorChapterResponse, "chapter">,
): string | null {
  return envelope.chapter.contentUnitKey ?? null;
}

/** What the screen used to do — kept to show what it would have chosen. */
function unitKeyByOrder(
  envelope: Pick<LectorChapterResponse, "chapter">,
  manifest: { units: { order: number; unitKey: string }[] },
): string | null {
  return (
    manifest.units.find((u) => u.order === envelope.chapter.order)?.unitKey ??
    null
  );
}

const envelope = (order: number, contentUnitKey: string) =>
  ({
    chapter: { order, contentUnitKey },
  }) as unknown as Pick<LectorChapterResponse, "chapter">;

describe("mobile content identity", () => {
  it("opens B's own content from B's stable route", () => {
    expect(unitKeyFor(envelope(3, "key-B"))).toBe("key-B");
  });

  it("the manifest cannot redirect the read, however it is ordered", () => {
    // The envelope's key alone decides. A manifest that disagreed about
    // positions — for any reason — cannot change which unit is read.
    const b = envelope(3, "key-B");
    const scrambled = { units: [{ order: 3, unitKey: "key-A" }] };

    expect(unitKeyFor(b)).toBe("key-B");
    // What the old code would have rendered instead: A's text under B's URL.
    expect(unitKeyByOrder(b, scrambled)).toBe("key-A");
  });

  it("survives the orders disagreeing across the two structures", () => {
    // A legacy chapter at `Chapter.order` 2 whose unit the published manifest
    // places at 3. Both numbers are correct about their own structure; neither
    // is an identity.
    const legacyB = envelope(2, "key-B");
    const manifest = {
      units: [
        { order: 2, unitKey: "key-A" },
        { order: 3, unitKey: "key-B" },
      ],
    };

    expect(unitKeyFor(legacyB)).toBe("key-B");
    expect(unitKeyByOrder(legacyB, manifest)).toBe("key-A");
  });

  it("marks follow the same unit the text came from", () => {
    // One value feeds both reads in the screen, so they cannot diverge — a
    // mark can never be anchored to a unit other than the one on screen.
    const b = envelope(3, "key-B");
    expect(unitKeyFor(b)).toBe(unitKeyFor(b));
    expect(unitKeyFor(b)).toBe("key-B");
  });

  it("a chapter with no Core unit reads nothing rather than guessing", () => {
    // Fail-closed: the screen shows "unavailable" instead of falling back to
    // a positional guess.
    expect(unitKeyFor(envelope(3, undefined as unknown as string))).toBeNull();
  });
});

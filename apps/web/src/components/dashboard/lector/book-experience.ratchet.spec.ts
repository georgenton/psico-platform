import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mediaMode, isModeEnabled } from "./book-experience";

/**
 * Book Experience Standard V1 — the six things the reader must never do again.
 *
 *   TRANSCRIPT_ONLY_AUDIOBOOK_ENABLED=false
 *   TRANSCRIPT_ONLY_VIDEO_ENABLED=false
 *   EMPTY_PUBLISHED_MEDIA_NAVIGATION=false
 *   FAKE_MEDIA_PLAYER=false
 *   CLIENT_INVENTED_MEDIA_SOURCE=false
 *   GUIDE_LIFECYCLE_CHANGED=false
 *
 * The first three are behaviour and are asserted against the view model. The
 * last three are absences, and an absence is only durable if something fails
 * when it stops being true — so they are asserted by reading the source.
 */

const LECTOR_DIR = __dirname;
const PROTOTYPE = join(
  __dirname,
  "..",
  "..",
  "prototypes",
  "book-experience",
  "BookExperiencePrototype.tsx",
);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("ratchet · publication", () => {
  it.each([
    ["TRANSCRIPT_ONLY_AUDIOBOOK_ENABLED=false", "AUDIOBOOK" as const],
    ["TRANSCRIPT_ONLY_VIDEO_ENABLED=false", "VIDEO" as const],
  ])("%s", (_flag, kind) => {
    // A transcript is not a playable item, so it cannot be the thing that
    // turns a mode on. There is no `hasTranscript` input to `mediaMode` at
    // all — the count is the only lever.
    expect(
      isModeEnabled(
        mediaMode({
          kind,
          declaredPublished: true,
          playableItemCount: 0,
          announced: true,
        }),
      ),
    ).toBe(false);
  });

  it("EMPTY_PUBLISHED_MEDIA_NAVIGATION=false", () => {
    for (const kind of ["AUDIOBOOK", "PODCAST", "VIDEO"] as const) {
      const view = mediaMode({
        kind,
        declaredPublished: true,
        playableItemCount: 0,
        announced: true,
      });
      expect(isModeEnabled(view)).toBe(false);
      expect(view.disabledReason).toBe("NO_PLAYABLE_ASSET");
    }
  });
});

describe("ratchet · absences", () => {
  it("FAKE_MEDIA_PLAYER=false — the prototype has no media element", () => {
    const src = stripComments(readFileSync(PROTOTYPE, "utf8"));
    for (const tag of ["<audio", "<video", "<iframe"]) {
      expect(src, `the prototype renders ${tag}`).not.toContain(tag);
    }
  });

  it("CLIENT_INVENTED_MEDIA_SOURCE=0 — the web mints no source of its own", () => {
    // A provider id, a storage key or a signed URL invented in the browser
    // would be a second authority over what exists. The manifest and the
    // access response are the only places those values come from.
    const src = stripComments(
      readFileSync(join(LECTOR_DIR, "book-experience.ts"), "utf8"),
    );
    for (const forbidden of [
      "videoUid",
      "objectKey",
      "posterObjectKey",
      "cloudflarestream",
      "https://",
    ]) {
      expect(src, `book-experience.ts mints ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("GUIDE_LIFECYCLE_CHANGED=false — this PR touches no guide command", () => {
    // The standard renames a tab and adds a badge. It must not reach into the
    // five commands, the ledger or the anchor: those are GR-3/GR-4 contracts
    // with their own tests, and a presentation change is not a reason to move
    // them.
    const src = stripComments(
      readFileSync(join(LECTOR_DIR, "book-experience.ts"), "utf8"),
    );
    for (const forbidden of [
      "createGuideSession",
      "completeGuideSessionStep",
      "submitGuideStepRecall",
      "cancelGuideSession",
      "completeGuideSession",
      "guideApi",
      "idempotencyKey",
    ]) {
      expect(src, `book-experience.ts touches ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("the standard is not a second editorial catalog", () => {
    const src = stripComments(
      readFileSync(join(LECTOR_DIR, "book-experience.ts"), "utf8"),
    );
    // No book slug, no chapter number, no media key: the view model reads what
    // the server said and decides how to show it. It never decides what exists.
    for (const forbidden of [
      "emociones-en-construccion",
      "parejas-que-perduran",
      "mediaKey:",
      "chapterOrder",
    ]) {
      expect(src, `book-experience.ts hardcodes ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});

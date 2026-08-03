import { describe, expect, it } from "vitest";
import type { ChapterMediaSummary } from "@psico/types";
import {
  audioFamilyMode,
  bookMode,
  disabledNotice,
  guidedMode,
  isModeEnabled,
  isModeVisible,
  mediaMode,
  mediaModeFromManifest,
} from "./book-experience";

/**
 * Book Experience Standard V1 — the publication rules, as tests.
 *
 * The author demo showed a mode that looked published and had nothing behind
 * it. Every case here is about the same promise: what the reader is offered is
 * what the reader can actually get. A transcript is not audio, a plan is not a
 * video, and a catalog entry with no asset is a fault we surface as disabled —
 * never as an invitation.
 */

function summary(over: Partial<ChapterMediaSummary>): ChapterMediaSummary {
  return {
    mediaKey: "k",
    mediaVersion: 1,
    kind: "AUDIOBOOK",
    title: "t",
    description: "d",
    durationSec: null,
    availability: "COMING_SOON",
    hasTranscript: false,
    hasCaptions: false,
    chapters: [],
    ...over,
  };
}

describe("1 · the book is always published", () => {
  it("BOOK is PUBLISHED and enabled, with no gate of any kind", () => {
    const view = bookMode();
    expect(view.state).toBe("PUBLISHED");
    expect(isModeEnabled(view)).toBe(true);
    expect(isModeVisible(view)).toBe(true);
    expect(view.disabledReason).toBeUndefined();
  });
});

describe("2–5 · the four-way media rule", () => {
  it("2 · absent from the plan → HIDDEN (no tab, no route, no call)", () => {
    const view = mediaMode({
      kind: "VIDEO",
      declaredPublished: false,
      playableItemCount: 0,
      announced: false,
    });
    expect(view.state).toBe("HIDDEN");
    expect(isModeVisible(view)).toBe(false);
    expect(isModeEnabled(view)).toBe(false);
  });

  it("3 · draft AND announced → COMING_SOON, disabled", () => {
    const view = mediaMode({
      kind: "PODCAST",
      declaredPublished: false,
      playableItemCount: 0,
      announced: true,
    });
    expect(view.state).toBe("COMING_SOON");
    expect(view.disabledReason).toBe("COMING_SOON");
    expect(isModeVisible(view)).toBe(true);
    expect(isModeEnabled(view)).toBe(false);
    expect(disabledNotice(view)).toBe("Próximamente");
  });

  it("4 · draft and NOT announced → HIDDEN, not «próximamente»", () => {
    const view = mediaMode({
      kind: "PODCAST",
      declaredPublished: false,
      playableItemCount: 0,
      announced: false,
    });
    expect(view.state).toBe("HIDDEN");
    expect(disabledNotice(view)).toBeNull();
  });

  it("5 · published with ZERO playable items → fails closed", () => {
    // The catalog says published, nothing can play. That is a fault, not an
    // editorial announcement, so it is reported as one.
    const view = mediaMode({
      kind: "AUDIOBOOK",
      declaredPublished: true,
      playableItemCount: 0,
      announced: true,
    });
    expect(isModeEnabled(view)).toBe(false);
    expect(view.disabledReason).toBe("NO_PLAYABLE_ASSET");
    expect(view.itemCount).toBe(0);
  });
});

describe("6–8 · one real asset is enough, per format", () => {
  it.each([
    ["6 · audiobook", "AUDIOBOOK" as const],
    ["7 · podcast", "PODCAST" as const],
    ["8 · video", "VIDEO" as const],
  ])("%s published with a playable item → enabled", (_why, kind) => {
    const view = mediaMode({
      kind,
      declaredPublished: true,
      playableItemCount: 1,
      announced: true,
    });
    expect(view.state).toBe("PUBLISHED");
    expect(isModeEnabled(view)).toBe(true);
    expect(view.itemCount).toBe(1);
    expect(view.disabledReason).toBeUndefined();
  });

  it("counts every playable item, so a playlist reports its length", () => {
    const view = mediaMode({
      kind: "VIDEO",
      declaredPublished: true,
      playableItemCount: 3,
      announced: true,
    });
    expect(view.itemCount).toBe(3);
  });
});

describe("9–10 · a disabled mode is inert", () => {
  it.each([
    [
      "9 · COMING_SOON does not navigate",
      mediaMode({
        kind: "VIDEO",
        declaredPublished: false,
        playableItemCount: 0,
        announced: true,
      }),
    ],
    [
      "10 · NO_PLAYABLE_ASSET does not navigate",
      mediaMode({
        kind: "VIDEO",
        declaredPublished: true,
        playableItemCount: 0,
        announced: true,
      }),
    ],
  ])("%s", (_why, view) => {
    // `isModeEnabled` is the single predicate the reader consults before it
    // switches mode or mounts a media surface. False here is what keeps both
    // the navigation and the playback call from happening.
    expect(isModeEnabled(view)).toBe(false);
  });
});

describe("11–12 · a transcript is not the medium", () => {
  it("11 · a transcript-only audiobook stays disabled", () => {
    const view = mediaModeFromManifest("AUDIOBOOK", [
      summary({
        kind: "AUDIOBOOK",
        availability: "COMING_SOON",
        hasTranscript: true,
      }),
    ]);
    expect(isModeEnabled(view)).toBe(false);
    expect(view.itemCount).toBe(0);
  });

  it("12 · a transcript-only video stays disabled", () => {
    const view = mediaModeFromManifest("VIDEO", [
      summary({
        kind: "VIDEO",
        availability: "COMING_SOON",
        hasTranscript: true,
        hasCaptions: true,
      }),
    ]);
    expect(isModeEnabled(view)).toBe(false);
  });
});

describe("the manifest adapter", () => {
  it("AVAILABLE is the only thing that enables a mode", () => {
    const view = mediaModeFromManifest("AUDIOBOOK", [
      summary({ kind: "AUDIOBOOK", availability: "AVAILABLE" }),
    ]);
    expect(view.state).toBe("PUBLISHED");
    expect(view.itemCount).toBe(1);
  });

  it("a kind missing from the manifest is HIDDEN", () => {
    const view = mediaModeFromManifest("PODCAST", [
      summary({ kind: "AUDIOBOOK", availability: "AVAILABLE" }),
    ]);
    expect(view.state).toBe("HIDDEN");
  });

  it("a manifest that never arrived offers nothing", () => {
    // Null covers both «still loading» and «the request failed». Offering a
    // mode on the strength of a response we do not have is exactly the failure
    // this standard exists to prevent.
    for (const kind of ["AUDIOBOOK", "PODCAST", "VIDEO"] as const) {
      expect(mediaModeFromManifest(kind, null).state).toBe("HIDDEN");
    }
  });

  it("counts only the AVAILABLE entries of its own kind", () => {
    const view = mediaModeFromManifest("VIDEO", [
      summary({ kind: "VIDEO", availability: "AVAILABLE", mediaKey: "v1" }),
      summary({ kind: "VIDEO", availability: "COMING_SOON", mediaKey: "v2" }),
      summary({ kind: "AUDIOBOOK", availability: "AVAILABLE", mediaKey: "a1" }),
    ]);
    expect(view.itemCount).toBe(1);
    expect(view.state).toBe("PUBLISHED");
  });
});

describe("13–14 · the guided experience", () => {
  it("13 · a ready runtime publishes the mode, with the new label", () => {
    const view = guidedMode({ runtimeReady: true, discoveryPending: false });
    expect(view.state).toBe("PUBLISHED");
    expect(view.label).toContain("Experiencia guiada");
    expect(view.label).not.toContain("Lectura guiada");
  });

  it("14 · not ready shows NO guide — never another book's as a fallback", () => {
    for (const pending of [true, false]) {
      const view = guidedMode({
        runtimeReady: false,
        discoveryPending: pending,
      });
      expect(isModeEnabled(view)).toBe(false);
      expect(view.state).toBe("HIDDEN");
    }
  });
});

/**
 * AUDIO_FAMILY_GATING — Escuchar is the audio family, not the audiobook.
 *
 * The narration and the conversation are produced separately, and a chapter
 * can genuinely have one without the other. Gating the tab on the audiobook
 * alone would hide a finished podcast behind a narration nobody has recorded
 * yet — the same «offer you cannot take» this standard exists to prevent, only
 * inverted: an offer withheld rather than an offer broken.
 */
describe("audioFamilyMode", () => {
  const audiobook = (availability: ChapterMediaSummary["availability"]) =>
    summary({ kind: "AUDIOBOOK", mediaKey: "a1", availability });
  const podcast = (availability: ChapterMediaSummary["availability"]) =>
    summary({ kind: "PODCAST", mediaKey: "p1", availability });

  it("AUDIOBOOK available + PODCAST absent → Escuchar enabled", () => {
    const view = audioFamilyMode([audiobook("AVAILABLE")]);
    expect(view.state).toBe("PUBLISHED");
    expect(isModeEnabled(view)).toBe(true);
    expect(view.label).toBe("🎧 Escuchar");
  });

  it("AUDIOBOOK absent + PODCAST available → Escuchar enabled", () => {
    const view = audioFamilyMode([podcast("AVAILABLE")]);
    expect(isModeEnabled(view)).toBe(true);
    expect(view.itemCount).toBe(1);
  });

  it("AUDIOBOOK coming soon + PODCAST available → Escuchar enabled", () => {
    const view = audioFamilyMode([
      audiobook("COMING_SOON"),
      podcast("AVAILABLE"),
    ]);
    expect(isModeEnabled(view)).toBe(true);
    expect(view.itemCount).toBe(1);
  });

  it("AUDIOBOOK coming soon + PODCAST coming soon → Escuchar disabled · Próximamente", () => {
    const view = audioFamilyMode([
      audiobook("COMING_SOON"),
      podcast("COMING_SOON"),
    ]);
    expect(view.state).toBe("COMING_SOON");
    expect(isModeEnabled(view)).toBe(false);
    expect(isModeVisible(view)).toBe(true);
    expect(disabledNotice(view)).toBe("Próximamente");
  });

  it("both absent → Escuchar hidden", () => {
    expect(audioFamilyMode([]).state).toBe("HIDDEN");
    expect(isModeVisible(audioFamilyMode([]))).toBe(false);
  });

  it("a manifest that has not answered offers nothing", () => {
    const view = audioFamilyMode(null);
    expect(view.state).toBe("HIDDEN");
    expect(isModeEnabled(view)).toBe(false);
  });

  it("ignores formats that are not part of the audio family", () => {
    // A published video must not open Escuchar.
    const view = audioFamilyMode([
      summary({ kind: "VIDEO", mediaKey: "v1", availability: "AVAILABLE" }),
    ]);
    expect(view.state).toBe("HIDDEN");
  });
});

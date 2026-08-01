import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  guidePresentationRegistry,
  type GuidePresentation,
} from "./guide-presentation";
import { guideAnchorRegistry } from "./guide-anchor";
import { EEC_PIN, PQP_PIN } from "./guide-test-fixtures";

/**
 * GR-4 — the six things the demo must not do.
 *
 * The Guide is a learning surface. Everything it touches on the wellbeing
 * side — resonances, the emotional map, the mood log, the check-in — belongs
 * to the reader and only ever moves when the reader taps something. A guide
 * that recorded a resonance because a step completed, or pre-selected an
 * emotion because it "knew" how the chapter lands, would be writing the
 * reader's inner life on their behalf. That is the failure this file exists
 * to make impossible to introduce quietly.
 *
 *   RESONANCE_AUTOMATIC=false
 *   EMOTIONAL_MAP_AUTOMATIC_WRITE=false
 *   MOOD_AUTOMATIC_WRITE=false
 *   CHECKIN_PREFILLED=false
 *   GUIDE_DISCOVERY_CLIENT_INFERENCE=0
 *   GUIDE_DISCOVERY_FALLBACK_PIN=0
 *
 * Scope is narrow on purpose: the guide components plus the reader shell that
 * mounts them. A ratchet that swept the whole app would fire on legitimate
 * uses elsewhere (the mood chip DOES write a mood — that is its job) and a
 * noisy ratchet gets deleted.
 */

const GUIDE_DIR = __dirname;
const LECTOR_DIR = join(__dirname, "..", "lector");

function runtimeFiles(dir: string): string[] {
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((full) => statSync(full).isFile())
    .filter(
      (full) => /\.tsx?$/.test(full) && !/\.(spec|test)\.tsx?$/.test(full),
    );
}

/** A comment explaining an absence must never trip a ratchet. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const GUIDE_FILES = runtimeFiles(GUIDE_DIR);
const LECTOR_SHELL = join(LECTOR_DIR, "LectorShell.tsx");
const SCANNED = [...GUIDE_FILES, LECTOR_SHELL];

function sourcesOf(files: string[]): Array<[string, string]> {
  return files.map((f) => [f, stripComments(readFileSync(f, "utf8"))]);
}

describe("firewall · the guide never writes on the reader's behalf", () => {
  it("RESONANCE_AUTOMATIC=false — every resonance is a tap", () => {
    // The ONLY call site is a click handler. A resonance created from an
    // effect, a step completion or a timer would be the guide deciding that
    // something mattered to the reader.
    for (const [file, source] of sourcesOf(SCANNED)) {
      const calls = source.match(/resonancesApi\.\w+/g) ?? [];
      if (calls.length === 0) continue;
      // Confirm/remove live behind `onClick`/`onConfirm`-shaped handlers, never
      // inside a `useEffect` body.
      for (const effect of source.match(/useEffect\([\s\S]*?\n {2}\}/g) ?? []) {
        expect(
          effect,
          `${file} creates a resonance from an effect`,
        ).not.toMatch(/resonancesApi\.(confirm|create|upsert)/);
      }
    }
  });

  it("EMOTIONAL_MAP_AUTOMATIC_WRITE=false — the guide writes no map data", () => {
    for (const [file, source] of sourcesOf(SCANNED)) {
      for (const forbidden of [
        "emotionalMapApi",
        "logTextFeatures",
        "text-features",
      ]) {
        expect(source, `${file} touches the emotional map`).not.toContain(
          forbidden,
        );
      }
    }
  });

  it("MOOD_AUTOMATIC_WRITE=false — no mood is logged from the guide", () => {
    for (const [file, source] of sourcesOf(SCANNED)) {
      for (const forbidden of ["moodApi", "logMood", '"/mood"', "`/mood"]) {
        expect(source, `${file} logs a mood`).not.toContain(forbidden);
      }
    }
  });

  it("CHECKIN_PREFILLED=false — the check-in opens empty", () => {
    // `openMoodCheckin` is called with NO argument anywhere in the reader: the
    // guide hands the reader the surface, not an opinion about how they feel.
    const source = stripComments(readFileSync(LECTOR_SHELL, "utf8"));
    const calls = source.match(/openMoodCheckin\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call, "the check-in is opened with a preselection").toBe(
        "openMoodCheckin()",
      );
    }
  });

  it("GUIDE_DISCOVERY_CLIENT_INFERENCE=0 — the pin is never derived locally", () => {
    for (const [file, source] of sourcesOf(SCANNED)) {
      // A map from slug to guide, or a guess from the chapter number, would be
      // a second authority that can disagree with the server's catalog.
      expect(source, `${file} maps a book slug to a guide`).not.toMatch(
        /["'`]emociones-en-construccion["'`]\s*[:=]\s*\{?\s*guideKey/,
      );
      expect(source, `${file} maps a book slug to a guide`).not.toMatch(
        /["'`]parejas-que-perduran["'`]\s*[:=]\s*\{?\s*guideKey/,
      );
      expect(source, `${file} infers a guide from a step key`).not.toMatch(
        /stepKey\.startsWith\(/,
      );
    }
  });

  it("GUIDE_DISCOVERY_FALLBACK_PIN=0 — the READER path names no guide key", () => {
    /**
     * Scoped to the reader chain, and that scope is the point.
     *
     * The Exploraciones surface (`GuideEntryCard`, `GuidePlayerMount`) DOES
     * name a pin: it is a single static route for one guide, and naming it
     * there is how Session B removed the singleton — the pin is stated at the
     * mount instead of inherited. The reader is the opposite case: its guide
     * depends on which chapter is open, so a literal anywhere in this chain
     * would be a fallback waiting to be reached when discovery says something
     * else.
     */
    const READER_CHAIN = [
      LECTOR_SHELL,
      join(GUIDE_DIR, "use-guide-discovery.ts"),
      join(GUIDE_DIR, "use-guide-run.ts"),
      join(GUIDE_DIR, "guide-web-bundle.ts"),
      join(GUIDE_DIR, "guide-pin.ts"),
      join(GUIDE_DIR, "guide-recovery.ts"),
      join(GUIDE_DIR, "guide-scene.ts"),
      join(GUIDE_DIR, "ReaderGuidePanel.tsx"),
    ];
    for (const [file, source] of sourcesOf(READER_CHAIN)) {
      for (const key of [
        "eec-c1-cuerpo-antes-que-mente",
        "pqp-c1-contacto-sostenido",
      ]) {
        expect(
          source,
          `${file} hardcodes the guide key "${key}"`,
        ).not.toContain(key);
      }
    }
  });
});

describe("firewall · both guides are actually reachable", () => {
  // A firewall that passes because nothing is wired would be worthless.
  it.each([
    ["Emociones", EEC_PIN],
    ["Parejas", PQP_PIN],
  ])(
    "%s has a presentation AND an anchor under its exact pin",
    (_name, pin) => {
      const presentation: GuidePresentation | null =
        guidePresentationRegistry.getExact(pin);
      expect(presentation).not.toBeNull();
      expect(presentation!.guideKey).toBe(pin.guideKey);
      expect(guideAnchorRegistry.getExact(pin)).not.toBeNull();
    },
  );
});

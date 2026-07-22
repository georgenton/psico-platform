import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CC-7.5 — the ratchet over the Guide WEB surface.
 *
 * Scope is deliberately narrow: the guide components, the guide route and the
 * Exploraciones page. It does not scan the backend, where words like `result`
 * or `conceptKey` are legitimate domain terms — a ratchet that fired on those
 * would be noise, and noisy ratchets get deleted.
 *
 *   GUIDE_WEB_ROUTE_COUNT=1
 *   GUIDE_WEB_PRESENTATION_COUNT=1
 *   GUIDE_WEB_START_AUTOMATIC_WITHOUT_RECOVERY=false
 *   GUIDE_WEB_CLIENT_PROGRESS_WRITES=0
 *   GUIDE_WEB_CORRECT_OPTION_REFERENCES=0
 *   GUIDE_WEB_USER_ID_REQUEST_FIELDS=0
 *   GUIDE_WEB_EDITORIAL_CONTEXT_REQUEST_FIELDS=0
 *   GUIDE_WEB_RESULT_REQUEST_FIELDS=0
 */

const GUIDE_DIR = __dirname;
const WEB_SRC = join(__dirname, "..", "..", "..");
const EXPLORACIONES_DIR = join(WEB_SRC, "app", "dashboard", "exploraciones");

function runtimeFiles(dir: string): string[] {
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((full) => statSync(full).isFile())
    .filter(
      (full) => /\.tsx?$/.test(full) && !/\.(spec|test)\.tsx?$/.test(full),
    );
}

/** Comments explaining an absence must never trip a ratchet. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const GUIDE_FILES = runtimeFiles(GUIDE_DIR);

describe("ratchet · guide web surface", () => {
  it("publishes exactly one guide route and one presentation catalog", () => {
    const routes = readdirSync(EXPLORACIONES_DIR)
      .map((entry) => join(EXPLORACIONES_DIR, entry))
      .filter((full) => statSync(full).isDirectory());
    expect(routes).toHaveLength(1);
    expect(relative(EXPLORACIONES_DIR, routes[0]!)).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );
    // No dynamic segment: there is no discovery endpoint to back one.
    expect(routes[0]!.includes("[")).toBe(false);

    const catalogs = GUIDE_FILES.filter((f) =>
      f.endsWith("guide-presentation.ts"),
    );
    expect(catalogs).toHaveLength(1);
  });

  it("never sends a userId, editorial context or a verdict", () => {
    const forbidden = [
      "userId",
      "editionKey",
      "unitKey",
      "editionId",
      "unitId",
      "bookId",
      "revisionId",
      "conceptKey",
      "exerciseKey",
      "itemKey",
      "confirmationKey",
      "completionPolicy",
      "correctOptionKey",
      "evaluationSource",
    ];
    for (const file of GUIDE_FILES) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const key of forbidden) {
        expect(
          source.includes(key),
          `${relative(GUIDE_DIR, file)} → ${key}`,
        ).toBe(false);
      }
    }
  });

  it("never writes progress: no client-side counter feeds a transition", () => {
    for (const file of GUIDE_FILES) {
      const source = stripComments(readFileSync(file, "utf8"));
      // The classic ways a UI starts owning progress.
      expect(source).not.toMatch(/stepsCompleted\s*\+\s*1/);
      expect(source).not.toMatch(/stepsCompleted\s*\+\+/);
      expect(source).not.toMatch(/setStepsCompleted/);
      expect(source).not.toMatch(/setCurrentStep\b/);
      expect(source).not.toMatch(/stepIndex/);
    }
  });

  it("the only guideApi calls are the five commands", () => {
    const player = readFileSync(join(GUIDE_DIR, "GuidePlayer.tsx"), "utf8");
    const calls = [...player.matchAll(/guideApi\.([a-zA-Z]+)\(/g)].map(
      (m) => m[1]!,
    );
    expect([...new Set(calls)].sort()).toEqual([
      "cancelGuideSession",
      "completeGuideSession",
      "completeGuideSessionStep",
      "createGuideSession",
      "submitGuideStepRecall",
    ]);
    // No read endpoint exists — the UI must not invent one.
    expect(player).not.toMatch(/guideApi\.get/);
    expect(player).not.toMatch(/setInterval|setTimeout\s*\(\s*.*poll/i);
  });

  it("shows no correctness verdict anywhere on the surface", () => {
    const surface = [
      ...GUIDE_FILES,
      join(EXPLORACIONES_DIR, "page.tsx"),
      join(EXPLORACIONES_DIR, "eec-c1-cuerpo-antes-que-mente", "page.tsx"),
    ];
    for (const file of surface) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const word of [
        "Respuesta correcta",
        "Incorrecto",
        "Puntuación",
        "aciertos",
      ]) {
        expect(source.includes(word), `${file} → ${word}`).toBe(false);
      }
    }
  });

  it("the guide never enters the Journey list or its components", () => {
    const page = readFileSync(join(EXPLORACIONES_DIR, "page.tsx"), "utf8");
    // The guide card is rendered on its own, not through a journey component.
    expect(page).toMatch(/<GuideEntryCard\s*\/>/);
    expect(page).not.toMatch(/journeys\.(push|concat|unshift)/);
    expect(page).not.toMatch(/ExFeaturedCard\s+journey=\{\s*guide/);
  });
});

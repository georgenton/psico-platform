import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRACTICE_KINDS,
  guideAnchorRegistry,
  guidedChapterConcepts,
  resolveGuideAnchor,
} from "@psico/types";
import { productionGuideRegistry } from "../guide/guide-catalog";
import { productionGuideDiscoveryCatalog } from "../guide/guide-discovery-catalog";
import { validateExperienceDefinition } from "../experience/experience-catalog";
import { toPublicExperienceView } from "../experience/experience-public-view";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";
import { toDefinition } from "./eec-c01-guides-apply";
import {
  loadManifests,
  validateManifests,
  type GuideManifest,
} from "./eec-c01-guides-cli";

/**
 * EEC-C02 · the five guided readings, checked against the chapter that is
 * actually published.
 *
 * The suite of C01 proved the pipeline; this one proves the CONTENT of the
 * second chapter — that each anchor resolves against revisión 11's blocks,
 * that every key a manifest names exists in the catalog that has to answer for
 * it, and that the public half of a recall never carries the answer.
 *
 * It reads the published payload rather than the database on purpose: those
 * bytes are what production serves (verified block by block on 2026-09-04), so
 * an anchor that resolves here resolves there.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const MANIFEST_DIR = join(ROOT, "artifacts/eec/C02/v1.0/feelverse/guides");
const CANONICAL_SHA =
  "f137ee10fb80a3ea91af42d93d7262b98de7101a5eeae37051d765dc12a2188a";
const UNIT_KEY = "f58df2e8-4203-5aa2-83b0-1a8ab79a885a";
const BOOK = "emociones-en-construccion";

const manifests: GuideManifest[] = loadManifests(MANIFEST_DIR);

/** The chapter as Content Core serves it, projected the way the reader sees it. */
const blocks = (
  JSON.parse(
    readFileSync(
      join(ROOT, "artifacts/eec/C02/v1.0/feelverse/unit-payload.json"),
      "utf8",
    ),
  ) as { blocks: { kind: string; content: string }[] }
).blocks.map((b, i) => ({
  id: `blk-${i}`,
  kind: b.kind,
  content: b.content,
  blockKey: `key-${i}`,
  blockVersionId: `ver-${i}`,
}));

describe("EEC-C02 · manifests", () => {
  it("are five, valid, DRAFT and pinned to the published chapter", () => {
    expect(manifests).toHaveLength(5);
    expect(validateManifests(manifests, CANONICAL_SHA)).toEqual([]);
    for (const m of manifests) {
      expect(m.chapterOrder).toBe(2);
      expect(m.unitKey).toBe(UNIT_KEY);
      expect(m.canonicalSha256).toBe(CANONICAL_SHA);
      expect(m.status).toBe("DRAFT");
      expect(m.publishAllowed).toBe(false);
    }
  });

  it("name five distinct readings that borrow nothing from chapter 1", () => {
    expect(manifests.map((m) => m.guideKey)).toEqual([
      "eec-c2-universal-no-significa-uniforme",
      "eec-c2-cultura-gramatica-no-destino",
      "eec-c2-gesto-necesita-contexto",
      "eec-c2-palabras-dan-contorno",
      "eec-c2-rituales-dan-marco-no-guion",
    ]);
    // A C02 target that pointed at a C01 row would merge two chapters'
    // progress under one step.
    for (const m of manifests) {
      expect(m.practiceKey.startsWith("eec-c2-practice-")).toBe(true);
      expect(m.recallKey.startsWith("eec-c2-recall-")).toBe(true);
      expect(JSON.stringify(m)).not.toContain("eec-c1-");
    }
  });

  it("stay out of the reader's route: nothing offers them yet", () => {
    expect(productionGuideDiscoveryCatalog.listContext(BOOK, 2)).toEqual([]);
    for (const m of manifests) {
      expect(
        productionGuideDiscoveryCatalog.offersPin(BOOK, 2, {
          guideKey: m.guideKey,
          guideVersion: 1,
        }),
      ).toBe(false);
    }
  });
});

describe("EEC-C02 · anchors resolve against revisión 11", () => {
  it("each one lands on exactly one paragraph of the published chapter", () => {
    for (const m of manifests) {
      const locator = guideAnchorRegistry.getExact({
        guideKey: m.guideKey,
        guideVersion: 1,
      });
      expect(locator, m.guideKey).toBeTruthy();
      const resolution = resolveGuideAnchor(blocks, locator!);
      expect(resolution.status, m.guideKey).toBe("RESOLVED");
    }
  });

  it("the manifest's heading and fingerprint are the anchor's own", () => {
    for (const m of manifests) {
      const locator = guideAnchorRegistry.getExact({
        guideKey: m.guideKey,
        guideVersion: 1,
      })!;
      expect(locator.sourceHeading).toBe(m.anchors.primary.heading);
      expect(locator.passageLastSentence).toBe(m.anchors.primary.fingerprint);
      // Verbatim from the chapter, emphasis included: the published block
      // carries the Markdown, so a "cleaned up" fingerprint matches nothing.
      const headings = blocks.filter(
        (b) => b.kind === "HEADING" && b.content === locator.sourceHeading,
      );
      const passages = blocks.filter((b) =>
        b.content.includes(locator.passageLastSentence),
      );
      expect(headings, m.guideKey).toHaveLength(1);
      expect(passages, m.guideKey).toHaveLength(1);
    }
  });
});

describe("EEC-C02 · concepts, practices and recalls", () => {
  it("every concept a manifest names is registered for chapter 2", () => {
    const registered = guidedChapterConcepts(BOOK, 2).map((c) => c.key);
    expect(registered).toHaveLength(5);
    for (const m of manifests) expect(registered).toContain(m.conceptKey);
    for (const c of guidedChapterConcepts(BOOK, 2)) {
      expect(c.unitKey).toBe(UNIT_KEY);
    }
  });

  it("every practice exists, in a kind this build can render", () => {
    const pairs = EXERCISE_INGESTION_CATALOG[BOOK] ?? [];
    for (const m of manifests) {
      const pair = pairs.find((p) => p.practice.exerciseKey === m.practiceKey);
      expect(pair, m.practiceKey).toBeTruthy();
      expect(pair!.practice.chapterOrder).toBe(2);
      expect(pair!.practice.practiceKind).toBe(m.practiceKind);
      expect(PRACTICE_KINDS as readonly string[]).toContain(m.practiceKind);
      // The interaction is the content the renderer reads; without it the
      // scene falls back to a button and the design is gone.
      expect(pair!.practice.interaction?.kind).toBe(m.practiceKind);
      // The practice anchors on a heading the chapter really prints.
      expect(
        blocks.some(
          (b) =>
            b.kind === "HEADING" && b.content === pair!.practice.sourceHeading,
        ),
        pair!.practice.sourceHeading,
      ).toBe(true);
    }
  });

  it("every recall asks one question with three options and answers both ways", () => {
    const pairs = EXERCISE_INGESTION_CATALOG[BOOK] ?? [];
    for (const m of manifests) {
      const pair = pairs.find((p) => p.recall.exerciseKey === m.recallKey);
      expect(pair, m.recallKey).toBeTruthy();
      const recall = pair!.recall;
      expect(recall.chapterOrder).toBe(2);
      expect(recall.content.conceptKey).toBe(m.conceptKey);
      expect(recall.content.options).toHaveLength(3);
      expect(recall.content.options.map((o) => o.key)).toContain(
        recall.content.correctOptionKey,
      );
      expect(recall.feedback.correct.length).toBeGreaterThan(20);
      expect(recall.feedback.review.length).toBeGreaterThan(20);
    }
  });
});

describe("EEC-C02 · the definition a draft would store", () => {
  it("is accepted by the catalog validator, pinned to its own guide", () => {
    for (const m of manifests) {
      const def = validateExperienceDefinition(toDefinition(m));
      expect(def.status).toBe("DRAFT");
      expect(def.chapterOrder).toBe(2);
      expect(def.guidePin).toEqual({ guideKey: m.guideKey, guideVersion: 1 });
      // The guide it pins has to be registered, or the draft cannot bind.
      expect(() =>
        productionGuideRegistry.getExact(m.guideKey, 1),
      ).not.toThrow();
      // Scenes open on INTRO and close on SUMMARY, and each obligatory step is
      // completed by exactly one scene.
      const kinds = def.scenes.map((s) => s.kind);
      expect(kinds[0]).toBe("INTRO");
      expect(kinds[kinds.length - 1]).toBe("SUMMARY");
      const completes = def.scenes
        .map(
          (s) =>
            (s as { completesGuideStepKey?: string }).completesGuideStepKey,
        )
        .filter(Boolean);
      expect([...completes].sort()).toEqual(
        m.guideSteps.map((s) => s.stepKey).sort(),
      );
    }
  });

  it("MG02 is the only one that offers a reflection, and it is optional", () => {
    const withReflection = manifests.filter((m) =>
      m.scenes.some((s) => s.kind === "REFLECTION"),
    );
    expect(withReflection.map((m) => m.manifestId)).toEqual(["EEC-C02-MG02"]);
    const scene = withReflection[0].scenes.find(
      (s) => s.kind === "REFLECTION",
    )!;
    expect(scene.optional).toBe(true);
    // What a person writes there stays with them; the manifest says so and the
    // privacy policy says so.
    expect(scene.note).toMatch(/se queda en tu dispositivo/);
  });

  it("the public view carries the question and the options, never the answer", () => {
    for (const m of manifests) {
      const def = validateExperienceDefinition(toDefinition(m));
      const view = toPublicExperienceView(def);
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain("correctOptionKey");
      const pairs = EXERCISE_INGESTION_CATALOG[BOOK] ?? [];
      const recall = pairs.find(
        (p) => p.recall.exerciseKey === m.recallKey,
      )!.recall;
      // The three option keys DO travel — a client has to name the one it
      // picked. What must not travel is which of them is right, and that is a
      // field, not a value: the correct key is indistinguishable from the
      // distractors precisely because all three are here and nothing marks one.
      const scene = view.scenes.find((s) => s.kind === "RECALL") as unknown as {
        payload: { options: { optionKey: string; label: string }[] };
      };
      expect(scene.payload.options.map((o) => o.optionKey).sort()).toEqual(
        recall.content.options.map((o) => o.key).sort(),
      );
      for (const option of scene.payload.options) {
        expect(Object.keys(option).sort()).toEqual(["label", "optionKey"]);
      }
      for (const option of recall.content.options) {
        expect(serialized).toContain(option.label);
      }
    }
  });
});

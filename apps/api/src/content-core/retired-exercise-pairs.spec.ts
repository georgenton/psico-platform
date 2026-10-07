import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { productionGuideRegistry } from "../guide/guide-catalog";
import {
  isStartableGuidePin,
  PRODUCTION_GUIDE_DISCOVERY_ENTRIES,
  PRODUCTION_LEGACY_GUIDE_PINS,
} from "../guide/guide-discovery-catalog";
import {
  EXERCISE_INGESTION_CATALOG,
  materializableExercisePairs,
  practiceSourceHeadings,
} from "./exercise-ingestion-catalog";

/**
 * Historical RESOLUTION and fresh MATERIALIZATION are two different questions,
 * and the EEC C01 pilot is the case that separates them.
 *
 * Its pair was written on 2026-07-21 against the pilot source; the canonical
 * v1.0 manuscript landed on 2026-09-02 without the heading it anchors to. The
 * rows it already produced are referenced by guide steps and by sessions that
 * ran, so the runtime must keep resolving it. A fresh environment, built from
 * the canonical source, has nothing to anchor it to — and asking the ingestion
 * to anchor it there would be asking it to invent editorial text.
 *
 * These tests assert KEYS, COUNTS and the presence or absence of a heading in
 * the canonical file. They never assert prose.
 */

const EEC = "emociones-en-construccion";
const PILOT_PRACTICE = "eec-c1-practice-escucharte-por-dentro";
const PILOT_RECALL = "eec-c1-recall-cuerpo-antes-que-mente";

/** Repo root, from `apps/api/src/content-core/`. */
const REPO_ROOT = resolve(__dirname, "../../../..");
const canonicalChapter = (n: number): string =>
  readFileSync(
    resolve(
      REPO_ROOT,
      `content/books/eec/C${String(n).padStart(2, "0")}/chapter.md`,
    ),
    "utf8",
  );

const pairsOf = (slug: string) => EXERCISE_INGESTION_CATALOG[slug] ?? [];

describe("retired exercise pairs — resolution vs materialization", () => {
  it("A · keeps the retired pilot visible to the consumers that resolve it", () => {
    const keys = pairsOf(EEC).flatMap((p) => [
      p.practice.exerciseKey,
      p.recall.exerciseKey,
    ]);
    // Runtime lookup (recall feedback, the public experience view, guide
    // discovery) walks the whole catalog. Dropping the entry would strand every
    // row and session that already points at these ids.
    expect(keys).toContain(PILOT_PRACTICE);
    expect(keys).toContain(PILOT_RECALL);
  });

  it("B · never offers the retired pilot to a materialization path", () => {
    const keys = materializableExercisePairs(EEC).flatMap((p) => [
      p.practice.exerciseKey,
      p.recall.exerciseKey,
    ]);
    expect(keys).not.toContain(PILOT_PRACTICE);
    expect(keys).not.toContain(PILOT_RECALL);
  });

  it("B · drops exactly the pairs marked retired, and no others", () => {
    for (const slug of Object.keys(EXERCISE_INGESTION_CATALOG)) {
      const all = pairsOf(slug);
      const live = materializableExercisePairs(slug);
      expect(live).toEqual(all.filter((p) => !p.retired));
      expect(live.every((p) => !p.retired)).toBe(true);
    }
  });

  it("C · keeps the rest of C01 materializable", () => {
    const c01 = materializableExercisePairs(EEC).filter(
      (p) => p.practice.chapterOrder === 1,
    );
    // The five-microguide route, written against the canonical v1.0 source.
    expect(c01).toHaveLength(5);
    const source = canonicalChapter(1);
    for (const p of c01) {
      expect(source.split(p.practice.sourceHeading)).toHaveLength(2);
    }
  });

  it("D · keeps C02–C10 materializable against their canonical sources", () => {
    for (let chapter = 2; chapter <= 10; chapter += 1) {
      const pairs = materializableExercisePairs(EEC).filter(
        (p) => p.practice.chapterOrder === chapter,
      );
      expect(pairs.length).toBeGreaterThan(0);
      const source = canonicalChapter(chapter);
      for (const p of pairs) {
        // `split` length 2 ⇒ the heading occurs exactly once: not missing, not
        // ambiguous. Both failure modes are real and the ingestion refuses both.
        expect(source.split(p.practice.sourceHeading)).toHaveLength(2);
      }
    }
  });

  it("E · the canonical C01 source genuinely lacks the retired heading", () => {
    const retired = pairsOf(EEC).find(
      (p) => p.practice.exerciseKey === PILOT_PRACTICE,
    );
    expect(retired?.retired).toBe(true);
    // The premise of the whole fix. If this ever starts matching, the manuscript
    // changed and the retirement should be revisited — not the other way round.
    expect(canonicalChapter(1)).not.toContain(retired!.practice.sourceHeading);
  });

  it("G · asks the editorial ground for nothing the canonical source lacks", () => {
    // `practiceSourceHeadings` is what the validators and fixtures seed from.
    // Every heading it still demands must exist, exactly once, in the canonical
    // chapter that declares it — so a fresh environment cannot fail on
    // EXERCISE_INGEST_SOURCE_MISSING for a target we chose to keep.
    const required = practiceSourceHeadings(EEC);
    expect(required).not.toContain(
      pairsOf(EEC).find((p) => p.practice.exerciseKey === PILOT_PRACTICE)!
        .practice.sourceHeading,
    );
    for (const p of materializableExercisePairs(EEC)) {
      const source = canonicalChapter(p.practice.chapterOrder);
      expect(source.split(p.practice.sourceHeading)).toHaveLength(2);
    }
  });

  it("F · keeps seedPracticeHeadings out of the production path", () => {
    // The helper creates whatever headings the catalog asks for. That is right
    // for a fixture and wrong everywhere else: it would paper over exactly the
    // mismatch these tests exist to surface. A production file reaching for it
    // is the bug, so the boundary is a ratchet rather than a convention.
    const SRC = resolve(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== "node_modules") walk(full);
          continue;
        }
        if (!/\.ts$/.test(entry)) continue;
        if (/\.(spec|e2e-spec|pg-spec)\.ts$/.test(entry)) continue;
        if (full.includes("/test-support/")) continue;
        const body = readFileSync(full, "utf8");
        if (!body.includes("seedPracticeHeadings")) continue;
        // One exemption, and it is earned rather than granted by filename: a
        // throwaway-environment builder may seed headings as long as it refuses
        // to run on a deployed box BEFORE it opens a connection. `eec-c01-e2e-
        // seed.ts` is that file today. Anything else reaching for the helper is
        // a production path and fails here.
        const refusesDeployedBoxes =
          body.includes("resolveEnvironment") &&
          /env === "production" \|\| env === "staging"/.test(body);
        if (!refusesDeployedBoxes) offenders.push(full.slice(SRC.length + 1));
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});

describe("retired pilot — the three states, stated separately", () => {
  const PILOT_GUIDE = "eec-c1-cuerpo-antes-que-mente";
  const CURRENT_GUIDE = "eec-c1-teorias-como-lentes";

  it("REGISTERED · the pin still resolves, so pinned sessions keep working", () => {
    expect(() =>
      productionGuideRegistry.getExact(PILOT_GUIDE, 1),
    ).not.toThrow();
    const def = productionGuideRegistry.getExact(PILOT_GUIDE, 1);
    expect(def.steps).toHaveLength(3);
  });

  it("STARTABLE · no new session may begin from it", () => {
    expect(isStartableGuidePin(PILOT_GUIDE, 1)).toBe(false);
  });

  it("STARTABLE · a current guide still may — absence from the list is the default", () => {
    expect(isStartableGuidePin(CURRENT_GUIDE, 1)).toBe(true);
    // A guide out of discovery while editorial prepares it must still start by
    // exact pin, so discovery is deliberately NOT the criterion.
    expect(isStartableGuidePin("una-guia-que-nadie-ofrece-todavia", 1)).toBe(
      true,
    );
  });

  it("STARTABLE · the refusal is per VERSION, not per key", () => {
    // Retiring @1 says nothing about a @2 that editorial may approve later.
    expect(isStartableGuidePin(PILOT_GUIDE, 2)).toBe(true);
  });

  it("DISCOVERABLE · the pilot is not offered as a route", () => {
    const offered = PRODUCTION_GUIDE_DISCOVERY_ENTRIES.map(
      (e) => `${e.pin.guideKey}@${e.pin.guideVersion}`,
    );
    expect(offered).not.toContain(`${PILOT_GUIDE}@1`);
  });

  it("DISCOVERABLE · but it stays in the legacy pins a rolling deploy binds", () => {
    // Not the same question as startability: this map exists so the previous
    // binary keeps meaning what it meant, and it shrinks on its own schedule.
    const legacy = PRODUCTION_LEGACY_GUIDE_PINS.map(
      (e) => `${e.pin.guideKey}@${e.pin.guideVersion}`,
    );
    expect(legacy).toContain(`${PILOT_GUIDE}@1`);
  });
});

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLI_ERRORS,
  loadManifests,
  validateManifests,
  type GuideManifest,
} from "./eec-c01-guides-cli";
import {
  createDrafts,
  previewReport,
  publishTestSuite,
  toDefinition,
  verifyDrafts,
  PUBLISH_REFUSED_ON_DEPLOYED,
  type DraftCreator,
} from "./eec-c01-guides-apply";
import { assertWriteAllowed, parseArgs } from "./eec-c01-guides-main";
import { productionGuideDiscoveryCatalog } from "../guide/guide-discovery-catalog";

/**
 * EEC-C01 — the manifests and the CLI's decisions, without a database.
 *
 * The pg-spec proves the chain works against PostgreSQL. This proves the things
 * that must hold before anything is allowed near a database: that the manifests
 * describe what they claim to, that a tampered one is refused rather than
 * applied, that every draft carries its OWN pin, and that a write on a deployed
 * box needs somebody to say so out loud.
 */

const ROOT = join(process.cwd(), "../..");
const MANIFEST_DIR = join(ROOT, "artifacts/eec/C01/v1.0/feelverse/guides");
const CHAPTER = join(ROOT, "content/books/eec/C01/chapter.md");
const PILOT = "eec-c1-cuerpo-antes-que-mente";

const MANIFESTS = loadManifests(MANIFEST_DIR);
const CANONICAL = createHash("sha256")
  .update(readFileSync(CHAPTER, "utf8"), "utf8")
  .digest("hex");

/** A deep copy, so a mutation in one case cannot leak into the next. */
const clone = (): GuideManifest[] =>
  JSON.parse(JSON.stringify(MANIFESTS)) as GuideManifest[];

const codes = (m: readonly GuideManifest[], sha = CANONICAL) =>
  validateManifests(m, sha).map((i) => i.code);

describe("EEC-C01 · the manifests", () => {
  it("there are exactly five, in route order, at version 1", () => {
    expect(MANIFESTS).toHaveLength(5);
    expect(MANIFESTS.map((m) => m.manifestId)).toEqual([
      "EEC-C01-MG01",
      "EEC-C01-MG02",
      "EEC-C01-MG03",
      "EEC-C01-MG04",
      "EEC-C01-MG05",
    ]);
    expect(MANIFESTS.every((m) => m.experienceVersion === 1)).toBe(true);
    expect(MANIFESTS.every((m) => m.guideVersion === 1)).toBe(true);
  });

  it("they validate against the canonical chapter", () => {
    expect(validateManifests(MANIFESTS, CANONICAL)).toEqual([]);
  });

  it("each declares its own guide, and none is the pilot", () => {
    expect(new Set(MANIFESTS.map((m) => m.guideKey)).size).toBe(5);
    expect(MANIFESTS.map((m) => m.guideKey)).not.toContain(PILOT);
  });

  it("the checksum is over the manifest itself, so an edit is caught", () => {
    const m = clone();
    m[2].scenes[0].title = "Otro título";
    expect(codes(m)).toContain(CLI_ERRORS.checksumMismatch);
  });

  it("a manifest built against another chapter is refused", () => {
    expect(codes(MANIFESTS, "0".repeat(64))).toEqual(
      Array(5).fill(CLI_ERRORS.canonicalMismatch),
    );
  });

  it("PUBLISHED, or publishable, is refused — this phase drafts only", () => {
    const a = clone();
    a[0].status = "PUBLISHED";
    a[0].manifestSha256 = "";
    expect(codes(a)).toContain(CLI_ERRORS.manifestInvalid);

    const b = clone();
    b[0].publishAllowed = true;
    expect(codes(b)).toContain(CLI_ERRORS.publishNotAllowed);
  });

  it("a manifest that mentions the pilot anywhere is refused", () => {
    const m = clone();
    m[1].conceptKey = "eec-c1-cuerpo-antes-que-mente";
    expect(codes(m)).toContain(CLI_ERRORS.pilotReferenced);
  });

  it("two manifests may not claim the same guide, experience or target", () => {
    const m = clone();
    m[3].guideKey = m[0].guideKey;
    expect(codes(m)).toContain(CLI_ERRORS.manifestInvalid);
  });

  it("a guide the build does not register is refused", () => {
    const m = clone();
    m[0].guideKey = "eec-c1-una-guia-que-no-existe";
    expect(codes(m)).toContain(CLI_ERRORS.unknownGuide);
  });

  it("scenes open on INTRO, close on SUMMARY, and carry the four kinds", () => {
    for (const m of MANIFESTS) {
      expect(m.scenes[0].kind).toBe("INTRO");
      expect(m.scenes[m.scenes.length - 1].kind).toBe("SUMMARY");
      expect(m.scenes.map((s) => s.order)).toEqual(
        m.scenes.map((_, i) => i + 1),
      );
      for (const kind of ["PASSAGE", "CONCEPT", "PRACTICE", "RECALL"]) {
        expect(m.scenes.some((s) => s.kind === kind)).toBe(true);
      }
      expect(m.scenes.length).toBeGreaterThanOrEqual(7);
      expect(m.scenes.length).toBeLessThanOrEqual(8);
    }
  });

  it("a broken scene sequence is refused", () => {
    const m = clone();
    m[0].scenes = m[0].scenes.filter((s) => s.kind !== "RECALL");
    expect(codes(m)).toContain(CLI_ERRORS.manifestInvalid);
  });

  it("three guide steps, in the order the reader walks them", () => {
    for (const m of MANIFESTS) {
      expect(m.guideSteps.map((s) => s.kind)).toEqual([
        "CONCEPT_EXPLORATION",
        "CATALOG_PRACTICE",
        "ACTIVE_RECALL",
      ]);
      expect(m.guideSteps.map((s) => s.targetKey)).toEqual([
        m.conceptKey,
        m.practiceKey,
        m.recallKey,
      ]);
    }
  });

  it("every privacy answer is no, and a yes is refused", () => {
    for (const m of MANIFESTS) {
      expect(Object.values(m.privacyPolicy).every((v) => v === false)).toBe(
        true,
      );
    }
    const m = clone();
    m[0].privacyPolicy.storesFreeText = true;
    expect(codes(m)).toContain(CLI_ERRORS.manifestInvalid);
  });

  it("a correct answer never appears in a manifest", () => {
    expect(JSON.stringify(MANIFESTS)).not.toContain("correctOptionKey");
    const m = clone() as unknown as Record<string, unknown>[];
    m[0].correctOptionKey = "opcion-1";
    expect(codes(m as unknown as GuideManifest[])).toContain(
      CLI_ERRORS.manifestInvalid,
    );
  });

  it("this suite ships without media, and says so", () => {
    for (const m of MANIFESTS) {
      const media = (m as unknown as { media?: Record<string, unknown> }).media;
      expect(media).toEqual({ audio: null, video: null });
    }
  });
});

describe("EEC-C01 · the definition a draft is created from", () => {
  it("always carries its own pin — never the chapter fallback", () => {
    for (const m of MANIFESTS) {
      const def = toDefinition(m);
      expect(def.guidePin).toEqual({ guideKey: m.guideKey, guideVersion: 1 });
      expect(def.guidePin?.guideKey).not.toBe(PILOT);
      expect(def.status).toBe("DRAFT");
    }
    // Explicitly: the fallback the service would have used answers with the
    // pilot, which is why leaving `guidePin` off is not an option here.
    expect(
      productionGuideDiscoveryCatalog.getExactContext(
        "emociones-en-construccion",
        1,
      )?.guideKey,
    ).toBe(PILOT);
  });

  it("keeps the manifest's scene order and carries no grading datum", () => {
    for (const m of MANIFESTS) {
      const def = toDefinition(m);
      expect(def.scenes.map((s) => s.kind)).toEqual(
        m.scenes.map((s) => s.kind),
      );
      expect(JSON.stringify(def)).not.toContain("correctOptionKey");
    }
  });
});

// ── The write decisions, with fakes standing in for the database ────────────

interface Row {
  id: string;
  status: string;
  guideKey: string | null;
  definitionJson?: unknown;
  experienceKey?: string;
}

function fakeDb(rows: Record<string, Row> = {}) {
  return {
    chapterExperienceVersion: {
      findUnique: ({
        where,
      }: {
        where: { experienceKey_experienceVersion: { experienceKey: string } };
      }) =>
        Promise.resolve(
          rows[where.experienceKey_experienceVersion.experienceKey] ?? null,
        ),
      // `where.experienceKey` is honoured — verify asks two different
      // questions of this table, and a fake that answers both with everything
      // makes the pilot look like one of the drafts.
      findMany: (args?: {
        where?: { experienceKey?: string | { in: string[] } };
      }) => {
        const want = args?.where?.experienceKey;
        const keep = (k: string) =>
          want === undefined
            ? true
            : typeof want === "string"
              ? k === want
              : want.in.includes(k);
        return Promise.resolve(
          Object.entries(rows)
            .filter(([experienceKey]) => keep(experienceKey))
            .map(([experienceKey, r]) => ({
              ...r,
              experienceKey,
              experienceVersion: 1,
              contentUnitId: "unit-1",
            })),
        );
      },
      findFirst: () => Promise.resolve(null),
    },
  } as never;
}

function fakeCreator(): DraftCreator & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    createDraft: (userId, input, unit) => {
      calls.push([userId, input, unit]);
      return Promise.resolve({ id: `draft-${calls.length}` });
    },
  };
}

describe("EEC-C01 · create-drafts", () => {
  it("a dry run creates nothing and says so", async () => {
    const service = fakeCreator();
    const r = await createDrafts(
      fakeDb(),
      service,
      MANIFESTS,
      "u1",
      false,
      "unit-1",
    );
    expect(service.calls).toHaveLength(0);
    expect(r.applied).toBe(false);
    expect(r.drafts.map((d) => d.action)).toEqual(Array(5).fill("SKIPPED"));
  });

  it("sends every pin explicitly, plus the unit the plan resolved", async () => {
    const service = fakeCreator();
    await createDrafts(fakeDb(), service, MANIFESTS, "u1", true, "unit-1");
    expect(service.calls).toHaveLength(5);
    expect(
      service.calls.map(
        ([, input]) =>
          (input as { guidePin: { guideKey: string } }).guidePin.guideKey,
      ),
    ).toEqual(MANIFESTS.map((m) => m.guideKey));
    expect(service.calls.every(([, , unit]) => unit === "unit-1")).toBe(true);
  });

  it("an existing, matching draft is a no-op, not a second row", async () => {
    const rows = Object.fromEntries(
      MANIFESTS.map((m, i) => [
        m.experienceKey,
        { id: `x${i}`, status: "DRAFT", guideKey: m.guideKey },
      ]),
    );
    const service = fakeCreator();
    const r = await createDrafts(
      fakeDb(rows),
      service,
      MANIFESTS,
      "u1",
      true,
      "unit-1",
    );
    expect(service.calls).toHaveLength(0);
    expect(r.drafts.map((d) => d.action)).toEqual(Array(5).fill("NOOP"));
    expect(r.ok).toBe(true);
  });

  it("one drifted row refuses the WHOLE set — no partial application", async () => {
    const rows = {
      [MANIFESTS[0].experienceKey]: {
        id: "x0",
        status: "PUBLISHED",
        guideKey: MANIFESTS[0].guideKey,
      },
    };
    const service = fakeCreator();
    const r = await createDrafts(
      fakeDb(rows),
      service,
      MANIFESTS,
      "u1",
      true,
      "unit-1",
    );
    expect(r.drift).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(false);
    // The other four exist in no database anywhere: refusing means refusing.
    expect(service.calls).toHaveLength(0);
    expect(r.drafts[0].action).toBe("DRIFT");
  });

  it("a refusal from the service stops the batch where it happened", async () => {
    const service: DraftCreator & { n: number } = {
      n: 0,
      createDraft() {
        this.n += 1;
        if (this.n === 3) {
          return Promise.reject({
            response: { code: "EXPERIENCE_GUIDE_PIN_NOT_RUNNABLE_HERE" },
          });
        }
        return Promise.resolve({ id: `draft-${this.n}` });
      },
    };
    const r = await createDrafts(
      fakeDb(),
      service,
      MANIFESTS,
      "u1",
      true,
      "unit-1",
    );
    expect(r.ok).toBe(false);
    expect(r.drafts.map((d) => d.action)).toEqual([
      "CREATED",
      "CREATED",
      "DRIFT",
      "SKIPPED",
      "SKIPPED",
    ]);
    expect(r.drafts[2].detail).toBe("EXPERIENCE_GUIDE_PIN_NOT_RUNNABLE_HERE");
  });
});

describe("EEC-C01 · verify and preview", () => {
  const stored = Object.fromEntries(
    MANIFESTS.map((m, i) => [
      m.experienceKey,
      {
        id: `x${i}`,
        status: "DRAFT",
        guideKey: m.guideKey,
        definitionJson: toDefinition(m) as unknown,
      },
    ]),
  );

  it("verify passes only while the route is dark", async () => {
    const db = fakeDb(stored);
    expect((await verifyDrafts(db, MANIFESTS, false)).checks.flagOff).toBe(
      true,
    );
    expect((await verifyDrafts(db, MANIFESTS, true)).checks.flagOff).toBe(
      false,
    );
  });

  it("verify refuses if anything re-pinned the pilot to one of ours", async () => {
    // The pilot has no stored row in a fresh database and several in
    // production, so the check is about what was TOUCHED, not about matching
    // one environment's shape.
    const withPilot = {
      ...stored,
      [PILOT]: { id: "pilot", status: "DRAFT", guideKey: PILOT },
    };
    expect(
      (await verifyDrafts(fakeDb(withPilot), MANIFESTS, false)).checks
        .pilotUntouched,
    ).toBe(true);

    const stolen = {
      ...stored,
      [PILOT]: {
        id: "pilot",
        status: "DRAFT",
        guideKey: MANIFESTS[0].guideKey,
      },
    };
    expect(
      (await verifyDrafts(fakeDb(stolen), MANIFESTS, false)).checks
        .pilotUntouched,
    ).toBe(false);
  });

  it("verify reads the pins from the rows, not from the manifests", async () => {
    const wrong = { ...stored };
    wrong[MANIFESTS[0].experienceKey] = {
      ...wrong[MANIFESTS[0].experienceKey],
      guideKey: PILOT,
    };
    const r = await verifyDrafts(fakeDb(wrong), MANIFESTS, false);
    expect(r.checks.pinsMatchManifests).toBe(false);
  });

  it("preview describes five scenes-and-anchors views with no correct answer", async () => {
    const r = await previewReport(fakeDb(stored), MANIFESTS);
    expect(r.ok).toBe(true);
    expect(r.previews).toHaveLength(5);
    expect(r.previews.every((p) => !p.correctOptionKeyExposed)).toBe(true);
    expect(r.previews.every((p) => p.anchorResolved)).toBe(true);
  });

  it("preview refuses if a grading datum ever reached a stored definition", async () => {
    const poisoned = { ...stored };
    const first = MANIFESTS[0].experienceKey;
    poisoned[first] = {
      ...poisoned[first],
      definitionJson: { scenes: [{ kind: "RECALL", correctOptionKey: "a" }] },
    };
    const r = await previewReport(fakeDb(poisoned), MANIFESTS);
    expect(r.ok).toBe(false);
    expect(r.previews.some((p) => p.correctOptionKeyExposed)).toBe(true);
  });
});

describe("EEC-C01 · the gates on the executable", () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
    vi.unstubAllEnvs();
  });

  it("dry-run is the default, and --dry-run beats --apply", () => {
    expect(parseArgs(["plan"]).apply).toBe(false);
    expect(parseArgs(["create-drafts", "--apply"]).apply).toBe(true);
    expect(parseArgs(["create-drafts", "--apply", "--dry-run"]).apply).toBe(
      false,
    );
    expect(parseArgs(["plan", "--environment=production"]).environment).toBe(
      "production",
    );
  });

  it("a local write needs no ceremony", () => {
    vi.stubEnv("PSICO_ENV", "development");
    expect(() =>
      assertWriteAllowed(parseArgs(["create-drafts", "--apply"])),
    ).not.toThrow();
  });

  it("a production write needs the environment named and the intent spelled", () => {
    vi.stubEnv("PSICO_ENV", "production");
    expect(() =>
      assertWriteAllowed(parseArgs(["create-drafts", "--apply"])),
    ).toThrow(/EEC_C01_PRODUCTION_WRITE_REFUSED/);
    expect(() =>
      assertWriteAllowed(
        parseArgs(["create-drafts", "--apply", "--environment=production"]),
      ),
    ).toThrow(/EEC_C01_PRODUCTION_WRITE_REFUSED/);
    expect(() =>
      assertWriteAllowed(
        parseArgs([
          "create-drafts",
          "--apply",
          "--environment=production",
          "--confirm-production-draft",
        ]),
      ),
    ).not.toThrow();
  });

  it("reading production never asks for anything", () => {
    vi.stubEnv("PSICO_ENV", "production");
    expect(() => assertWriteAllowed(parseArgs(["plan"]))).not.toThrow();
  });
});

/**
 * §9 — what happens when the batch dies halfway.
 *
 * The five creations are five transactions, and no wrapper here can make them
 * one: `createDraft` takes the chapter's advisory lock and opens its own. So
 * the guarantee is not atomicity, it is RECOVERABILITY — and that has to be
 * demonstrated at every position, not argued for once.
 */
describe("EEC-C01 · recovering from a partial apply", () => {
  /** A creator that fails on the Nth call and succeeds on every other. */
  function creatorFailingAt(position: number, store: Record<string, Row>) {
    let n = 0;
    return {
      get calls() {
        return n;
      },
      createDraft(_userId: string, input: { experienceKey: string }) {
        n += 1;
        if (n === position) {
          return Promise.reject(new Error("connection reset"));
        }
        // A successful create is a row that exists from now on — which is what
        // makes the rerun's inspection meaningful.
        store[input.experienceKey] = {
          id: `row-${input.experienceKey}`,
          status: "DRAFT",
          guideKey: input.experienceKey,
        };
        return Promise.resolve({ id: `row-${input.experienceKey}` });
      },
    };
  }

  for (const position of [1, 2, 3, 4, 5]) {
    it(`a failure at position ${position} reports PARTIAL_APPLY and names what is left`, async () => {
      const store: Record<string, Row> = {};
      const service = creatorFailingAt(position, store);
      const first = await createDrafts(
        fakeDb(store),
        service,
        MANIFESTS,
        "u1",
        true,
        "unit-1",
      );

      const landed = position - 1;
      expect(Object.keys(store)).toHaveLength(landed);
      if (landed === 0) {
        // Nothing landed: this is a refusal, not a partial apply.
        expect(first.outcome).toBe("REFUSED");
      } else {
        expect(first.outcome).toBe("PARTIAL_APPLY");
      }
      expect(first.ok).toBe(false);
      // The ones that did not land are named, so an operator does not have to
      // diff the database against the manifests by hand.
      expect(first.pending).toHaveLength(MANIFESTS.length - landed);
      expect(first.pending).toContain(MANIFESTS[position - 1].manifestId);
      // Nothing was deleted to "clean up". What landed stays.
      expect(first.drafts.filter((d) => d.action === "CREATED")).toHaveLength(
        landed,
      );
    });

    it(`re-running after a failure at position ${position} completes exactly the missing ones`, async () => {
      const store: Record<string, Row> = {};
      await createDrafts(
        fakeDb(store),
        creatorFailingAt(position, store),
        MANIFESTS,
        "u1",
        true,
        "unit-1",
      );
      const landed = Object.keys(store).length;

      // The rerun uses a creator that fails at nothing.
      const healthy = creatorFailingAt(0, store);
      const second = await createDrafts(
        fakeDb(store),
        healthy,
        MANIFESTS,
        "u1",
        true,
        "unit-1",
      );

      expect(second.ok).toBe(true);
      expect(second.outcome).toBe(landed === 5 ? "NOOP" : "APPLIED");
      expect(second.pending).toEqual([]);
      // Only the missing ones were created: no duplicates, no rewrites.
      expect(healthy.calls).toBe(MANIFESTS.length - landed);
      expect(Object.keys(store)).toHaveLength(MANIFESTS.length);
      expect(second.drafts.filter((d) => d.action === "NOOP")).toHaveLength(
        landed,
      );
    });
  }

  it("a third run after a completed recovery writes nothing at all", async () => {
    const store: Record<string, Row> = {};
    await createDrafts(
      fakeDb(store),
      creatorFailingAt(3, store),
      MANIFESTS,
      "u1",
      true,
      "unit-1",
    );
    await createDrafts(
      fakeDb(store),
      creatorFailingAt(0, store),
      MANIFESTS,
      "u1",
      true,
      "unit-1",
    );
    const third = creatorFailingAt(0, store);
    const r = await createDrafts(
      fakeDb(store),
      third,
      MANIFESTS,
      "u1",
      true,
      "unit-1",
    );
    expect(third.calls).toBe(0);
    expect(r.outcome).toBe("NOOP");
    expect(r.drafts.every((d) => d.action === "NOOP")).toBe(true);
  });
});

/**
 * §4 — publishing, and the one place it must never reach.
 *
 * The browser walkthrough needs published experiences. The wrong way to get
 * them is production's, so the guard is asserted here rather than trusted to a
 * flag somebody could set.
 */
describe("EEC-C01 · publish-test-suite refuses a deployed box", () => {
  const publisher = {
    publish: (id: string) =>
      Promise.resolve({ id, publishedAt: new Date().toISOString() }),
  };

  for (const env of ["production", "staging"]) {
    it(`refuses on ${env}, even with the confirmation typed`, async () => {
      await expect(
        publishTestSuite(fakeDb(), publisher, MANIFESTS, env, true),
      ).rejects.toThrow(PUBLISH_REFUSED_ON_DEPLOYED);
    });
  }

  it("refuses off production too, when nobody confirmed", async () => {
    await expect(
      publishTestSuite(fakeDb(), publisher, MANIFESTS, "development", false),
    ).rejects.toThrow(/NOT_CONFIRMED/);
  });

  it("publishes the five when the environment and the intent both allow it", async () => {
    const rows = Object.fromEntries(
      MANIFESTS.map((m, i) => [
        m.experienceKey,
        { id: `x${i}`, status: "DRAFT", guideKey: m.guideKey },
      ]),
    );
    const seen: string[] = [];
    const r = await publishTestSuite(
      fakeDb(rows),
      {
        publish: (id: string) => {
          seen.push(id);
          return Promise.resolve({ id, publishedAt: "now" });
        },
      },
      MANIFESTS,
      "development",
      true,
    );
    expect(r.ok).toBe(true);
    expect(seen).toHaveLength(5);
    expect(r.published.map((p) => p.manifestId)).toEqual(
      MANIFESTS.map((m) => m.manifestId),
    );
  });

  it("does not republish what is already published", async () => {
    const rows = Object.fromEntries(
      MANIFESTS.map((m, i) => [
        m.experienceKey,
        { id: `x${i}`, status: "PUBLISHED", guideKey: m.guideKey },
      ]),
    );
    const seen: string[] = [];
    await publishTestSuite(
      fakeDb(rows),
      {
        publish: (id: string) => {
          seen.push(id);
          return Promise.resolve({ id, publishedAt: "now" });
        },
      },
      MANIFESTS,
      "test",
      true,
    );
    expect(seen).toEqual([]);
  });
});

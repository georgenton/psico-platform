import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CircleActivityDefinition } from "@psico/types";
import { CircleTemplateRegistry } from "@psico/types";

vi.mock("server-only", () => ({}));

import {
  DUO_CTA_LABEL,
  PRODUCTION_DUO_ELIGIBILITY,
  resolveDuoEntry,
  resolvePublishedTemplateByKey,
  type DuoEligibilityDeps,
  type DuoEligibilityMapping,
} from "./eligibility";
import { PLANTILLA } from "@/components/circulos/__fixtures__/actividad";

/**
 * Eligibility, exercised against injected catalogs.
 *
 * The production catalog is empty and stays empty, so every positive case here
 * builds its own registry from fixtures. That is the point of the resolver
 * taking its dependencies: the RULES can be proven without publishing anything.
 */

/** `src/lib/circulos` → `apps/web`. */
const WEB = resolve(__dirname, "../../..");

const PIN = { experienceKey: "fixture-experience", experienceVersion: 1 };

/** A template that names the experience back, as a real mapping requires. */
function template(
  over: Partial<CircleActivityDefinition> = {},
): CircleActivityDefinition {
  return {
    ...PLANTILLA,
    source: {
      bookSlug: "fixture-book",
      chapterOrder: 1,
      experiencePin: { ...PIN },
    },
    ...over,
  };
}

function deps(
  definitions: CircleActivityDefinition[],
  catalog: DuoEligibilityMapping[],
): DuoEligibilityDeps {
  return { catalog, registry: new CircleTemplateRegistry(definitions) };
}

const MAPPING: DuoEligibilityMapping = {
  experienceKey: PIN.experienceKey,
  experienceVersion: PIN.experienceVersion,
  templateKey: "fixture-duo",
  templateVersion: 1,
};

describe("eligibility is an enumeration, never an inference", () => {
  it("1 · an exact pin mapped to a PUBLISHED template offers the CTA", () => {
    const entry = resolveDuoEntry(PIN, deps([template()], [MAPPING]));
    expect(entry).toEqual({
      label: DUO_CTA_LABEL,
      href: "/dashboard/circulos/nuevo/fixture-duo",
    });
  });

  it("2 · a different experience VERSION is not the mapped pin", () => {
    const d = deps([template()], [MAPPING]);
    // Same key, next version. Publishing a new experience version is how an
    // experience is edited, so inheriting the old one's mapping would carry an
    // approval forward onto content nobody reviewed.
    expect(resolveDuoEntry({ ...PIN, experienceVersion: 2 }, d)).toBeNull();
  });

  it("3 · a pin with no mapping is not eligible", () => {
    const d = deps([template()], [MAPPING]);
    expect(
      resolveDuoEntry({ experienceKey: "otra-cosa", experienceVersion: 1 }, d),
    ).toBeNull();
  });

  it("4 · a DRAFT template is never offered", () => {
    const d = deps([template({ status: "DRAFT" })], [MAPPING]);
    expect(resolveDuoEntry(PIN, d)).toBeNull();
  });

  it("5 · an ARCHIVED template is never offered", () => {
    const d = deps([template({ status: "ARCHIVED" })], [MAPPING]);
    expect(resolveDuoEntry(PIN, d)).toBeNull();
  });

  it("6 · a template whose source names another experience is refused", () => {
    // The mapping says this experience; the template says a different one.
    // Two records that disagree are not an approval.
    const mismatched = template({
      source: {
        bookSlug: "fixture-book",
        chapterOrder: 1,
        experiencePin: {
          experienceKey: "otro-experience",
          experienceVersion: 1,
        },
      },
    });
    expect(resolveDuoEntry(PIN, deps([mismatched], [MAPPING]))).toBeNull();

    // And a template that names NO experience is likewise unreachable:
    // absence is not agreement.
    const silent = template({
      source: { bookSlug: "fixture-book", chapterOrder: 1 },
    });
    expect(resolveDuoEntry(PIN, deps([silent], [MAPPING]))).toBeNull();
  });

  it("7 · moving the chapter's position changes nothing", () => {
    // `chapterOrder` is printed-book metadata. It is not unique across books
    // and it does not even agree with the editorial chapter code, so it must
    // carry no weight at all.
    const atOne = resolveDuoEntry(
      PIN,
      deps(
        [
          template({
            source: {
              bookSlug: "fixture-book",
              chapterOrder: 1,
              experiencePin: { ...PIN },
            },
          }),
        ],
        [MAPPING],
      ),
    );
    const atNinety = resolveDuoEntry(
      PIN,
      deps(
        [
          template({
            source: {
              bookSlug: "fixture-book",
              chapterOrder: 90,
              experiencePin: { ...PIN },
            },
          }),
        ],
        [MAPPING],
      ),
    );
    expect(atOne).toEqual(atNinety);
    expect(atOne).not.toBeNull();
  });

  it("9 · no fallback turns an unmapped catalog into a permissive one", () => {
    // An EMPTY catalog with a perfectly good published template offers
    // nothing. If any default existed, this is where it would show.
    const d = deps([template()], []);
    expect(resolveDuoEntry(PIN, d)).toBeNull();

    // And a catalog with one mapping does not spill onto its neighbours.
    const withOne = deps([template()], [MAPPING]);
    for (const key of ["vecino-1", "vecino-2", "fixture-experienc"]) {
      expect(
        resolveDuoEntry({ experienceKey: key, experienceVersion: 1 }, withOne),
      ).toBeNull();
    }
  });

  it("production ships zero mappings, matching the empty catalog", () => {
    expect(PRODUCTION_DUO_ELIGIBILITY).toHaveLength(0);
    // And with the real (empty) dependencies, nothing resolves.
    expect(resolveDuoEntry(PIN)).toBeNull();
  });
});

describe("the organiser route resolves a key to ONE published pin", () => {
  it("resolves a single published version", () => {
    const d = deps([template()], [MAPPING]);
    expect(
      resolvePublishedTemplateByKey("fixture-duo", d)?.templateVersion,
    ).toBe(1);
  });

  it("refuses DRAFT, ARCHIVED, unknown and ambiguous keys alike", () => {
    expect(
      resolvePublishedTemplateByKey(
        "fixture-duo",
        deps([template({ status: "DRAFT" })], []),
      ),
    ).toBeNull();
    expect(
      resolvePublishedTemplateByKey(
        "fixture-duo",
        deps([template({ status: "ARCHIVED" })], []),
      ),
    ).toBeNull();
    expect(
      resolvePublishedTemplateByKey("no-existe", deps([template()], [])),
    ).toBeNull();

    // Two PUBLISHED versions of one key: refused rather than resolved by
    // picking the higher one. A link written for v1 must never create a v2.
    const ambiguous = deps(
      [template(), template({ templateVersion: 2 })],
      [MAPPING],
    );
    expect(resolvePublishedTemplateByKey("fixture-duo", ambiguous)).toBeNull();
  });

  it("production resolves no key, because nothing is published", () => {
    expect(resolvePublishedTemplateByKey("fixture-duo")).toBeNull();
  });
});

describe("10 · the catalog never reaches a client bundle", () => {
  it("is marked server-only", () => {
    const src = readFileSync(join(__dirname, "eligibility.ts"), "utf8");
    expect(src).toMatch(/^import "server-only";/m);
  });

  it("is imported by no 'use client' module", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(join(WEB, "src"), {
      recursive: true,
    } as never) as string[]) {
      if (typeof file !== "string") continue;
      if (!/\.(ts|tsx)$/.test(file)) continue;
      if (/\.(test|spec)\.tsx?$/.test(file)) continue;
      const src = readFileSync(join(WEB, "src", file), "utf8");
      if (!/^\s*["']use client["']/m.test(src)) continue;
      if (/circulos\/eligibility/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

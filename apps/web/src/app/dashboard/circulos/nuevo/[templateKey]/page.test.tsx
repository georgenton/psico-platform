import { describe, expect, it, vi } from "vitest";
import { CircleTemplateRegistry } from "@psico/types";
// Type-only, so it is erased before `vi.mock`'s hoisted factory runs.
import type * as EligibilityModule from "@/lib/circulos/eligibility";

/** The sentinel Next's own `notFound()` throws, stood in for here. */
const NOT_FOUND = new Error("NEXT_NOT_FOUND");

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));
vi.mock("server-only", () => ({}));

/**
 * Records what the page hands the resolver, then delegates to the REAL one.
 *
 * A recording wrapper rather than a stub: the behaviour under test is the
 * page's, so replacing the resolver would only prove the test's own double
 * works.
 */
const keysSeen = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/circulos/eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof EligibilityModule>();
  return {
    ...actual,
    resolvePublishedTemplateByKey: (key: string, deps?: unknown) => {
      keysSeen.push(key);
      return (
        actual.resolvePublishedTemplateByKey as (
          k: string,
          d?: unknown,
        ) => unknown
      )(key, deps);
    },
  };
});

import NuevoDuoPage from "./page";
import {
  resolvePublishedTemplateByKey,
  type DuoEligibilityDeps,
} from "@/lib/circulos/eligibility";
import { PLANTILLA } from "@/components/circulos/__fixtures__/actividad";

/**
 * The organiser route's refusal is uniform, and it never throws.
 *
 * `params.templateKey` arrives ALREADY decoded — Next decodes dynamic segments
 * itself. The page used to decode it a second time, which is not a harmless
 * redundancy: a key containing a literal `%` (`100%`, `50%-50%`) makes
 * `decodeURIComponent` throw `URIError`, and an unhandled throw is a 500 on a
 * route whose every other refusal is a quiet 404. The single input most likely
 * to be probed would have been the single input that answered differently.
 */

function render(templateKey: string): { threw: unknown } {
  try {
    NuevoDuoPage({ params: { templateKey } });
    return { threw: null };
  } catch (err) {
    return { threw: err };
  }
}

describe("a malformed decoded key is refused, not thrown at", () => {
  const MALFORMED = ["100%", "50%-50%", "%", "%E0%A4%A", "descuento-%%", "%zz"];

  it("never raises URIError for a key containing a literal %", () => {
    for (const key of MALFORMED) {
      const { threw } = render(key);
      expect(threw, key).not.toBeInstanceOf(URIError);
      expect((threw as Error)?.name, key).not.toBe("URIError");
    }
  });

  it("takes the same notFound() path as any unknown key", () => {
    const baseline = render("una-clave-que-no-existe").threw;
    expect(baseline).toBe(NOT_FOUND);

    for (const key of MALFORMED) {
      // Not merely "a 404" — the very same sentinel, by the very same route.
      expect(render(key).threw, key).toBe(baseline);
    }
  });

  it("hands the key to the resolver verbatim, decoding nothing", () => {
    // If the page decoded a second time, `a%20b` would arrive as `a b` and
    // `100%` would not arrive at all — it would have thrown on the way.
    keysSeen.length = 0;
    render("100%");
    render("a%20b");
    render("eec-c1-cuerpo-antes-que-mente");
    expect(keysSeen).toEqual([
      "100%",
      "a%20b",
      "eec-c1-cuerpo-antes-que-mente",
    ]);
  });
});

describe("the refusal reveals nothing about WHY", () => {
  it("unknown, ambiguous, DRAFT and ARCHIVED are one answer", () => {
    // The page turns `null` into `notFound()`. So the question is whether the
    // resolver's four refusals are distinguishable — they must not be, or the
    // address bar becomes a way to enumerate the catalog.
    const withSource = (over = {}) => ({
      ...PLANTILLA,
      source: {
        bookSlug: "fixture-book",
        chapterOrder: 1,
        experiencePin: { experienceKey: "x", experienceVersion: 1 },
      },
      ...over,
    });
    const d = (definitions: ReturnType<typeof withSource>[]) =>
      ({
        catalog: [],
        registry: new CircleTemplateRegistry(definitions),
      }) as DuoEligibilityDeps;

    const answers = [
      // unknown
      resolvePublishedTemplateByKey("no-existe", d([withSource()])),
      // DRAFT
      resolvePublishedTemplateByKey(
        "fixture-duo",
        d([withSource({ status: "DRAFT" })]),
      ),
      // ARCHIVED
      resolvePublishedTemplateByKey(
        "fixture-duo",
        d([withSource({ status: "ARCHIVED" })]),
      ),
      // ambiguous — two PUBLISHED versions of one key
      resolvePublishedTemplateByKey(
        "fixture-duo",
        d([withSource(), withSource({ templateVersion: 2 })]),
      ),
      // malformed
      resolvePublishedTemplateByKey("100%", d([withSource()])),
      // empty
      resolvePublishedTemplateByKey("fixture-duo", d([])),
    ];

    // One value, six causes. Nothing carries the reason outward.
    expect(answers).toEqual([null, null, null, null, null, null]);
    expect(new Set(answers).size).toBe(1);
  });

  it("production answers notFound for every key, including C07's", () => {
    // The catalog is empty, so this route is a 404 in production whatever is
    // typed into it — and C07's key is not a special case, it is the same case.
    for (const key of [
      "fixture-duo",
      "pqp-c7-reconocer-la-violencia",
      "eec-c1-cuerpo-antes-que-mente",
      "100%",
    ]) {
      expect(render(key).threw, key).toBe(NOT_FOUND);
    }
  });
});

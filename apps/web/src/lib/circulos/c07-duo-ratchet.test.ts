import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CircleActivityDefinition } from "@psico/types";
import { CircleTemplateRegistry } from "@psico/types";

vi.mock("server-only", () => ({}));

import {
  PRODUCTION_DUO_ELIGIBILITY,
  resolveDuoEntry,
  type DuoEligibilityMapping,
} from "./eligibility";
import { PLANTILLA } from "@/components/circulos/__fixtures__/actividad";

/**
 * PQP C07 has no Dúo, and no future cut may give it one.
 *
 * ── Why this chapter ───────────────────────────────────────────────────────
 *
 * C07's material is limits, covert contempt, unequal power and violence. A Dúo
 * is a structured conversation between two people who both opt in; offering one
 * here would invite the person with less room to name the problem to the person
 * who benefits from it, inside a flow that cannot tell which situation it is
 * looking at. The chapter ships `DUO_CANDIDATES = []` on purpose, and this file
 * is what stops that decision from being undone by accident.
 *
 * ── Why it is SEMANTIC and not a number ────────────────────────────────────
 *
 * A guard written against "chapter 7" would be worse than no guard. In this
 * collection every chapter `CNN` sits at `chapterOrder NN+1`:
 *
 *     C06 → chapterOrder 7        C07 → chapterOrder 8
 *
 * So "block 7" blocks the wrong chapter — one that legitimately HAS a candidate
 * — and lets C07 through untouched. This file therefore reads the chapter's own
 * editorial module and derives its canonical keys from it. Rename a microguide
 * and the derived keys move with it; renumber the book and nothing here cares.
 */

/** `src/lib/circulos` → `apps/web` → repo root. */
const WEB = resolve(__dirname, "../../..");
const ROOT = resolve(WEB, "../..");
const C07_PATH = resolve(ROOT, "scripts/pqp/chapters/c07.mjs");

interface C07Module {
  CHAPTER: { code: string; chapterOrder: number; keyPrefix: string };
  DUO_CANDIDATES: unknown[];
  MICROGUIDES: { slug: string }[];
}

let c07: C07Module;
/** The Experience pins C07 actually publishes, derived from the source. */
let canonicalKeys: string[];

beforeAll(async () => {
  // `@vite-ignore`: this is the editorial source itself, outside the app's
  // module graph. It is imported, not parsed, so a change to its shape breaks
  // this test loudly instead of being silently missed by a regex.
  c07 = (await import(
    /* @vite-ignore */ pathToFileURL(C07_PATH).href
  )) as unknown as C07Module;
  // `experienceKey === guideKey === `${keyPrefix}-${slug}`` — the derivation
  // `scripts/pqp/build-guide-manifests.mjs` performs. Read, never retyped.
  canonicalKeys = c07.MICROGUIDES.map(
    (mg) => `${c07.CHAPTER.keyPrefix}-${mg.slug}`,
  );
});

describe("PQP_C07_DUO_CANDIDATES=0", () => {
  it("the chapter itself still ships an empty candidate list", () => {
    expect(c07.CHAPTER.code).toBe("C07");
    expect(c07.DUO_CANDIDATES).toHaveLength(0);
  });

  it("the derivation this ratchet depends on is real", () => {
    // If the key grammar ever changes, this fails LOUDLY rather than letting
    // the assertions below quietly check keys that no longer exist.
    expect(canonicalKeys.length).toBeGreaterThan(0);
    expect(c07.CHAPTER.keyPrefix).toMatch(/^[a-z0-9-]+$/);
    for (const key of canonicalKeys) {
      expect(key.startsWith(`${c07.CHAPTER.keyPrefix}-`)).toBe(true);
    }
    // The second canonical source in this repo — the anchor registry — must
    // agree with what we derived. Two sources, one answer.
    const anchors = readFileSync(
      resolve(ROOT, "packages/types/src/guide-anchor.ts"),
      "utf8",
    );
    for (const key of canonicalKeys) {
      expect(anchors, `anchor for ${key}`).toContain(`guideKey: "${key}"`);
    }
  });
});

describe("PQP_C07_DUO_ELIGIBLE=false", () => {
  it("no production mapping names a C07 experience", () => {
    const named = PRODUCTION_DUO_ELIGIBILITY.filter(
      (m) =>
        canonicalKeys.includes(m.experienceKey) ||
        m.experienceKey.startsWith(`${c07.CHAPTER.keyPrefix}-`),
    );
    expect(named).toEqual([]);
  });

  it("every C07 pin resolves to nothing, at every version", () => {
    for (const experienceKey of canonicalKeys) {
      for (const experienceVersion of [1, 2, 3]) {
        expect(
          resolveDuoEntry({ experienceKey, experienceVersion }),
          `${experienceKey}@${experienceVersion}`,
        ).toBeNull();
      }
    }
  });

  it("publishing a template that claims C07 is not enough to enable it", () => {
    // Someone publishes a template whose source names a C07 experience. With
    // the PRODUCTION catalog, it is still unreachable: a template cannot
    // nominate itself, only an approved mapping can point at it.
    const claiming: CircleActivityDefinition = {
      ...PLANTILLA,
      source: {
        bookSlug: "parejas-que-perduran",
        chapterOrder: c07.CHAPTER.chapterOrder,
        experiencePin: {
          experienceKey: canonicalKeys[0]!,
          experienceVersion: 1,
        },
      },
    };
    const entry = resolveDuoEntry(
      { experienceKey: canonicalKeys[0]!, experienceVersion: 1 },
      {
        catalog: PRODUCTION_DUO_ELIGIBILITY,
        registry: new CircleTemplateRegistry([claiming]),
      },
    );
    expect(entry).toBeNull();
  });
});

describe("PQP_C07_CTA_VISIBLE=false", () => {
  it("no surface mounts a Dúo CTA with a C07 pin", () => {
    // The CTA is only ever rendered by `DuoEntryPoint`. Every mount site must
    // pass a pin, and none of them may pass one of C07's.
    const mounts = mountedPins();
    expect(mounts.length).toBeGreaterThan(0); // the check must have something to check
    for (const key of canonicalKeys) {
      expect(mounts, `C07 key ${key} is mounted`).not.toContain(key);
    }
  });

  it("a generic fallback cannot make it appear", () => {
    // The failure this guards against: someone adds "if nothing matched, offer
    // the chapter's first published template". With a maximally permissive
    // registry AND an empty mapping list, the answer must still be nothing.
    const everything = new CircleTemplateRegistry([
      PLANTILLA,
      { ...PLANTILLA, templateKey: "otra", templateVersion: 1 },
    ]);
    for (const experienceKey of canonicalKeys) {
      expect(
        resolveDuoEntry(
          { experienceKey, experienceVersion: 1 },
          { catalog: [], registry: everything },
        ),
      ).toBeNull();
    }
  });
});

describe("POSITIONAL_AUTHORITY_USED=false", () => {
  it("the offset that makes positional guards wrong is real", () => {
    // Stated as an assertion so the premise of this whole file is checked, not
    // assumed: C07 is NOT at position 7.
    expect(c07.CHAPTER.chapterOrder).toBe(8);
    expect(c07.CHAPTER.chapterOrder).not.toBe(7);
  });

  it("the resolver reads no chapter position at all", () => {
    // A NON-C07 experience sitting at C07's exact chapterOrder resolves
    // normally. If position were authority — a blocklist on order 8, say —
    // this would be refused, and the refusal would be for the wrong reason.
    const pin = { experienceKey: "vecino-inocente", experienceVersion: 1 };
    const mapping: DuoEligibilityMapping = {
      ...pin,
      templateKey: "fixture-duo",
      templateVersion: 1,
    };
    const atC07Position: CircleActivityDefinition = {
      ...PLANTILLA,
      source: {
        bookSlug: "parejas-que-perduran",
        chapterOrder: c07.CHAPTER.chapterOrder,
        experiencePin: { ...pin },
      },
    };
    const entry = resolveDuoEntry(pin, {
      catalog: [mapping],
      registry: new CircleTemplateRegistry([atC07Position]),
    });
    expect(entry).not.toBeNull();
  });

  it("the eligibility module never reads chapterOrder", () => {
    const src = readFileSync(resolve(__dirname, "eligibility.ts"), "utf8");
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "");
    expect(code).not.toContain("chapterOrder");
  });
});

/**
 * Every Experience pin any surface hands to `DuoEntryPoint`.
 *
 * Read from the mount sites rather than from a list someone maintains: a new
 * surface that forgets to register itself would otherwise be invisible here,
 * and invisible is exactly what this must not be.
 */
function mountedPins(): string[] {
  const keys: string[] = [];
  for (const file of readdirSync(resolve(WEB, "src"), {
    recursive: true,
  } as never) as string[]) {
    if (typeof file !== "string") continue;
    if (!/\.tsx?$/.test(file)) continue;
    if (/\.(test|spec)\.tsx?$/.test(file)) continue;
    const src = readFileSync(resolve(WEB, "src", file), "utf8");
    if (!src.includes("DuoEntryPoint")) continue;
    for (const m of src.matchAll(/experienceKey:\s*["']([^"']+)["']/g)) {
      keys.push(m[1]!);
    }
  }
  return keys;
}

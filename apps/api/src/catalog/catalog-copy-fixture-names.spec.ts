import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FIXTURE_AUTHOR_SLUGS,
  fixtureIdentitiesNamedIn,
} from "./authorship-sources";
import { BOOK_COPY_WITHDRAWAL } from "./authorship-plan-file";

/**
 * A ratchet over the catalogue's editorial COPY.
 *
 * ── What it is for, and why it is not the repair ──────────────────────────
 *
 * `authorship-repair.ts` cleans the copy a hosted row already carries. This
 * stops the next one from being written. The two are not interchangeable and
 * neither covers the other: a repair applied to staging says nothing about
 * what the next deploy seeds, and a green ratchet says nothing about the rows
 * already out there — the UAT of 2026-10-22 found exactly that gap, a seed
 * that had stopped writing the name and a hosted row that still served it.
 *
 * ── Why it reads the source instead of running it ─────────────────────────
 *
 * `prisma/seed.ts` executes on import, so importing it from a spec would seed
 * whatever `DATABASE_URL` points at. Same reason, same technique, as
 * `seed-authorship.spec.ts`, which this deliberately does not touch: that one
 * pins the anchor book's synopsis against one hardcoded name, and this one
 * covers every copy field against every declared fixture identity.
 *
 * ── Why the names are derived ─────────────────────────────────────────────
 *
 * Through the same `fixtureIdentitiesNamedIn` the planner uses, from
 * `FIXTURE_AUTHOR_SLUGS`. Declaring a new fixture identity therefore extends
 * this check with it, and the check cannot drift from what the repair
 * considers "named" — if the two disagreed, one of them would be wrong about
 * the thing they both exist to catch.
 */

const SEED_DIR = join(__dirname, "..", "..", "prisma");

/** Seed modules that carry catalogue copy. */
const SEED_FILES = ["seed.ts", "seed-therapists.ts"] as const;

/**
 * The source with comments removed.
 *
 * The rule is about PAYLOADS, not prose. These files explain at length why a
 * fixture identity is not accredited, and naming it is how a reader follows
 * the explanation. Checking the raw text would fail on its own documentation
 * and push the next person to delete the reasoning to get green.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * Every string literal assigned to a copy field, with where it came from.
 *
 * `name` and `slug` are excluded on purpose: those are how the fixture row
 * declares its own identity, and it must keep naming itself. Everything else
 * is text a reader sees attached to a work or a person.
 */
const COPY_KEYS = [
  "summary",
  "description",
  "bio",
  "subtitle",
  "title",
  "headline",
  "excerpt",
] as const;

function copyLiteralsIn(
  src: string,
  where: string,
): Array<{ where: string; text: string }> {
  const code = stripComments(src);
  const out: Array<{ where: string; text: string }> = [];
  for (const key of COPY_KEYS) {
    // `key:` followed by a (possibly wrapped) double-quoted literal.
    const re = new RegExp(`\\b${key}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
    for (const m of code.matchAll(re)) {
      out.push({ where: `${where} · ${key}`, text: m[1]! });
    }
  }
  return out;
}

const LITERALS = SEED_FILES.flatMap((f) =>
  copyLiteralsIn(readFileSync(join(SEED_DIR, f), "utf8"), f),
);

describe("copy del catálogo ↔ identidades de fixture", () => {
  it("el extractor encuentra cada campo de copy, y descarta los comentarios", () => {
    // Guard the guard, exercised on a known input rather than on whatever the
    // seed happens to contain today: an assertion like "there is a `bio:` in
    // the seed" turns into a false alarm the day a field legitimately stops
    // being seeded, and teaches the next person to weaken the check.
    const sample = [
      '// bio: "esto es un comentario y no cuenta"',
      "const x = {",
      ...COPY_KEYS.map((k) => `  ${k}: "texto de ${k}",`),
      '  name: "Nombre Que No Se Vigila",',
      "};",
    ].join("\n");
    const found = copyLiteralsIn(sample, "muestra");
    expect(found.map((f) => f.text).sort()).toEqual(
      COPY_KEYS.map((k) => `texto de ${k}`).sort(),
    );
  });

  it("hay literales que vigilar y nombres con los que vigilarlos", () => {
    expect(FIXTURE_AUTHOR_SLUGS.length).toBeGreaterThan(0);
    expect(LITERALS.length).toBeGreaterThan(20);
    for (const file of SEED_FILES) {
      expect(
        LITERALS.some((l) => l.where.startsWith(file)),
        `no se extrajo ningún literal de ${file}`,
      ).toBe(true);
    }
  });

  it("el detector reconoce un nombre de fixture donde lo haya", () => {
    // Guard the guard, the other half: a detector that answered "no" to
    // everything would make the assertion below vacuous.
    const probe = `${FIXTURE_AUTHOR_SLUGS[0]!.split("-").join(" ")} escribió esto.`;
    expect(fixtureIdentitiesNamedIn(probe)).toContain(FIXTURE_AUTHOR_SLUGS[0]);
  });

  it("ningún campo de copy del catálogo nombra a una identidad de fixture", () => {
    const offenders = LITERALS.filter(
      (l) => fixtureIdentitiesNamedIn(l.text).length > 0,
    ).map((l) => `${l.where}: «${l.text.slice(0, 60)}…»`);
    expect(offenders).toEqual([]);
  });

  it("el marcador que escribe la reparación tampoco nombra a nadie", () => {
    // Otherwise a repaired row would trip the very check that selected it,
    // and the plan would propose withdrawing its own replacement for ever.
    for (const [field, text] of Object.entries(BOOK_COPY_WITHDRAWAL)) {
      expect(
        fixtureIdentitiesNamedIn(text),
        `el marcador de ${field} nombra a una identidad de fixture`,
      ).toEqual([]);
    }
  });

  it("el seed no siembra biografía para una identidad de fixture", () => {
    // Prose about a person nobody accredited is what the repair withdraws.
    // Seeding one would hand a fresh catalogue the state the repair exists to
    // leave behind, and the plan would propose the same withdrawal for ever.
    const src = stripComments(readFileSync(join(SEED_DIR, "seed.ts"), "utf8"));
    for (const slug of FIXTURE_AUTHOR_SLUGS) {
      const idx = src.indexOf(`slug: "${slug}"`);
      if (idx < 0) continue;
      expect(src.slice(idx, idx + 400)).not.toMatch(/\bbio:/);
    }
  });
});

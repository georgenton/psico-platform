import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The PR1 cut, asserted rather than promised.
 *
 * The report for this PR claims `RUNTIME_SCOPE=none`, no Prisma model, no
 * migration and no private-draft field. Those are checkable facts, so they are
 * checked here: an auditor should not have to take a summary's word for what a
 * diff contains.
 *
 * ── This file is expected to change in PR2 ─────────────────────────────────
 *
 * `feat/circles-domain-foundation` adds the migration, the models and the Nest
 * module. The three "not yet" assertions below will fail then, and updating
 * them is part of that cut — the point is that the change becomes a visible,
 * deliberate edit instead of drift nobody noticed. The assertions about
 * private drafts, Content Core ids and PQP C07 are NOT of that kind: those
 * hold for every future cut.
 */

const ROOT = join(process.cwd(), "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Comments legitimately name what the code must not contain. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const CONTRACT_FILES = [
  "packages/types/src/circles.ts",
  "packages/types/src/circles-catalog.ts",
];

describe("circles · PR1 scope — contract only, no runtime", () => {
  it("adds no Prisma model", () => {
    const schema = read("apps/api/prisma/schema.prisma");
    expect(schema).not.toMatch(/^model\s+Circle\w*\s*\{/m);
  });

  it("adds no migration", () => {
    const dirs = readdirSync(join(ROOT, "apps/api/prisma/migrations"));
    expect(dirs.filter((d) => /circle/i.test(d))).toEqual([]);
  });

  it("wires no Nest module", () => {
    const appModule = read("apps/api/src/app.module.ts");
    expect(appModule).not.toMatch(/CirclesModule/);
  });

  it("ships only specs and fixtures in this directory", () => {
    // The executable form of RUNTIME_SCOPE=none: no controller, no service, no
    // module, no repository, no guard.
    const files = readdirSync(join(ROOT, "apps/api/src/circles")).sort();
    for (const file of files) {
      expect(file, file).toMatch(/\.(spec|fixtures)\.ts$/);
    }
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("circles · invariants that hold for every future cut", () => {
  it("has no field anywhere for a private draft", () => {
    // The whole privacy posture rests on this: preparation is local, and the
    // server has nowhere to put it even if a later cut tried.
    for (const file of CONTRACT_FILES) {
      const src = code(read(file));
      for (const forbidden of [
        "draftText",
        "privateResponse",
        "privateAnswer",
        "preparationText",
        "answerText",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
    // And not in the Prisma schema either, in case a model lands before this
    // spec is read again.
    expect(code(read("apps/api/prisma/schema.prisma"))).not.toMatch(
      /privateResponse|draftText/,
    );
  });

  it("never lets a Content Core id into the shared contract", () => {
    for (const file of CONTRACT_FILES) {
      expect(code(read(file)), file).not.toContain("contentUnitId");
    }
  });

  it("keeps the contract free of personal-data imports", () => {
    // Círculos may never reach Diario, Eco personal, Mapa or Patrones. The
    // contract package imports nothing at all today; this pins that it stays
    // that way as the catalog grows.
    for (const file of CONTRACT_FILES) {
      const src = code(read(file));
      for (const forbidden of [
        "DiaryEntry",
        "EcoThread",
        "EcoMessage",
        "EmotionalMap",
        "MoodLog",
        "Patrones",
        "Reflexiones",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("imports no editorial DUO_CANDIDATES into the catalog", () => {
    // The nine candidates in the Parejas chapters are editorial drafts that say
    // so themselves. Publishing one is an editorial decision, never a wiring
    // side effect.
    for (const file of CONTRACT_FILES) {
      expect(code(read(file)), file).not.toContain("DUO_CANDIDATES");
    }
  });

  it("never states that issue #639 is closed", () => {
    // Frozen is not closed. #639's implementation arc is complete and frozen,
    // and the issue itself is still open — an ADR that called it closed would
    // be recording a fact about GitHub that is not true, and the next reader
    // would plan around it.
    //
    // The ratchet is focused: it reads every line that mentions 639 and
    // refuses a closure claim on any of them. The three canonical status
    // declarations are the one place the word may appear, because that is
    // where the truthful value lives.
    const CANONICAL = [
      "ISSUE_639_IMPLEMENTATION_COMPLETE=true",
      "ISSUE_639_FROZEN=true",
      "ISSUE_639_CLOSED=false",
    ];
    for (const file of [
      "docs/adr/0023-circles-one-domain-many-surfaces.md",
      "docs/architecture/circles-v1.md",
    ]) {
      const src = read(file);
      for (const line of src.split("\n")) {
        if (!line.includes("639")) continue;
        if (CANONICAL.some((c) => line.includes(c))) continue;
        expect(line, `${file} · ${line.trim()}`).not.toMatch(
          /cerrad\w*|closed/i,
        );
      }
    }
    // And the ADR must state the status rather than leave it to inference.
    const adr = read("docs/adr/0023-circles-one-domain-many-surfaces.md");
    for (const declaration of CANONICAL) {
      expect(adr, declaration).toContain(declaration);
    }
  });

  it("leaves PQP C07 without a Dúo candidate", () => {
    // The chapter that names violence and coercive control ships an empty list
    // on purpose: a bilateral activity is the wrong instrument there. Every
    // future cut inherits this.
    const c07 = read("scripts/pqp/chapters/c07.mjs");
    expect(c07).toMatch(/export const DUO_CANDIDATES = \[\]/);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Círculos cut, asserted rather than promised.
 *
 * ── Updated for PR2, exactly as PR1 said it would be ───────────────────────
 *
 * PR1 shipped three "not yet" assertions — no Prisma model, no migration, no
 * Nest module — and said in this comment that `feat/circles-domain-foundation`
 * would have to change them deliberately rather than let them rot. This is that
 * edit. Each one is now its positive counterpart, so the file still fails if
 * the models, the migration or the wiring disappear.
 *
 * The rest of the assertions were never of that kind. Private drafts, Content
 * Core ids, personal-data imports, the editorial candidates, #639's status and
 * PQP C07 hold for every cut, and PR2 adds the ones its own scope makes
 * checkable: no raw secret in a column, no client-asserted identity in a DTO,
 * an empty production catalog, and a frozen `GuideSession`.
 */

const ROOT = join(process.cwd(), "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Comments legitimately name what the code must not contain. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const CONTRACT_FILES = [
  "packages/types/src/circles.ts",
  "packages/types/src/circles-catalog.ts",
];

const CIRCLES_DIR = "apps/api/src/circles";
const circlesSources = () =>
  readdirSync(join(ROOT, CIRCLES_DIR))
    .filter(
      (f) => f.endsWith(".ts") && !/\.(spec|pg-spec|fixtures)\.ts$/.test(f),
    )
    .map((f) => `${CIRCLES_DIR}/${f}`);

describe("circles · PR2 scope — the access spine, and only that", () => {
  it("declares the eight models", () => {
    const schema = read("apps/api/prisma/schema.prisma");
    for (const model of [
      "Circle",
      "CircleMember",
      "CircleInvitation",
      "CircleGuestSession",
      "CircleActivity",
      "CircleActivityParticipant",
      "CircleArtifact",
      "CircleEvent",
    ]) {
      expect(schema, model).toMatch(
        new RegExp(`^model\\s+${model}\\s*\\{`, "m"),
      );
    }
  });

  it("ships exactly one migration, and it is additive", () => {
    const dirs = readdirSync(join(ROOT, "apps/api/prisma/migrations")).filter(
      (d) => /circle/i.test(d),
    );
    expect(dirs).toEqual(["20260909180000_circles_domain_foundation"]);
    const sql = read(`apps/api/prisma/migrations/${dirs[0]}/migration.sql`);
    // The hazard that broke production on 2026-06-01: Prisma CLI chatter as
    // the first line of a file Postgres is about to execute.
    expect(sql.split("\n")[0]).toMatch(/^--/);
    for (const line of sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))) {
      expect(line, line).not.toMatch(
        /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)\b|\bALTER\s+COLUMN\b|\bRENAME\b/i,
      );
    }
  });

  it("wires the Nest module", () => {
    const appModule = read("apps/api/src/app.module.ts");
    expect(appModule).toMatch(/CirclesModule/);
  });

  it("implements none of PR3's surface", () => {
    // The limits in §C, as a check rather than a promise. Reveal, confirm-share,
    // artifacts, withdrawal and the worker are absent — not stubbed, not behind
    // a second flag.
    const sources = circlesSources()
      .map((f) => code(read(f)))
      .join("\n");
    for (const forbidden of [
      "confirmShare",
      "confirm-share",
      "revealActivity",
      "revealBarrier",
      "proposeArtifact",
      "recordFollowUp",
      "withdrawParticipant",
    ]) {
      expect(sources, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps the rollout closed by default", () => {
    // No default anywhere in the module turns Círculos on. The resolver's own
    // behaviour is covered in `circles-rollout.spec.ts`; this is the textual
    // ratchet against somebody adding `?? "on"` later.
    for (const file of circlesSources()) {
      const src = code(read(file));
      // A DEFAULT of "on" — `?? "on"`, `|| "on"`, `= "on"`. Deliberately not
      // `=== "on"`, which is how the service reads the mode it was given.
      expect(src, file).not.toMatch(
        /\?\?\s*"on"|\|\|\s*"on"|(?<![=!<>])=\s*"on"/,
      );
    }
  });
});

describe("circles · PR2 — secrets never become columns", () => {
  it("has no raw token or code column in the schema", () => {
    const schema = code(read("apps/api/prisma/schema.prisma"));
    const circlesSection = schema.slice(schema.indexOf("model Circle "));
    for (const [, field] of circlesSection.matchAll(/^\s{2}(\w+)\s+\w/gm)) {
      // `tokenHash` and `codeHash` are fine. A bare `token`, `code`, `secret`
      // or `plaintext` is the thing that must never appear.
      expect(field, field).not.toMatch(
        /^(token|code|secret|rawToken|rawCode|plaintext)$/i,
      );
    }
  });

  it("never persists what the minting functions return", () => {
    // `raw` leaves `circles-secrets.ts` and reaches the caller. Nothing in the
    // module may put it in a Prisma `data` object or a log line.
    for (const file of circlesSources()) {
      const src = code(read(file));
      expect(src, `${file} · logs`).not.toMatch(
        /console\.(log|info|warn|error)|logger\.\w+\(/,
      );
      // `input.tokenHash` is the correct assignment and must not trip this;
      // `input.token` — the raw value — must. Hence the word boundary.
      expect(src, `${file} · tokenHash assignment`).not.toMatch(
        /tokenHash:\s*(raw\b|presented\b|input\.token\b|dto\.)/,
      );
      expect(src, `${file} · codeHash assignment`).not.toMatch(
        /codeHash:\s*(raw\b|presented\b|input\.code\b|dto\.)/,
      );
    }
  });
});

describe("circles · PR2 — the client never asserts who it is", () => {
  it("declares no identity or role field in any DTO", () => {
    const dtoDir = `${CIRCLES_DIR}/dto`;
    const files = readdirSync(join(ROOT, dtoDir)).filter((f) =>
      f.endsWith(".ts"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = code(read(`${dtoDir}/${file}`));
      for (const forbidden of [
        "userId",
        "participantId",
        "activityId",
        "circleId",
        "memberId",
        "role",
      ]) {
        // Not "ignored" — absent. The global pipe runs `forbidNonWhitelisted`,
        // so a body carrying one is rejected before a handler sees it.
        expect(src, `${dtoDir}/${file} · ${forbidden}`).not.toMatch(
          new RegExp(`\\b${forbidden}\\b`),
        );
      }
    }
  });

  it("builds every actor from a server-side value", () => {
    const actor = code(read(`${CIRCLES_DIR}/circles-actor.ts`));
    // The two constructors take a row and a verified subject. Neither signature
    // has a parameter a request body could flow into.
    expect(actor).toMatch(/export function buildGuestActor\(row: \{/);
    expect(actor).toMatch(/export function buildUserActor\(userId: string\)/);
    expect(actor).not.toMatch(/req\.body|request\.body|dto\./);
  });
});

describe("circles · PR2 — nothing outside its own tables moved", () => {
  it("never touches GuideSession", () => {
    // #639's arc is complete and frozen. Círculos referencing `guideSession`
    // anywhere would be the first step of exactly the merge ADR 0023 §2.1
    // rejected.
    for (const file of [...circlesSources(), ...CONTRACT_FILES]) {
      const src = code(read(file));
      for (const forbidden of [
        "guideSession",
        "GuideSession",
        "GuideCommandReceipt",
      ]) {
        expect(src, `${file} · ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("leaves the production catalog empty", () => {
    // Publishing a template is an editorial decision. It cannot become a side
    // effect of wiring a module.
    const catalog = read("packages/types/src/circles-catalog.ts");
    expect(catalog).toMatch(
      /PRODUCTION_CIRCLE_TEMPLATES:\s*readonly CircleActivityDefinition\[\]\s*=\s*\[\]/,
    );
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
    // And not in the Prisma schema either — the models landed in PR2, so this
    // is now checking a real table list rather than an empty possibility.
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

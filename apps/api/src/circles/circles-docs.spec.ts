import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The architecture document, checked against the code it describes.
 *
 * This ratchet exists because of a specific failure: after PR2 merged, the
 * document's header said PR2 while sections 2 and 5 still said the Prisma
 * models, the migration and `CirclesModule` did not exist, and the PR train
 * still called PR2 "this cut". Three statements about the same repository,
 * two of them false, and nothing failed.
 *
 * The fix was to correct those sections in place rather than append a note
 * saying the sections above are out of date — a document that contradicts
 * itself is worse than one that is merely stale, because a reader cannot tell
 * which half to believe.
 *
 * What is checked here is narrow on purpose: not prose style, not
 * completeness, but the specific class of claim that goes stale silently —
 * "this does not exist yet" about something that now does.
 */

const ROOT = join(process.cwd(), "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const ARCH = "docs/architecture/circles-v1.md";
const ADR = "docs/adr/0023-circles-one-domain-many-surfaces.md";

/** Section bodies, so a claim can be located rather than grepped globally. */
function section(src: string, heading: string): string {
  const start = src.indexOf(`\n## ${heading}`);
  expect(start, `section "${heading}" is missing`).toBeGreaterThan(-1);
  const next = src.indexOf("\n## ", start + 4);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("circles docs · the merged cuts are described as merged", () => {
  it("never says the models, the migration or the module do not exist", () => {
    // The eight models, the migration and the Nest module are in `main`. A
    // sentence saying otherwise is not a stale detail — it is the document
    // telling the next author to build something that is already there.
    const arch = read(ARCH);
    const forbidden = [
      /ninguno existe todav[ií]a/i,
      /no existen? (todav[ií]a )?(el )?(modelo|modelos) prisma/i,
      /no a[ñn]ade[^|]*modelo prisma/i,
      /aterrizar[áa] en PR2/i,
      /contiene [úu]nicamente specs y fixtures/i,
      /sin `?CirclesModule`?/i,
    ];
    for (const re of forbidden) {
      expect(arch, `claim matching ${re}`).not.toMatch(re);
    }
  });

  it("marks PR1 and PR2 merged, and PR3 as the cut in progress", () => {
    const arch = read(ARCH);
    for (const line of [
      "PR1_MERGED=true",
      "PR2_MERGED=true",
      "PR3_IN_PROGRESS=true",
    ]) {
      expect(arch, line).toContain(line);
    }
    const train = section(arch, "12.");
    // The train table names exactly one cut as the current one.
    const current = [...train.matchAll(/\*\*este corte\*\*/g)];
    expect(current, "exactly one row is the current cut").toHaveLength(1);
    expect(train).toMatch(
      /\|\s*\*\*3\*\*\s*\|\s*`feat\/circles-participation-state`[^|]*\|[^|]*\|\s*\*\*este corte\*\*/,
    );
    expect(train).toMatch(
      /\|\s*\*\*2\*\*\s*\|\s*`feat\/circles-domain-foundation`[^|]*\|[^|]*\|\s*fusionada/,
    );
  });

  it("keeps section 5 describing models that exist", () => {
    const five = section(read(ARCH), "5.");
    expect(five).toMatch(/todos existentes en `main`/i);
    expect(five).toMatch(/20260909180000_circles_domain_foundation/);
  });

  it("still states the facts about the product, which have not changed", () => {
    // Merged code is not a shipped product. These five lines are what keeps
    // "the models exist" from being read as "Círculos is live".
    const arch = read(ARCH);
    for (const line of [
      "CIRCLES_ROLLOUT_MODE=off_or_absent",
      "PUBLISHED_TEMPLATES=0",
      "CIRCLES_PRODUCTION_ROWS=0",
      "ACCOUNT_DELETION_WITH_CIRCLE_EVENTS=blocked_pending_sanctioned_scrub_design",
      "REQUIRED_BEFORE_PILOT=true",
    ]) {
      expect(arch, line).toContain(line);
    }
    expect(read(ADR)).toContain(
      "ACCOUNT_DELETION_WITH_CIRCLE_EVENTS=blocked_pending_sanctioned_scrub_design",
    );
  });

  it("never calls the shared-content encryption end-to-end", () => {
    // The one claim the product must never make: the API holds the key.
    //
    // The check is on the AFFIRMATIVE form, not on the letters "E2E". Saying
    // "multiparty E2E crypto is out of scope" is a true statement about what
    // the program does NOT build, and an earlier, cruder version of this test
    // flagged exactly that line — a ratchet that fires on a correct sentence
    // teaches people to weaken ratchets.
    for (const doc of [ARCH, ADR]) {
      const src = read(doc);
      for (const line of src.split("\n")) {
        expect(line, `${doc} · ${line.trim()}`).not.toMatch(
          /(lo compartido|el contenido|los sobres|el snapshot|shared content)[^.]{0,80}\b(es|son|is|are)\b[^.]{0,20}(E2E|end-to-end|extremo a extremo)/i,
        );
        expect(line, `${doc} · ${line.trim()}`).not.toMatch(
          /cifrad\w+\s+(de\s+)?(extremo a extremo|end-to-end)/i,
        );
      }
    }
    // And the denial has to be present, not merely the absence of a claim.
    expect(read(ARCH)).toMatch(/\*\*No es E2E\*\*|no es\s+\*\*E2E\*\*/i);
    expect(read(ADR)).toMatch(/esto \*\*no es E2E\*\*/i);
    expect(read(ADR)).toContain("SHARED_CONTENT_IS_E2E=false");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #639 — the freeze record, guarded.
 *
 * ── Why a test guards a paragraph ───────────────────────────────────────────
 *
 * The C.5 section of the ROADMAP records something unusual and easy to erode:
 * production verification that came out PARTIAL, on purpose, because completing
 * it would have required either extracting a bearer token from a server-rendered
 * payload or opening a reader route whose mount writes. Both were refused. The
 * gap is a security boundary that held, not a defect that was skipped.
 *
 * That distinction survives exactly as long as the words do. Six months from
 * now "partial" reads like an oversight somebody should tidy up, and tidying it
 * up means writing `C5_COMPLETE=true` — a sentence nobody measured. So the
 * sentences that carry the distinction are asserted here, in the SECTION that
 * makes the claim, not merely somewhere in a 1,200-line document: a matching
 * phrase three chapters away would satisfy a naive grep while the passage a
 * reader actually lands on said the opposite.
 *
 * What this file does NOT do is freeze prose style. It pins the handful of
 * statements whose inversion would change what a reader believes about
 * production.
 */

const ROADMAP = join(process.cwd(), "../../docs/ROADMAP.md");

/** The C.5 passage alone — heading to heading. */
function c5Section(): string {
  const doc = readFileSync(ROADMAP, "utf8");
  const start = doc.indexOf("#### C.5 — verificación productiva PARCIAL");
  expect(start, "the C.5 freeze section must exist").toBeGreaterThan(-1);
  const after = doc.indexOf("\n#### ", start + 1);
  return doc.slice(start, after === -1 ? doc.length : after);
}

describe("ratchet · the #639 freeze says what was and was not verified", () => {
  it("keeps C.5 incomplete, and keeps the acceptance explicit", () => {
    const s = c5Section();
    // 1 · the flag itself. Flipping it is the single edit that would turn a
    //     measured boundary into an unmeasured claim.
    expect(s).toContain("C5_COMPLETE=false");
    expect(s).not.toContain("C5_COMPLETE=true");
    // 2 · and the word that says the partial result was a decision, not a
    //     leftover. Without it, "false" reads as unfinished business.
    expect(s).toContain("partial_accepted");
  });

  it("never calls the authenticated reader surfaces observed", () => {
    const s = c5Section();
    // 3 · 4 · the two endpoints that were NOT exercised keep saying so.
    expect(s).toContain(
      "CARD_STATE_AUTHENTICATED_SMOKE=blocked_by_readonly_boundary",
    );
    expect(s).toContain(
      "DISCOVERY_AUTHENTICATED_SMOKE=blocked_by_readonly_boundary",
    );
    expect(s).toContain(
      "C5_AUTHENTICATED_READER_SMOKE=blocked_by_security_boundary",
    );
  });

  it("never claims the Lector was opened or its heartbeat ran", () => {
    const s = c5Section();
    // 5 · the route was refused precisely because mounting it writes.
    expect(s).toContain("READER_ROUTE_OPENED=false");
    expect(s).toContain("LECTOR_HEARTBEAT_EXECUTED=false");
  });

  it("never claims a CMS mutation was exercised in production", () => {
    const s = c5Section();
    // 6 · the archive dialog was opened and CANCELLED; rebind never ran.
    expect(s).toContain("CMS_MUTATIONS_EXECUTED=0");
    expect(s).toMatch(/cancelado/i);
    expect(s).not.toMatch(/rebind (real|ejecutado|probado en producción)/i);
  });

  it("never normalises extracting the session's bearer", () => {
    const s = c5Section();
    // 7 · the refusal is the reason the smoke is partial. If this line goes,
    //     the next reader has no idea why the gap exists.
    expect(s).toContain("COOKIE_OR_TOKEN_EXTRACTED=false");
    expect(s).toMatch(/extraer una credencial/i);
  });

  it("keeps the preimage/postimage equality that proves nothing was written", () => {
    const s = c5Section();
    // 8 · the whole no-writes claim rests on this one comparison.
    expect(s).toContain("PREIMAGE_POSTIMAGE_MATCH=true");
    expect(s).toContain("OPERATOR_CONTENT_WRITES=0");
  });

  it("keeps implementation-complete and production-verified apart", () => {
    const s = c5Section();
    // 9 · the two facts that are most tempting to merge into one sentence.
    expect(s).toContain("ISSUE_639_IMPLEMENTATION_COMPLETE=true");
    expect(s).toContain("ISSUE_639_PRODUCTION_VERIFIED=partial");
    expect(s).not.toContain("ISSUE_639_PRODUCTION_VERIFIED=true");
  });

  it("keeps freeze apart from closing the issue", () => {
    const s = c5Section();
    // 10 · frozen is a pause. Closed is a verdict nobody issued.
    expect(s).toContain("ISSUE_639_FROZEN=true");
    expect(s).toContain("ISSUE_639_CLOSED=false");
  });

  it("keeps the freeze point pinned to the verified tree", () => {
    const s = c5Section();
    // 11 · a freeze with no SHA cannot be checked against anything later.
    expect(s).toContain(
      "FREEZE_POINT_MAIN_SHA=cfafbd8214309024c46f700d84ad175ebc327f88",
    );
  });

  it("keeps the four reopening triggers", () => {
    const s = c5Section();
    // 12 · without them, "frozen" has no exit and becomes abandonment.
    expect(s).toMatch(/Criterio de reapertura/i);
    const numbered = s.match(/^\s{0,3}\d\.\s/gm) ?? [];
    expect(numbered.length).toBeGreaterThanOrEqual(4);
  });
});

describe("ratchet · the identity facts #639 established stay stated", () => {
  const doc = () => readFileSync(ROADMAP, "utf8");

  it("never calls `unitKey` portable", () => {
    // 13 · the measurement that forced the whole server-side design: the same
    //      book ingested twice produces different keys.
    const text = doc();
    expect(text).not.toMatch(
      /unitKey[^.\n]{0,40}(es|is) (una )?identidad portable/i,
    );
    expect(text).toMatch(/no (existe|hay) identidad de capítulo portable/i);
  });

  it("never returns positional authority to the browser", () => {
    // 14 · the defect #639 is about. If this line inverts, the issue is open
    //      again whatever the freeze says.
    const text = doc();
    expect(text).toContain("POSITIONAL_BINDING_AUTHORITY=false");
    // Tolerates the markdown emphasis the document actually uses: the claim is
    // what is pinned, not how it is typeset.
    expect(text).toMatch(/anchorAppliesTo`?\s*\**\s*fue eliminado/i);
  });
});

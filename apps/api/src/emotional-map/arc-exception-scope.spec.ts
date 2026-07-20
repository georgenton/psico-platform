import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMPORTANT_CONF_N,
  IMPORTANT_GOOD_N,
  RESONANCE_CONF_N,
  RESONANCE_GOOD_N,
} from "./emotional-map.scoring";
import { MODEL_REGISTRY } from "./model-registry";

/**
 * CC-7.2 — ratchet `arc-exception-scope` (ADR 0018, INV-1…INV-6).
 *
 * The EXPLICIT_AXIS_EXCEPTION is exactly as wide as the ADR approved and not
 * one axis, input or constant wider. This spec pins the shape with stable
 * symbols/fragments (never line numbers): widening the exception — a new axis
 * reading resonances, a frequency/dwell/progress/recall enrichment, an
 * unregistered model id, a silently moved cap — forces a DELIBERATE edit here,
 * which is the ADR's governance requirement (INV-6) made executable.
 *
 * Note ADR 0018 limit 5: `evidence` exposes `modelId` + `n` ONLY.
 * `model_version=1.0` / `model_status=EXPERIMENTAL` live in the model
 * registry — the version is NOT an evidence field, and this ratchet also
 * pins that no version field appears in the ARC evidence literals.
 */

const SCORING = readFileSync(
  join(__dirname, "emotional-map.scoring.ts"),
  "utf8",
);
const SERVICE = readFileSync(
  join(__dirname, "emotional-map.service.ts"),
  "utf8",
);

describe("ratchet · arc-exception-scope", () => {
  // ── INV-4/INV-5 — constants are the ADR's constants ──────────────────────
  it("caps and confidence saturation are exactly the ADR values", () => {
    expect(RESONANCE_GOOD_N).toBe(4);
    expect(RESONANCE_CONF_N).toBe(2);
    expect(IMPORTANT_GOOD_N).toBe(3);
    expect(IMPORTANT_CONF_N).toBe(1);
  });

  // ── INV-6 — both models registered, EXPERIMENTAL v1.0, in the registry ───
  it("ARC-C1 and ARC-P1 are registered (version/status live HERE, not in evidence)", () => {
    const arcC1 = MODEL_REGISTRY.find((m) => m.id === "ARC-C1");
    const arcP1 = MODEL_REGISTRY.find((m) => m.id === "ARC-P1");
    expect(arcC1?.version).toBe("1.0");
    expect(arcC1?.status).toBe("EXPERIMENTAL");
    expect(arcP1?.version).toBe("1.0");
    expect(arcP1?.status).toBe("EXPERIMENTAL");
  });

  // ── INV-2 — the input is counting DISTINCT explicit confirmations ────────
  it("the resonance-derived values are distinct-set counts of conceptKey/important", () => {
    expect(SCORING).toContain(
      "const resonanceConcepts = new Set(resonances.map((r) => r.conceptKey)).size;",
    );
    expect(SCORING).toMatch(
      /const importantConcepts = new Set\(\s*resonances\.filter\(\(r\) => r\.important\)\.map\(\(r\) => r\.conceptKey\),\s*\)\.size;/,
    );
  });

  it("scoring consumes ONLY {conceptKey, important} — no usage timestamps", () => {
    // `confirmedAt` may appear once: the input type declaration. Any second
    // occurrence means a timestamp entered the model — widen deliberately or
    // revert.
    expect((SCORING.match(/confirmedAt/g) ?? []).length).toBe(1);
    // No frequency/dwell/recall enrichment anywhere in scoring:
    expect(SCORING).not.toMatch(/dwell/i);
    // (LearningEvent absence is enforced module-wide by no-learning-in-map.)
  });

  // ── INV-1 — only conexion (ARC-C1) and proposito (ARC-P1) read them ──────
  it("the V2 branches of conexion/proposito are pure resonance counts with caps", () => {
    expect(SCORING).toMatch(
      /const confConexion = emotionalMapV2\s*\?\s*clamp01\(resonanceConcepts \/ RESONANCE_CONF_N\)/,
    );
    expect(SCORING).toMatch(
      /const confProposito = emotionalMapV2\s*\?\s*clamp01\(importantConcepts \/ IMPORTANT_CONF_N\)/,
    );
    expect(SCORING).toMatch(
      /const conexionRaw = emotionalMapV2\s*\?\s*clamp01\(resonanceConcepts \/ RESONANCE_GOOD_N\)/,
    );
    expect(SCORING).toMatch(
      /const propositoRaw = emotionalMapV2\s*\?\s*clamp01\(importantConcepts \/ IMPORTANT_GOOD_N\)/,
    );
  });

  it("no OTHER axis reads the resonance-derived values (exhaustive use list)", () => {
    // Every line that mentions the derived counts must be on this allowlist.
    // A new consumer (another axis, a new formula) adds a line that is not —
    // and this test fails until the widening is deliberate and reviewed.
    const allowed: RegExp[] = [
      /^\s*const resonanceConcepts = new Set\(/, //           definition
      /^\s*const importantConcepts = new Set\(/, //           definition
      // (the `.filter((r) => r.important)` continuation line has no derived
      //  identifier on it — INV-2's fragment test above pins its exact shape)
      /^\s*\? clamp01\(resonanceConcepts \/ RESONANCE_CONF_N\)/, // confConexion
      /^\s*\? clamp01\(importantConcepts \/ IMPORTANT_CONF_N\)/, // confProposito
      /^\s*\? clamp01\(resonanceConcepts \/ RESONANCE_GOOD_N\)/, // conexionRaw
      /^\s*\? clamp01\(importantConcepts \/ IMPORTANT_GOOD_N\)/, // propositoRaw
      /^\s*\? resonanceConcepts > 0/, //                      conexion sources
      /^\s*\? importantConcepts > 0/, //                      proposito sources
      /^\s*measured: emotionalMapV2 && resonanceConcepts > 0,/, // conexion
      /^\s*measured: emotionalMapV2 && importantConcepts > 0,/, // proposito
      /^\s*\? \{ modelId: "ARC-C1", n: resonanceConcepts \}/, // evidence
      /^\s*\? \{ modelId: "ARC-P1", n: importantConcepts \}/, // evidence
      /^\s*resonanceCount: resonanceConcepts,/, //            narrator FACTS (copy only)
    ];
    const uses = SCORING.split("\n").filter((line) =>
      /resonanceConcepts|importantConcepts/.test(line),
    );
    const unexpected = uses.filter(
      (line) => !allowed.some((re) => re.test(line)),
    );
    expect(unexpected).toEqual([]);
    // …and the allowlist itself is fully exercised (no dead entries):
    for (const re of allowed) {
      expect(
        uses.some((line) => re.test(line)),
        String(re),
      ).toBe(true);
    }
  });

  // ── ADR 0018 limit 5 — evidence exposes modelId + n, never a version ─────
  it("ARC evidence literals carry exactly {modelId, n} — no version field", () => {
    expect(SCORING).toContain('? { modelId: "ARC-C1", n: resonanceConcepts }');
    expect(SCORING).toContain('? { modelId: "ARC-P1", n: importantConcepts }');
    // No evidence literal anywhere in scoring exposes a model version:
    expect(SCORING).not.toMatch(/modelId:[^}]*version/s);
  });

  // ── INV-3 — the service feeds the scoring only the catalog metadata ──────
  it("the service selects only {conceptKey, confirmedAt, important} from Resonance", () => {
    expect(SERVICE).toMatch(
      /resonance\.findMany\(\{\s*where: \{ userId \},\s*select: \{ conceptKey: true, confirmedAt: true, important: true \},\s*\}\)/,
    );
  });
});

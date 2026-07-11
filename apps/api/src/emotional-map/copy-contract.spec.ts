import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fase B — copy contract ratchet (docs/product/emotional-map-copy-contract.md).
 *
 * Scans the PUBLIC map components (web + mobile) for forbidden copy terms.
 * The KNOWN_VIOLATIONS snapshot pins today's reality: removing a violation
 * requires shrinking the snapshot (good), and introducing a NEW forbidden term
 * anywhere in these files fails the build (the point of the ratchet).
 *
 * Same file-walking pattern as the privacy specs — these are source files of
 * sibling workspaces, resolved from the repo root.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

/** Forbidden terms (matched case-insensitively) per the copy contract. */
const FORBIDDEN_TERMS = [
  "comprensión emocional",
  "confianza",
  "te recuperas",
  "vas en buena dirección",
  "ánimo de base es bueno",
  "muy parejo",
  "señal temprana",
  "medido",
  "minutos de lectura",
  "racha actual",
  "conversaciones con eco",
  "la ia notó",
  "riesgo detectado",
  "crisis detectada",
  "dominas esta habilidad",
] as const;

/** Public map surfaces under contract (relative to repo root). */
const FILES = [
  "apps/web/src/components/dashboard/mapa/MapStage.tsx",
  "apps/web/src/components/dashboard/mapa/MapDims.tsx",
  "apps/web/src/components/dashboard/mapa/MapAffectDynamics.tsx",
  "apps/web/src/components/dashboard/mapa/MapFeed.tsx",
  "apps/web/src/components/dashboard/mapa/MapInfoButton.tsx",
  "apps/web/src/components/dashboard/mapa/affect-copy.ts",
  // Fase F — V2 layout components enter the contract clean (zero violations).
  "apps/web/src/components/dashboard/mapa/MapMomento.tsx",
  "apps/web/src/components/dashboard/mapa/MapSelfReport.tsx",
  "apps/web/src/components/dashboard/mapa/MapLenguaje.tsx",
  "apps/web/src/components/dashboard/mapa/MapNarrative.tsx",
  "apps/mobile/src/components/dashboard/mapa/affect-copy.ts",
  "apps/mobile/src/components/dashboard/mapa/MapSelfReportCard.tsx",
  "apps/mobile/app/(tabs)/mapa.tsx",
] as const;

/**
 * Today's violations, pinned. Fixing one (Fase B'/F) means REMOVING it here in
 * the same PR — never adding. Keys are repo-relative paths; values are the
 * sorted forbidden terms present in that file.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  // Fase F: the V2 layout has no pct / "Medido" / engagement copy, and the
  // privacy-modal "conversaciones con Eco" mentions were reworded ("charlas").
  // What remains lives ONLY in the LEGACY branches of these files — they are
  // rendered while EMOTIONAL_MAP_LEGACY_UI holds and get DELETED when the
  // legacy layout retires (Fase G), which is when these entries shrink to
  // zero.
  "apps/web/src/components/dashboard/mapa/MapStage.tsx": [
    "comprensión emocional",
  ],
  "apps/web/src/components/dashboard/mapa/MapDims.tsx": ["medido"],
  "apps/mobile/app/(tabs)/mapa.tsx": ["comprensión emocional", "medido"],
};

function violationsIn(content: string): string[] {
  const lower = content.toLowerCase();
  return FORBIDDEN_TERMS.filter((t) => lower.includes(t)).sort();
}

describe("Emotional Map copy contract (ratchet)", () => {
  it("no NEW forbidden terms appear in public map components", () => {
    const found: Record<string, string[]> = {};
    for (const rel of FILES) {
      const content = readFileSync(join(REPO_ROOT, rel), "utf8");
      const terms = violationsIn(content);
      if (terms.length > 0) found[rel] = terms;
    }
    // Exact match: a new term fails (ratchet up); a fixed term also fails
    // until the snapshot is shrunk in the same PR (deliberate bookkeeping).
    expect(found).toEqual(KNOWN_VIOLATIONS);
  });

  it("every file under contract exists (guards against silent renames)", () => {
    for (const rel of FILES) {
      expect(() => readFileSync(join(REPO_ROOT, rel), "utf8")).not.toThrow();
    }
  });
});

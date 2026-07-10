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
  "apps/mobile/src/components/dashboard/mapa/affect-copy.ts",
  "apps/mobile/app/(tabs)/mapa.tsx",
] as const;

/**
 * Today's violations, pinned. Fixing one (Fase B'/F) means REMOVING it here in
 * the same PR — never adding. Keys are repo-relative paths; values are the
 * sorted forbidden terms present in that file.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  // Fase B' (L1) cleaned the affect block: MapAffectDynamics + both
  // affect-copy twins are now term-free. What remains belongs to later
  // phases: the global pct + "Medido" badge (Fase F) and the engagement
  // chips (Fase C → LearningDashboard).
  "apps/web/src/components/dashboard/mapa/MapStage.tsx": [
    "comprensión emocional",
  ],
  "apps/web/src/components/dashboard/mapa/MapDims.tsx": ["medido"],
  "apps/web/src/components/dashboard/mapa/MapFeed.tsx": [
    "conversaciones con eco",
    "minutos de lectura",
    "racha actual",
  ],
  // Benign occurrence: the privacy modal SAYS Eco conversations are encrypted
  // — it does not present them as a map source. Pinned all the same; context
  // review happens when the modal is rewritten in Fase F.
  "apps/web/src/components/dashboard/mapa/MapInfoButton.tsx": [
    "conversaciones con eco",
  ],
  "apps/mobile/app/(tabs)/mapa.tsx": [
    "comprensión emocional",
    "conversaciones con eco",
    "medido",
    "minutos de lectura",
  ],
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

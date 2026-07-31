import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Mi Evolución says what happened, not what it made of you.
 *
 * «Tu transformación en el tiempo» and «Hitos de tu transformación» are claims
 * about a person's inner change that this screen has no evidence for — it counts
 * chapters, practices and recall attempts. The screen was reworded to describe
 * the record instead ("recorrido"), and this ratchet keeps it that way.
 *
 * The page is an async Server Component, so its error fallback cannot be mounted
 * in jsdom. Reading the source is the honest way to pin copy that no component
 * test can reach; the component-level pins live beside MilestonesTimeline and
 * LearningActivityCard.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../../..");

const COMPONENTS = "apps/web/src/components/dashboard/evolucion";

// Enumerated rather than listed, so a new component joins the ratchet the day
// it is added instead of the day someone remembers to extend an array.
const SURFACE = [
  "apps/web/src/app/dashboard/evolucion/page.tsx",
  ...readdirSync(resolve(repoRoot, COMPONENTS))
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => `${COMPONENTS}/${f}`),
];

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("Mi Evolución · copy contract", () => {
  it("claims no transformation anywhere on the surface", () => {
    const offenders = SURFACE.filter((rel) => /transformaci/i.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it("uses «Tu recorrido, registrado» in both header branches", () => {
    const page = read("apps/web/src/app/dashboard/evolucion/page.tsx");

    expect(page).not.toContain("Tu transformación en el tiempo");
    // Once for the error fallback, once for the loaded page.
    expect(page.match(/Tu recorrido, registrado/g)).toHaveLength(2);
  });

  it("titles the timeline «Hitos de tu recorrido» in both states", () => {
    const timeline = read(
      "apps/web/src/components/dashboard/evolucion/MilestonesTimeline.tsx",
    );

    expect(timeline).not.toContain("Hitos de tu transformación");
    // Once for the empty state, once for the populated timeline.
    expect(timeline.match(/Hitos de tu recorrido/g)).toHaveLength(2);
  });
});

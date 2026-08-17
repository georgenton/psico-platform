import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * C.0A1 — a ratchet over the CLAIMS, not just the config.
 *
 * The roadmap and the PR body have already carried three statements that were
 * wrong in ways the files themselves could not catch: that Config-as-Code
 * replaces the dashboard wholesale, that an omitted field returns to its
 * default, and that re-reading the service after binding proves a deployment
 * consumed the file. Each was plausible, each was repeated, and none of the
 * existing tests could see them.
 *
 * So the prose gets a ratchet too — narrow on purpose: it pins the handful of
 * claims that would mislead whoever performs the binding.
 */

const ROADMAP = join(process.cwd(), "..", "..", "docs", "ROADMAP.md");
const text = () => readFileSync(ROADMAP, "utf8");

describe("docs ratchet · the merge model is stated correctly", () => {
  it("says Railway MERGES rather than replaces", () => {
    expect(text()).toMatch(/no reemplaza el dashboard|combina/i);
  });

  it("does not claim an omitted field reverts to its default", () => {
    // It keeps the dashboard's value. Saying otherwise is what made
    // `sleepApplication` look safe to omit.
    expect(text()).toMatch(/Un campo\s+omitido \*\*no\*\* vuelve a su default/);
  });

  it("keeps the five binding states separate", () => {
    for (const marker of [
      "REPO_CONFIG_RATCHET=true",
      "RAILWAY_CONFIG_PATHS_BOUND=false",
      "CONFIG_SOURCE_USED_BY_API_DEPLOYMENT=false",
      "CONFIG_SOURCE_USED_BY_WORKER_DEPLOYMENT=false",
      "DEPLOYED_CONFIG_MATCHES_REPO=false",
    ]) {
      expect(text()).toContain(marker);
    }
  });

  it("says binding alone does not prove a deployment used the file", () => {
    expect(text()).toMatch(
      /releer\s+`serviceInstance` después del binding no prueba/,
    );
  });
});

describe("docs ratchet · the measured semantics are recorded", () => {
  it("records that an omitted field contributes nothing", () => {
    // The probe's core finding. Without it, "the file omits it" reads as a
    // guarantee, which is exactly the mistake this replaced.
    expect(text()).toMatch(/campo \*\*omitido\*\*.*no aparece/s);
  });

  it("records that null IS a declaration", () => {
    const src = text();
    expect(src).toContain("propertyFileMapping");
    expect(src).toMatch(/`null` es una\s*\n?declaración/);
  });

  it("records that the file does not write into the stored config", () => {
    expect(text()).toMatch(
      /el fichero no escribe en la\s*\n?configuración almacenada/,
    );
  });

  it("keeps the honest limit — the override of a non-null value was not observed", () => {
    // The one step the probe could not reach. Dropping this sentence would
    // turn a sound argument into an overstated claim.
    expect(text()).toMatch(
      /no llegué a observar el paso final|Límite honesto/i,
    );
  });

  it("the worker's fields are CODE_OWNED because they are DECLARED", () => {
    const rows = text()
      .split("\n")
      .filter((l) => l.startsWith("|") && l.includes("(worker)"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row).toContain("CODE_OWNED");
      expect(row).toMatch(/null/);
    }
  });

  it("NOT_APPLICABLE stays qualified as not governed by the file", () => {
    expect(text()).toMatch(/NOT_APPLICABLE`? · \*\*no declarados\*\*/);
  });
});

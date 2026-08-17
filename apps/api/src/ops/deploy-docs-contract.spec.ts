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

  it("separates what was measured from what was derived", () => {
    // The probe measured that null is a file contribution. Railway DOCUMENTS
    // that a present property wins over the dashboard. That null therefore
    // clears a dashboard value follows from both — it was never observed,
    // because no non-null stored value could be set to collide with. Losing
    // any one of these four lines turns a sound argument into an overstated
    // claim.
    const src = text();
    expect(src).toContain("NULL_IS_FILE_CONTRIBUTION=proven");
    expect(src).toContain("FILE_VALUE_PRECEDENCE_OVER_DASHBOARD=documented");
    expect(src).toContain("NULL_OVER_NON_NULL_DASHBOARD_OBSERVED=false");
    expect(src).toContain(
      "NULL_CLEAR_BEHAVIOR=derived_from_provenance_plus_documented_precedence",
    );
  });

  it("never calls the unobserved link measured or proven", () => {
    // The passage about clearing a dashboard value must read as a derivation.
    // "Medido" or "probado" there would simply be false.
    const src = text();
    const claim = src.slice(src.indexOf("NULL_CLEAR_BEHAVIOR")).slice(0, 900);
    expect(claim).toMatch(/derivación/i);
    expect(claim).toMatch(/no una observación/i);
  });

  it("does not claim the files merely reproduce the effective config", () => {
    // They do not: the watch patterns are deliberate hardening, and the
    // worker's nulls are new declarations.
    const src = text();
    expect(src).not.toMatch(/y reproducen la configuración efectiva\./);
    expect(src).toMatch(/hardening/);
    expect(src).toMatch(/declaraciones nuevas/);
    expect(src).toMatch(/un deployment consuma los ficheros/);
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

/**
 * The operational plan gets its own ratchet.
 *
 * These are not stylistic preferences. Each pins a way the plan could quietly
 * become unsafe again: counting a binding-triggered deployment as "none", so it
 * never gets verified; binding both services at once, so the canary stops being
 * a canary; and calling an operational rollback "closed" while `main` still
 * points at the code that failed.
 */
describe("docs ratchet · the two-wave plan stays safe", () => {
  it("expects exactly one verifiable deployment per service in wave 2", () => {
    const src = text();
    expect(src).toContain("WAVE_2_WORKER_DEPLOYMENTS_EXPECTED=1");
    expect(src).toContain("WAVE_2_API_DEPLOYMENTS_EXPECTED=1");
    // Only the MANUAL redeploys may be zero.
    expect(src).toContain(
      "WAVE_2_MANUAL_REDEPLOYS_EXPECTED=0_or_1_per_service",
    );
    expect(src).not.toContain("WAVE_2_API_DEPLOYMENTS_EXPECTED=0");
    expect(src).not.toContain("WAVE_2_WORKER_DEPLOYMENTS_EXPECTED=0");
  });

  it("forbids reporting zero deployments because the binding triggered them", () => {
    // A deployment the binding created is still a deployment, and it is the
    // exact one carrying the file for the first time.
    expect(text()).toMatch(
      /nunca\*{0,2}\s+es correcto\s*\n?\s*es reportar «0 deployments en la onda 2 porque el binding los disparó»/,
    );
  });

  it("binds the worker first and the API only after it is healthy", () => {
    const src = text();
    expect(src).toContain("WAVE_2_WORKER_FIRST=true");
    expect(src).toContain("WAVE_2_API_AFTER_WORKER_HEALTHY=true");
    expect(src).toMatch(/Los dos servicios no se enlazan a la vez/);
    expect(src).toMatch(/worker \(canario\)/i);
    // Wave 2A must precede wave 2B in the document, not merely be mentioned.
    expect(src.indexOf("Onda 2A")).toBeGreaterThan(0);
    expect(src.indexOf("Onda 2B")).toBeGreaterThan(src.indexOf("Onda 2A"));
  });

  it("keeps a terminal health gate between the worker and the API", () => {
    expect(text()).toMatch(
      /\*\*Gate terminal:\*\* no se pasa al API hasta que el worker esté sano/,
    );
  });

  it("separates operational rollback from source reconciliation", () => {
    const src = text();
    expect(src).toMatch(/Nivel 1 · Rollback operativo inmediato/);
    expect(src).toMatch(/Nivel 2 · Reconciliación de fuente/);
    // Restoring a deployment leaves main ahead of production. Say so.
    expect(src).toMatch(/`main` sigue\s*\n?apuntando al commit nuevo/);
    expect(src).toMatch(/solicitar autorización\*{0,2} antes de fusionarla/);
  });

  it("never calls an operational rollback a closed incident", () => {
    const src = text();
    // The marker has two distinct jobs, and `toContain` alone cannot tell them
    // apart: it must be REPORTED by whoever rolls back, and it must be what
    // keeps the incident open. Dropping either one leaves the other looking
    // like coverage.
    expect(src).toMatch(
      /reportar\s*\n?\s*la causa exacta y registrar `SOURCE_RUNTIME_DIVERGENCE=true`/,
    );
    expect(src).toMatch(
      /rollback operativo con `SOURCE_RUNTIME_DIVERGENCE=true` es una \*\*mitigación\s*\n?completada, no un incidente cerrado\*\*/,
    );
    expect(src).toMatch(
      /no declarar cerrado el incidente\*{0,2} mientras `main` y producción no vuelvan a/,
    );
  });

  it("does not pause autodeploy or revert Git without its own authorization", () => {
    expect(text()).toMatch(
      /no se pausa el autodeploy ni se revierte\s*\n?Git sin autorización independiente/,
    );
  });
});

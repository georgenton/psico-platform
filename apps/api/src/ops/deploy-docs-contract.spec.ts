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

describe("docs ratchet · omitted fields are not claimed as CODE_OWNED", () => {
  it("the worker's pre-deploy and healthcheck are marked unresolved", () => {
    // Omission does not prevent inheritance, and the authoritative "clear"
    // representation is still an open question. Calling either CODE_OWNED
    // would promise a guarantee the file does not deliver.
    const src = text();
    const rows = src
      .split("\n")
      .filter((l) => l.includes("(worker)") && l.startsWith("|"));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row).toContain("DASHBOARD_OWNED");
      expect(row).not.toMatch(/`CODE_OWNED`/);
    }
  });

  it("the open question is recorded as blocked, not guessed", () => {
    expect(text()).toContain("BLOCKED_NEEDS_NON_PRODUCTION_RAILWAY_PROBE=true");
  });

  it("NOT_APPLICABLE is qualified as 'no value today', not guaranteed", () => {
    expect(text()).toMatch(/NOT_APPLICABLE`? · \*\*sin valor efectivo hoy/);
  });
});

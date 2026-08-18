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

/**
 * Slice one wave's section out of the document.
 *
 * Without this, a check meant for wave 2A passes on wording that only exists in
 * 2B — which is exactly how 2B ended up with half a decision machine while the
 * global checks stayed green. Each wave is verified against its own text.
 */
const waveSection = (heading: string): string => {
  const src = text();
  const start = src.indexOf(`###### ${heading}`);
  if (start < 0) throw new Error(`missing section: ${heading}`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n#{5,6} /);
  return next < 0 ? rest : rest.slice(0, next);
};
const wave2A = () => waveSection("Onda 2A — worker (canario)");
const wave2B = () => waveSection("Onda 2B — API");

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
    // C.0A1 closed all five on 2026-08-18, so they now read `true`. What the
    // ratchet protects is not their value but their SEPARATENESS: binding is
    // not consuming, and consuming is not matching. Collapsing them into one
    // "config is done" line is the regression, and the roadmap has to keep
    // saying so out loud now that they happen to agree.
    for (const marker of [
      "REPO_CONFIG_RATCHET=true",
      "RAILWAY_CONFIG_PATHS_BOUND=true",
      "CONFIG_SOURCE_USED_BY_API_DEPLOYMENT=true",
      "CONFIG_SOURCE_USED_BY_WORKER_DEPLOYMENT=true",
      "DEPLOYED_CONFIG_MATCHES_REPO=true",
    ]) {
      expect(text()).toContain(marker);
    }
    expect(text().replace(/\s+/g, " ")).toMatch(
      /Siguen siendo cinco preguntas distintas: enlazar no es consumir, y consumir no es coincidir/,
    );
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
    const flat = text().replace(/\s+/g, " ");
    const claim = flat.slice(flat.indexOf("NULL_CLEAR_BEHAVIOR")).slice(0, 900);
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
    // Whitespace-tolerant: the sentence reflows whenever the section is edited,
    // and a ratchet that breaks on rewrapping teaches people to delete it.
    const flat = text().replace(/\s+/g, " ");
    expect(flat).toMatch(
      /nunca\*{0,2} es correcto es reportar «0 deployments en la onda 2 porque el binding los disparó»/,
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

/**
 * How a binding actually gets applied — learned the expensive way.
 *
 * The first wave-2A attempt wrote the config path, ran `railway redeploy`, got
 * a green SUCCESS, and proved nothing: a plain redeploy reuses the resolved
 * configuration of the deployment it copies, so the pending binding was never
 * applied. A throwaway Railway project then showed what does work — writing the
 * path applies immediately (no staged change), and a deployment FROM SOURCE is
 * what re-resolves Config-as-Code.
 *
 * These pins exist so that lesson cannot quietly evaporate from the plan.
 */
describe("docs ratchet · applying a binding is not the same as writing it", () => {
  it("separates writing the path from applying it", () => {
    const src = text();
    expect(src).toMatch(
      /\*\*Escribir\*\*\s*\n?`railwayConfigFile` deja el path guardado; \*\*aplicarlo\*\*/,
    );
    expect(src).toMatch(/Son dos operaciones, no\s*\n?una/);
  });

  it("rejects a plain redeploy as proof of consumption", () => {
    const src = text();
    expect(src).toMatch(
      /redeploy del deployment actual\*{0,2} reutiliza\s*\n?la configuración ya resuelta/,
    );
    expect(src).toMatch(
      /no aplica\s*\n?el binding pendiente y \*\*no demuestra nada\*\*/,
    );
  });

  it("names the source-deployment mechanism the probe actually verified", () => {
    const src = text();
    expect(src).toContain(
      "BINDING_APPLICATION_MODE=FROM_SOURCE_REDEPLOY_AFTER_APPLIED_BINDING",
    );
    // The command has two jobs — recorded as what the probe verified, and
    // prescribed in the wave-2A steps. `toContain` cannot tell them apart, so
    // losing either one would slip past a single check.
    expect(src).toContain("COMMAND_VERIFIED=railway redeploy --from-source");
    expect(src.replace(/\s+/g, " ")).toMatch(
      /deployment desde la fuente \(`railway redeploy --from-source`\) sobre el SHA/,
    );
    expect(src).toContain("BINDING_WRITE_CREATED_STAGED_CHANGE=false");
    expect(src).toContain("BINDING_WRITE_CREATED_DEPLOYMENT=false");
  });

  it("keeps the staged-change bookends on the wave", () => {
    expect(text()).toMatch(
      /empieza con \*\*cero staged changes\*\* y termina con \*\*cero\s*\n?staged changes\*\*/,
    );
  });

  it("refuses SUCCESS alone and demands all three manifests", () => {
    const src = text();
    expect(src).toMatch(
      /El estado `SUCCESS` \*\*no\*\* es evidencia de nada|`SUCCESS` \*\*no\*\* es evidencia/,
    );
    expect(src).toMatch(/manifests vacíos es un \*\*fallo\s*\n?de la onda\*\*/);
    // Empty is never acceptable for either provenance manifest.
    expect(src).toMatch(/`fileServiceManifest` \*\*no vacío\*\*/);
    expect(src).toMatch(/`propertyFileMapping` \*\*no vacío\*\*/);
  });

  it("treats null and empty string as representations, never as equal values", () => {
    const src = text();
    // Both mean unbound — but they are distinct stored values, and the check is
    // bound-vs-unbound. Collapsing them into "equivalent" is the regression.
    expect(src).toMatch(
      /\*\*dos representaciones de almacenamiento distintas del mismo estado\s*\n?semántico\*\*/,
    );
    expect(src).toMatch(/no son el mismo valor/);
    expect(src).toContain('UNBOUND  ⇔  railwayConfigFile ∈ { null, "" }');
    expect(src).toMatch(
      /Un path no vacío \*\*nunca\*\* cuenta como desenlazado/,
    );
  });

  it("blocks wave 2B while 2A is incomplete", () => {
    expect(text()).toMatch(
      /Mientras\s*\n?\s*`WAVE_2A_COMPLETE=false`, el siguiente paso es reintentar la 2A, nunca\s*\n?\s*empezar la 2B/,
    );
  });
});

/**
 * Both waves must carry the SAME three-way decision machine.
 *
 * Wave 2B originally recorded whether the write staged or deployed, and then
 * only handled "neither" — so a staged change or a directly-created deployment
 * would have fallen through to a step that did not exist. Each wave is checked
 * against its own section so neither can borrow the other's wording.
 */
describe("docs ratchet · both waves branch the same way", () => {
  for (const [label, section] of [
    ["2A", wave2A],
    ["2B", wave2B],
  ] as const) {
    it(`wave ${label} records both write outcomes separately`, () => {
      const s = section();
      expect(s).toContain("BINDING_WRITE_CREATED_STAGED_CHANGE");
      expect(s).toContain("BINDING_WRITE_CREATED_DEPLOYMENT");
    });

    it(`wave ${label} covers the staged-change branch`, () => {
      expect(section().replace(/\s+/g, " ")).toMatch(
        /\*\*staged change.{0,12}\*\* → aplicar ese changeset y verificar el deployment/,
      );
    });

    it(`wave ${label} covers the direct-deployment branch without creating another`, () => {
      expect(section().replace(/\s+/g, " ")).toMatch(
        /\*\*deployment directo.{0,12}\*\* → verificar \*\*ese\*\* deployment y \*\*no crear otro\*\*/,
      );
    });

    it(`wave ${label} falls back to a source deployment`, () => {
      expect(section().replace(/\s+/g, " ")).toMatch(
        /\*\*ninguno de los dos\*\* → lanzar \*\*un\*\* deployment desde la fuente \(`railway redeploy --from-source`\)/,
      );
    });

    it(`wave ${label} refuses a plain redeploy as proof`, () => {
      expect(section().replace(/\s+/g, " ")).toMatch(
        /redeploy plano \*{0,2}nunca\*{0,2} vale como prueba|Tampoco aquí un redeploy plano cuenta como prueba/,
      );
    });

    it(`wave ${label} opens and closes on zero staged changes`, () => {
      const flat = section().replace(/\s+/g, " ");
      expect(flat).toMatch(/arranca con \*\*cero staged changes\*\*/);
      expect(flat).toMatch(/queda otra vez con \*\*cero staged changes\*\*/);
    });
  }
});

/**
 * What the second probe did and did NOT settle.
 *
 * It reconfirmed that a declared `null` is a file contribution — both nulls
 * showed up in propertyFileMapping on a real from-source deployment. It did not
 * pit a file `null` against a non-null stored dashboard value, so the clearing
 * behaviour is still derived. Calling that "the last derived link, closed"
 * would be the same overstatement this ratchet exists to prevent.
 */
describe("docs ratchet · the second probe reconfirms, it does not close", () => {
  it("keeps the unobserved collision marked as unobserved", () => {
    const src = text();
    expect(src).toContain("NULL_OVER_NON_NULL_DASHBOARD_OBSERVED=false");
    expect(src).not.toContain("NULL_OVER_NON_NULL_DASHBOARD_OBSERVED=true");
    expect(src).toContain(
      "NULL_CLEAR_BEHAVIOR=derived_from_provenance_plus_documented_precedence",
    );
    expect(src).not.toMatch(/NULL_CLEAR_BEHAVIOR=(observed|proven|measured)/);
  });

  it("never claims the derived link was closed", () => {
    const flat = text().replace(/\s+/g, " ");
    expect(flat).not.toMatch(/cierra el (último|ultimo) eslabón/i);
    expect(flat).not.toMatch(/eslabón (derivado )?cerrado/i);
    expect(flat).not.toMatch(/C\.0A1 (solo )?hab(í|i)a derivado/i);
    // And it must say, positively, what the new evidence is worth.
    expect(flat).toMatch(
      /reconfirmó\*{0,2}, ahora en un deployment desde fuente/,
    );
    expect(flat).toMatch(/\*\*no\*\* el cierre de la colisión no observada/);
  });

  it("does not overstate what fileServiceManifest contains", () => {
    const src = text();
    expect(src).toContain(
      "FILE_MANIFEST_CLAIM=structurally matched all nine governed build/deploy fields",
    );
    expect(src).toContain("FILE_MANIFEST_FULL_JSON_EQUALITY=false");
    const flat = src.replace(/\s+/g, " ");
    expect(flat).toMatch(
      /`fileServiceManifest` \*\*no\*\* es el fichero\. No trae `\$schema`/,
    );
    // The marker alone is not enough: the prose must not go back to claiming
    // the manifest reproduces the file, which is what it literally does not do.
    expect(flat).not.toMatch(/reproduc\w+ el fichero( exactamente)?/i);
    expect(flat).toMatch(
      /coincidiendo \*\*estructuralmente en los nueve campos gobernados\*\*/,
    );
  });

  it("reports the probe project as tombstoned, not gone", () => {
    const src = text();
    expect(src).toContain("TEMP_SERVICE_DELETED=true");
    expect(src).toContain("TEMP_PROJECT_DELETION_SCHEDULED=true");
    expect(src).toContain("TEMP_PROJECT_DELETED=false_as_of_report");
    expect(src).toContain("ACTIVE_COMPUTE_RESOURCES_REMAINING=0");
    expect(src).toContain("PROJECT_TOMBSTONE_PENDING=true");
    expect(src).not.toMatch(/TEMP_PROJECT_DELETED=true/);
    expect(src.replace(/\s+/g, " ")).toMatch(
      /el objeto Project todavía existe hasta que Railway ejecute su borrado/,
    );
  });
});

/**
 * The stacked train has an operational trap, so the roadmap has to name it.
 *
 * A PR based on another branch does not receive the workflows a PR against
 * `main` does — 15 checks versus 8, here. Reading a green 8/8 as "gates
 * passed" is how a stacked branch reaches production having skipped whatever
 * only runs on the default branch.
 */
describe("docs ratchet · the stacked release train", () => {
  it("says a stacked PR must be retargeted and rebuilt after its base merges", () => {
    const flat = text().replace(/\s+/g, " ");
    expect(flat).toMatch(/reapuntarse a `main`/);
    expect(flat).toMatch(/actualizarse contra el merge commit real/);
    expect(flat).toMatch(/su diff contiene \*\*solo\*\* C\.0B2/);
    expect(flat).toMatch(/diff exclusivo de C\.0B3/);
    expect(flat).toMatch(/cero migraciones nuevas en su diff/);
  });

  it("never equates a stacked check run with the gates against main", () => {
    const flat = text().replace(/\s+/g, " ");
    expect(flat).toMatch(
      /Un `8\/8` verde \*\*no equivale\*\* a los gates completos contra `main`/,
    );
  });

  it("records what #639 already solved instead of relisting it as pending", () => {
    const src = text();
    expect(src).toContain("EXACT_PIN_RECOVERY_MULTI_ACTIVE_SAFE=true");
    expect(src).toContain("ACTIVE_LOOKUP_SCOPED_BY_GUIDE_KEY=true");
    expect(src).toContain("ARBITRARY_ACTIVE_SELECTION_PRESENT=false");
    // The one documented unscoped read must stay described as a cardinality
    // PROOF, not as a session lookup.
    expect(src.replace(/\s+/g, " ")).toMatch(
      /`activeOwnCardinality`, que existe para \*\*probar\*\* la promesa del índice global/,
    );
  });

  it("keeps the unrelated flake as separate debt, with its evidence", () => {
    const flat = text().replace(/\s+/g, " ");
    expect(flat).toMatch(/guide-firewall\.e2e-spec\.ts/);
    expect(flat).toMatch(/falló \*\*1 de 6\*\*/);
    expect(flat).toMatch(/una corrida verde posterior no borra el hecho/);
  });
});

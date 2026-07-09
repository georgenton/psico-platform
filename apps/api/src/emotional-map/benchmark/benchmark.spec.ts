import { describe, expect, it } from "vitest";
import type { EmotionalMapResult } from "@psico/types";

import { scoreEmotionalMap } from "../emotional-map.scoring";
import type { IEmotionalMapProvider } from "../providers/provider.interface";
import { buildPersonaInput, PERSONAS } from "./personas";

/**
 * Stage 0 — offline multi-persona benchmark. Runs each synthetic user archetype
 * through the REAL scoring (scoreEmotionalMap), prints a table, and asserts
 * per-persona behaviour so it doubles as a regression guard. Deterministic.
 * Captured output lives in docs/research/emotional-map-benchmark.md.
 */

// Fixed stub for the LLM axes — the benchmark is about the data → structure
// mapping, not the model's wording. OU overrides Calma when active anyway.
const stubProvider: IEmotionalMapProvider = {
  name: "stub",
  score: async () => ({
    calma: 0.6,
    claridad: 0.6,
    compasion: 0.55,
    consciencia: 0.6,
  }),
};

function pctOrGathering(v: number | null, active: boolean): string {
  if (!active) return "—";
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

describe("Stage 0 — emotional-map persona benchmark", () => {
  it("maps each persona to a map result and prints the benchmark table", async () => {
    const rows: Array<{ id: string; result: EmotionalMapResult }> = [];
    for (const p of PERSONAS) {
      const result = await scoreEmotionalMap(
        buildPersonaInput(p),
        stubProvider,
      );
      rows.push({ id: p.id, result });
    }

    // eslint-disable-next-line no-console
    console.log(
      "\n[BENCHMARK] persona → mapa (días · #ánimo · dinámica · conf · tono · recup · estab · inercia · cobertura · pct)",
    );
    for (const { id, result } of rows) {
      const p = PERSONAS.find((x) => x.id === id)!;
      const ad = result.affectDynamics;
      const active = ad?.status === "active";
      const conf = ad ? `${Math.round(ad.confidence * 100)}%` : "—";
      const inertia =
        active && ad?.inertiaDays != null ? `${ad.inertiaDays.toFixed(1)}d` : "—"; // prettier-ignore
      // eslint-disable-next-line no-console
      console.log(
        [
          id.padEnd(24),
          `${String(p.days).padStart(3)}d`,
          `n=${String(ad?.nObs ?? 0).padStart(3)}`,
          (ad?.status ?? "off").padEnd(9),
          `conf=${conf.padStart(4)}`,
          `tono=${pctOrGathering(ad?.baseline ?? null, active).padStart(4)}`,
          `recup=${pctOrGathering(ad?.recovery ?? null, active).padStart(4)}`,
          `estab=${pctOrGathering(ad?.stability ?? null, active).padStart(4)}`,
          `iner=${inertia.padStart(6)}`,
          `cob=${String(Math.round(result.coverage * 100)).padStart(3)}%`,
          `pct=${String(result.pct).padStart(3)}%`,
        ].join("  "),
      );
    }

    expect(rows).toHaveLength(PERSONAS.length);
  });

  it("short/sparse histories stay in 'gathering'; steady ones go 'active'", async () => {
    const by = async (id: string) =>
      scoreEmotionalMap(
        buildPersonaInput(PERSONAS.find((p) => p.id === id)!),
        stubProvider,
      );

    // 3 days and 1 week are below the observation floor → gathering.
    expect((await by("nuevo-3d")).affectDynamics?.status).toBe("gathering");
    expect((await by("semana-casual")).affectDynamics?.status).toBe(
      "gathering",
    );

    // A month+ of steady check-ins → active.
    expect((await by("mes-constante")).affectDynamics?.status).toBe("active");
    expect((await by("trimestre-disciplinado")).affectDynamics?.status).toBe(
      "active",
    );
  });

  it("confidence grows with history (disciplined quarter ≥ one month)", async () => {
    const month = await scoreEmotionalMap(
      buildPersonaInput(PERSONAS.find((p) => p.id === "mes-constante")!),
      stubProvider,
    );
    const quarter = await scoreEmotionalMap(
      buildPersonaInput(
        PERSONAS.find((p) => p.id === "trimestre-disciplinado")!,
      ),
      stubProvider,
    );
    expect(quarter.affectDynamics?.confidence ?? 0).toBeGreaterThanOrEqual(
      month.affectDynamics?.confidence ?? 0,
    );
    // ~90 days of daily-ish check-ins saturates confidence.
    expect(quarter.affectDynamics?.confidence ?? 0).toBeGreaterThanOrEqual(0.9);
  });

  it("a near-flat persona reads as MORE stable than a volatile one", async () => {
    const flat = await scoreEmotionalMap(
      buildPersonaInput(PERSONAS.find((p) => p.id === "casi-plano-mes")!),
      stubProvider,
    );
    const volatile = await scoreEmotionalMap(
      buildPersonaInput(PERSONAS.find((p) => p.id === "volatil-mes")!),
      stubProvider,
    );
    expect(flat.affectDynamics?.status).toBe("active");
    expect(volatile.affectDynamics?.status).toBe("active");
    expect(flat.affectDynamics?.stability ?? 0).toBeGreaterThan(
      volatile.affectDynamics?.stability ?? 0,
    );
  });

  it("Etapa 1: a steady ±1-jump persona reads as MEANINGFULLY stable (not ~0)", async () => {
    // The Etapa-0 finding: v0 read normal ±1-level check-in jumps as volatility,
    // so "stable" personas scored ~0% stability. With the measurement-noise
    // floor they should now read clearly stable.
    for (const id of [
      "dos-semanas",
      "mes-constante",
      "trimestre-disciplinado",
    ]) {
      const r = await scoreEmotionalMap(
        buildPersonaInput(PERSONAS.find((p) => p.id === id)!),
        stubProvider,
      );
      expect(r.affectDynamics?.status).toBe("active");
      expect(r.affectDynamics?.stability ?? 0).toBeGreaterThan(0.4);
    }
  });

  it("Etapa 1: recovery + inertia are gated until recoveryNeeded observations", async () => {
    // 8 ≤ nObs < recoveryNeeded → baseline + stability present, but θ-derived
    // axes (recovery, inertia) withheld.
    const early = await scoreEmotionalMap(
      buildPersonaInput(PERSONAS.find((p) => p.id === "dos-semanas")!), // n=10
      stubProvider,
    );
    expect(early.affectDynamics?.status).toBe("active");
    expect(early.affectDynamics?.nObs ?? 0).toBeLessThan(
      early.affectDynamics?.recoveryNeeded ?? 0,
    );
    expect(early.affectDynamics?.baseline).not.toBeNull();
    expect(early.affectDynamics?.stability).not.toBeNull();
    expect(early.affectDynamics?.recovery).toBeNull();
    expect(early.affectDynamics?.inertiaDays).toBeNull();

    // Enough history → all four axes present.
    const mature = await scoreEmotionalMap(
      buildPersonaInput(
        PERSONAS.find((p) => p.id === "trimestre-disciplinado")!,
      ), // n=77
      stubProvider,
    );
    expect(mature.affectDynamics?.nObs ?? 0).toBeGreaterThanOrEqual(
      mature.affectDynamics?.recoveryNeeded ?? 0,
    );
    expect(mature.affectDynamics?.recovery).not.toBeNull();
    expect(mature.affectDynamics?.inertiaDays).not.toBeNull();
  });

  it("Etapa 2: daily checkins turn Claridad/Compasión/Consciencia into MEASURED axes", async () => {
    const withCheckins = await scoreEmotionalMap(
      buildPersonaInput(PERSONAS.find((p) => p.id === "checkin-3sem")!),
      stubProvider,
    );
    const measuredKeys = withCheckins.dimensions
      .filter((d) => d.measured)
      .map((d) => d.key);
    expect(measuredKeys).toEqual(
      expect.arrayContaining(["claridad", "compasion", "consciencia"]),
    );
    // The measured value reflects the answers (stable persona answers 3-4/4).
    const claridad = withCheckins.dimensions.find((d) => d.key === "claridad")!;
    expect(claridad.value).toBeGreaterThan(0.6);
    expect(claridad.sources).toMatch(/check-in diario/);

    // Control: a persona WITHOUT checkins keeps those axes unmeasured.
    const without = await scoreEmotionalMap(
      buildPersonaInput(PERSONAS.find((p) => p.id === "mes-constante")!),
      stubProvider,
    );
    for (const key of ["claridad", "compasion", "consciencia"] as const) {
      expect(without.dimensions.find((d) => d.key === key)!.measured).not.toBe(
        true,
      );
    }
  });

  it("higher engagement yields higher overall map coverage", async () => {
    const low = await scoreEmotionalMap(
      buildPersonaInput(PERSONAS.find((p) => p.id === "nuevo-3d")!),
      stubProvider,
    );
    const high = await scoreEmotionalMap(
      buildPersonaInput(
        PERSONAS.find((p) => p.id === "trimestre-disciplinado")!,
      ),
      stubProvider,
    );
    expect(high.coverage).toBeGreaterThan(low.coverage);
  });
});

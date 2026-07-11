import { describe, expect, it } from "vitest";

import { MODEL_REGISTRY, getModel } from "./model-registry";
import {
  CHECKIN_GOOD_N,
  RECOVERY_MIN_OBS,
  TEXT_GOOD_N,
} from "./emotional-map.scoring";
import { MIN_OBS_FOR_FIT } from "./dynamics/ou";
import { EWS_MIN_OBS } from "./dynamics/ews";
import { FLAGS } from "../shared/flags";

/**
 * Fase B — the registry is DATA, but data that lies is worse than no data.
 * These tests pin the declared gates/flags to the actual code constants so the
 * registry cannot silently drift from what runs in production (the exact
 * failure mode that motivated it).
 */
describe("MODEL_REGISTRY", () => {
  it("has unique, stable ids", () => {
    const ids = MODEL_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "H1",
        "OU-G0",
        "OU-GT",
        "OU-O1",
        "EWS-R1",
        "TXT-L1",
        "CHK-S1",
        "ARC-C1",
        "NAR-L1",
      ]),
    );
  });

  it("declares gates that match the code constants", () => {
    expect(getModel("OU-G0")?.minimumData.observationCount).toBe(
      MIN_OBS_FOR_FIT,
    );
    expect(getModel("OU-GT")?.minimumData.observationCount).toBe(
      MIN_OBS_FOR_FIT,
    );
    expect(getModel("EWS-R1")?.minimumData.observationCount).toBe(EWS_MIN_OBS);
    // Fase B' (decision L1, approved 2026-07-11): recovery/inertia gate raised
    // to 100 per paper-1-results E1 (theta unidentified below ~100 obs). If
    // this number changes, update the registry + copy contract in the same PR.
    expect(RECOVERY_MIN_OBS).toBe(100);
    // TXT-L1 saturates at TEXT_GOOD_N analyzed entries; CHK-S1 at CHECKIN_GOOD_N
    // answers — the registry floor is the first observation, saturation is the
    // documented full-confidence point.
    expect(TEXT_GOOD_N).toBe(8);
    expect(CHECKIN_GOOD_N).toBe(5);
  });

  it("declares feature flags that actually exist", () => {
    for (const model of MODEL_REGISTRY) {
      if (model.featureFlag) {
        expect(Object.keys(FLAGS)).toContain(model.featureFlag);
      }
    }
  });

  it("keeps EWS-R1 as research-only and OU-O1 as design", () => {
    expect(getModel("EWS-R1")?.status).toBe("RESEARCH_ONLY");
    expect(getModel("OU-O1")?.status).toBe("DESIGN");
    expect(getModel("H1")?.status).toBe("LEGACY");
  });

  it("known limitations cite the paper where the claim is empirical", () => {
    const ews = getModel("EWS-R1");
    expect(ews?.knownLimitations.join(" ")).toContain("sensitivity 40%");
    const ou = getModel("OU-G0");
    expect(ou?.knownLimitations.join(" ")).toContain("n≈100");
  });
});

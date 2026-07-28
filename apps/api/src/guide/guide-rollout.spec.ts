import { describe, expect, it } from "vitest";
import {
  GuideRolloutConfigError,
  resolveGuideRolloutConfig,
  type GuideRolloutEnv,
} from "./guide-rollout";
import { GuideRolloutService } from "./guide-rollout.service";

/**
 * CC-7.R1 — the rollout policy is a pure function of (env, deployed) and the
 * service a pure function of (config, userId). No process.env is mutated and no
 * global state is touched, so these tests never bleed into others.
 */

const ID_A = "cmb0usuarioalpha01";
const ID_B = "cmb0usuariobeta002";

/** `resolveGuideRolloutConfig` never puts a received id in the error it throws. */
function configError(env: GuideRolloutEnv, deployed: boolean): unknown {
  try {
    resolveGuideRolloutConfig(env, deployed);
    return null;
  } catch (err) {
    return err;
  }
}

describe("resolveGuideRolloutConfig", () => {
  it("defaults to `on` locally when the mode is unset", () => {
    expect(resolveGuideRolloutConfig({}, false)).toEqual({
      mode: "on",
      pilotUserIds: [],
    });
  });

  it("defaults to `on` in test when the mode is unset", () => {
    // Same as local — an unset flag OUTSIDE a deployed box preserves the dev
    // default so every Guide fixture keeps working.
    expect(resolveGuideRolloutConfig({}, false).mode).toBe("on");
  });

  it("fails a DEPLOYED box that does not declare a mode", () => {
    const err = configError({}, true);
    expect(err).toBeInstanceOf(GuideRolloutConfigError);
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_ROLLOUT_MODE_REQUIRED",
    );
  });

  it("fails a DEPLOYED box with an invalid mode", () => {
    const err = configError({ GUIDE_ROLLOUT_MODE: "beta" }, true);
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_ROLLOUT_MODE_INVALID",
    );
  });

  it("fails an explicit invalid mode even locally", () => {
    const err = configError({ GUIDE_ROLLOUT_MODE: "ON" }, false);
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_ROLLOUT_MODE_INVALID",
    );
  });

  it("off → nobody; on → everybody", () => {
    expect(
      resolveGuideRolloutConfig({ GUIDE_ROLLOUT_MODE: "off" }, true),
    ).toEqual({ mode: "off", pilotUserIds: [] });
    expect(
      resolveGuideRolloutConfig({ GUIDE_ROLLOUT_MODE: "on" }, true),
    ).toEqual({ mode: "on", pilotUserIds: [] });
  });

  it("pilot resolves the exact allowlist", () => {
    expect(
      resolveGuideRolloutConfig(
        {
          GUIDE_ROLLOUT_MODE: "pilot",
          GUIDE_PILOT_USER_IDS: `${ID_A}, ${ID_B}`,
        },
        true,
      ),
    ).toEqual({ mode: "pilot", pilotUserIds: [ID_A, ID_B] });
  });

  it("pilot without an allowlist is a config error", () => {
    const err = configError({ GUIDE_ROLLOUT_MODE: "pilot" }, true);
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_PILOT_ALLOWLIST_REQUIRED",
    );
  });

  it("rejects an empty segment", () => {
    const err = configError(
      { GUIDE_ROLLOUT_MODE: "pilot", GUIDE_PILOT_USER_IDS: `${ID_A},,${ID_B}` },
      true,
    );
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_PILOT_ALLOWLIST_INVALID",
    );
  });

  it("rejects a duplicate", () => {
    const err = configError(
      { GUIDE_ROLLOUT_MODE: "pilot", GUIDE_PILOT_USER_IDS: `${ID_A},${ID_A}` },
      true,
    );
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_PILOT_ALLOWLIST_INVALID",
    );
  });

  it("rejects internal whitespace", () => {
    const err = configError(
      { GUIDE_ROLLOUT_MODE: "pilot", GUIDE_PILOT_USER_IDS: "bad id" },
      true,
    );
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_PILOT_ALLOWLIST_INVALID",
    );
  });

  it("rejects an email", () => {
    const err = configError(
      {
        GUIDE_ROLLOUT_MODE: "pilot",
        GUIDE_PILOT_USER_IDS: "person@example.test",
      },
      true,
    );
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_PILOT_ALLOWLIST_INVALID",
    );
  });

  it("rejects more than the maximum number of pilot users", () => {
    const many = Array.from({ length: 501 }, (_, i) => `u_${i}`).join(",");
    const err = configError(
      { GUIDE_ROLLOUT_MODE: "pilot", GUIDE_PILOT_USER_IDS: many },
      true,
    );
    expect((err as GuideRolloutConfigError).code).toBe(
      "GUIDE_PILOT_ALLOWLIST_INVALID",
    );
  });

  it("never leaks a received id in the error", () => {
    // A private-looking id that must never surface in the thrown error.
    const receivedId = "cmb0privatepilotid99";
    const err = configError(
      {
        GUIDE_ROLLOUT_MODE: "pilot",
        GUIDE_PILOT_USER_IDS: `${receivedId} bad`,
      },
      true,
    ) as Error;
    expect(err.message).not.toContain(receivedId);
    expect(JSON.stringify(err)).not.toContain(receivedId);
  });
});

describe("GuideRolloutService.isAvailable", () => {
  const svc = (mode: "off" | "pilot" | "on", ids: string[] = []) =>
    new GuideRolloutService({ mode, pilotUserIds: ids });

  it("off denies everyone", () => {
    expect(svc("off").isAvailable(ID_A)).toBe(false);
  });

  it("on allows everyone", () => {
    expect(svc("on").isAvailable(ID_A)).toBe(true);
  });

  it("pilot allows an exact member and denies a non-member", () => {
    const s = svc("pilot", [ID_A]);
    expect(s.isAvailable(ID_A)).toBe(true);
    expect(s.isAvailable(ID_B)).toBe(false);
  });

  it("pilot membership is case-sensitive", () => {
    expect(svc("pilot", [ID_A]).isAvailable(ID_A.toUpperCase())).toBe(false);
  });
});

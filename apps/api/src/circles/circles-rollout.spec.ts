import { describe, expect, it } from "vitest";
import {
  resolveCirclesRolloutConfig,
  type CirclesRolloutEnv,
} from "./circles-rollout";
import { CirclesRolloutService } from "./circles-rollout.service";

/**
 * The rollout resolver, and the one property that matters about it: there is no
 * input that opens Círculos by accident.
 *
 * The resolver is TOTAL — every input produces a config — so these tests do not
 * check that bad configuration throws. They check the stronger thing: that bad
 * configuration produces `off`, which is the state where nothing is reachable.
 */

const resolve = (env: CirclesRolloutEnv) => resolveCirclesRolloutConfig(env);
const serviceFor = (env: CirclesRolloutEnv) =>
  new CirclesRolloutService(resolve(env));

describe("circles rollout · a missing or unreadable setting is `off`", () => {
  it("resolves an empty environment to off", () => {
    const config = resolve({});
    expect(config.mode).toBe("off");
    expect(config.pilotUserIds).toEqual([]);
    expect(config.warnings).toEqual([]);
  });

  it("treats whitespace as absence", () => {
    expect(resolve({ CIRCLES_ROLLOUT_MODE: "   " }).mode).toBe("off");
  });

  it("trims the value before reading it", () => {
    // Surrounding whitespace is an editing artefact of an env file, not a
    // different mode. `" pilot "` means `pilot` — and then falls to `off`
    // anyway, because no allowlist came with it.
    const config = resolve({
      CIRCLES_ROLLOUT_MODE: " pilot ",
      CIRCLES_PILOT_USER_IDS: "user_a",
    });
    expect(config.mode).toBe("pilot");
  });

  it.each(["ON", "On", "enabled", "true", "1", "off;on", "pilot,on", "yes"])(
    "resolves the invalid mode %j to off",
    (mode) => {
      const config = resolve({ CIRCLES_ROLLOUT_MODE: mode });
      expect(config.mode).toBe("off");
      expect(config.warnings).toContain("CIRCLES_ROLLOUT_MODE_INVALID");
    },
  );

  it("never throws, whatever it is handed", () => {
    // A typo in an environment variable must not be able to take the API down.
    // `off` is already the safe state, so refusing to boot would trade a closed
    // surface for an outage and buy nothing.
    for (const mode of ["", "  ", "nonsense", "OFF", "0", "null"]) {
      expect(() => resolve({ CIRCLES_ROLLOUT_MODE: mode })).not.toThrow();
    }
  });

  it("says what it rejected without saying what it received", () => {
    const config = resolve({ CIRCLES_ROLLOUT_MODE: "s3cret-cohort-name" });
    expect(config.warnings).toEqual(["CIRCLES_ROLLOUT_MODE_INVALID"]);
    expect(JSON.stringify(config)).not.toContain("s3cret");
  });
});

describe("circles rollout · pilot requires a readable allowlist", () => {
  it("resolves pilot with no allowlist to off", () => {
    const config = resolve({ CIRCLES_ROLLOUT_MODE: "pilot" });
    expect(config.mode).toBe("off");
    expect(config.warnings).toContain("CIRCLES_PILOT_ALLOWLIST_EMPTY");
  });

  it.each([
    "user one",
    "a@b.com",
    "u1,,u2",
    "u1,u1",
    "u1;u2",
    Array.from({ length: 501 }, (_, i) => `u${i}`).join(","),
  ])("discards the whole allowlist %j and falls to off", (list) => {
    const config = resolve({
      CIRCLES_ROLLOUT_MODE: "pilot",
      CIRCLES_PILOT_USER_IDS: list,
    });
    // Not "a smaller pilot": an allowlist that could not be read in full is
    // not evidence about who should be in it.
    expect(config.mode).toBe("off");
    expect(config.pilotUserIds).toEqual([]);
  });

  it("keeps a well-formed allowlist exactly as written", () => {
    const config = resolve({
      CIRCLES_ROLLOUT_MODE: "pilot",
      CIRCLES_PILOT_USER_IDS: " user_a , user-b ,userC ",
    });
    expect(config.mode).toBe("pilot");
    expect(config.pilotUserIds).toEqual(["user_a", "user-b", "userC"]);
  });

  it("does not let a bad allowlist knock out an explicit `on`", () => {
    // `on` does not consult the allowlist, but a malformed one still means the
    // configuration was not understood — and the safe reading of "I did not
    // understand your configuration" is not "enable it for everybody".
    const config = resolve({
      CIRCLES_ROLLOUT_MODE: "on",
      CIRCLES_PILOT_USER_IDS: "not a user id",
    });
    expect(config.mode).toBe("off");
    expect(config.warnings).toContain("CIRCLES_PILOT_ALLOWLIST_INVALID");
  });
});

describe("circles rollout · the service answers per actor", () => {
  it("off denies everybody, allowlist or not", () => {
    const service = serviceFor({
      CIRCLES_ROLLOUT_MODE: "off",
      CIRCLES_PILOT_USER_IDS: "user_a",
    });
    expect(service.currentMode()).toBe("off");
    expect(service.isAvailable("user_a")).toBe(false);
    expect(service.isAvailable("anybody")).toBe(false);
    expect(service.isGuestSurfaceAvailable()).toBe(false);
  });

  it("pilot admits exactly the listed ids", () => {
    const service = serviceFor({
      CIRCLES_ROLLOUT_MODE: "pilot",
      CIRCLES_PILOT_USER_IDS: "user_a,user_b",
    });
    expect(service.isAvailable("user_a")).toBe(true);
    expect(service.isAvailable("user_b")).toBe(true);
    // Exact match: no case folding, no prefix, no substring.
    expect(service.isAvailable("USER_A")).toBe(false);
    expect(service.isAvailable("user_a ")).toBe(false);
    expect(service.isAvailable("user_ab")).toBe(false);
    expect(service.isAvailable("")).toBe(false);
  });

  it("on admits any authenticated actor", () => {
    const service = serviceFor({ CIRCLES_ROLLOUT_MODE: "on" });
    expect(service.isAvailable("whoever")).toBe(true);
    expect(service.isGuestSurfaceAvailable()).toBe(true);
  });

  it("keeps the guest surface running under pilot", () => {
    // An allowlisted member who cannot invite anybody is not in a pilot of a
    // product about two people. The guest surface rides on the invitation,
    // which only an enabled member could have created.
    const service = serviceFor({
      CIRCLES_ROLLOUT_MODE: "pilot",
      CIRCLES_PILOT_USER_IDS: "user_a",
    });
    expect(service.isGuestSurfaceAvailable()).toBe(true);
  });

  it("gives a guest no way to raise the mode", () => {
    // There is no method on the service that takes anything a guest controls.
    const service = serviceFor({});
    expect(service.isGuestSurfaceAvailable()).toBe(false);
    expect(service.isAvailable("")).toBe(false);
    // And the resolved mode is captured at construction: mutating the process
    // environment afterwards changes nothing.
    process.env.CIRCLES_ROLLOUT_MODE = "on";
    try {
      expect(service.currentMode()).toBe("off");
      expect(service.isGuestSurfaceAvailable()).toBe(false);
    } finally {
      delete process.env.CIRCLES_ROLLOUT_MODE;
    }
  });
});

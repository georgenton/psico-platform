import { describe, expect, it } from "vitest";

// The harness lives outside `src`, which is where the test runner looks. It is
// plain ESM with no dependencies, so importing it by relative path is enough.
// A plain ESM harness module with no dependencies — test tooling, not shipped
// source, which is why it lives under `e2e/` rather than in `src`.
import {
  ownedResources,
  planTeardown,
  readProcessStart,
  stillOurs,
} from "../../../e2e/circulos/ownership.mjs";

/**
 * The rule that keeps `--down` from killing something it does not own.
 *
 * This existed only inside `stack.mjs`, where nothing could reach it: the
 * evidence that a reused pid is spared was one manual run, and the next person
 * to touch the teardown had no way to find out they had broken it. It is a pure
 * decision — recorded state in, actions out — so it is now testable without
 * starting or killing a single process.
 */

const service = (over: Record<string, unknown> = {}) => ({
  name: "api",
  pid: 4242,
  lstart: "Sun Sep 13 17:52:57 2026",
  ...over,
});

describe("a teardown only touches what the run actually owns", () => {
  it("stops a service that is still the process the run started", () => {
    const plan = planTeardown(
      { services: [service()] },
      () => "Sun Sep 13 17:52:57 2026",
    );
    expect(plan.map((p: { action: string }) => p.action)).toEqual(["stop"]);
  });

  it("SPARES a live pid whose start time does not match", () => {
    // The whole reason the start time is recorded. `--down` runs hours later in
    // a different process; by then 4242 may belong to anything at all, and
    // signalling it because a file once said so is how a cleanup script kills
    // somebody's editor.
    const plan = planTeardown(
      { services: [service()] },
      () => "Mon Jan  1 09:00:00 1990",
    );
    expect(plan[0].action).toBe("spare");
  });

  it("treats a pid that is simply gone as nothing to do", () => {
    const plan = planTeardown({ services: [service()] }, () => null);
    expect(plan[0].action).toBe("gone");
  });

  it("is idempotent: a second pass over a torn-down run stops nothing", () => {
    const state = {
      services: [service({ name: "api" }), service({ name: "web", pid: 4243 })],
    };
    const first = planTeardown(state, () => "Sun Sep 13 17:52:57 2026");
    expect(first.every((p: { action: string }) => p.action === "stop")).toBe(
      true,
    );

    // Everything is gone now, which is what the second `--down` sees.
    const second = planTeardown(state, () => null);
    expect(second.every((p: { action: string }) => p.action === "gone")).toBe(
      true,
    );
  });

  it("refuses to treat a missing observation as a match", () => {
    expect(stillOurs(service(), null)).toBe(false);
    expect(stillOurs(service(), undefined)).toBe(false);
    expect(stillOurs(service(), "Sun Sep 13 17:52:57 2026")).toBe(true);
  });

  it("names only the containers and directories the run recorded", () => {
    // Never a pattern: `circulos-e2e-*` would also match a concurrent run, and
    // removing those is the same mistake as killing a reused pid.
    const owned = ownedResources({
      containers: ["circulos-e2e-pg-abc1234567"],
      work: "/tmp/circulos-e2e-abc1234567",
      logs: "/tmp/circulos-e2e-abc1234567-logs",
    });
    expect(owned.containers).toEqual(["circulos-e2e-pg-abc1234567"]);
    expect(owned.directories).toEqual([
      "/tmp/circulos-e2e-abc1234567",
      "/tmp/circulos-e2e-abc1234567-logs",
    ]);
    expect(JSON.stringify(owned)).not.toContain("*");
  });

  it("reads a ZOMBIE as gone, not as running", () => {
    // A killed child that nothing has reaped stays in the process table, and
    // `ps -p` keeps listing it. Treating that as alive made teardown wait out
    // the grace period on every service and then announce "STILL RUNNING"
    // about four processes that were already dead.
    expect(readProcessStart("Z+   Sun Sep 13 17:52:57 2026")).toBeNull();
    expect(readProcessStart("Z    Sun Sep 13 17:52:57 2026")).toBeNull();
  });

  it("reads a live process as its start time, whitespace and all", () => {
    // `ps` pads a single-digit day, so the value is normalised — and the
    // recorded side goes through this same function, so the two agree.
    expect(readProcessStart("Ss   Sun Sep 13 17:52:57 2026")).toBe(
      "Sun Sep 13 17:52:57 2026",
    );
    expect(readProcessStart("S    Sun Sep  7 09:00:00 2026")).toBe(
      "Sun Sep 7 09:00:00 2026",
    );
  });

  it("reads an empty answer as no such process", () => {
    expect(readProcessStart("")).toBeNull();
    expect(readProcessStart("   ")).toBeNull();
    expect(readProcessStart(null)).toBeNull();
    expect(readProcessStart(undefined)).toBeNull();
  });

  it("survives a state file with nothing in it", () => {
    expect(planTeardown({}, () => null)).toEqual([]);
    expect(ownedResources({})).toEqual({ containers: [], directories: [] });
  });
});

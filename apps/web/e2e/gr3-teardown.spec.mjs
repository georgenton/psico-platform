import { describe, expect, it, vi } from "vitest";
import {
  RETAIN_ACK,
  assertRetainAllowed,
  finalGatePass,
  stopProcess,
  teardownDatabase,
  teardownReport,
} from "./gr3-teardown.mjs";

/**
 * GR-3 — the teardown, including the ways it fails.
 *
 * The bug these tests exist for: the gate used to report
 * `API_PROCESS_STOPPED=true` because it had SENT a signal, and to exit 0 after
 * a drop that threw. Both are asserted here against fakes, so the failing
 * paths are exercised without breaking a real database or a real server.
 */

/** A process that exits after `exitsAfter` polls, or never. */
function fakeChild({ exitsAfter = 0, killThrows = null, alreadyExited = false } = {}) {
  const child = {
    exitCode: alreadyExited ? 0 : null,
    signalCode: null,
    signals: [],
    kill(sig) {
      if (killThrows) throw new Error(killThrows);
      child.signals.push(sig);
      if (exitsAfter === 0) child.exitCode = 0;
    },
  };
  let polls = 0;
  child.tick = () => {
    polls += 1;
    if (exitsAfter > 0 && polls >= exitsAfter) child.exitCode = 0;
  };
  return child;
}

/** Instant "sleep" that advances the fake child instead of real time. */
const tickWait = (child) => async () => child.tick();

describe("stopProcess", () => {
  it("a process that already exited needs no signal", async () => {
    const child = fakeChild({ alreadyExited: true });
    const res = await stopProcess(child);
    expect(res).toEqual({ stopped: true, how: "already-exited" });
    expect(child.signals).toEqual([]);
  });

  it("SIGTERM is enough when the process listens", async () => {
    const child = fakeChild();
    const res = await stopProcess(child, { wait: tickWait(child) });
    expect(res.stopped).toBe(true);
    expect(res.how).toBe("sigterm");
    expect(child.signals).toEqual(["SIGTERM"]);
  });

  it("escalates to SIGKILL, and still waits for the exit", async () => {
    // Ignores SIGTERM; dies a few polls after SIGKILL.
    const child = fakeChild({ exitsAfter: 60 });
    const res = await stopProcess(child, { wait: tickWait(child) });
    expect(res.stopped).toBe(true);
    expect(res.how).toBe("sigkill");
    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("reports FALSE when the process survives SIGKILL", async () => {
    // The whole point: a signal delivered is not a process stopped.
    const child = fakeChild({ exitsAfter: Number.MAX_SAFE_INTEGER });
    const res = await stopProcess(child, { wait: tickWait(child) });
    expect(res.stopped).toBe(false);
    expect(res.how).toBe("still-alive-after-sigkill");
  });

  it("reports FALSE when the signal itself cannot be sent", async () => {
    const child = fakeChild({ killThrows: "EPERM" });
    const res = await stopProcess(child, { wait: tickWait(child) });
    expect(res.stopped).toBe(false);
    expect(res.how).toContain("sigterm-failed");
  });

  it("a process that was never started counts as stopped", async () => {
    expect(await stopProcess(null)).toEqual({ stopped: true, how: "not-started" });
  });
});

describe("assertRetainAllowed", () => {
  it("case C — --keep-database without the acknowledgement is refused", () => {
    expect(() => assertRetainAllowed({ keep: true, ack: null })).toThrow(/RETAIN_ACK|KEEP_GR3/);
    expect(() => assertRetainAllowed({ keep: true, ack: "yes please" })).toThrow();
  });

  it("allows the ordinary run, and the acknowledged retain", () => {
    expect(() => assertRetainAllowed({ keep: false, ack: null })).not.toThrow();
    expect(() => assertRetainAllowed({ keep: true, ack: RETAIN_ACK })).not.toThrow();
  });
});

describe("teardownDatabase", () => {
  it("case A — a successful drop is dropped, not retained, and passes", async () => {
    const drop = vi.fn().mockResolvedValue(undefined);
    const res = await teardownDatabase({ drop, dbName: "gr3_evidence" });
    expect(drop).toHaveBeenCalledOnce();
    expect(res).toEqual({ dropped: true, retained: false, pass: true, reason: null });
  });

  it("case B — a failing drop is NOT a pass, and is not called retention", async () => {
    // The bug: a leftover database used to be reported as a clean run.
    const drop = vi.fn().mockRejectedValue(new Error("connection refused"));
    const res = await teardownDatabase({ drop, dbName: "gr3_evidence" });
    expect(res.dropped).toBe(false);
    expect(res.retained).toBe(false);
    expect(res.pass).toBe(false);
    expect(res.reason).toContain("drop failed");
  });

  it("case D — an acknowledged retain passes without dropping", async () => {
    const drop = vi.fn();
    const res = await teardownDatabase({
      keep: true,
      ack: RETAIN_ACK,
      drop,
      dbName: "gr3_evidence",
    });
    expect(drop).not.toHaveBeenCalled();
    expect(res).toEqual({ dropped: false, retained: true, pass: true, reason: null });
  });

  it("retain without the acknowledgement fails rather than silently dropping", async () => {
    const drop = vi.fn();
    const res = await teardownDatabase({ keep: true, ack: null, drop, dbName: "gr3_evidence" });
    expect(drop).not.toHaveBeenCalled();
    expect(res.pass).toBe(false);
    expect(res.retained).toBe(false);
  });
});

describe("finalGatePass", () => {
  it("needs both halves", () => {
    expect(finalGatePass({ primary: true, teardown: true })).toBe(true);
    expect(finalGatePass({ primary: true, teardown: false })).toBe(false);
    expect(finalGatePass({ primary: false, teardown: true })).toBe(false);
    expect(finalGatePass({ primary: false, teardown: false })).toBe(false);
  });
});

describe("teardownReport", () => {
  const ok = { stopped: true, how: "sigterm" };
  const stuck = { stopped: false, how: "still-alive-after-sigkill" };

  it("case A — a clean run reports every flag true", () => {
    const r = teardownReport({
      api: ok,
      web: ok,
      db: { dropped: true, retained: false, pass: true, reason: null },
      primary: true,
    });
    expect(r.finalPass).toBe(true);
    expect(r.lines).toContain("EVIDENCE_DATABASE_DROPPED=true");
    expect(r.lines).toContain("EVIDENCE_DATABASE_RETAINED_FOR_DEBUG=false");
    expect(r.lines).toContain("EVIDENCE_DATABASE_TEARDOWN_PASS=true");
    expect(r.lines).toContain("FINAL_GATE_PASS=true");
    // The old ambiguous flag must not come back.
    expect(r.lines.join("\n")).not.toContain("DROPPED_OR_EXPLICITLY_RETAINED");
  });

  it("case B — a failed drop makes the whole run fail, even after a green gate", () => {
    const r = teardownReport({
      api: ok,
      web: ok,
      db: { dropped: false, retained: false, pass: false, reason: "drop failed: nope" },
      primary: true,
    });
    expect(r.teardownPass).toBe(false);
    expect(r.finalPass).toBe(false);
    expect(r.lines).toContain("PRIMARY_GATE_PASS=true");
  });

  it("a surviving process fails the run, and takes the rate-limit claim with it", () => {
    const r = teardownReport({
      api: stuck,
      web: ok,
      db: { dropped: true, retained: false, pass: true, reason: null },
      primary: true,
    });
    expect(r.lines).toContain("API_PROCESS_STOPPED=false");
    // The store lives inside that process: if it is alive, the store is too.
    expect(r.lines).toContain("RATE_LIMIT_STORE_REMOVED=false");
    expect(r.finalPass).toBe(false);
  });

  it("both failures are reported — teardown does not hide the gate", () => {
    const r = teardownReport({
      api: ok,
      web: ok,
      db: { dropped: false, retained: false, pass: false, reason: "drop failed" },
      primary: false,
    });
    expect(r.lines).toContain("PRIMARY_GATE_PASS=false");
    expect(r.lines).toContain("EVIDENCE_DATABASE_TEARDOWN_PASS=false");
    expect(r.finalPass).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuideLifecycleService } from "./guide-lifecycle.service";
import { GuideLifecycleError } from "./guide-errors";
import { EEC_C1_BODY_BEFORE_MIND_GUIDE } from "./guide-catalog";
import type * as CapabilityModuleNs from "./guide-active-capability";
import {
  guideStartLockKeys,
  type GuideActiveCapability,
} from "./guide-active-capability";

type CapabilityModule = typeof CapabilityModuleNs;

/**
 * The capability read is the ONLY thing stubbed: the branch taken is the
 * claim, and the classification itself is proved elsewhere — against real
 * PostgreSQL, against the migration we ship. The lock-key authority is NOT
 * stubbed, so a test that passes proves production's own sequence.
 */
const readCapability = vi.fn();
vi.mock("./guide-active-capability", async (importOriginal) => {
  const actual = await importOriginal<CapabilityModule>();
  return { ...actual, readGuideActiveCapability: () => readCapability() };
});

/**
 * C.0A — what `start()` actually DOES in each schema state.
 *
 * The other specs each prove one piece: the detector classifies, the index
 * enforces, the advisory keys serialise, recovery scopes. None of them proves
 * the piece production wires together — that a GLOBAL verdict really reaches
 * the cardinality check, that a LINEAGE verdict really scopes the autocancel,
 * that FAIL_CLOSED really writes nothing. Those are the failures that would
 * cancel somebody's journey, so they are asserted here on CALLS and ORDER,
 * not on a final snapshot.
 *
 * The capability read is stubbed, because the point is the branch taken, not
 * the classification (proved in `guide-active-capability.spec.ts` and against
 * real PostgreSQL in the pg-spec).
 */

const GUIDE = EEC_C1_BODY_BEFORE_MIND_GUIDE;
const USER = { userId: "user-1" } as never;
const COMMAND = {
  idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  guideKey: GUIDE.guideKey,
  guideVersion: GUIDE.guideVersion,
};

const activeRow = (over: Record<string, unknown> = {}) => ({
  id: "session-x",
  userId: "user-1",
  guideKey: GUIDE.guideKey,
  guideVersion: GUIDE.guideVersion,
  status: "ACTIVE",
  editionId: "ed-1",
  unitId: "un-1",
  stepsCompleted: 0,
  totalSteps: GUIDE.steps.length,
  currentStepKey: GUIDE.steps[0]!.stepKey,
  startedAt: new Date("2026-01-01T00:00:00Z"),
  completedAt: null,
  cancelledAt: null,
  ...over,
});

/**
 * ONE trace for everything START does, in the order it does it.
 *
 * Locks, reads and writes recorded in separate arrays cannot answer the
 * question that matters: did the locks happen BEFORE the receipt, was the
 * capability read BEFORE the first write, was the autocancel BEFORE the
 * create. A single ordered list makes each of those a prefix assertion.
 */
function makeService(over: { capability?: unknown; active?: unknown } = {}) {
  const trace: string[] = [];
  const track =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      trace.push(name);
      void args;
      return value;
    };

  const tx = {
    // The advisory lock goes through the same trace as everything else, so a
    // lock that drifts after the receipt is visible as an out-of-place entry.
    $executeRaw: vi.fn(async (strings: unknown, key: unknown) => {
      trace.push(`lock:${String(key)}`);
      return 1;
    }),
  };

  const activeOwnCardinality = vi.fn(
    track(
      "activeOwnCardinality",
      over.active === undefined
        ? { kind: "NONE" }
        : over.active === "MULTIPLE"
          ? { kind: "MULTIPLE" }
          : { kind: "SINGLE", session: over.active },
    ),
  );
  const findActiveOwnForGuideKey = vi.fn(
    track(
      "findActiveOwnForGuideKey",
      over.active === undefined || over.active === "MULTIPLE"
        ? null
        : over.active,
    ),
  );
  // The repository returns the number of rows it changed, not a row.
  const cancelActive = vi.fn(track("cancelActive", 1));
  const createActive = vi.fn(track("createActive", activeRow({ id: "new-1" })));
  const findOwn = vi.fn(track("findOwn", activeRow()));
  const appendReceipt = vi.fn(
    track("appendReceipt", { created: true, replayed: false, receipt: {} }),
  );
  const appendEvent = vi.fn(track("appendEvent", {}));
  const inspectValidated = vi.fn(track("inspectReceipt", { state: "absent" }));
  const listAccepted = vi.fn(track("listAccepted", []));

  const service = new GuideLifecycleService(
    { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } as never,
    {} as never, // resolver — START does not touch it
    { assertCanReadUnit: vi.fn(track("gate", undefined)) } as never,
    {
      resolve: vi.fn(
        track("resolveContext", {
          editionId: "ed-1",
          unitId: "un-1",
          editionKey: "ed-key",
          unitKey: "un-key",
        }),
      ),
    } as never,
    {
      activeOwnCardinality,
      findActiveOwnForGuideKey,
      cancelActive,
      createActive,
      findOwn,
    } as never,
    { listAccepted } as never,
    { inspectValidated, appendValidated: appendReceipt } as never,
    { appendValidated: appendEvent } as never,
  );

  const capabilityValue = (over.capability ?? {
    effectiveMode: "GLOBAL",
    globalHealth: "HEALTHY",
    lineageHealth: "ABSENT",
    degraded: false,
  }) as GuideActiveCapability;
  readCapability.mockImplementation(async () => {
    trace.push("readCapability");
    return capabilityValue;
  });

  return {
    service,
    trace,
    activeOwnCardinality,
    findActiveOwnForGuideKey,
    cancelActive,
    createActive,
    appendReceipt,
    appendEvent,
  };
}

/** Swallow the sanitized failure so a branch can be inspected either way. */
const run = async (service: GuideLifecycleService) => {
  try {
    await service.start(USER, COMMAND);
    return { threw: false as const, err: undefined };
  } catch (err) {
    return { threw: true as const, err };
  }
};

const LOCKS = guideStartLockKeys(USER.userId, COMMAND.guideKey).map(
  (k) => `lock:${k}`,
);

/**
 * The prefix every START shares before it can decide anything: the start lock,
 * the editorial context, the receipt verdict, the entitlement gate, the
 * capability. Nothing may be written before all of it has happened.
 */
const NORMATIVE_PREFIX = [
  ...LOCKS,
  "resolveContext",
  "inspectReceipt",
  "gate",
  "readCapability",
];

/** The writes a successful START performs, in the only acceptable order. */
const effectsOf = (trace: string[]) =>
  trace.filter((e) =>
    ["cancelActive", "createActive", "appendReceipt", "appendEvent"].includes(
      e,
    ),
  );

/** A sanitized Guide failure, never a raw driver error. */
const expectCanonicalStorageFailure = (err: unknown) => {
  expect(err).toBeInstanceOf(GuideLifecycleError);
  expect((err as GuideLifecycleError).code).toBe("GUIDE_STORAGE_FAILURE");
  // `message === code`: no value, no pg text, ever embedded.
  expect((err as GuideLifecycleError).message).toBe("GUIDE_STORAGE_FAILURE");
};

beforeEach(() => {
  vi.restoreAllMocks();
  readCapability.mockReset();
});

describe("START · one ordered trace, not four separate claims", () => {
  it("locks, context, receipt, gate and capability all precede any write", async () => {
    const h = makeService({ active: activeRow({ id: "old-1" }) });
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    // The prefix is exact: a lock that drifts after the receipt, or a
    // capability read that lands after the first write, changes this list.
    expect(h.trace.slice(0, NORMATIVE_PREFIX.length)).toEqual(NORMATIVE_PREFIX);
    // Not a list rebuilt here: the same authority the pg-spec models V2 with.
    expect(h.trace.slice(0, LOCKS.length)).toEqual(LOCKS);
  });

  it("writes happen in exactly one order", async () => {
    const h = makeService({ active: activeRow({ id: "old-1" }) });
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(effectsOf(h.trace)).toEqual([
      "cancelActive",
      "createActive",
      "appendReceipt",
      "appendEvent",
    ]);
  });
});

describe("START · GLOBAL authority", () => {
  it("proves cardinality, never asks the lineage question, and completes", async () => {
    const h = makeService();
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(h.activeOwnCardinality).toHaveBeenCalledTimes(1);
    expect(h.findActiveOwnForGuideKey).not.toHaveBeenCalled();
  });

  it("with no prior session it still creates and confirms one", async () => {
    const h = makeService();
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(h.cancelActive).not.toHaveBeenCalled();
    expect(h.createActive).toHaveBeenCalledTimes(1);
    expect(h.appendReceipt).toHaveBeenCalledTimes(1);
    expect(h.appendEvent).toHaveBeenCalledTimes(1);
    expect(effectsOf(h.trace)).toEqual([
      "createActive",
      "appendReceipt",
      "appendEvent",
    ]);
  });

  it("SINGLE autocancels that one session, then creates", async () => {
    const h = makeService({ active: activeRow({ id: "old-1" }) });
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(h.cancelActive).toHaveBeenCalledTimes(1);
    expect(h.createActive).toHaveBeenCalledTimes(1);
    expect(h.appendReceipt).toHaveBeenCalledTimes(1);
    expect(h.appendEvent).toHaveBeenCalledTimes(1);
    expect(effectsOf(h.trace)).toEqual([
      "cancelActive",
      "createActive",
      "appendReceipt",
      "appendEvent",
    ]);
  });

  it("MULTIPLE fails closed with the canonical error and writes NOTHING", async () => {
    // The global index promises at most one ACTIVE row. Two means schema and
    // code disagree, and a global autocancel would then close a lineage the
    // reader never touched.
    const h = makeService({ active: "MULTIPLE" });
    const out = await run(h.service);

    expect(out.threw).toBe(true);
    expectCanonicalStorageFailure(out.err);
    expect(h.cancelActive).not.toHaveBeenCalled();
    expect(h.createActive).not.toHaveBeenCalled();
    expect(h.appendReceipt).not.toHaveBeenCalled();
    expect(h.appendEvent).not.toHaveBeenCalled();
    // Inspecting the receipt is a normative READ that precedes every branch —
    // it is not the same thing as writing one.
    expect(h.trace).toContain("inspectReceipt");
    expect(effectsOf(h.trace)).toEqual([]);
  });
});

describe("START · GLOBAL + LINEAGE present", () => {
  it("keeps global behaviour — it does not switch early", async () => {
    const h = makeService({
      capability: {
        effectiveMode: "GLOBAL",
        globalHealth: "HEALTHY",
        lineageHealth: "HEALTHY",
        degraded: false,
      },
      active: activeRow({ id: "old-1" }),
    });
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(h.activeOwnCardinality).toHaveBeenCalledTimes(1);
    expect(h.findActiveOwnForGuideKey).not.toHaveBeenCalled();
    expect(effectsOf(h.trace)).toEqual([
      "cancelActive",
      "createActive",
      "appendReceipt",
      "appendEvent",
    ]);
  });
});

describe("START · LINEAGE authority", () => {
  const lineage = {
    effectiveMode: "LINEAGE",
    globalHealth: "ABSENT",
    lineageHealth: "HEALTHY",
    degraded: false,
  };

  it("asks only about the requested guide", async () => {
    const h = makeService({ capability: lineage });
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(h.findActiveOwnForGuideKey).toHaveBeenCalledWith(
      USER.userId,
      COMMAND.guideKey,
      expect.anything(),
    );
    expect(h.activeOwnCardinality).not.toHaveBeenCalled();
  });

  it("a sibling lineage is not even a candidate", async () => {
    // The defect #639 exists for: starting X must leave B running. Here the
    // repository is asked about X, so B cannot be returned and cannot be
    // cancelled — the guarantee lives in the query, not in a later filter.
    const h = makeService({ capability: lineage });
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    const [, askedGuideKey] = h.findActiveOwnForGuideKey.mock.calls[0] ?? [];
    expect(askedGuideKey).toBe(COMMAND.guideKey);
    expect(h.cancelActive).not.toHaveBeenCalled();
  });

  it("with no prior session it still creates and confirms one", async () => {
    const h = makeService({ capability: lineage });
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(effectsOf(h.trace)).toEqual([
      "createActive",
      "appendReceipt",
      "appendEvent",
    ]);
  });

  it("cancels the same lineage before creating the new session", async () => {
    const h = makeService({
      capability: lineage,
      active: activeRow({ id: "x-v1" }),
    });
    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(effectsOf(h.trace)).toEqual([
      "cancelActive",
      "createActive",
      "appendReceipt",
      "appendEvent",
    ]);
  });
});

describe("START · FAIL_CLOSED", () => {
  it("returns the canonical error and writes nothing at all", async () => {
    const h = makeService({
      capability: {
        effectiveMode: "FAIL_CLOSED",
        globalHealth: "ABSENT",
        lineageHealth: "ABSENT",
        degraded: false,
      },
    });
    const out = await run(h.service);

    expect(out.threw).toBe(true);
    expectCanonicalStorageFailure(out.err);
    expect(h.cancelActive).not.toHaveBeenCalled();
    expect(h.createActive).not.toHaveBeenCalled();
    expect(h.appendReceipt).not.toHaveBeenCalled();
    expect(h.appendEvent).not.toHaveBeenCalled();
    expect(effectsOf(h.trace)).toEqual([]);
  });

  it("refuses BEFORE consulting any active session", async () => {
    const h = makeService({
      capability: {
        effectiveMode: "FAIL_CLOSED",
        globalHealth: "MALFORMED",
        lineageHealth: "MALFORMED",
        degraded: false,
      },
    });
    const out = await run(h.service);

    expect(out.threw).toBe(true);
    expect(h.activeOwnCardinality).not.toHaveBeenCalled();
    expect(h.findActiveOwnForGuideKey).not.toHaveBeenCalled();
    // It got as far as reading the capability, and no further.
    expect(h.trace).toEqual(NORMATIVE_PREFIX);
  });
});

describe("START · degraded is reported and changes nothing", () => {
  const degraded = {
    effectiveMode: "GLOBAL",
    globalHealth: "HEALTHY",
    lineageHealth: "INVALID_OR_NOT_READY",
    degraded: true,
  };

  const spyLogger = (service: GuideLifecycleService, impl?: () => void) =>
    vi
      .spyOn(
        (service as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        "warn",
      )
      .mockImplementation(impl ?? (() => undefined));

  it("emits the sanitized signal and still completes", async () => {
    const h = makeService({ capability: degraded });
    const warn = spyLogger(h.service);

    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("GUIDE_ACTIVE_CAPABILITY_DEGRADED");
    expect(line).toContain("effectiveMode=GLOBAL");
    expect(line).toContain("lineageHealth=INVALID_OR_NOT_READY");
  });

  it("carries no user data, no index name, no SQL", async () => {
    const h = makeService({ capability: degraded });
    const warn = spyLogger(h.service);

    await run(h.service);

    const line = String(warn.mock.calls[0]?.[0] ?? "");
    expect(line).not.toContain(USER.userId);
    expect(line).not.toContain(COMMAND.guideKey);
    expect(line).not.toMatch(/SELECT|pg_index|CREATE INDEX|GuideSession_/);
  });

  it("a logger that THROWS does not fail START", async () => {
    // Telemetry is not load-bearing: the command must succeed in full, not
    // merely reach the create.
    const h = makeService({
      capability: degraded,
      active: activeRow({ id: "old-1" }),
    });
    spyLogger(h.service, () => {
      throw new Error("logger down");
    });

    const out = await run(h.service);

    expect(out.threw).toBe(false);
    expect(effectsOf(h.trace)).toEqual([
      "cancelActive",
      "createActive",
      "appendReceipt",
      "appendEvent",
    ]);
  });

  it("stays quiet when nothing is degraded", async () => {
    const h = makeService();
    const warn = spyLogger(h.service);

    const out = await run(h.service);
    expect(out.threw).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuideLifecycleService } from "./guide-lifecycle.service";
import { EEC_C1_BODY_BEFORE_MIND_GUIDE } from "./guide-catalog";
import type * as CapabilityModuleNs from "./guide-active-capability";
import {
  c0aStartLockKeys,
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

/** Records the order of every collaborator call the branch may make. */
function makeService(over: { capability?: unknown; active?: unknown } = {}) {
  const calls: string[] = [];
  const track =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      calls.push(name);
      void args;
      return value;
    };

  const lockKeys: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async (strings: unknown, key: unknown) => {
      lockKeys.push(String(key));
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
  const inspectValidated = vi.fn(track("inspect", { state: "absent" }));
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

  readCapability.mockResolvedValue(
    (over.capability ?? {
      effectiveMode: "GLOBAL",
      globalHealth: "HEALTHY",
      lineageHealth: "ABSENT",
      degraded: false,
    }) as GuideActiveCapability,
  );

  return {
    service,
    calls,
    lockKeys,
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
    return { threw: false as const };
  } catch (err) {
    return { threw: true as const, err };
  }
};

beforeEach(() => {
  vi.restoreAllMocks();
  readCapability.mockReset();
});

describe("START · the lock sequence is production's own", () => {
  it("takes the canonical keys, in canonical order, before anything else", async () => {
    const h = makeService();
    await run(h.service);

    // Not a list rebuilt here: the same authority the pg-spec models V1 with.
    expect(h.lockKeys).toEqual([
      ...c0aStartLockKeys(USER.userId, COMMAND.guideKey),
    ]);
    // Both locks are held before the capability read and any write.
    expect(h.calls.indexOf("resolveContext")).toBeGreaterThan(-1);
    expect(h.lockKeys).toHaveLength(2);
  });
});

describe("START · GLOBAL authority", () => {
  it("proves cardinality and never asks the lineage question", async () => {
    const h = makeService();
    await run(h.service);

    expect(h.activeOwnCardinality).toHaveBeenCalledTimes(1);
    expect(h.findActiveOwnForGuideKey).not.toHaveBeenCalled();
  });

  it("SINGLE autocancels that one session, then creates", async () => {
    const h = makeService({ active: activeRow({ id: "old-1" }) });
    await run(h.service);

    expect(h.cancelActive).toHaveBeenCalledTimes(1);
    expect(h.calls.indexOf("cancelActive")).toBeLessThan(
      h.calls.indexOf("createActive"),
    );
  });

  it("MULTIPLE fails closed and writes NOTHING", async () => {
    // The global index promises at most one ACTIVE row. Two means schema and
    // code disagree, and a global autocancel would then close a lineage the
    // reader never touched.
    const h = makeService({ active: "MULTIPLE" });
    const out = await run(h.service);

    expect(out.threw).toBe(true);
    expect(h.cancelActive).not.toHaveBeenCalled();
    expect(h.createActive).not.toHaveBeenCalled();
    expect(h.appendReceipt).not.toHaveBeenCalled();
    expect(h.appendEvent).not.toHaveBeenCalled();
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
    await run(h.service);

    expect(h.activeOwnCardinality).toHaveBeenCalledTimes(1);
    expect(h.findActiveOwnForGuideKey).not.toHaveBeenCalled();
    expect(h.cancelActive).toHaveBeenCalledTimes(1);
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
    await run(h.service);

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
    await run(h.service);

    const [, askedGuideKey] = h.findActiveOwnForGuideKey.mock.calls[0] ?? [];
    expect(askedGuideKey).toBe(COMMAND.guideKey);
    expect(h.cancelActive).not.toHaveBeenCalled();
  });

  it("cancels the same lineage before creating the new session", async () => {
    const h = makeService({
      capability: lineage,
      active: activeRow({ id: "x-v1" }),
    });
    await run(h.service);

    expect(h.cancelActive).toHaveBeenCalledTimes(1);
    expect(h.calls.indexOf("cancelActive")).toBeLessThan(
      h.calls.indexOf("createActive"),
    );
  });
});

describe("START · FAIL_CLOSED", () => {
  it("writes nothing at all", async () => {
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
    expect(h.cancelActive).not.toHaveBeenCalled();
    expect(h.createActive).not.toHaveBeenCalled();
    expect(h.appendReceipt).not.toHaveBeenCalled();
    expect(h.appendEvent).not.toHaveBeenCalled();
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
    await run(h.service);

    expect(h.activeOwnCardinality).not.toHaveBeenCalled();
    expect(h.findActiveOwnForGuideKey).not.toHaveBeenCalled();
  });
});

describe("START · degraded is reported and changes nothing", () => {
  const degraded = {
    effectiveMode: "GLOBAL",
    globalHealth: "HEALTHY",
    lineageHealth: "INVALID_OR_NOT_READY",
    degraded: true,
  };

  it("emits the sanitized signal", async () => {
    const h = makeService({ capability: degraded });
    const warn = vi
      .spyOn(
        (h.service as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        "warn",
      )
      .mockImplementation(() => undefined);

    await run(h.service);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("GUIDE_ACTIVE_CAPABILITY_DEGRADED");
    expect(line).toContain("effectiveMode=GLOBAL");
    expect(line).toContain("lineageHealth=INVALID_OR_NOT_READY");
  });

  it("carries no user data, no index name, no SQL", async () => {
    const h = makeService({ capability: degraded });
    const warn = vi
      .spyOn(
        (h.service as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        "warn",
      )
      .mockImplementation(() => undefined);

    await run(h.service);

    const line = String(warn.mock.calls[0]?.[0] ?? "");
    expect(line).not.toContain(USER.userId);
    expect(line).not.toContain(COMMAND.guideKey);
    expect(line).not.toMatch(/SELECT|pg_index|CREATE INDEX|GuideSession_/);
  });

  it("still completes the GLOBAL path — telemetry is not load-bearing", async () => {
    const h = makeService({
      capability: degraded,
      active: activeRow({ id: "old-1" }),
    });
    vi.spyOn(
      (h.service as unknown as { logger: { warn: (m: string) => void } })
        .logger,
      "warn",
    ).mockImplementation(() => {
      throw new Error("logger down");
    });

    await run(h.service);

    expect(h.cancelActive).toHaveBeenCalledTimes(1);
    expect(h.createActive).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when nothing is degraded", async () => {
    const h = makeService();
    const warn = vi
      .spyOn(
        (h.service as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        "warn",
      )
      .mockImplementation(() => undefined);

    await run(h.service);
    expect(warn).not.toHaveBeenCalled();
  });
});

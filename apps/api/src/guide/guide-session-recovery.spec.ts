import { describe, expect, it, vi } from "vitest";

import { GuideLifecycleService } from "./guide-lifecycle.service";
import {
  GuideRecoveryQueryError,
  parseGuideRecoveryQuery,
} from "./guide-recovery-params";
import { EEC_C1_BODY_BEFORE_MIND_GUIDE } from "./guide-catalog";

/**
 * GR-5 — cross-device checkpoint recovery, pinned.
 *
 * Two properties carry the weight here. First, the answer is derived from the
 * LEDGER, not from a counter — so a session that accepted two steps says two,
 * whatever any client believed. Second, "not recoverable" is ONE answer for
 * several situations: no session, someone else's session, a different pin, a
 * version that left the registry. Keeping them indistinguishable is what stops
 * this read from being used to learn what another person is doing.
 */

const GUIDE = EEC_C1_BODY_BEFORE_MIND_GUIDE;
const PIN = { guideKey: GUIDE.guideKey, guideVersion: GUIDE.guideVersion };
const USER = "user-1";

/** Only the two collaborators the recovery path touches. */
function makeService(over: { active?: unknown; accepted?: unknown[] }): {
  service: GuideLifecycleService;
  findActive: ReturnType<typeof vi.fn>;
  listAccepted: ReturnType<typeof vi.fn>;
} {
  const findActive = vi.fn().mockResolvedValue(over.active ?? null);
  const listAccepted = vi.fn().mockResolvedValue(over.accepted ?? []);
  const service = new GuideLifecycleService(
    {} as never, // prisma — untouched by a read
    {} as never, // resolver
    {} as never, // access
    {} as never, // context
    { findActive } as never,
    { listAccepted } as never,
    {} as never, // receipts
    {} as never, // events
  );
  return { service, findActive, listAccepted };
}

const session = (over: Record<string, unknown> = {}) => ({
  id: "session-1",
  userId: USER,
  guideKey: GUIDE.guideKey,
  guideVersion: GUIDE.guideVersion,
  status: "ACTIVE",
  ...over,
});

/**
 * The STORED row shape, which is not the catalog's: the persisted policy is
 * upper-case and every target column that does not belong to this kind has to
 * be explicitly null. `parseAcceptedGuideStepRow` rejects anything looser,
 * which is how a half-written ledger row fails closed instead of becoming a
 * plausible-looking step.
 */
const acceptedRow = (stepKey: string, order: number) => ({
  sessionId: "session-1",
  stepKey,
  order,
  kind: "CONCEPT_EXPLORATION",
  completionPolicy: "EXPLICIT_CONFIRMATION",
  conceptKey: "eec-cuerpo-antes-que-mente",
  itemKey: null,
  exerciseKey: null,
  confirmationKey: null,
  selectedOptionKey: null,
  recallResult: null,
});

describe("GR-5 — recoverable session lookup", () => {
  it("returns null when the actor has no active session", async () => {
    const { service } = makeService({ active: null });
    await expect(service.findRecoverableSession(USER, PIN)).resolves.toBeNull();
  });

  it("scopes the lookup to the JWT actor — the query carries the user", async () => {
    const { service, findActive } = makeService({ active: null });
    await service.findRecoverableSession(USER, PIN);
    expect(findActive).toHaveBeenCalledWith(USER);
  });

  it("returns the session for an exact pin, derived from the ledger", async () => {
    const { service } = makeService({
      active: session(),
      accepted: [acceptedRow("explorar-cuerpo-antes-que-mente", 1)],
    });
    const view = await service.findRecoverableSession(USER, PIN);
    expect(view).toEqual({
      sessionId: "session-1",
      guideKey: GUIDE.guideKey,
      guideVersion: 1,
      status: "ACTIVE",
      stepsCompleted: 1,
      totalSteps: 3,
      // The NEXT step, which is what the Player opens a scene for.
      currentStepKey: "practicar-escucharte-por-dentro",
    });
  });

  it("a session pinned to another guide is invisible, not 'denied'", async () => {
    const { service } = makeService({
      active: session({ guideKey: "pqp-c1-contacto-sostenido" }),
    });
    await expect(service.findRecoverableSession(USER, PIN)).resolves.toBeNull();
  });

  it("a session pinned to another VERSION is equally invisible", async () => {
    const { service } = makeService({ active: session({ guideVersion: 2 }) });
    await expect(service.findRecoverableSession(USER, PIN)).resolves.toBeNull();
  });

  it("a version no longer in the registry reads as unrecoverable, not as a guess", async () => {
    const { service } = makeService({
      active: session({ guideKey: "gone-from-catalog" }),
    });
    await expect(
      service.findRecoverableSession(USER, {
        guideKey: "gone-from-catalog",
        guideVersion: 1,
      }),
    ).resolves.toBeNull();
  });

  it("exposes only the public view — no userId, no ledger, no internal ids", async () => {
    const { service } = makeService({
      active: session({ editionId: "ed-1", unitId: "u-1" }),
      accepted: [acceptedRow("explorar-cuerpo-antes-que-mente", 1)],
    });
    const view = await service.findRecoverableSession(USER, PIN);
    const json = JSON.stringify(view);
    for (const leak of [
      "userId",
      "editionId",
      "unitId",
      "user-1",
      "targetKey",
    ]) {
      expect(json, leak).not.toContain(leak);
    }
    expect(Object.keys(view!).sort()).toEqual([
      "currentStepKey",
      "guideKey",
      "guideVersion",
      "sessionId",
      "status",
      "stepsCompleted",
      "totalSteps",
    ]);
  });

  it("reads nothing but the two rows it needs — no write primitive is reachable", async () => {
    const { service, findActive, listAccepted } = makeService({
      active: session(),
      accepted: [],
    });
    await service.findRecoverableSession(USER, PIN);
    // The service was built with `{}` for prisma, receipts and events: had the
    // read touched any of them, this test would have thrown instead of passing.
    expect(findActive).toHaveBeenCalledTimes(1);
    expect(listAccepted).toHaveBeenCalledTimes(1);
  });
});

describe("GR-5 — the query is parsed, never coerced", () => {
  it("accepts a canonical pin", () => {
    expect(
      parseGuideRecoveryQuery("eec-c1-cuerpo-antes-que-mente", "1"),
    ).toEqual({ guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 });
  });

  it.each([
    [undefined, "1"],
    ["", "1"],
    ["Has Spaces", "1"],
    ["UPPER", "1"],
    ["ok-key", undefined],
    ["ok-key", "0"],
    ["ok-key", "-1"],
    ["ok-key", "1.0"],
    ["ok-key", " 1"],
    ["ok-key", "+1"],
    ["ok-key", "1e0"],
    ["ok-key", "abc"],
  ])("rejects (%s, %s)", (key, version) => {
    expect(() => parseGuideRecoveryQuery(key, version)).toThrow(
      GuideRecoveryQueryError,
    );
  });

  it("the error carries a fixed code and no received value", () => {
    try {
      parseGuideRecoveryQuery("Not A Key", "1");
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as GuideRecoveryQueryError;
      expect(e.code).toBe("GUIDE_INVALID_RECOVERY_QUERY");
      expect(e.message).toBe("GUIDE_INVALID_RECOVERY_QUERY");
      expect(e.message).not.toContain("Not A Key");
    }
  });
});

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuideLifecycleError } from "./guide-errors";
import {
  GuideDiscoveryParamsError,
  parseGuideDiscoveryParams,
} from "./guide-discovery-params";
import { GuideDiscoveryService } from "./guide-discovery.service";

/**
 * Unit coverage for the params parser and for the service's decision ORDER.
 * Real relations (targets, units, revisions, entitlement) are exercised against
 * PostgreSQL in the pg-spec; here we pin who gets asked, in what order, and
 * that every negative looks identical from outside.
 *
 * The sharpest thing pinned here is the line between a VERDICT and a FAILURE.
 * "The catalog says there is no guide" and "the database could not tell us"
 * are different facts; collapsing the second into `available:false` would have
 * the client cache a negative nobody ever asserted.
 */

const EEC_CTX = { bookSlug: "emociones-en-construccion", chapterOrder: 1 };
const PQP_CTX = { bookSlug: "parejas-que-perduran", chapterOrder: 2 };
const USER = { userId: "u-1", plan: "FREE" };

describe("parseGuideDiscoveryParams", () => {
  it("accepts the Emociones context", () => {
    expect(parseGuideDiscoveryParams("emociones-en-construccion", "1")).toEqual(
      EEC_CTX,
    );
  });

  it("accepts the Parejas context at platform order 2", () => {
    expect(parseGuideDiscoveryParams("parejas-que-perduran", "2")).toEqual(
      PQP_CTX,
    );
  });

  it.each([
    ["order zero", "un-libro", "0"],
    ["a negative order", "un-libro", "-1"],
    ["a fractional order", "un-libro", "1.5"],
    ["a non-numeric order", "un-libro", "abc"],
    ["an empty order", "un-libro", ""],
    ["a slug with spaces", "con espacios", "1"],
    ["an empty slug", "", "1"],
    ["a slug with uppercase punctuation", "Libro_Raro", "1"],
  ])("rejects %s", (_why, slug, order) => {
    expect(() => parseGuideDiscoveryParams(slug, order)).toThrow(
      GuideDiscoveryParamsError,
    );
  });

  it("keeps the error value-free — the message is exactly the code", () => {
    try {
      parseGuideDiscoveryParams("con espacios", "1");
    } catch (e) {
      const err = e as GuideDiscoveryParamsError;
      expect(err.message).toBe(err.code);
      expect(err.message).not.toContain("con espacios");
    }
    expect.assertions(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GuideDiscoveryService", () => {
  /** A transaction stub whose model calls are individually programmable. */
  function makeDeps(opts: {
    rolloutOn?: boolean;
    resolved?: Record<string, unknown> | Error;
    book?: unknown;
    chapter?: unknown;
    unit?: unknown;
    revisionUnit?: unknown;
    /** The exact error `assertCanReadUnit` raises, so the test names a TYPE. */
    accessThrows?: unknown;
    txThrows?: Error;
    /** A model call that blows up mid-transaction (a driver failure). */
    bookThrows?: Error;
  }) {
    const tx = {
      book: {
        findUnique: vi.fn(async () => {
          if (opts.bookThrows) throw opts.bookThrows;
          return opts.book ?? null;
        }),
      },
      chapter: { findFirst: vi.fn(async () => opts.chapter ?? null) },
      contentUnit: { findUnique: vi.fn(async () => opts.unit ?? null) },
      revisionUnit: {
        findUnique: vi.fn(async () => opts.revisionUnit ?? null),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => {
        if (opts.txThrows) throw opts.txThrows;
        return fn(tx);
      }),
    };
    const rollout = { isAvailable: vi.fn(() => opts.rolloutOn !== false) };
    const targetContext = {
      resolve: vi.fn(async () => {
        if (opts.resolved instanceof Error) throw opts.resolved;
        return (
          opts.resolved ?? {
            editionId: "ed-1",
            unitId: "unit-1",
            editionKey: "parejas-que-perduran-1e",
            unitKey: "uk-1",
            bookId: "b-1",
            bookSlug: "parejas-que-perduran",
            bookPlan: "FREE",
            revisionId: "rev-1",
            revisionNumber: 1,
          }
        );
      }),
    };
    const access = {
      assertCanReadUnit: vi.fn(async () => {
        if (opts.accessThrows !== undefined) throw opts.accessThrows;
      }),
    };
    const svc = new GuideDiscoveryService(
      prisma as never,
      rollout as never,
      targetContext as never,
      access as never,
    );
    return { svc, prisma, rollout, targetContext, access, tx };
  }

  /** The happy shape for Parejas: every relation lines up. */
  function coherentParejas() {
    return {
      book: { id: "b-1" },
      chapter: { id: "ch-1" },
      unit: { id: "unit-1" },
      revisionUnit: { id: "ru-1" },
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it("returns false and touches NO database when rollout is off", async () => {
    const { svc, prisma, targetContext } = makeDeps({ rolloutOn: false });
    await expect(svc.discover(USER, PQP_CTX)).resolves.toEqual({
      available: false,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(targetContext.resolve).not.toHaveBeenCalled();
  });

  it("returns false for a context the catalog does not know", async () => {
    const { svc, prisma } = makeDeps({});
    await expect(
      svc.discover(USER, { bookSlug: "libro-inexistente", chapterOrder: 1 }),
    ).resolves.toEqual({ available: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns false for the Parejas preface (order 1)", async () => {
    const { svc, prisma } = makeDeps({});
    await expect(
      svc.discover(USER, { bookSlug: "parejas-que-perduran", chapterOrder: 1 }),
    ).resolves.toEqual({ available: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns the EXACT Parejas pin when everything converges", async () => {
    const { svc } = makeDeps(coherentParejas());
    const res = await svc.discover(USER, PQP_CTX);
    expect(res).toEqual({
      available: true,
      guideKey: "pqp-c1-contacto-sostenido",
      guideVersion: 1,
    });
    // Exactly three properties — no context, no ids, no target keys.
    expect(Object.keys(res).sort()).toEqual([
      "available",
      "guideKey",
      "guideVersion",
    ]);
  });

  it("returns the EXACT Emociones pin when everything converges", async () => {
    const { svc } = makeDeps({
      ...coherentParejas(),
      resolved: {
        editionId: "ed-e",
        unitId: "unit-1",
        editionKey: "emociones-en-construccion-1e",
        unitKey: "uk-e",
        bookId: "b-e",
        bookSlug: "emociones-en-construccion",
        bookPlan: "FREE",
        revisionId: "rev-e",
        revisionNumber: 1,
      },
    });
    await expect(svc.discover(USER, EEC_CTX)).resolves.toEqual({
      available: true,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
  });

  it.each([
    [
      "the targets cannot be resolved",
      { resolved: new GuideLifecycleError("GUIDE_CONTEXT_UNRESOLVED") },
    ],
    [
      "the targets disagree with each other",
      { resolved: new GuideLifecycleError("GUIDE_CONTEXT_MISMATCH") },
    ],
    [
      "the targets belong to another book",
      {
        resolved: {
          editionId: "ed-1",
          unitId: "unit-1",
          editionKey: "otro-1e",
          unitKey: "uk-1",
          bookId: "b-x",
          bookSlug: "otro-libro",
          bookPlan: "FREE",
          revisionId: "rev-1",
          revisionNumber: 1,
        },
      },
    ],
    ["the book row is missing", { book: null }],
    ["the chapter row is missing", { chapter: null }],
    ["the unit is missing", { unit: null }],
    ["the unit disagrees with the targets", { unit: { id: "otra-unidad" } }],
    ["the unit is outside the published revision", { revisionUnit: null }],
    [
      "the plan does not entitle the unit",
      { accessThrows: new ForbiddenException("PRO_REQUIRED") },
    ],
    [
      "the edition or unit is not there",
      { accessThrows: new NotFoundException("UNIT_NOT_FOUND") },
    ],
  ])("returns an opaque false when %s", async (_why, override) => {
    const { svc } = makeDeps({ ...coherentParejas(), ...override });
    const res = await svc.discover(USER, PQP_CTX);
    expect(res).toEqual({ available: false });
    // The negative arm never carries a pin.
    expect(res).not.toHaveProperty("guideKey");
    expect(res).not.toHaveProperty("guideVersion");
  });

  // ── Verdict vs failure ────────────────────────────────────────────────────
  // INFRASTRUCTURE_IS_NOT_AVAILABLE_FALSE. Each of these would otherwise be
  // indistinguishable from "there is no guide here", which is the one lie this
  // endpoint must not tell.
  it.each([
    [
      "the transaction itself fails",
      { txThrows: new Error("connection terminated unexpectedly") },
    ],
    [
      "the context resolver reports a storage failure",
      { resolved: new GuideLifecycleError("GUIDE_STORAGE_FAILURE") },
    ],
    [
      "the context resolver throws something unrecognised",
      { resolved: new TypeError("cannot read properties of undefined") },
    ],
    [
      "a model call blows up mid-transaction",
      {
        bookThrows: new Error("Invalid `prisma.book.findUnique()` invocation"),
      },
    ],
    [
      "the entitlement check throws a driver error",
      { accessThrows: new Error("pool timeout") },
    ],
    [
      "the entitlement check throws a bad-request",
      { accessThrows: new BadRequestException("ANCHOR_MISSING_TARGET") },
    ],
  ])("propagates rather than answering false when %s", async (_why, over) => {
    const { svc } = makeDeps({ ...coherentParejas(), ...over });
    await expect(svc.discover(USER, PQP_CTX)).rejects.toThrow();
  });

  it("keeps the propagated storage failure value-free", async () => {
    const { svc } = makeDeps({
      ...coherentParejas(),
      resolved: new GuideLifecycleError("GUIDE_STORAGE_FAILURE"),
    });
    try {
      await svc.discover(USER, PQP_CTX);
    } catch (e) {
      const err = e as GuideLifecycleError;
      expect(err).toBeInstanceOf(GuideLifecycleError);
      // message === code: no slug, no order, no id, no driver text.
      expect(err.message).toBe("GUIDE_STORAGE_FAILURE");
      for (const value of [
        "parejas-que-perduran",
        "pqp-c1-contacto-sostenido",
        "unit-1",
        "ed-1",
        "rev-1",
        USER.userId,
      ]) {
        expect(err.message).not.toContain(value);
      }
    }
    expect.assertions(8);
  });

  it("checks entitlement inside the same transaction it read under", async () => {
    const { svc, access, tx } = makeDeps(coherentParejas());
    await svc.discover(USER, PQP_CTX);
    expect(access.assertCanReadUnit).toHaveBeenCalledWith(
      {
        userId: USER.userId,
        userPlan: USER.plan,
        editionKey: "parejas-que-perduran-1e",
        unitKey: "uk-1",
      },
      tx,
    );
  });
});

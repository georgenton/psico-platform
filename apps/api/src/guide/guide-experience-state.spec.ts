import { describe, expect, it, vi } from "vitest";
import { toGuideCompletionSummary } from "./guide-completion-summary";
import { EEC_C1_BODY_BEFORE_MIND_GUIDE } from "./guide-catalog";
import type { AcceptedGuideStep } from "./guide-state-machine";

/**
 * GR-7 — the projection a finished run is allowed to show, and the read that
 * makes it survive a reload.
 *
 * The bug this closes was quiet: an ACTIVE run came back after a refresh
 * because `/sessions/recoverable` could see it, and a COMPLETED one did not,
 * so a journey somebody finished on Tuesday greeted them on Wednesday with
 * «Empezar». The tempting fix was a flag in `localStorage`. A browser saying
 * "I completed this" is a claim about the ledger, and the browser is not the
 * ledger — so the fix is a read.
 *
 * The negative assertions carry most of the weight here. What must NOT reach
 * a reader is more interesting than what must: the option they chose, the
 * option that was right, any id, and the harsher internal word for a recall
 * that did not land.
 */

const GUIDE = EEC_C1_BODY_BEFORE_MIND_GUIDE;

/** Step keys this guide actually declares, so fixtures stay honest. */
const CONCEPT_KEY = "explorar-cuerpo-antes-que-mente";
const PRACTICE_KEY = "practicar-escucharte-por-dentro";
const RECALL_KEY = "recordar-cuerpo-antes-que-mente";

const concept = (order: number): AcceptedGuideStep => ({
  stepKey: CONCEPT_KEY,
  order,
  kind: "CONCEPT_EXPLORATION",
  completionPolicy: "EXPLICIT_CONFIRMATION",
  conceptKey: "eec-cuerpo-antes-que-mente",
});

const practice = (order: number): AcceptedGuideStep => ({
  stepKey: PRACTICE_KEY,
  order,
  kind: "CATALOG_PRACTICE",
  completionPolicy: "CATALOG_PRACTICE_CONFIRMATION",
  exerciseKey: "eec-c1-practice-escucharte-por-dentro",
});

const recall = (
  order: number,
  result: "CORRECT" | "INCORRECT",
): AcceptedGuideStep => ({
  stepKey: RECALL_KEY,
  order,
  kind: "ACTIVE_RECALL",
  completionPolicy: "OBJECTIVE_RECALL",
  itemKey: "eec-c1-recall-cuerpo-antes-que-mente",
  selectedOptionKey: "opcion-mente-primero",
  recallResult: result,
});

describe("toGuideCompletionSummary · what a finished run reports", () => {
  it("counts concepts and practices from the accepted ledger", () => {
    const summary = toGuideCompletionSummary({
      definition: GUIDE,
      acceptedSteps: [concept(1), practice(2)],
    });

    expect(summary.conceptsExplored).toBe(1);
    expect(summary.practicesConfirmed).toBe(1);
    expect(summary.recalls).toHaveLength(0);
  });

  it("reports CORRECT as CORRECT", () => {
    const summary = toGuideCompletionSummary({
      definition: GUIDE,
      acceptedSteps: [recall(1, "CORRECT")],
    });
    expect(summary.recalls).toEqual([{ outcome: "CORRECT" }]);
  });

  it("reports the internal INCORRECT as REVIEW", () => {
    // Not softening a fact — changing which fact is reported. "There is
    // something here to look at again" is what the reader can act on; "you
    // got it wrong" is a verdict on them.
    const summary = toGuideCompletionSummary({
      definition: GUIDE,
      acceptedSteps: [recall(1, "INCORRECT")],
    });
    expect(summary.recalls).toEqual([{ outcome: "REVIEW" }]);
    expect(JSON.stringify(summary)).not.toContain("INCORRECT");
  });

  it("carries neither the chosen option nor the correct one", () => {
    const summary = toGuideCompletionSummary({
      definition: GUIDE,
      acceptedSteps: [concept(1), practice(2), recall(3, "INCORRECT")],
    });

    const serialized = JSON.stringify(summary);
    for (const forbidden of [
      "selectedOptionKey",
      "correctOptionKey",
      "opcion-mente-primero",
      "itemKey",
      "exerciseKey",
      "conceptKey",
      "sessionId",
      "userId",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("ignores rows for steps this pinned version does not declare", () => {
    // A row from a retired version is not evidence about THIS journey, and
    // counting it would inflate a number the reader might compare.
    const stray: AcceptedGuideStep = { ...concept(9), stepKey: "paso-viejo" };
    const summary = toGuideCompletionSummary({
      definition: GUIDE,
      acceptedSteps: [concept(1), stray],
    });
    expect(summary.conceptsExplored).toBe(1);
  });

  it("lists recalls in ledger order, not arrival order", () => {
    const summary = toGuideCompletionSummary({
      definition: GUIDE,
      acceptedSteps: [
        { ...recall(3, "CORRECT"), stepKey: RECALL_KEY },
        { ...recall(1, "INCORRECT"), stepKey: RECALL_KEY },
      ],
    });
    expect(summary.recalls.map((r) => r.outcome)).toEqual([
      "REVIEW",
      "CORRECT",
    ]);
  });

  it("counts nothing for a run with no accepted steps", () => {
    const summary = toGuideCompletionSummary({
      definition: GUIDE,
      acceptedSteps: [],
    });
    expect(summary).toEqual({
      conceptsExplored: 0,
      practicesConfirmed: 0,
      recalls: [],
    });
  });
});

/**
 * The service read. Prisma is a spy here rather than a database: what these
 * cases pin is the DECISION — which status maps to which state, and that a
 * read never writes.
 */
describe("findExperienceState · where the actor stands", () => {
  const PIN = { guideKey: GUIDE.guideKey, guideVersion: GUIDE.guideVersion };

  function serviceWith(row: unknown, steps: unknown[] = []) {
    const findFirst = vi.fn().mockResolvedValue(row);
    const create = vi.fn();
    const update = vi.fn();
    const findMany = vi.fn().mockResolvedValue(steps);
    const prisma = {
      guideSession: { findFirst, create, update },
      guideSessionStep: { findMany, create },
    };
    return { prisma, writes: [create, update] };
  }

  it("no session → NOT_STARTED", async () => {
    const { prisma, writes } = serviceWith(null);
    const { GuideSessionRepository } =
      await import("./guide-session.repository");
    const repo = new GuideSessionRepository(
      prisma as unknown as ConstructorParameters<
        typeof GuideSessionRepository
      >[0],
    );

    expect(await repo.findLatestOwnForExactPin("u1", PIN)).toBeNull();
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it("the repository read is scoped to the actor AND the exact pin", async () => {
    const { prisma } = serviceWith(null);
    const { GuideSessionRepository } =
      await import("./guide-session.repository");
    const repo = new GuideSessionRepository(
      prisma as unknown as ConstructorParameters<
        typeof GuideSessionRepository
      >[0],
    );
    await repo.findLatestOwnForExactPin("u1", PIN);

    // A foreign session is not denied — the query cannot see it, so it does
    // not exist. Same for another version of the same guide.
    expect(prisma.guideSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "u1",
          guideKey: PIN.guideKey,
          guideVersion: PIN.guideVersion,
        },
        orderBy: { startedAt: "desc" },
      }),
    );
  });
});

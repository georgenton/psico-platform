import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuideSessionView } from "@psico/types";
import type { GuidePresentation } from "./guide-presentation";
import { guideStorageKey } from "./guide-recovery";
import { useGuideRun } from "./use-guide-run";
import type * as ApiClientModule from "@psico/api-client";

/**
 * GR-4 — `submitRecall` refuses a cross-recall pair BEFORE it commits to it.
 *
 * The order is the point. A key minted and a record written for an attempt the
 * server was always going to reject is worse than a rejection: the retry path
 * would faithfully re-send it, and the reader would watch a command fail twice
 * for a question they were never asked.
 *
 * So the assertions are not just "the request did not happen" — they are also
 * `CROSS_RECALL_OPTION_RECOVERY_WRITES=0`.
 */

const start = vi.fn();
const submitRecallApi = vi.fn();

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      createGuideSession: (...a: unknown[]) => start(...a),
      completeGuideSessionStep: vi.fn(),
      submitGuideStepRecall: (...a: unknown[]) => submitRecallApi(...a),
      cancelGuideSession: vi.fn(),
      completeGuideSession: vi.fn(),
    },
  };
});

const SCOPE = "t".repeat(43);
const PIN = { guideKey: "test-dos-recalls", guideVersion: 1 } as const;
const START_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Same synthetic guide as `guide-option-scope.spec.ts`: two recall steps. */
const TWO_RECALLS: GuidePresentation = {
  guideKey: PIN.guideKey,
  guideVersion: PIN.guideVersion,
  title: "Guía de prueba",
  tag: "Prueba",
  summary: "Dos recalls.",
  steps: [
    {
      surface: "recall",
      stepKey: "recall-a",
      initialReaderScene: "recall",
      shortLabel: "A",
      title: "A",
      body: [],
      actionLabel: "Registrar",
      question: "¿Pregunta A?",
      options: [
        { optionKey: "a-1", label: "A uno" },
        { optionKey: "a-2", label: "A dos" },
      ],
    },
    {
      surface: "recall",
      stepKey: "recall-b",
      initialReaderScene: "recall",
      shortLabel: "B",
      title: "B",
      body: [],
      actionLabel: "Registrar",
      question: "¿Pregunta B?",
      options: [
        { optionKey: "b-1", label: "B uno" },
        { optionKey: "b-2", label: "B dos" },
      ],
    },
  ],
  labels: {
    start: "",
    resume: "",
    restart: "",
    finish: "",
    exit: "",
    back: "",
    retry: "",
  },
};

function session(currentStepKey: string): GuideSessionView {
  return {
    sessionId: "ses_two_recalls",
    guideKey: PIN.guideKey,
    guideVersion: PIN.guideVersion,
    status: "ACTIVE",
    stepsCompleted: 0,
    totalSteps: 2,
    currentStepKey,
  };
}

/** Seed a record so the hook resumes and reaches a live session. */
function seedRecovery() {
  window.localStorage.setItem(
    guideStorageKey(PIN) as string,
    JSON.stringify({
      schemaVersion: 1,
      actorScope: SCOPE,
      guideKey: PIN.guideKey,
      guideVersion: PIN.guideVersion,
      startIdempotencyKey: START_KEY,
    }),
  );
}

async function mountOn(currentStepKey: string) {
  start.mockResolvedValue({ session: session(currentStepKey) });
  const hook = renderHook(() =>
    useGuideRun({ actorScope: SCOPE, pin: PIN, presentation: TWO_RECALLS }),
  );
  // The run must actually be live, otherwise `send` would short-circuit on the
  // missing session and the test would pass for the wrong reason.
  await waitFor(() => expect(hook.result.current.session).not.toBeNull());
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  seedRecovery();
});

describe("useGuideRun.submitRecall · option scope", () => {
  it("sends the command when the pair lines up", async () => {
    submitRecallApi.mockResolvedValue({
      session: session("recall-b"),
      feedback: { outcome: "CORRECT" },
    });
    const hook = await mountOn("recall-a");

    await act(async () => {
      hook.result.current.submitRecall("recall-a", "a-1");
    });

    await waitFor(() => expect(submitRecallApi).toHaveBeenCalled());
    expect(submitRecallApi.mock.calls[0]?.[1]).toBe("recall-a");
    expect(
      (submitRecallApi.mock.calls[0]?.[2] as Record<string, unknown>)
        .selectedOptionKey,
    ).toBe("a-1");
  });

  it.each([
    ["recall-a", "b-1"],
    ["recall-b", "a-1"],
  ])(
    "refuses %s + %s with no request and no recovery write",
    async (stepKey, optionKey) => {
      const hook = await mountOn(stepKey);

      // Count writes from THIS point on: the mount's own settle-write is
      // legitimate and is not what this test is about.
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const before = submitRecallApi.mock.calls.length;

      await act(async () => {
        hook.result.current.submitRecall(stepKey, optionKey);
      });

      // CROSS_RECALL_OPTION_NETWORK_REQUESTS=0
      expect(submitRecallApi.mock.calls.length).toBe(before);
      // CROSS_RECALL_OPTION_RECOVERY_WRITES=0
      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    },
  );

  it("refuses an option that exists in no recall at all", async () => {
    const hook = await mountOn("recall-a");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await act(async () => {
      hook.result.current.submitRecall("recall-a", "z-9");
    });

    expect(submitRecallApi).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

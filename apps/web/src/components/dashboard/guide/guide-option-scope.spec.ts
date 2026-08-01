import { describe, expect, it } from "vitest";
import {
  isGuideOptionKey,
  isGuideOptionKeyForStep,
  type GuidePresentation,
} from "./guide-presentation";
import { parsePendingGuideCommand } from "./guide-recovery";
import { EEC_PRESENTATION, PQP_PRESENTATION } from "./guide-test-fixtures";

/**
 * GR-4 — an option belongs to ONE recall, not to a guide.
 *
 * Both production guides happen to have a single recall step, so
 * `isGuideOptionKey` ("does this key exist anywhere in this guide?") gives the
 * right answer today by accident. This file uses a synthetic two-recall guide
 * to show what that check misses: `recall-a` would accept `b-1`, the browser
 * would mint an idempotency key and write a recovery record, and the server
 * would reject a command the client had already committed to retrying.
 *
 * The fixture is test-only on purpose. Adding a second recall to a real guide
 * to expose this would make an editorial change to prove a code property.
 */

const TWO_RECALLS: GuidePresentation = {
  guideKey: "test-dos-recalls",
  guideVersion: 1,
  title: "Guía de prueba",
  tag: "Prueba",
  summary: "Dos recalls, para probar el alcance de la validación.",
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
    {
      surface: "confirm",
      stepKey: "confirmar-algo",
      initialReaderScene: "cover",
      shortLabel: "C",
      title: "C",
      body: [],
      actionLabel: "Confirmar",
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

describe("isGuideOptionKeyForStep", () => {
  it("accepts each recall's own options", () => {
    expect(isGuideOptionKeyForStep("recall-a", "a-1", TWO_RECALLS)).toBe(true);
    expect(isGuideOptionKeyForStep("recall-a", "a-2", TWO_RECALLS)).toBe(true);
    expect(isGuideOptionKeyForStep("recall-b", "b-1", TWO_RECALLS)).toBe(true);
    expect(isGuideOptionKeyForStep("recall-b", "b-2", TWO_RECALLS)).toBe(true);
  });

  it("CROSS_RECALL_OPTION_ACCEPTED=false — both directions", () => {
    expect(isGuideOptionKeyForStep("recall-a", "b-1", TWO_RECALLS)).toBe(false);
    expect(isGuideOptionKeyForStep("recall-a", "b-2", TWO_RECALLS)).toBe(false);
    expect(isGuideOptionKeyForStep("recall-b", "a-1", TWO_RECALLS)).toBe(false);
    expect(isGuideOptionKeyForStep("recall-b", "a-2", TWO_RECALLS)).toBe(false);
  });

  it("is strictly stronger than the guide-wide check", () => {
    // This is the whole point: the coarse check cannot tell these apart.
    expect(isGuideOptionKey("b-1", TWO_RECALLS)).toBe(true);
    expect(isGuideOptionKeyForStep("recall-a", "b-1", TWO_RECALLS)).toBe(false);
  });

  it.each([
    ["an unknown step", "recall-inventado", "a-1"],
    ["a confirm step", "confirmar-algo", "a-1"],
    ["an unknown option", "recall-a", "z-9"],
    ["an empty option", "recall-a", ""],
  ])("rejects %s", (_why, stepKey, optionKey) => {
    expect(isGuideOptionKeyForStep(stepKey, optionKey, TWO_RECALLS)).toBe(
      false,
    );
  });

  it("rejects a non-string option without throwing", () => {
    for (const value of [null, undefined, 1, {}, []]) {
      expect(isGuideOptionKeyForStep("recall-a", value, TWO_RECALLS)).toBe(
        false,
      );
    }
  });

  it("keeps the production guides working", () => {
    expect(
      isGuideOptionKeyForStep(
        "recordar-cuerpo-antes-que-mente",
        "opcion-cuerpo-primero",
        EEC_PRESENTATION,
      ),
    ).toBe(true);
    expect(
      isGuideOptionKeyForStep(
        "recordar-contacto-sostenido",
        "pqp-opcion-manos-y-mirada",
        PQP_PRESENTATION,
      ),
    ).toBe(true);
    // …and still refuses the other guide's option.
    expect(
      isGuideOptionKeyForStep(
        "recordar-contacto-sostenido",
        "opcion-cuerpo-primero",
        PQP_PRESENTATION,
      ),
    ).toBe(false);
  });
});

describe("parsePendingGuideCommand is scoped to the exact recall", () => {
  const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const SESSION = "ses_two_recalls";

  function recall(stepKey: string, selectedOptionKey: string) {
    return {
      commandType: "STEP_RECALL",
      idempotencyKey: KEY,
      sessionId: SESSION,
      stepKey,
      selectedOptionKey,
    };
  }

  it("round-trips each recall with its own option", () => {
    expect(
      parsePendingGuideCommand(recall("recall-a", "a-1"), TWO_RECALLS),
    ).toEqual(recall("recall-a", "a-1"));
    expect(
      parsePendingGuideCommand(recall("recall-b", "b-1"), TWO_RECALLS),
    ).toEqual(recall("recall-b", "b-1"));
  });

  it("drops a stored command that crosses recalls, both directions", () => {
    expect(
      parsePendingGuideCommand(recall("recall-a", "b-1"), TWO_RECALLS),
    ).toBeNull();
    expect(
      parsePendingGuideCommand(recall("recall-b", "a-1"), TWO_RECALLS),
    ).toBeNull();
  });
});

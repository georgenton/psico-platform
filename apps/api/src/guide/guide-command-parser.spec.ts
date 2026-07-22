import { describe, expect, it } from "vitest";
import {
  parseCancelGuideSessionCommand,
  parseCompleteGuideSessionCommand,
  parseCompleteGuideSessionStepCommand,
  parseStartGuideSessionCommand,
  parseSubmitGuideStepRecallCommand,
  type GuideParseResult,
} from "./guide-command-parser";

/**
 * CC-7.4D — the pure Guide parsers are the runtime authority on every body.
 *
 * The point of these tests is the CLOSED whitelist: the rejected-field table
 * is not a blocklist of scary words, it is proof that anything undeclared dies
 * structurally — editorial context, target keys, server-owned results, the
 * catalog's correct option, free text, emotions and metadata alike.
 */

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION = "cmb0abc123";
const STEP = "explorar-cuerpo-antes-que-mente";

function expectInvalid(result: GuideParseResult<unknown>): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("GUIDE_INVALID_PAYLOAD");
}

function expectKeyRequired(result: GuideParseResult<unknown>): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("GUIDE_IDEMPOTENCY_KEY_REQUIRED");
  }
}

/** Every parser, driven through one minimal valid call. */
const PARSERS: Array<{
  name: string;
  parse: (body: unknown) => GuideParseResult<unknown>;
}> = [
  {
    name: "start",
    parse: (b) => parseStartGuideSessionCommand(b),
  },
  {
    name: "step complete",
    parse: (b) =>
      parseCompleteGuideSessionStepCommand(
        { sessionId: SESSION, stepKey: STEP },
        b,
      ),
  },
  {
    name: "recall",
    parse: (b) =>
      parseSubmitGuideStepRecallCommand(
        { sessionId: SESSION, stepKey: STEP },
        b,
      ),
  },
  {
    name: "cancel",
    parse: (b) => parseCancelGuideSessionCommand({ sessionId: SESSION }, b),
  },
  {
    name: "session complete",
    parse: (b) => parseCompleteGuideSessionCommand({ sessionId: SESSION }, b),
  },
];

describe("guide command parsers · happy paths", () => {
  it("start: idempotencyKey + guideKey + exact version", () => {
    const r = parseStartGuideSessionCommand({
      idempotencyKey: UUID,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
    expect(r).toEqual({
      ok: true,
      command: {
        idempotencyKey: UUID,
        guideKey: "eec-c1-cuerpo-antes-que-mente",
        guideVersion: 1,
      },
    });
  });

  it("step complete: route params + idempotencyKey only", () => {
    const r = parseCompleteGuideSessionStepCommand(
      { sessionId: SESSION, stepKey: STEP },
      { idempotencyKey: UUID },
    );
    expect(r).toEqual({
      ok: true,
      command: { idempotencyKey: UUID, sessionId: SESSION, stepKey: STEP },
    });
  });

  it("recall: the chosen option and nothing else", () => {
    const r = parseSubmitGuideStepRecallCommand(
      { sessionId: SESSION, stepKey: STEP },
      { idempotencyKey: UUID, selectedOptionKey: "opcion-cuerpo-primero" },
    );
    expect(r).toEqual({
      ok: true,
      command: {
        idempotencyKey: UUID,
        sessionId: SESSION,
        stepKey: STEP,
        selectedOptionKey: "opcion-cuerpo-primero",
      },
    });
  });

  it("cancel and session complete: session id + idempotencyKey", () => {
    for (const parse of [
      parseCancelGuideSessionCommand,
      parseCompleteGuideSessionCommand,
    ]) {
      expect(parse({ sessionId: SESSION }, { idempotencyKey: UUID })).toEqual({
        ok: true,
        command: { idempotencyKey: UUID, sessionId: SESSION },
      });
    }
  });

  it("uppercase UUIDs are canonicalised without mutating the input", () => {
    const input = { idempotencyKey: UUID.toUpperCase() };
    const r = parseCancelGuideSessionCommand({ sessionId: SESSION }, input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.command as { idempotencyKey: string }).idempotencyKey).toBe(
        UUID,
      );
    }
    expect(input.idempotencyKey).toBe(UUID.toUpperCase());
  });
});

describe("guide command parsers · the closed whitelist", () => {
  it("rejects every undeclared field on EVERY command", () => {
    // Editorial context, target keys, server-owned verdicts, the catalog's
    // answer, progress counters, and the classic free-text/emotional payloads.
    const forbidden: Array<Record<string, unknown>> = [
      { userId: "u-1" },
      { editionKey: "emociones-en-construccion-1e" },
      { unitKey: "unit-1" },
      { context: { editionKey: "e", unitKey: "u" } },
      { sessionId: SESSION },
      { stepKey: STEP },
      { kind: "CONCEPT_EXPLORATION" },
      { completionPolicy: "explicit_confirmation" },
      { conceptKey: "c-1" },
      { exerciseKey: "e-1" },
      { itemKey: "i-1" },
      { confirmationKey: "k-1" },
      { order: 1 },
      { stepsCompleted: 3 },
      { totalSteps: 3 },
      { currentStepKey: STEP },
      { result: "correct" },
      { evaluationSource: "server" },
      { score: 10 },
      { emotion: "sad" },
      { text: "…" },
      { transcript: "…" },
      { duration: 42 },
      { metadata: {} },
      { payload: {} },
      { correctOptionKey: "opcion-cuerpo-primero" },
    ];
    for (const { name, parse } of PARSERS) {
      for (const extra of forbidden) {
        const body: Record<string, unknown> = {
          idempotencyKey: UUID,
          ...(name === "start"
            ? { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 }
            : {}),
          ...(name === "recall"
            ? { selectedOptionKey: "opcion-cuerpo-primero" }
            : {}),
          ...extra,
        };
        expectInvalid(parse(body));
      }
    }
  });

  it("rejects non-objects, arrays and exotic prototypes", () => {
    for (const { parse } of PARSERS) {
      for (const body of [null, undefined, 1, "x", true, [], () => 1]) {
        expectInvalid(parse(body));
      }
      expectInvalid(parse(Object.create({ idempotencyKey: UUID })));
      expectInvalid(parse(new Date()));
    }
  });

  it("rejects symbol-keyed bodies", () => {
    for (const { name, parse } of PARSERS) {
      const body: Record<string | symbol, unknown> = {
        idempotencyKey: UUID,
        ...(name === "start"
          ? { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 }
          : {}),
        ...(name === "recall"
          ? { selectedOptionKey: "opcion-cuerpo-primero" }
          : {}),
      };
      body[Symbol("smuggled")] = "…";
      expectInvalid(parse(body));
    }
  });

  it("an inherited idempotencyKey does not count as present", () => {
    const body = Object.create({ idempotencyKey: UUID }) as object;
    expectInvalid(parseCancelGuideSessionCommand({ sessionId: SESSION }, body));
  });

  it("a missing idempotencyKey is its own code", () => {
    expectKeyRequired(
      parseStartGuideSessionCommand({ guideKey: "g", guideVersion: 1 }),
    );
    expectKeyRequired(
      parseCancelGuideSessionCommand({ sessionId: SESSION }, {}),
    );
  });

  it("rejects non-canonical idempotency keys", () => {
    for (const key of ["", "not-a-uuid", 42, null, `${UUID} `]) {
      expectInvalid(
        parseCancelGuideSessionCommand(
          { sessionId: SESSION },
          { idempotencyKey: key },
        ),
      );
    }
  });
});

describe("guide command parsers · closed grammars", () => {
  it("guideKey and selectedOptionKey follow the catalog grammar", () => {
    for (const bad of [
      "",
      " ",
      "Upper",
      "with space",
      "ñ",
      "a".repeat(201),
      7,
    ]) {
      expectInvalid(
        parseStartGuideSessionCommand({
          idempotencyKey: UUID,
          guideKey: bad,
          guideVersion: 1,
        }),
      );
      expectInvalid(
        parseSubmitGuideStepRecallCommand(
          { sessionId: SESSION, stepKey: STEP },
          { idempotencyKey: UUID, selectedOptionKey: bad },
        ),
      );
    }
  });

  it("guideVersion must be an integer >= 1 — never coerced", () => {
    for (const bad of ["1", 0, -1, 1.5, Number.NaN, Infinity, null, true]) {
      expectInvalid(
        parseStartGuideSessionCommand({
          idempotencyKey: UUID,
          guideKey: "eec-c1-cuerpo-antes-que-mente",
          guideVersion: bad,
        }),
      );
    }
  });

  it("route params are closed: shape, extras and grammar", () => {
    // stepKey follows the catalog grammar…
    expectInvalid(
      parseCompleteGuideSessionStepCommand(
        { sessionId: SESSION, stepKey: "Not A Key" },
        { idempotencyKey: UUID },
      ),
    );
    // …sessionId is an opaque token (no whitespace, no controls)…
    expectInvalid(
      parseCompleteGuideSessionStepCommand(
        { sessionId: "with space", stepKey: STEP },
        { idempotencyKey: UUID },
      ),
    );
    // …and an undeclared param is refused outright.
    expectInvalid(
      parseCancelGuideSessionCommand(
        { sessionId: SESSION, userId: "u-1" },
        { idempotencyKey: UUID },
      ),
    );
    expectInvalid(
      parseCancelGuideSessionCommand("not-an-object", {
        idempotencyKey: UUID,
      }),
    );
  });
});

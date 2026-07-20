import { describe, expect, it } from "vitest";
import {
  parseCompleteGuideSessionCommand,
  parseCompletePracticeCommand,
  parseCompleteUnitCommand,
  parseCreateGuideSessionCommand,
  parseExploreConceptCommand,
  parseOpenUnitCommand,
  parseSubmitRecallAttemptCommand,
  type ParseResult,
} from "./learning-command-parser";

/**
 * CC-7.1 — exhaustive pure-validation suite. The parsers ARE the privacy
 * mechanism at the wire boundary: everything not on the closed whitelist is
 * rejected structurally, so the free-text / emotional / metadata cases below
 * are demonstrations of the whitelist, not a keyword blocklist.
 */

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID2 = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

const expectInvalid = (r: ParseResult<unknown>, code?: string) => {
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error.code).toBe(code ?? "LEARNING_EVENT_INVALID_PAYLOAD");
  }
};

// Every body-taking parser, normalised to (body) => result with a valid route
// param, so the common invalid-body cases run against ALL of them.
const BODY_PARSERS: Array<{
  name: string;
  parse: (body: unknown) => ParseResult<unknown>;
}> = [
  {
    name: "openUnit",
    parse: (b) => parseOpenUnitCommand({ unitKey: "u-1" }, b),
  },
  {
    name: "completeUnit",
    parse: (b) => parseCompleteUnitCommand({ unitKey: "u-1" }, b),
  },
  {
    name: "exploreConcept",
    parse: (b) => parseExploreConceptCommand({ conceptKey: "c-1" }, b),
  },
  {
    name: "submitRecallAttempt",
    parse: (b) => parseSubmitRecallAttemptCommand(b),
  },
  {
    name: "completePractice",
    parse: (b) => parseCompletePracticeCommand({ exerciseKey: "e-1" }, b),
  },
  {
    name: "createGuideSession",
    parse: (b) => parseCreateGuideSessionCommand(b),
  },
  {
    name: "completeGuideSession",
    parse: (b) => parseCompleteGuideSessionCommand({ id: "gs-1" }, b),
  },
];

describe("learning command parsers — happy paths", () => {
  it("open unit: route unitKey + idempotencyKey → typed command", () => {
    const r = parseOpenUnitCommand(
      { unitKey: "unit-abc" },
      { idempotencyKey: UUID },
    );
    expect(r).toEqual({
      ok: true,
      command: { idempotencyKey: UUID, unitKey: "unit-abc" },
    });
  });

  it("complete unit: only route key + idempotencyKey are accepted", () => {
    const r = parseCompleteUnitCommand(
      { unitKey: "unit-abc" },
      { idempotencyKey: UUID },
    );
    expect(r).toEqual({
      ok: true,
      command: { idempotencyKey: UUID, unitKey: "unit-abc" },
    });
  });

  it("explore concept: route conceptKey + idempotencyKey", () => {
    const r = parseExploreConceptCommand(
      { conceptKey: "familia-ensamblada" },
      { idempotencyKey: UUID },
    );
    expect(r).toEqual({
      ok: true,
      command: { idempotencyKey: UUID, conceptKey: "familia-ensamblada" },
    });
  });

  it("recall (objective): itemKey + selectedOptionKey → kind objective", () => {
    const r = parseSubmitRecallAttemptCommand({
      idempotencyKey: UUID,
      itemKey: "item-1",
      selectedOptionKey: "option-b",
    });
    expect(r).toEqual({
      ok: true,
      command: {
        idempotencyKey: UUID,
        itemKey: "item-1",
        kind: "objective",
        selectedOptionKey: "option-b",
      },
    });
  });

  it("recall (self-assessed): itemKey + selfResult → kind self_assessed", () => {
    const r = parseSubmitRecallAttemptCommand({
      idempotencyKey: UUID,
      itemKey: "item-1",
      selfResult: "incorrect",
    });
    expect(r).toEqual({
      ok: true,
      command: {
        idempotencyKey: UUID,
        itemKey: "item-1",
        kind: "self_assessed",
        selfResult: "incorrect",
      },
    });
  });

  it("complete practice: route exerciseKey + idempotencyKey", () => {
    const r = parseCompletePracticeCommand(
      { exerciseKey: "respiracion-1" },
      { idempotencyKey: UUID },
    );
    expect(r).toEqual({
      ok: true,
      command: { idempotencyKey: UUID, exerciseKey: "respiracion-1" },
    });
  });

  it("create guide session: no editorial context → context null", () => {
    const r = parseCreateGuideSessionCommand({ idempotencyKey: UUID });
    expect(r).toEqual({
      ok: true,
      command: { idempotencyKey: UUID, context: null },
    });
  });

  it("create guide session: full context (editionKey AND unitKey)", () => {
    const r = parseCreateGuideSessionCommand({
      idempotencyKey: UUID,
      editionKey: "familias-ensambladas-1e",
      unitKey: "unit-abc",
    });
    expect(r).toEqual({
      ok: true,
      command: {
        idempotencyKey: UUID,
        context: { editionKey: "familias-ensambladas-1e", unitKey: "unit-abc" },
      },
    });
  });

  it("complete guide session: route id + idempotencyKey only", () => {
    const r = parseCompleteGuideSessionCommand(
      { id: "cmb0abc123" },
      { idempotencyKey: UUID },
    );
    expect(r).toEqual({
      ok: true,
      command: { idempotencyKey: UUID, guideSessionId: "cmb0abc123" },
    });
  });

  it("uppercase UUIDs are accepted and canonicalised to lowercase", () => {
    const upper = UUID.toUpperCase();
    const input = { idempotencyKey: upper };
    const r = parseOpenUnitCommand({ unitKey: "u" }, input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.command.idempotencyKey).toBe(UUID);
    // The INPUT is never modified — only the command is canonical.
    expect(input.idempotencyKey).toBe(upper);
  });

  it("lowercase UUIDs stay byte-identical", () => {
    const r = parseOpenUnitCommand({ unitKey: "u" }, { idempotencyKey: UUID });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.command.idempotencyKey).toBe(UUID);
  });

  it("inputs differing only by casing produce the SAME idempotencyKey", () => {
    const a = parseOpenUnitCommand({ unitKey: "u" }, { idempotencyKey: UUID });
    const b = parseOpenUnitCommand(
      { unitKey: "u" },
      { idempotencyKey: UUID.toUpperCase() },
    );
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.command.idempotencyKey).toBe(b.command.idempotencyKey);
    }
  });
});

describe("common invalid inputs — every parser", () => {
  it.each(BODY_PARSERS)("$name: undefined body → invalid", ({ parse }) => {
    expectInvalid(parse(undefined));
  });

  it.each(BODY_PARSERS)("$name: null body → invalid", ({ parse }) => {
    expectInvalid(parse(null));
  });

  it.each(BODY_PARSERS)("$name: array body → invalid", ({ parse }) => {
    expectInvalid(parse([{ idempotencyKey: UUID }]));
  });

  it.each(BODY_PARSERS)("$name: string body → invalid", ({ parse }) => {
    expectInvalid(parse("idempotencyKey"));
  });

  it.each(BODY_PARSERS)("$name: number body → invalid", ({ parse }) => {
    expectInvalid(parse(42));
  });

  it.each(BODY_PARSERS)(
    "$name: empty object → IDEMPOTENCY_KEY_REQUIRED",
    ({ parse }) => {
      expectInvalid(parse({}), "LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED");
    },
  );

  it.each(BODY_PARSERS)(
    "$name: idempotencyKey present but not a UUID → invalid payload",
    ({ parse }) => {
      expectInvalid(parse({ idempotencyKey: "not-a-uuid" }));
      expectInvalid(parse({ idempotencyKey: "" }));
      expectInvalid(parse({ idempotencyKey: null }));
      expectInvalid(parse({ idempotencyKey: 123 }));
    },
  );

  it.each(BODY_PARSERS)("$name: extra field → invalid", ({ parse }) => {
    expectInvalid(parse({ idempotencyKey: UUID, extra: 1 }));
  });

  it.each(BODY_PARSERS)(
    "$name: an INHERITED idempotencyKey is never accepted as own",
    ({ parse }) => {
      // Hostile prototype: the key exists on the prototype chain, not on the
      // object itself. isPlainObject + hasOwnProperty must both refuse it.
      const hostile = Object.create({ idempotencyKey: UUID }) as object;
      expectInvalid(parse(hostile));
    },
  );
});

describe("route params", () => {
  it("missing / empty / whitespace-only / non-string keys are invalid", () => {
    expectInvalid(parseOpenUnitCommand({}, { idempotencyKey: UUID }));
    expectInvalid(
      parseOpenUnitCommand({ unitKey: "" }, { idempotencyKey: UUID }),
    );
    expectInvalid(
      parseOpenUnitCommand({ unitKey: "   " }, { idempotencyKey: UUID }),
    );
    expectInvalid(
      parseOpenUnitCommand({ unitKey: 42 }, { idempotencyKey: UUID }),
    );
    expectInvalid(
      parseOpenUnitCommand({ unitKey: ["u"] }, { idempotencyKey: UUID }),
    );
    expectInvalid(parseOpenUnitCommand(null, { idempotencyKey: UUID }));
    expectInvalid(parseOpenUnitCommand("unit-abc", { idempotencyKey: UUID }));
  });

  it("keys with control characters or over-long keys are invalid", () => {
    expectInvalid(
      parseOpenUnitCommand({ unitKey: "u\nnit" }, { idempotencyKey: UUID }),
    );
    expectInvalid(
      parseOpenUnitCommand(
        { unitKey: "a".repeat(201) },
        { idempotencyKey: UUID },
      ),
    );
  });

  it("free text and whitespace in ANY position are invalid keys", () => {
    for (const bad of [
      "me siento triste hoy",
      "item key",
      "tab\tkey",
      "line\nkey",
      "nbsp\u00a0key",
      " leading",
      "trailing ",
    ]) {
      expectInvalid(
        parseOpenUnitCommand({ unitKey: bad }, { idempotencyKey: UUID }),
      );
    }
  });

  it("real key shapes pass: uuid, cuid, slug, underscore, dot, colon", () => {
    for (const good of [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "cmb0a1b2c3d4e5f6g7h8i9j0k",
      "eec-cuerpo-antes-que-mente",
      "familias-ensambladas-1e",
      "cuv-aaaaaaaa",
      "snake_case_key",
      "dotted.key.v1",
      "ns:scoped:key",
    ]) {
      const r = parseOpenUnitCommand(
        { unitKey: good },
        { idempotencyKey: UUID },
      );
      expect(r.ok).toBe(true);
    }
  });

  it("unexpected extra route params are invalid", () => {
    expectInvalid(
      parseOpenUnitCommand(
        { unitKey: "u-1", userId: "someone-else" },
        { idempotencyKey: UUID },
      ),
    );
  });
});

describe("privacy — the closed whitelist rejects every undeclared field", () => {
  // Not a keyword blocklist: ANY undeclared field dies. These names document
  // the attack surface the firewall is protecting against.
  const SMUGGLED: Record<string, unknown>[] = [
    { diaryText: "querido diario…" },
    { ecoMessage: "hola eco" },
    { transcript: "…" },
    { prompt: "act as…" },
    { freeText: "x" },
    { emotion: "sad" },
    { emotionalScore: 0.8 },
    { clinicalLabel: "depresion" },
    { mapAxis: "calma" },
    { metadata: { a: 1 } },
    { meta: {} },
    { completed: true },
    { progress: 100 },
    { duration: 999 },
    { percentage: 100 },
    { content: "…" },
    { text: "…" },
    { attention: 1 },
    { comprehension: 1 },
    { read: true },
  ];

  it.each(BODY_PARSERS)("$name rejects every smuggled field", ({ parse }) => {
    for (const extra of SMUGGLED) {
      expectInvalid(parse({ idempotencyKey: UUID, ...extra }));
    }
  });

  it("explore concept: the client cannot declare the editorial context", () => {
    for (const field of [
      { unitKey: "u-1" },
      { editionKey: "e-1" },
      { bookSlug: "familias-ensambladas" },
      { emotionalMeaning: "…" },
      { resonance: true },
    ]) {
      expectInvalid(
        parseExploreConceptCommand(
          { conceptKey: "c-1" },
          { idempotencyKey: UUID, ...field },
        ),
      );
    }
  });

  it("complete guide session: stepsCompleted/summary/transcript/result rejected", () => {
    for (const field of [
      { stepsCompleted: 7 },
      { summary: "…" },
      { transcript: "…" },
      { result: "done" },
    ]) {
      expectInvalid(
        parseCompleteGuideSessionCommand(
          { id: "gs-1" },
          { idempotencyKey: UUID, ...field },
        ),
      );
    }
  });
});

describe("recall attempt — exclusive union, server-owned result", () => {
  it("both selectedOptionKey and selfResult → invalid", () => {
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "item-1",
        selectedOptionKey: "option-a",
        selfResult: "correct",
      }),
    );
  });

  it("neither variant → invalid", () => {
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "item-1",
      }),
    );
  });

  it("client-declared result: 'correct' → rejected (server-owned)", () => {
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "item-1",
        selectedOptionKey: "option-a",
        result: "correct",
      }),
    );
  });

  it("client-declared evaluationSource: 'server' → rejected", () => {
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "item-1",
        selfResult: "correct",
        evaluationSource: "server",
      }),
    );
  });

  it("selfResult outside the enum → invalid", () => {
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "item-1",
        selfResult: "almost",
      }),
    );
  });

  it("free-text answer smuggled into the option key → invalid", () => {
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "item-1",
        selectedOptionKey:
          "creo que la respuesta es la B porque " + "x".repeat(200),
      }),
    );
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "item-1",
        selectedOptionKey: "linea uno\nlinea dos",
      }),
    );
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "item-1",
        answerText: "respuesta libre",
      }),
    );
  });

  it("missing/invalid itemKey → invalid", () => {
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        selectedOptionKey: "option-a",
      }),
    );
    expectInvalid(
      parseSubmitRecallAttemptCommand({
        idempotencyKey: UUID,
        itemKey: "  ",
        selectedOptionKey: "option-a",
      }),
    );
  });
});

describe("guide session create — all-or-nothing editorial context", () => {
  it("editionKey without unitKey → invalid (and vice versa)", () => {
    expectInvalid(
      parseCreateGuideSessionCommand({
        idempotencyKey: UUID,
        editionKey: "familias-ensambladas-1e",
      }),
    );
    expectInvalid(
      parseCreateGuideSessionCommand({ idempotencyKey: UUID, unitKey: "u-1" }),
    );
  });

  it("prompt/message/emotion/map/diary/eco fields rejected", () => {
    for (const field of [
      { prompt: "…" },
      { message: "…" },
      { emotion: "sad" },
      { map: {} },
      { diary: "…" },
      { eco: "…" },
    ]) {
      expectInvalid(
        parseCreateGuideSessionCommand({ idempotencyKey: UUID, ...field }),
      );
    }
  });
});

describe("determinism and immutability", () => {
  it("parsers never mutate the input (frozen input parses fine)", () => {
    const params = Object.freeze({ unitKey: "unit-abc" });
    const body = Object.freeze({ idempotencyKey: UUID });
    const before = JSON.stringify({ params, body });
    const r = parseOpenUnitCommand(params, body);
    expect(r.ok).toBe(true);
    expect(JSON.stringify({ params, body })).toBe(before);
  });

  it("returns a NEW normalised structure, not the input object", () => {
    const body = { idempotencyKey: UUID };
    const r = parseOpenUnitCommand({ unitKey: "u-1" }, body);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command).not.toBe(body);
      expect(Object.keys(r.command).sort()).toEqual([
        "idempotencyKey",
        "unitKey",
      ]);
    }
  });

  it("same input → same result (deterministic)", () => {
    const input = {
      idempotencyKey: UUID2,
      itemKey: "item-1",
      selfResult: "skipped",
    };
    const a = parseSubmitRecallAttemptCommand(input);
    const b = parseSubmitRecallAttemptCommand(input);
    expect(a).toEqual(b);
  });

  it("error details never echo input values", () => {
    const r = parseOpenUnitCommand(
      { unitKey: "u-1" },
      { idempotencyKey: UUID, diaryText: "TEXTO PRIVADO" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(JSON.stringify(r.error)).not.toContain("TEXTO PRIVADO");
      expect(JSON.stringify(r.error)).not.toContain("diaryText");
    }
  });
});

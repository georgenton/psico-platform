import { describe, expect, it } from "vitest";
import type { LearningEventTypeV1 } from "@psico/types";
import {
  isSemanticallyEquivalent,
  KIND_TO_TYPE,
  readStoredPayload,
  rebuildPayload,
  TYPE_TO_KIND,
  type StoredLearningEventSemantics,
} from "./learning-event-semantics";
import {
  LearningEventRepository,
  LearningEventStorageError,
  type LearningEventDb,
} from "./learning-event.repository";
import type { ValidatedLearningEvent } from "./validated-learning-event";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** One canonical validated input per V1 type (references included). */
const INPUTS: { [K in LearningEventTypeV1]: ValidatedLearningEvent<K> } = {
  unit_opened: {
    userId: "u-1",
    idempotencyKey: UUID,
    type: "unit_opened",
    payload: { editionKey: "libro-1e", unitKey: "unit-1" },
    editionId: "ed-1",
    unitId: "cu-1",
  },
  unit_completed: {
    userId: "u-1",
    idempotencyKey: UUID,
    type: "unit_completed",
    payload: { editionKey: "libro-1e", unitKey: "unit-1", revisionNumber: 3 },
    editionId: "ed-1",
    unitId: "cu-1",
  },
  concept_explored: {
    userId: "u-1",
    idempotencyKey: UUID,
    type: "concept_explored",
    payload: { conceptKey: "familia-ensamblada", unitKey: "unit-1" },
    conceptId: "co-1",
    unitId: "cu-1",
  },
  guide_session_started: {
    userId: "u-1",
    idempotencyKey: UUID,
    type: "guide_session_started",
    payload: { guideSessionId: "gs-1" },
    guideSessionId: "gs-1",
  },
  guide_session_completed: {
    userId: "u-1",
    idempotencyKey: UUID,
    type: "guide_session_completed",
    payload: { guideSessionId: "gs-1", stepsCompleted: 4 },
    guideSessionId: "gs-1",
  },
  active_recall_attempted: {
    userId: "u-1",
    idempotencyKey: UUID,
    type: "active_recall_attempted",
    payload: {
      unitKey: "unit-1",
      itemKey: "item-1",
      result: "correct",
      evaluationSource: "server",
      conceptKey: "familia-ensamblada",
    },
    unitId: "cu-1",
    conceptId: "co-1",
  },
  practice_completed: {
    userId: "u-1",
    idempotencyKey: UUID,
    type: "practice_completed",
    payload: { exerciseKey: "respiracion-1", unitKey: "unit-1" },
    unitId: "cu-1",
  },
};

/** Build the stored-row twin of a validated input (what the writer persists). */
function rowFor(input: ValidatedLearningEvent): StoredLearningEventSemantics {
  return {
    kind: TYPE_TO_KIND[input.type],
    payload: rebuildPayload(input),
    editionId: input.editionId ?? null,
    unitId: input.unitId ?? null,
    conceptId: input.conceptId ?? null,
    guideSessionId: input.guideSessionId ?? null,
    blockKey: input.blockKey ?? null,
    schemaVersion: 1,
  };
}

describe("type ↔ kind vocabulary", () => {
  it("maps each of the seven V1 types to a distinct Prisma kind", () => {
    const kinds = Object.values(TYPE_TO_KIND);
    expect(kinds).toHaveLength(7);
    expect(new Set(kinds).size).toBe(7);
  });

  it("round-trips: KIND_TO_TYPE inverts TYPE_TO_KIND exactly", () => {
    for (const [type, kind] of Object.entries(TYPE_TO_KIND)) {
      expect(KIND_TO_TYPE[kind]).toBe(type);
    }
    expect(Object.keys(KIND_TO_TYPE)).toHaveLength(7);
  });

  it("the four non-V1 kinds have no V1 type", () => {
    for (const kind of [
      "BLOCK_DWELL",
      "HIGHLIGHT_CREATED",
      "ANNOTATION_CREATED",
      "RESONANCE_CONFIRMED",
    ]) {
      expect(KIND_TO_TYPE[kind]).toBeUndefined();
    }
  });
});

describe("rebuildPayload — field-by-field write whitelist", () => {
  it("copies only the declared fields, dropping smuggled extras", () => {
    const smuggled = {
      ...INPUTS.unit_opened,
      payload: {
        editionKey: "libro-1e",
        unitKey: "unit-1",
        diaryText: "me siento triste",
        meta: { anything: true },
      } as ValidatedLearningEvent<"unit_opened">["payload"],
    };
    expect(rebuildPayload(smuggled)).toEqual({
      editionKey: "libro-1e",
      unitKey: "unit-1",
    });
  });

  it("produces the exact declared shape for every V1 type", () => {
    for (const input of Object.values(INPUTS)) {
      const rebuilt = rebuildPayload(input);
      expect(rebuilt).toEqual(input.payload);
      // No prototype surprises, no extra keys:
      expect(Object.getPrototypeOf(rebuilt)).toBe(Object.prototype);
    }
  });
});

describe("readStoredPayload — exact parse", () => {
  it("accepts the writer's own output for every type", () => {
    for (const input of Object.values(INPUTS)) {
      expect(readStoredPayload(input.type, rebuildPayload(input))).toEqual(
        input.payload,
      );
    }
  });

  it("rejects non-objects, arrays and null", () => {
    expect(readStoredPayload("unit_opened", null)).toBeNull();
    expect(readStoredPayload("unit_opened", "editionKey")).toBeNull();
    expect(readStoredPayload("unit_opened", [{ editionKey: "e" }])).toBeNull();
  });

  it("rejects a payload with an EXTRA key (no free-form riders)", () => {
    expect(
      readStoredPayload("unit_opened", {
        editionKey: "e",
        unitKey: "u",
        note: "hola",
      }),
    ).toBeNull();
  });

  it("rejects a payload with a missing key or wrong primitive type", () => {
    expect(readStoredPayload("unit_opened", { editionKey: "e" })).toBeNull();
    expect(
      readStoredPayload("unit_completed", {
        editionKey: "e",
        unitKey: "u",
        revisionNumber: "3",
      }),
    ).toBeNull();
    expect(
      readStoredPayload("guide_session_completed", {
        guideSessionId: "gs-1",
        stepsCompleted: 2.5,
      }),
    ).toBeNull();
  });

  it("rejects out-of-enum recall members; accepts conceptKey null", () => {
    expect(
      readStoredPayload("active_recall_attempted", {
        unitKey: "u",
        itemKey: "i",
        result: "almost",
        evaluationSource: "server",
        conceptKey: null,
      }),
    ).toBeNull();
    expect(
      readStoredPayload("active_recall_attempted", {
        unitKey: "u",
        itemKey: "i",
        result: "correct",
        evaluationSource: "teacher",
        conceptKey: null,
      }),
    ).toBeNull();
    expect(
      readStoredPayload("active_recall_attempted", {
        unitKey: "u",
        itemKey: "i",
        result: "skipped",
        evaluationSource: "self_assessed",
        conceptKey: null,
      }),
    ).toEqual({
      unitKey: "u",
      itemKey: "i",
      result: "skipped",
      evaluationSource: "self_assessed",
      conceptKey: null,
    });
  });
});

describe("isSemanticallyEquivalent — drift per semantic component", () => {
  it("matches the writer's own row for every type", () => {
    for (const input of Object.values(INPUTS)) {
      expect(isSemanticallyEquivalent(rowFor(input), input)).toBe(true);
    }
  });

  it("is not fooled by JSON property order", () => {
    const row = rowFor(INPUTS.unit_completed);
    // Same fields, reversed insertion order:
    row.payload = {
      revisionNumber: 3,
      unitKey: "unit-1",
      editionKey: "libro-1e",
    };
    expect(isSemanticallyEquivalent(row, INPUTS.unit_completed)).toBe(true);
  });

  it("drifts on type", () => {
    const row = rowFor(INPUTS.unit_opened);
    row.kind = "UNIT_COMPLETED";
    expect(isSemanticallyEquivalent(row, INPUTS.unit_opened)).toBe(false);
  });

  it("drifts on each payload field", () => {
    const cases: Array<[LearningEventTypeV1, Record<string, unknown>]> = [
      ["unit_opened", { editionKey: "otra" }],
      ["unit_opened", { unitKey: "otra" }],
      ["unit_completed", { revisionNumber: 4 }],
      ["concept_explored", { conceptKey: "otro" }],
      ["guide_session_started", { guideSessionId: "gs-2" }],
      ["guide_session_completed", { stepsCompleted: 5 }],
      ["active_recall_attempted", { result: "incorrect" }],
      ["active_recall_attempted", { evaluationSource: "self_assessed" }],
      ["active_recall_attempted", { itemKey: "item-2" }],
      ["active_recall_attempted", { conceptKey: null }],
      ["practice_completed", { exerciseKey: "otra" }],
    ];
    for (const [type, patch] of cases) {
      const input = INPUTS[type];
      const row = rowFor(input);
      row.payload = { ...(row.payload as Record<string, unknown>), ...patch };
      expect(
        isSemanticallyEquivalent(row, input),
        `${type} ${JSON.stringify(patch)}`,
      ).toBe(false);
    }
  });

  it("drifts on each resolved reference, blockKey and schemaVersion", () => {
    const fields: Array<keyof StoredLearningEventSemantics> = [
      "editionId",
      "unitId",
      "conceptId",
      "guideSessionId",
      "blockKey",
    ];
    for (const field of fields) {
      const row = rowFor(INPUTS.unit_opened);
      row[field] = "drifted" as never;
      expect(isSemanticallyEquivalent(row, INPUTS.unit_opened), field).toBe(
        false,
      );
    }
    const row = rowFor(INPUTS.unit_opened);
    row.schemaVersion = 2;
    expect(isSemanticallyEquivalent(row, INPUTS.unit_opened)).toBe(false);
    const legacy = rowFor(INPUTS.unit_opened);
    legacy.schemaVersion = null;
    expect(isSemanticallyEquivalent(legacy, INPUTS.unit_opened)).toBe(false);
  });

  it("treats an absent input reference and a stored NULL as the same thing", () => {
    const input: ValidatedLearningEvent<"guide_session_started"> = {
      userId: "u-1",
      idempotencyKey: UUID,
      type: "guide_session_started",
      payload: { guideSessionId: "gs-1" },
      guideSessionId: "gs-1",
      // editionId/unitId/conceptId/blockKey deliberately absent
    };
    expect(isSemanticallyEquivalent(rowFor(input), input)).toBe(true);
  });

  it("a malformed stored payload is equivalent to nothing", () => {
    const row = rowFor(INPUTS.unit_opened);
    row.payload = { editionKey: "libro-1e" };
    expect(isSemanticallyEquivalent(row, INPUTS.unit_opened)).toBe(false);
  });
});

describe("LearningEventRepository — runtime guards (no DB)", () => {
  const neverDb: LearningEventDb = {
    learningEvent: new Proxy(
      {},
      {
        get() {
          throw new Error("the DB must not be touched by this test");
        },
      },
    ) as LearningEventDb["learningEvent"],
  };

  it("a non-V1 type smuggled past the compiler never reaches the INSERT", async () => {
    const repo = new LearningEventRepository(neverDb);
    const smuggled = {
      ...INPUTS.unit_opened,
      type: "highlight_created",
    } as unknown as ValidatedLearningEvent;
    await expect(repo.appendValidated(smuggled)).rejects.toBeInstanceOf(
      LearningEventStorageError,
    );
  });

  it("error classes carry stable codes and no input values", async () => {
    const repo = new LearningEventRepository(neverDb);
    const smuggled = {
      ...INPUTS.unit_opened,
      type: "block_dwell",
    } as unknown as ValidatedLearningEvent;
    const err = await repo.appendValidated(smuggled).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LearningEventStorageError);
    const message = (err as Error).message;
    expect(message).toBe("LEARNING_EVENT_STORAGE_FAILURE");
    expect(message).not.toContain(UUID);
    expect(message).not.toContain("u-1");
  });
});

// ─── Type-level assertions (enforced by tsc, not at runtime) ────────────────

describe("ValidatedLearningEvent — type-level contract", () => {
  it("compiles — the assertions below are enforced by the typechecker", () => {
    // Non-V1 kinds are unrepresentable:
    const bad1: ValidatedLearningEvent = {
      userId: "u",
      idempotencyKey: UUID,
      // @ts-expect-error — block_dwell is not a V1 type
      type: "block_dwell",
      payload: { editionKey: "e", unitKey: "u" },
    };
    void bad1;

    // type↔payload stay coupled:
    const bad2: ValidatedLearningEvent<"unit_opened"> = {
      userId: "u",
      idempotencyKey: UUID,
      type: "unit_opened",
      // @ts-expect-error — a practice payload cannot ride unit_opened
      payload: { exerciseKey: "e", unitKey: "u" },
    };
    void bad2;

    // The clock and the schema version are server-owned, not inputs:
    const bad3: ValidatedLearningEvent<"unit_opened"> = {
      userId: "u",
      idempotencyKey: UUID,
      type: "unit_opened",
      payload: { editionKey: "e", unitKey: "u" },
      // @ts-expect-error — createdAt is not an input
      createdAt: new Date(),
    };
    void bad3;
    const bad4: ValidatedLearningEvent<"unit_opened"> = {
      userId: "u",
      idempotencyKey: UUID,
      type: "unit_opened",
      payload: { editionKey: "e", unitKey: "u" },
      // @ts-expect-error — schemaVersion is stamped by the repository
      schemaVersion: 1,
    };
    void bad4;

    expect(true).toBe(true);
  });
});

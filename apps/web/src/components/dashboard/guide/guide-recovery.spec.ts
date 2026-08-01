import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  guideStorageKey,
  clearGuideRecovery,
  guideRecoveryState,
  newIdempotencyKey,
  parseGuideRecoveryRecord,
  parsePendingGuideCommand,
  readGuideRecovery,
  writeGuideRecovery,
  type GuideRecoveryRecord,
} from "./guide-recovery";
import { EEC_PIN, EEC_PRESENTATION } from "./guide-test-fixtures";

/**
 * GR-4 kept these EEC assertions verbatim. What changed is that every entry
 * point now names the PIN it operates on, so a record can no longer be read,
 * written or cleared without saying which guide it belongs to.
 */
const PIN = EEC_PIN;
const PRESENTATION = EEC_PRESENTATION;
const GUIDE_STORAGE_KEY = guideStorageKey(PIN) as string;

/**
 * CC-7.5 — the recovery record is the only thing this browser remembers, and
 * it is read back through a parser that treats storage as hostile input.
 * A corrupt or foreign record must never become a command.
 */

const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_KEY = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
const SESSION = "cmb0abc1234567890";
const SCOPE_A = "A".repeat(43);
const SCOPE_B = "B".repeat(43);

const validRecord: GuideRecoveryRecord = {
  schemaVersion: 1,
  actorScope: SCOPE_A,
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
  startIdempotencyKey: KEY,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("storage key", () => {
  it("is versioned and namespaced by guide", () => {
    expect(GUIDE_STORAGE_KEY).toBe(
      "psico.guide.eec-c1-cuerpo-antes-que-mente.v1",
    );
  });
});

describe("parseGuideRecoveryRecord", () => {
  it("accepts the exact shape and rebuilds it field by field", () => {
    const parsed = parseGuideRecoveryRecord(
      { ...validRecord },
      SCOPE_A,
      PIN,
      PRESENTATION,
    );
    expect(parsed).toEqual(validRecord);
  });

  it("rejects anything that is not a plain object", () => {
    for (const bad of [null, undefined, 7, "x", [], new Date()]) {
      expect(
        parseGuideRecoveryRecord(bad, SCOPE_A, PIN, PRESENTATION),
      ).toBeNull();
    }
  });

  it("rejects an extra key", () => {
    expect(
      parseGuideRecoveryRecord(
        { ...validRecord, userId: "someone" },
        SCOPE_A,
        PIN,
        PRESENTATION,
      ),
    ).toBeNull();
  });

  it("rejects a wrong schema version, guide or version", () => {
    expect(
      parseGuideRecoveryRecord(
        { ...validRecord, schemaVersion: 2 },
        SCOPE_A,
        PIN,
        PRESENTATION,
      ),
    ).toBeNull();
    expect(
      parseGuideRecoveryRecord(
        { ...validRecord, guideKey: "otra-guia" },
        SCOPE_A,
        PIN,
        PRESENTATION,
      ),
    ).toBeNull();
    expect(
      parseGuideRecoveryRecord(
        { ...validRecord, guideVersion: 2 },
        SCOPE_A,
        PIN,
        PRESENTATION,
      ),
    ).toBeNull();
  });

  it("rejects a malformed idempotency key", () => {
    for (const bad of ["", "not-a-uuid", 123, `${KEY}-extra`]) {
      expect(
        parseGuideRecoveryRecord(
          { ...validRecord, startIdempotencyKey: bad },
          SCOPE_A,
          PIN,
          PRESENTATION,
        ),
      ).toBeNull();
    }
  });

  it("rejects a session id with whitespace or control characters", () => {
    expect(
      parseGuideRecoveryRecord(
        { ...validRecord, sessionId: "with space" },
        SCOPE_A,
        PIN,
        PRESENTATION,
      ),
    ).toBeNull();
    expect(
      parseGuideRecoveryRecord(
        { ...validRecord, sessionId: "" },
        SCOPE_A,
        PIN,
        PRESENTATION,
      ),
    ).toBeNull();
    expect(
      parseGuideRecoveryRecord(
        { ...validRecord, sessionId: SESSION },
        SCOPE_A,
        PIN,
        PRESENTATION,
      ),
    ).toEqual({ ...validRecord, sessionId: SESSION });
  });

  it("rejects a record written by another account", () => {
    // The whole point: A's start key is ABSENT for B on the server, so
    // replaying it as B would start a guide B never asked for.
    expect(
      parseGuideRecoveryRecord(
        { ...validRecord, actorScope: SCOPE_B },
        SCOPE_A,
        PIN,
        PRESENTATION,
      ),
    ).toBeNull();
  });

  it("rejects a missing or malformed scope, and a legacy record", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropping the scope IS the case
    const { actorScope: _dropped, ...legacy } = validRecord;
    expect(
      parseGuideRecoveryRecord(legacy, SCOPE_A, PIN, PRESENTATION),
    ).toBeNull();
    for (const bad of [
      "",
      "too-short",
      "A".repeat(42),
      "A".repeat(44),
      "A/B",
    ]) {
      expect(
        parseGuideRecoveryRecord(
          { ...validRecord, actorScope: bad },
          SCOPE_A,
          PIN,
          PRESENTATION,
        ),
      ).toBeNull();
    }
    // A caller with no usable scope gets nothing either.
    expect(
      parseGuideRecoveryRecord({ ...validRecord }, "", PIN, PRESENTATION),
    ).toBeNull();
  });

  it("rejects any record carrying raw identity", () => {
    for (const field of [
      "userId",
      "email",
      "accessToken",
      "refreshToken",
      "jwt",
    ]) {
      expect(
        parseGuideRecoveryRecord(
          { ...validRecord, [field]: "whatever" },
          SCOPE_A,
          PIN,
          PRESENTATION,
        ),
        field,
      ).toBeNull();
    }
  });

  it("keeps the START key when the pending command is unreadable", () => {
    const parsed = parseGuideRecoveryRecord(
      {
        ...validRecord,
        pendingCommand: { commandType: "NOPE" },
      },
      SCOPE_A,
      PIN,
      PRESENTATION,
    );
    expect(parsed).toEqual(validRecord);
    expect(parsed?.pendingCommand).toBeUndefined();
  });
});

describe("parsePendingGuideCommand", () => {
  const base = { idempotencyKey: OTHER_KEY, sessionId: SESSION };

  it("round-trips each of the four command types", () => {
    expect(
      parsePendingGuideCommand(
        {
          ...base,
          commandType: "STEP_COMPLETE",
          stepKey: "explorar-cuerpo-antes-que-mente",
        },
        PRESENTATION,
      ),
    ).toEqual({
      ...base,
      commandType: "STEP_COMPLETE",
      stepKey: "explorar-cuerpo-antes-que-mente",
    });

    expect(
      parsePendingGuideCommand(
        {
          ...base,
          commandType: "STEP_RECALL",
          stepKey: "recordar-cuerpo-antes-que-mente",
          selectedOptionKey: "opcion-mente-primero",
        },
        PRESENTATION,
      ),
    ).toEqual({
      ...base,
      commandType: "STEP_RECALL",
      stepKey: "recordar-cuerpo-antes-que-mente",
      selectedOptionKey: "opcion-mente-primero",
    });

    expect(
      parsePendingGuideCommand(
        { ...base, commandType: "CANCEL" },
        PRESENTATION,
      ),
    ).toEqual({ ...base, commandType: "CANCEL" });
    expect(
      parsePendingGuideCommand(
        { ...base, commandType: "SESSION_COMPLETE" },
        PRESENTATION,
      ),
    ).toEqual({ ...base, commandType: "SESSION_COMPLETE" });
  });

  it("preserves the recall option EXACTLY — never a normalized guess", () => {
    const parsed = parsePendingGuideCommand(
      {
        ...base,
        commandType: "STEP_RECALL",
        stepKey: "recordar-cuerpo-antes-que-mente",
        selectedOptionKey: "opcion-simultanea",
      },
      PRESENTATION,
    );
    expect(parsed).not.toBeNull();
    if (!parsed || parsed.commandType !== "STEP_RECALL") throw new Error("x");
    expect(parsed.selectedOptionKey).toBe("opcion-simultanea");
  });

  it("never reconstructs a verdict field", () => {
    const parsed = parsePendingGuideCommand(
      {
        ...base,
        commandType: "STEP_RECALL",
        stepKey: "recordar-cuerpo-antes-que-mente",
        selectedOptionKey: "opcion-cuerpo-primero",
      },
      PRESENTATION,
    );
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("correctOptionKey");
    expect(serialized).not.toContain("result");
    expect(serialized).not.toContain("evaluationSource");
    expect(serialized).not.toContain("userId");
  });

  it("rejects an unknown command, step or option", () => {
    expect(
      parsePendingGuideCommand(
        { ...base, commandType: "STEP_SKIP" },
        PRESENTATION,
      ),
    ).toBeNull();
    expect(
      parsePendingGuideCommand(
        {
          ...base,
          commandType: "STEP_COMPLETE",
          stepKey: "paso-inventado",
        },
        PRESENTATION,
      ),
    ).toBeNull();
    expect(
      parsePendingGuideCommand(
        {
          ...base,
          commandType: "STEP_RECALL",
          stepKey: "recordar-cuerpo-antes-que-mente",
          selectedOptionKey: "opcion-inventada",
        },
        PRESENTATION,
      ),
    ).toBeNull();
  });

  it("rejects a command whose kind does not fit its step", () => {
    // The server completes the recall step ONLY through its own command, and
    // a confirm step only through STEP_COMPLETE. A stored pairing that could
    // never be accepted is not one we hold on to.
    expect(
      parsePendingGuideCommand(
        {
          ...base,
          commandType: "STEP_COMPLETE",
          stepKey: "recordar-cuerpo-antes-que-mente",
        },
        PRESENTATION,
      ),
    ).toBeNull();
    expect(
      parsePendingGuideCommand(
        {
          ...base,
          commandType: "STEP_RECALL",
          stepKey: "explorar-cuerpo-antes-que-mente",
          selectedOptionKey: "opcion-cuerpo-primero",
        },
        PRESENTATION,
      ),
    ).toBeNull();
    expect(
      parsePendingGuideCommand(
        {
          ...base,
          commandType: "STEP_RECALL",
          stepKey: "practicar-escucharte-por-dentro",
          selectedOptionKey: "opcion-cuerpo-primero",
        },
        PRESENTATION,
      ),
    ).toBeNull();
  });

  it("rejects an extra field even on a valid command", () => {
    expect(
      parsePendingGuideCommand(
        {
          ...base,
          commandType: "CANCEL",
          result: "correct",
        },
        PRESENTATION,
      ),
    ).toBeNull();
  });
});

describe("readGuideRecovery", () => {
  it("reports 'empty' when nothing is stored", () => {
    expect(readGuideRecovery(SCOPE_A, PIN, PRESENTATION)).toEqual({
      state: "empty",
    });
    expect(guideRecoveryState(SCOPE_A, PIN, PRESENTATION)).toBe("empty");
  });

  it("drops and clears a corrupt blob without throwing", () => {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, "{not json");
    expect(() => readGuideRecovery(SCOPE_A, PIN, PRESENTATION)).not.toThrow();
    expect(readGuideRecovery(SCOPE_A, PIN, PRESENTATION)).toEqual({
      state: "empty",
    });
    expect(window.localStorage.getItem(GUIDE_STORAGE_KEY)).toBeNull();
  });

  it("drops and clears a record with an extra key", () => {
    window.localStorage.setItem(
      GUIDE_STORAGE_KEY,
      JSON.stringify({ ...validRecord, userId: "someone" }),
    );
    expect(readGuideRecovery(SCOPE_A, PIN, PRESENTATION)).toEqual({
      state: "empty",
    });
    expect(window.localStorage.getItem(GUIDE_STORAGE_KEY)).toBeNull();
  });

  it("round-trips a written record", () => {
    expect(
      writeGuideRecovery({ ...validRecord, sessionId: SESSION }, PIN),
    ).toEqual({
      ok: true,
    });
    expect(readGuideRecovery(SCOPE_A, PIN, PRESENTATION)).toEqual({
      state: "valid",
      record: { ...validRecord, sessionId: SESSION },
    });
    expect(guideRecoveryState(SCOPE_A, PIN, PRESENTATION)).toBe("valid");
    clearGuideRecovery(PIN);
    expect(readGuideRecovery(SCOPE_A, PIN, PRESENTATION)).toEqual({
      state: "empty",
    });
  });

  it("reports 'unavailable' — NOT 'empty' — when reading throws", () => {
    // The distinction matters: a browser that cannot read cannot write
    // either, so treating this as "no session yet" would invite a START
    // whose key nobody could ever recover.
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(readGuideRecovery(SCOPE_A, PIN, PRESENTATION)).toEqual({
      state: "unavailable",
    });
    expect(guideRecoveryState(SCOPE_A, PIN, PRESENTATION)).toBe("unavailable");
    spy.mockRestore();
  });
});

describe("writeGuideRecovery", () => {
  it("reports the failure instead of swallowing it", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(writeGuideRecovery(validRecord, PIN)).toEqual({ ok: false });
    spy.mockRestore();
  });
});

describe("newIdempotencyKey", () => {
  it("returns a canonical UUID", () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("returns null instead of a weaker key when randomUUID is missing", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
    });
    expect(newIdempotencyKey()).toBeNull();
    Object.defineProperty(globalThis, "crypto", {
      value: original,
      configurable: true,
    });
  });
});

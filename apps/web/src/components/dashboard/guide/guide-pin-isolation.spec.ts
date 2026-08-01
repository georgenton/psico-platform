import { beforeEach, describe, expect, it } from "vitest";
import {
  clearGuideRecovery,
  guideStorageKey,
  parseGuideRecoveryRecord,
  parsePendingGuideCommand,
  readGuideRecovery,
  writeGuideRecovery,
  type GuideRecoveryRecord,
} from "./guide-recovery";
import {
  firstSceneOf,
  parseGuideSceneRecord,
  readGuideScene,
  resolveScene,
  sceneStorageKey,
  writeGuideScene,
  type GuideSceneRecord,
} from "./guide-scene";
import {
  EEC_PIN,
  EEC_PRESENTATION,
  PQP_PIN,
  PQP_PRESENTATION,
} from "./guide-test-fixtures";

/**
 * GR-4 — one reader, two guides, two separate memories.
 *
 * Before this, both guides would have shared a storage slot and a parser that
 * accepted either one's steps. The failure that would produce is not a cosmetic
 * one: replaying Emociones' START key while reading Parejas asks the server for
 * a session that genuinely belongs to this user, and it would come back — for
 * the wrong chapter, with the wrong progress, ready to accept a command.
 *
 * These tests pin the isolation from both directions, because a one-way check
 * would pass on a build that only guarded the guide that happened to be first.
 */

const SCOPE_A = "a".repeat(43);
const SCOPE_B = "b".repeat(43);
const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION = "ses_abc123";

function recoveryFor(pin: typeof EEC_PIN): GuideRecoveryRecord {
  return {
    schemaVersion: 1,
    actorScope: SCOPE_A,
    guideKey: pin.guideKey,
    guideVersion: pin.guideVersion,
    startIdempotencyKey: KEY,
  };
}

function sceneFor(
  pin: typeof EEC_PIN,
  currentStepKey: string | null,
): GuideSceneRecord {
  return {
    schemaVersion: 1,
    actorScope: SCOPE_A,
    guideKey: pin.guideKey,
    guideVersion: pin.guideVersion,
    sessionId: SESSION,
    currentStepKey,
    scene: "practice",
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

// ─── Recovery ────────────────────────────────────────────────────────────────

describe("recovery storage is isolated per pin", () => {
  it("gives each guide its own slot", () => {
    expect(guideStorageKey(EEC_PIN)).toBe(
      "psico.guide.eec-c1-cuerpo-antes-que-mente.v1",
    );
    expect(guideStorageKey(PQP_PIN)).toBe(
      "psico.guide.pqp-c1-contacto-sostenido.v1",
    );
    expect(guideStorageKey(EEC_PIN)).not.toBe(guideStorageKey(PQP_PIN));
    // A version bump is a different slot too: a v2 run must not resume a v1.
    expect(guideStorageKey({ ...EEC_PIN, guideVersion: 2 })).not.toBe(
      guideStorageKey(EEC_PIN),
    );
  });

  it("has no slot at all for a malformed pin", () => {
    expect(guideStorageKey({ guideKey: "", guideVersion: 1 })).toBeNull();
    expect(
      readGuideRecovery(
        SCOPE_A,
        { guideKey: "", guideVersion: 1 },
        EEC_PRESENTATION,
      ),
    ).toEqual({ state: "unavailable" });
  });

  it("rejects an Emociones record read under Parejas", () => {
    expect(
      parseGuideRecoveryRecord(
        recoveryFor(EEC_PIN),
        SCOPE_A,
        PQP_PIN,
        PQP_PRESENTATION,
      ),
    ).toBeNull();
  });

  it("rejects a Parejas record read under Emociones", () => {
    expect(
      parseGuideRecoveryRecord(
        recoveryFor(PQP_PIN),
        SCOPE_A,
        EEC_PIN,
        EEC_PRESENTATION,
      ),
    ).toBeNull();
  });

  it("still rejects another actor, whichever pin is asking", () => {
    for (const [pin, presentation] of [
      [EEC_PIN, EEC_PRESENTATION],
      [PQP_PIN, PQP_PRESENTATION],
    ] as const) {
      expect(
        parseGuideRecoveryRecord(recoveryFor(pin), SCOPE_B, pin, presentation),
      ).toBeNull();
    }
  });

  it("never writes one guide's record into another's slot", () => {
    expect(writeGuideRecovery(recoveryFor(EEC_PIN), PQP_PIN)).toEqual({
      ok: false,
    });
    expect(
      window.localStorage.getItem(guideStorageKey(PQP_PIN) as string),
    ).toBeNull();
  });

  it("CROSS_GUIDE_START_REPLAY=false — a stored EEC start is invisible to PQP", () => {
    expect(writeGuideRecovery(recoveryFor(EEC_PIN), EEC_PIN)).toEqual({
      ok: true,
    });
    expect(readGuideRecovery(SCOPE_A, PQP_PIN, PQP_PRESENTATION)).toEqual({
      state: "empty",
    });
    // …and reading under PQP did not disturb the EEC record.
    expect(readGuideRecovery(SCOPE_A, EEC_PIN, EEC_PRESENTATION).state).toBe(
      "valid",
    );
  });

  it("clears only its own pin", () => {
    writeGuideRecovery(recoveryFor(EEC_PIN), EEC_PIN);
    writeGuideRecovery(recoveryFor(PQP_PIN), PQP_PIN);
    clearGuideRecovery(PQP_PIN);
    expect(readGuideRecovery(SCOPE_A, EEC_PIN, EEC_PRESENTATION).state).toBe(
      "valid",
    );
    expect(readGuideRecovery(SCOPE_A, PQP_PIN, PQP_PRESENTATION).state).toBe(
      "empty",
    );
  });
});

describe("pending commands are parsed against the pinned presentation", () => {
  const eecComplete = {
    commandType: "STEP_COMPLETE",
    idempotencyKey: KEY,
    sessionId: SESSION,
    stepKey: "explorar-cuerpo-antes-que-mente",
  };
  const pqpComplete = {
    commandType: "STEP_COMPLETE",
    idempotencyKey: KEY,
    sessionId: SESSION,
    stepKey: "explorar-contacto-sostenido",
  };

  it("accepts each guide's own confirm command", () => {
    expect(parsePendingGuideCommand(eecComplete, EEC_PRESENTATION)).toEqual(
      eecComplete,
    );
    expect(parsePendingGuideCommand(pqpComplete, PQP_PRESENTATION)).toEqual(
      pqpComplete,
    );
  });

  it("CROSS_GUIDE_PENDING_COMMAND_REPLAY=false, both directions", () => {
    expect(parsePendingGuideCommand(eecComplete, PQP_PRESENTATION)).toBeNull();
    expect(parsePendingGuideCommand(pqpComplete, EEC_PRESENTATION)).toBeNull();
  });

  it("drops a command whose step this guide does not know", () => {
    expect(
      parsePendingGuideCommand(
        { ...eecComplete, stepKey: "paso-inventado" },
        EEC_PRESENTATION,
      ),
    ).toBeNull();
  });

  it("drops a recall command whose option belongs to the other guide", () => {
    expect(
      parsePendingGuideCommand(
        {
          commandType: "STEP_RECALL",
          idempotencyKey: KEY,
          sessionId: SESSION,
          stepKey: "recordar-contacto-sostenido",
          // An Emociones option under a Parejas step: the reader never saw it.
          selectedOptionKey: "opcion-cuerpo-primero",
        },
        PQP_PRESENTATION,
      ),
    ).toBeNull();
  });

  it("refuses a confirm command aimed at a recall step", () => {
    expect(
      parsePendingGuideCommand(
        { ...pqpComplete, stepKey: "recordar-contacto-sostenido" },
        PQP_PRESENTATION,
      ),
    ).toBeNull();
  });

  it("refuses a recall command aimed at a confirm step", () => {
    expect(
      parsePendingGuideCommand(
        {
          commandType: "STEP_RECALL",
          idempotencyKey: KEY,
          sessionId: SESSION,
          stepKey: "practicar-diez-minutos-de-contacto",
          selectedOptionKey: "pqp-opcion-manos-y-mirada",
        },
        PQP_PRESENTATION,
      ),
    ).toBeNull();
  });
});

// ─── Scenes ──────────────────────────────────────────────────────────────────

describe("scene storage is isolated per pin", () => {
  it("gives each guide its own slot", () => {
    expect(sceneStorageKey(EEC_PIN)).toBe(
      "psico.guide.scene.eec-c1-cuerpo-antes-que-mente.v1",
    );
    expect(sceneStorageKey(PQP_PIN)).toBe(
      "psico.guide.scene.pqp-c1-contacto-sostenido.v1",
    );
    expect(sceneStorageKey(EEC_PIN)).not.toBe(sceneStorageKey(PQP_PIN));
  });

  it("CROSS_GUIDE_SCENE_REJECTED=true, both directions", () => {
    expect(
      parseGuideSceneRecord(
        sceneFor(EEC_PIN, "practicar-escucharte-por-dentro"),
        SCOPE_A,
        PQP_PIN,
      ),
    ).toBeNull();
    expect(
      parseGuideSceneRecord(
        sceneFor(PQP_PIN, "practicar-diez-minutos-de-contacto"),
        SCOPE_A,
        EEC_PIN,
      ),
    ).toBeNull();
  });

  it("does not leak a written scene across pins", () => {
    writeGuideScene(
      sceneFor(EEC_PIN, "practicar-escucharte-por-dentro"),
      EEC_PIN,
    );
    expect(readGuideScene(SCOPE_A, PQP_PIN)).toBeNull();
    expect(readGuideScene(SCOPE_A, EEC_PIN)).not.toBeNull();
  });

  it("refuses to write a record into another pin's slot", () => {
    writeGuideScene(
      sceneFor(EEC_PIN, "explorar-cuerpo-antes-que-mente"),
      PQP_PIN,
    );
    expect(
      window.localStorage.getItem(sceneStorageKey(PQP_PIN) as string),
    ).toBeNull();
  });
});

describe("firstSceneOf reads the presentation, never the step key's prefix", () => {
  it("opens each Parejas checkpoint on its declared scene", () => {
    expect(firstSceneOf("explorar-contacto-sostenido", PQP_PRESENTATION)).toBe(
      "cover",
    );
    expect(
      firstSceneOf("practicar-diez-minutos-de-contacto", PQP_PRESENTATION),
    ).toBe("practice");
    expect(firstSceneOf("recordar-contacto-sostenido", PQP_PRESENTATION)).toBe(
      "recall",
    );
  });

  it("keeps the Emociones behaviour unchanged", () => {
    expect(
      firstSceneOf("explorar-cuerpo-antes-que-mente", EEC_PRESENTATION),
    ).toBe("cover");
    expect(
      firstSceneOf("practicar-escucharte-por-dentro", EEC_PRESENTATION),
    ).toBe("practice");
    expect(
      firstSceneOf("recordar-cuerpo-antes-que-mente", EEC_PRESENTATION),
    ).toBe("recall");
  });

  it("UNKNOWN_CURRENT_STEP_FAILS_CLOSED=true — null, never `cover`", () => {
    expect(firstSceneOf("paso-que-no-existe", PQP_PRESENTATION)).toBeNull();
    // A step from the OTHER guide is exactly this case.
    expect(
      firstSceneOf("practicar-escucharte-por-dentro", PQP_PRESENTATION),
    ).toBeNull();
    expect(
      resolveScene(
        { sessionId: SESSION, currentStepKey: "paso-que-no-existe" },
        null,
        PQP_PRESENTATION,
      ),
    ).toBeNull();
  });

  it("still reports `finish` when the server's cursor is null", () => {
    expect(firstSceneOf(null, PQP_PRESENTATION)).toBe("finish");
  });
});

describe("resolveScene discards a record from another checkpoint", () => {
  it("falls back to the CURRENT checkpoint's first scene", () => {
    const stored = sceneFor(PQP_PIN, "practicar-diez-minutos-de-contacto");
    expect(
      resolveScene(
        // The server has moved on to recall; the record still describes the
        // practice checkpoint, so it is stale rather than wrong.
        { sessionId: SESSION, currentStepKey: "recordar-contacto-sostenido" },
        stored,
        PQP_PRESENTATION,
      ),
    ).toBe("recall");
  });

  it("keeps a record that still describes this checkpoint", () => {
    const stored = sceneFor(PQP_PIN, "practicar-diez-minutos-de-contacto");
    expect(
      resolveScene(
        {
          sessionId: SESSION,
          currentStepKey: "practicar-diez-minutos-de-contacto",
        },
        stored,
        PQP_PRESENTATION,
      ),
    ).toBe("practice");
  });

  it("discards a record from another session", () => {
    const stored = sceneFor(PQP_PIN, "practicar-diez-minutos-de-contacto");
    expect(
      resolveScene(
        {
          sessionId: "ses_otra",
          currentStepKey: "practicar-diez-minutos-de-contacto",
        },
        stored,
        PQP_PRESENTATION,
      ),
    ).toBe("practice");
  });
});

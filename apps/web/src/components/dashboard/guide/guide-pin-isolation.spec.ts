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
  experienceSceneStorageKey,
  parseExperienceSceneRecord,
  readExperienceScene,
  sceneKeyFor,
  writeExperienceScene,
} from "../experience/experience-scene-store";
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

/**
 * GR-6 — the scene cursor moved to the experience pin, and so did this test.
 *
 * The property being protected is unchanged: one reader walking two journeys
 * must not have either one's cursor answer for the other. What changed is what
 * a cursor is pinned to. It used to be `guideKey@guideVersion`; it is now
 * `experienceKey@experienceVersion`, because the panel a person is looking at
 * belongs to the experience, not to the guide underneath it.
 */
describe("experience scene storage is isolated per pin", () => {
  const EEC_XP = {
    experienceKey: "eec-c1-cuerpo-antes-que-mente",
    experienceVersion: 1,
  };
  const PQP_XP = {
    experienceKey: "pqp-c1-contacto-sostenido",
    experienceVersion: 1,
  };

  const sceneRecord = (
    pin: { experienceKey: string; experienceVersion: number },
    sceneKey: string,
    actorScope = SCOPE_A,
  ) => ({
    schemaVersion: 1 as const,
    actorScope,
    experienceKey: pin.experienceKey,
    experienceVersion: pin.experienceVersion,
    sessionId: SESSION,
    currentStepKey: "practicar-escucharte-por-dentro",
    sceneKey,
  });

  it("gives each experience its own slot", () => {
    expect(experienceSceneStorageKey(EEC_XP)).toBe(
      "psico.experience.scene.eec-c1-cuerpo-antes-que-mente.v1",
    );
    expect(experienceSceneStorageKey(PQP_XP)).not.toBe(
      experienceSceneStorageKey(EEC_XP),
    );
  });

  it("CROSS_EXPERIENCE_SCENE_REJECTED=true, both directions", () => {
    expect(
      parseExperienceSceneRecord(
        sceneRecord(EEC_XP, "practica"),
        SCOPE_A,
        PQP_XP,
      ),
    ).toBeNull();
    expect(
      parseExperienceSceneRecord(
        sceneRecord(PQP_XP, "practica"),
        SCOPE_A,
        EEC_XP,
      ),
    ).toBeNull();
  });

  it("rejects a record written by another actor", () => {
    expect(
      parseExperienceSceneRecord(
        sceneRecord(EEC_XP, "practica", SCOPE_B),
        SCOPE_A,
        EEC_XP,
      ),
    ).toBeNull();
  });

  it("does not leak a written scene across pins", () => {
    writeExperienceScene(sceneRecord(EEC_XP, "practica"), EEC_XP);
    expect(readExperienceScene(SCOPE_A, PQP_XP)).toBeNull();
    expect(readExperienceScene(SCOPE_A, EEC_XP)).not.toBeNull();
  });

  it("refuses to write a record into another pin's slot", () => {
    writeExperienceScene(sceneRecord(EEC_XP, "practica"), PQP_XP);
    expect(
      window.localStorage.getItem(experienceSceneStorageKey(PQP_XP) as string),
    ).toBeNull();
  });

  it("a cursor from another session or checkpoint is not this moment", () => {
    const stored = sceneRecord(EEC_XP, "practica");
    expect(
      sceneKeyFor(
        {
          sessionId: SESSION,
          currentStepKey: "practicar-escucharte-por-dentro",
        },
        stored,
      ),
    ).toBe("practica");
    expect(
      sceneKeyFor(
        {
          sessionId: "ses_otra",
          currentStepKey: "practicar-escucharte-por-dentro",
        },
        stored,
      ),
    ).toBeNull();
    expect(
      sceneKeyFor(
        {
          sessionId: SESSION,
          currentStepKey: "recordar-cuerpo-antes-que-mente",
        },
        stored,
      ),
    ).toBeNull();
  });
});

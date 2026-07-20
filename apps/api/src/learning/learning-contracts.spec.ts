import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  LearningEventPayloadByType,
  LearningEventRecord,
  LearningEventTypeV1,
  OpenUnitRequestBody,
  SubmitRecallAttemptRequestBody,
  UnitOpenedPayload,
} from "@psico/types";
import {
  parseOpenUnitCommand,
  type LearningCommandError,
} from "./learning-command-parser";

/**
 * CC-7.1 — public-contract ratchet. Mirrors the repo's file-content guard
 * pattern (cf. no-emotional-map.spec.ts): the CONTRACT SOURCES themselves are
 * checked so a future edit cannot quietly reopen a hole the design closed.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const TYPES_SRC = readFileSync(
  join(REPO_ROOT, "packages", "types", "src", "learning-events.ts"),
  "utf8",
);
const PARSER_SRC = readFileSync(
  join(__dirname, "learning-command-parser.ts"),
  "utf8",
);

describe("learning-events contract source (packages/types)", () => {
  it("has no generic learning-event request (clients send domain commands)", () => {
    expect(TYPES_SRC).not.toContain("CreateLearningEventRequest");
  });

  it("has no free-form escape hatches", () => {
    expect(TYPES_SRC).not.toMatch(/Record<string,\s*unknown>/);
    expect(TYPES_SRC).not.toMatch(/[:<(]\s*any\b/);
    expect(TYPES_SRC).not.toMatch(/Prisma\.JsonValue/);
    expect(TYPES_SRC).not.toMatch(/\bmetadata\b/);
    expect(TYPES_SRC).not.toMatch(/\bmeta\s*[?:]/);
  });

  it("never exposes userId (the actor is the JWT, not the wire)", () => {
    expect(TYPES_SRC).not.toMatch(/\buserId\b/);
  });

  it("idempotencyKey is never optional in any contract", () => {
    expect(TYPES_SRC).not.toMatch(/idempotencyKey\?/);
    // …and it exists (guards against renaming it away).
    expect(TYPES_SRC).toMatch(/idempotencyKey: string/);
  });

  it("guide_session_* payloads are server-only: no request body carries them", () => {
    // The two guide event types exist in the vocabulary…
    expect(TYPES_SRC).toContain('"guide_session_started"');
    expect(TYPES_SRC).toContain('"guide_session_completed"');
    // …but no public request body DECLARES a server-owned field (field-shaped
    // matches only — the doc comments naming the prohibition are allowed).
    const requestSection = TYPES_SRC.slice(
      TYPES_SRC.indexOf("Request bodies"),
      TYPES_SRC.indexOf("Domain commands"),
    );
    expect(requestSection).not.toMatch(/^\s*stepsCompleted\??:/m);
    expect(requestSection).not.toMatch(/^\s*result\??:/m);
    expect(requestSection).not.toMatch(/^\s*evaluationSource\??:/m);
  });
});

describe("learning-command-parser source (apps/api)", () => {
  it("imports nothing but @psico/types (no Nest, no Prisma, no services)", () => {
    expect(PARSER_SRC).not.toMatch(/@nestjs/);
    expect(PARSER_SRC).not.toMatch(/@prisma|PrismaClient|prisma\./);
    expect(PARSER_SRC).not.toMatch(/ContentAccessService/);
    expect(PARSER_SRC).not.toMatch(/emotional-map|EmotionalMap/i);
    expect(PARSER_SRC).not.toMatch(/Guide(Service|Module)/);
    const imports = PARSER_SRC.match(/from "([^"]+)"/g) ?? [];
    expect(imports).toEqual(['from "@psico/types"']);
  });

  it("performs no IO, no clocks, no ID generation, no logging", () => {
    expect(PARSER_SRC).not.toMatch(/Date\.now|new Date\(/);
    expect(PARSER_SRC).not.toMatch(/Math\.random|randomUUID|crypto/);
    expect(PARSER_SRC).not.toMatch(/console\.|logger/i);
    expect(PARSER_SRC).not.toMatch(/fetch\(|readFile|process\.env/);
  });
});

// ─── Type-level assertions (checked by tsc, not at runtime) ─────────────────

describe("type-level contract", () => {
  it("compiles — the assertions below are enforced by the typechecker", () => {
    // idempotencyKey is mandatory:
    // @ts-expect-error — a body without idempotencyKey must not typecheck
    const missingKey: OpenUnitRequestBody = {};
    void missingKey;

    // The recall union is exclusive — both variants at once must not typecheck:
    // @ts-expect-error — selectedOptionKey and selfResult cannot coexist
    const bothVariants: SubmitRecallAttemptRequestBody = {
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      itemKey: "item-1",
      selectedOptionKey: "a",
      selfResult: "correct",
    };
    void bothVariants;

    // The public record never exposes the actor:
    const record = {} as LearningEventRecord;
    // @ts-expect-error — userId does not exist on LearningEventRecord
    void record.userId;

    expect(true).toBe(true);
  });

  it("type↔payload coupling: matches compile, mismatches do not", () => {
    const base = {
      id: "le-1",
      schemaVersion: 1 as const,
      occurredAt: "2026-07-19T00:00:00.000Z",
      editionId: null,
      unitId: null,
      conceptId: null,
      guideSessionId: null,
    };
    const openPayload: UnitOpenedPayload = { editionKey: "e", unitKey: "u" };

    // unit_opened + UnitOpenedPayload compiles:
    const okRecord: LearningEventRecord<"unit_opened"> = {
      ...base,
      type: "unit_opened",
      payload: openPayload,
    };
    void okRecord;

    // unit_opened + PracticeCompletedPayload does NOT compile:
    const badRecord: LearningEventRecord<"unit_opened"> = {
      ...base,
      type: "unit_opened",
      // @ts-expect-error — a practice payload cannot ride a unit_opened record
      payload: { exerciseKey: "e", unitKey: "u" },
    };
    void badRecord;

    expect(true).toBe(true);
  });

  it("narrowing on record.type exposes the exact payload", () => {
    const record = {
      id: "le-2",
      schemaVersion: 1,
      occurredAt: "2026-07-19T00:00:00.000Z",
      editionId: null,
      unitId: null,
      conceptId: null,
      guideSessionId: null,
      type: "unit_completed",
      payload: { editionKey: "e", unitKey: "u", revisionNumber: 3 },
    } as LearningEventRecord;

    if (record.type === "unit_completed") {
      // Narrowed: revisionNumber is available without casts.
      expect(record.payload.revisionNumber).toBe(3);
    } else {
      throw new Error("expected a unit_completed record");
    }
  });

  it("the payload map covers exactly the seven V1 types", () => {
    // Both directions enforced by tsc: keyof map ≡ LearningEventTypeV1.
    type MapCoversTypes =
      LearningEventTypeV1 extends keyof LearningEventPayloadByType
        ? true
        : never;
    type TypesCoverMap =
      keyof LearningEventPayloadByType extends LearningEventTypeV1
        ? true
        : never;
    const covers: MapCoversTypes = true;
    const exact: TypesCoverMap = true;
    expect(covers && exact).toBe(true);
  });

  it("error field and detail are closed literal unions", () => {
    const err: LearningCommandError = {
      code: "LEARNING_EVENT_INVALID_PAYLOAD",
      // @ts-expect-error — arbitrary field names are not assignable
      field: "diaryText",
    };
    void err;
    const err2: LearningCommandError = {
      code: "LEARNING_EVENT_INVALID_PAYLOAD",
      // @ts-expect-error — arbitrary detail strings are not assignable
      detail: "user wrote: me siento triste",
    };
    void err2;
    expect(true).toBe(true);
  });
});

describe("idempotency canonicalisation (runtime)", () => {
  it("commands always carry the lowercase canonical UUID", () => {
    const upper = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    const r = parseOpenUnitCommand({ unitKey: "u" }, { idempotencyKey: upper });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command.idempotencyKey).toBe(upper.toLowerCase());
    }
  });
});

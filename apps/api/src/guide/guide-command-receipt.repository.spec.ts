import { describe, expect, it } from "vitest";
import {
  GuideCommandInvalidInputError,
  GuideCommandReceiptRepository,
} from "./guide-command-receipt.repository";
import type {
  GuideCommandReceiptWrite,
  ValidatedGuideCommandSemantics,
} from "./guide-command-semantics";

/**
 * CC-7.4B — PRE-DB validation unit suite (PR #590 closure §3): malicious
 * casts around the closed unions are rejected BEFORE any storage round-trip.
 * The delegate THROWS on any touch, so a passing test proves the database
 * was never reached.
 */

const explodingDb = {
  guideCommandReceipt: {
    createMany: () => {
      throw new Error("DB was touched with invalid semantics");
    },
    findUnique: () => {
      throw new Error("DB was touched with invalid semantics");
    },
  },
} as never;

const repo = new GuideCommandReceiptRepository(explodingDb);
const KEY = "cccccccc-cccc-4ccc-8ccc-000000000201";

const write = (semantics: ValidatedGuideCommandSemantics) =>
  ({ semantics }) as GuideCommandReceiptWrite;

describe("GuideCommandReceiptRepository · fail-closed PRE-DB validation", () => {
  it("rejects a kind/target MISMATCH smuggled past the types", async () => {
    const smuggled = {
      commandType: "STEP_COMPLETE",
      userId: "u-1",
      idempotencyKey: KEY,
      sessionId: "sess-1",
      stepKey: "explora",
      kind: "CONCEPT_EXPLORATION",
      // Malicious cast: the WRONG target for the kind.
      exerciseKey: "respiracion-1",
    } as unknown as ValidatedGuideCommandSemantics;
    await expect(repo.appendValidated(write(smuggled))).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
    await expect(repo.inspectValidated(smuggled)).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
  });

  it("rejects an EXTRA target on top of the correct one", async () => {
    const extra = {
      commandType: "STEP_COMPLETE",
      userId: "u-1",
      idempotencyKey: KEY,
      sessionId: "sess-1",
      stepKey: "explora",
      kind: "CONCEPT_EXPLORATION",
      conceptKey: "familia-ensamblada",
      confirmationKey: "contrabando",
    } as unknown as ValidatedGuideCommandSemantics;
    await expect(repo.appendValidated(write(extra))).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
  });

  it("rejects a MISSING target", async () => {
    const missing = {
      commandType: "STEP_COMPLETE",
      userId: "u-1",
      idempotencyKey: KEY,
      sessionId: "sess-1",
      stepKey: "explora",
      kind: "CATALOG_PRACTICE",
    } as unknown as ValidatedGuideCommandSemantics;
    await expect(repo.appendValidated(write(missing))).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
  });

  it("rejects catalog keys outside the closed grammar (uppercase, whitespace, empty, controls)", async () => {
    for (const conceptKey of ["", " ", "Mayus", "con espacio", "tab\there"]) {
      const bad = {
        commandType: "STEP_COMPLETE",
        userId: "u-1",
        idempotencyKey: KEY,
        sessionId: "sess-1",
        stepKey: "explora",
        kind: "CONCEPT_EXPLORATION",
        conceptKey,
      } as unknown as ValidatedGuideCommandSemantics;
      await expect(
        repo.appendValidated(write(bad)),
        JSON.stringify(conceptKey),
      ).rejects.toThrow(GuideCommandInvalidInputError);
    }
  });

  it("rejects a START smuggling a sessionId into its semantics (exact-keys check)", async () => {
    const smuggled = {
      commandType: "START",
      userId: "u-1",
      idempotencyKey: KEY,
      guideKey: "guia-prueba",
      guideVersion: 1,
      editionId: null,
      unitId: null,
      // Malicious cast: START semantics carry NO sessionId.
      sessionId: "sess-forjada",
    } as unknown as ValidatedGuideCommandSemantics;
    await expect(repo.inspectValidated(smuggled)).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
  });

  it("rejects a PARTIAL editorial anchor and a non-positive version on START", async () => {
    const partial = {
      commandType: "START",
      userId: "u-1",
      idempotencyKey: KEY,
      guideKey: "guia-prueba",
      guideVersion: 1,
      editionId: "ed-1",
      unitId: null,
    } as unknown as ValidatedGuideCommandSemantics;
    await expect(repo.inspectValidated(partial)).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
    const badVersion = {
      commandType: "START",
      userId: "u-1",
      idempotencyKey: KEY,
      guideKey: "guia-prueba",
      guideVersion: 0,
      editionId: null,
      unitId: null,
    } as unknown as ValidatedGuideCommandSemantics;
    await expect(repo.inspectValidated(badVersion)).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
  });

  it("rejects unknown command types and invalid idempotency keys pre-DB", async () => {
    const unknownType = {
      commandType: "STEP_SKIP",
      userId: "u-1",
      idempotencyKey: KEY,
      sessionId: "sess-1",
    } as unknown as ValidatedGuideCommandSemantics;
    await expect(repo.inspectValidated(unknownType)).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
    const badKey = {
      commandType: "CANCEL",
      userId: "u-1",
      idempotencyKey: "not-a-uuid",
      sessionId: "sess-1",
    } as unknown as ValidatedGuideCommandSemantics;
    await expect(repo.appendValidated(write(badKey))).rejects.toThrow(
      GuideCommandInvalidInputError,
    );
  });
});

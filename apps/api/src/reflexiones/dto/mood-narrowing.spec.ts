import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DIARY_MOODS } from "@psico/types";
import { CreateDiaryEntryDto } from "./create-entry.dto";
import { UpdateDiaryEntryDto } from "./update-entry.dto";
import { ListDiaryEntriesQueryDto } from "./list-entries-query.dto";

/**
 * Verifies that the DTO validators reject mood values that are not in the
 * shared DIARY_MOODS catalog. If someone adds a mood to the catalog without
 * updating the DTO (or vice versa), these tests catch it.
 *
 * Pairs with `apps/api/src/onboarding/moods-alignment.spec.ts` which enforces
 * the seed ↔ DIARY_MOODS alignment. Together they form a closed loop:
 *
 *   client picks mood → DTO validates against DIARY_MOODS →
 *   service writes to DB → seed/catalog matches DIARY_MOODS.
 */
describe("Diary DTO mood narrowing", () => {
  const validMood = DIARY_MOODS[0].id;
  const VALID_CIPHER =
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMA";
  const VALID_NONCE = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYX";

  describe("CreateDiaryEntryDto", () => {
    function makeBody(mood: string) {
      return plainToInstance(CreateDiaryEntryDto, {
        mood,
        textCiphertext: VALID_CIPHER,
        textNonce: VALID_NONCE,
      });
    }

    it("accepts every mood in the shared catalog", async () => {
      for (const m of DIARY_MOODS) {
        const errors = await validate(makeBody(m.id));
        expect(
          errors,
          `mood '${m.id}' should be accepted but errored: ${JSON.stringify(errors)}`,
        ).toHaveLength(0);
      }
    });

    it("rejects an unknown mood", async () => {
      const errors = await validate(makeBody("unknown-mood-xyz"));
      const moodError = errors.find((e) => e.property === "mood");
      expect(moodError).toBeDefined();
      expect(moodError?.constraints).toHaveProperty("isIn");
    });

    it("rejects empty string mood", async () => {
      const errors = await validate(makeBody(""));
      expect(errors.find((e) => e.property === "mood")).toBeDefined();
    });
  });

  describe("UpdateDiaryEntryDto", () => {
    it("accepts an optional valid mood", async () => {
      const dto = plainToInstance(UpdateDiaryEntryDto, { mood: validMood });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("accepts undefined mood (optional)", async () => {
      const dto = plainToInstance(UpdateDiaryEntryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("rejects an unknown mood when present", async () => {
      const dto = plainToInstance(UpdateDiaryEntryDto, {
        mood: "made-up-mood",
      });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === "mood")).toBeDefined();
    });
  });

  describe("ListDiaryEntriesQueryDto", () => {
    it("accepts a valid mood filter", async () => {
      const dto = plainToInstance(ListDiaryEntriesQueryDto, {
        mood: validMood,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("accepts an empty query (no filters)", async () => {
      const dto = plainToInstance(ListDiaryEntriesQueryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("rejects an unknown mood filter", async () => {
      const dto = plainToInstance(ListDiaryEntriesQueryDto, {
        mood: "fake-mood",
      });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === "mood")).toBeDefined();
    });
  });
});

import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { WELLNESS_MOOD_IDS } from "@psico/types";
import { UpdateMoodDto } from "./update-mood.dto";

/**
 * Verifies that `PATCH /api/user/mood` rejects anything outside the shared
 * WELLNESS_MOOD_IDS catalog. Pairs with `diario/dto/mood-narrowing.spec.ts`
 * and `terapia/dto/checkin-mood-narrowing.spec.ts` — same enforcement
 * pattern across the 3 distinct mood vocabularies.
 */
describe("UpdateMoodDto wellness narrowing", () => {
  it("accepts every mood in the WELLNESS_MOOD_IDS catalog", async () => {
    for (const id of WELLNESS_MOOD_IDS) {
      const dto = plainToInstance(UpdateMoodDto, { mood: id });
      const errors = await validate(dto);
      expect(
        errors,
        `mood '${id}' should be accepted but errored: ${JSON.stringify(errors)}`,
      ).toHaveLength(0);
    }
  });

  it("rejects an unknown mood", async () => {
    const dto = plainToInstance(UpdateMoodDto, { mood: "made-up" });
    const errors = await validate(dto);
    const moodError = errors.find((e) => e.property === "mood");
    expect(moodError).toBeDefined();
    expect(moodError?.constraints).toHaveProperty("isIn");
  });

  it("rejects a Diary-vocabulary mood (calma not a wellness mood)", async () => {
    const dto = plainToInstance(UpdateMoodDto, { mood: "calma" });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === "mood")).toBeDefined();
  });

  it("rejects a Therapy-vocabulary mood (calmo not a wellness mood)", async () => {
    const dto = plainToInstance(UpdateMoodDto, { mood: "calmo" });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === "mood")).toBeDefined();
  });

  it("rejects empty string", async () => {
    const dto = plainToInstance(UpdateMoodDto, { mood: "" });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === "mood")).toBeDefined();
  });

  it("rejects missing mood (required)", async () => {
    const dto = plainToInstance(UpdateMoodDto, {});
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === "mood")).toBeDefined();
  });
});

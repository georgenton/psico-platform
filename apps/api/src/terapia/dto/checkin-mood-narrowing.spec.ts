import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { THERAPY_MOODS } from "@psico/types";
import { UpdateSessionPrepDto } from "./update-prep.dto";

/**
 * Mirrors apps/api/src/diario/dto/mood-narrowing.spec.ts for the Terapia
 * checkInMood field. The therapy mood catalog is independent (5 entries vs
 * 7 in Diario), but the validation pattern is identical:
 *
 *   client picks therapy mood → DTO validates against THERAPY_MOODS →
 *   service writes to SessionPrep.checkInMood.
 *
 * Adding a mood here requires updating `THERAPY_MOODS` in `@psico/types`.
 */
describe("UpdateSessionPrepDto checkInMood narrowing", () => {
  it("accepts every mood in the THERAPY_MOODS catalog", async () => {
    for (const m of THERAPY_MOODS) {
      const dto = plainToInstance(UpdateSessionPrepDto, { checkInMood: m.id });
      const errors = await validate(dto);
      expect(
        errors,
        `mood '${m.id}' should be accepted but errored: ${JSON.stringify(errors)}`,
      ).toHaveLength(0);
    }
  });

  it("accepts undefined checkInMood (optional)", async () => {
    const dto = plainToInstance(UpdateSessionPrepDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects an unknown therapy mood", async () => {
    const dto = plainToInstance(UpdateSessionPrepDto, {
      checkInMood: "made-up",
    });
    const errors = await validate(dto);
    const moodError = errors.find((e) => e.property === "checkInMood");
    expect(moodError).toBeDefined();
    expect(moodError?.constraints).toHaveProperty("isIn");
  });

  it("rejects a Diary-vocabulary mood (calma not a therapy mood)", async () => {
    const dto = plainToInstance(UpdateSessionPrepDto, { checkInMood: "calma" });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === "checkInMood")).toBeDefined();
  });

  it("rejects empty string", async () => {
    const dto = plainToInstance(UpdateSessionPrepDto, { checkInMood: "" });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === "checkInMood")).toBeDefined();
  });
});

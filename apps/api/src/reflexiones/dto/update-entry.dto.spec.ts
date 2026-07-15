import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { UpdateDiaryEntryDto } from "./update-entry.dto";

/**
 * PR-2A · the PATCH mood contract. `@ValidateIf(value !== undefined)` (not
 * `@IsOptional`) so a MISSING mood is fine (leaves it untouched) but an
 * EXPLICIT null is rejected — otherwise a `mood = null` row could be written,
 * which the read path then 500s on. The nullable transition lands in PR-2B.
 */

async function moodErrors(body: Record<string, unknown>): Promise<boolean> {
  const dto = plainToInstance(UpdateDiaryEntryDto, body);
  const errors = await validate(dto);
  return errors.some((e) => e.property === "mood");
}

describe("UpdateDiaryEntryDto · mood", () => {
  it("allows the property to be omitted (mood untouched)", async () => {
    expect(await moodErrors({ tags: ["trabajo"] })).toBe(false);
  });

  it("allows a canonical mood", async () => {
    expect(await moodErrors({ mood: "good" })).toBe(false);
  });

  it("REJECTS an explicit null (until PR-2B)", async () => {
    expect(await moodErrors({ mood: null })).toBe(true);
  });

  it("rejects empty / legacy / unknown tokens", async () => {
    for (const bad of ["", "calma", "energia", "zzz"]) {
      expect(await moodErrors({ mood: bad })).toBe(true);
    }
  });
});

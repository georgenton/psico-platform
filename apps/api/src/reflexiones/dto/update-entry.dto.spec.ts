import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { UpdateDiaryEntryDto } from "./update-entry.dto";

/**
 * PR-2B · the PATCH mood contract is three-way. `@ValidateIf(value !==
 * undefined && value !== null)` so both a MISSING mood (leaves it untouched)
 * AND an EXPLICIT null (clears it) are valid, while a present value must still
 * be canonical. The service distinguishes absent vs null via `hasOwnProperty`.
 */

async function moodErrors(body: Record<string, unknown>): Promise<boolean> {
  const dto = plainToInstance(UpdateDiaryEntryDto, body);
  const errors = await validate(dto);
  return errors.some((e) => e.property === "mood");
}

async function versionErrors(body: Record<string, unknown>): Promise<boolean> {
  const dto = plainToInstance(UpdateDiaryEntryDto, body);
  const errors = await validate(dto);
  return errors.some((e) => e.property === "moodSelectionVersion");
}

describe("UpdateDiaryEntryDto · mood", () => {
  it("allows the property to be omitted (mood untouched)", async () => {
    expect(await moodErrors({ tags: ["trabajo"] })).toBe(false);
  });

  it("allows a canonical mood", async () => {
    expect(await moodErrors({ mood: "good" })).toBe(false);
  });

  it("PR-2B: ALLOWS an explicit null (clears the mood)", async () => {
    expect(await moodErrors({ mood: null })).toBe(false);
  });

  it("rejects empty / legacy / unknown tokens", async () => {
    for (const bad of ["", "calma", "energia", "zzz"]) {
      expect(await moodErrors({ mood: bad })).toBe(true);
    }
  });
});

describe("UpdateDiaryEntryDto · moodSelectionVersion", () => {
  it("allows the client attestation 'explicit-v1'", async () => {
    expect(
      await versionErrors({
        mood: "good",
        moodSelectionVersion: "explicit-v1",
      }),
    ).toBe(false);
  });

  it("rejects server-owned attestations from a client (mood-log-v1 / seed-v1)", async () => {
    expect(
      await versionErrors({
        mood: "good",
        moodSelectionVersion: "mood-log-v1",
      }),
    ).toBe(true);
    expect(
      await versionErrors({ mood: "good", moodSelectionVersion: "seed-v1" }),
    ).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_COOLDOWN_DAYS,
  ACCOUNT_DELETION_COOLDOWN_MS,
  accountDeletionCutoff,
  accountDeletionDueAt,
} from "./account-deletion-window";

describe("the account deletion window", () => {
  it("is thirty days", () => {
    // A literal, deliberately. Every other test reads the constant, so a change
    // to the number has to be typed twice to go through — once here.
    expect(ACCOUNT_DELETION_COOLDOWN_DAYS).toBe(30);
    expect(ACCOUNT_DELETION_COOLDOWN_MS).toBe(2_592_000_000);
  });

  it("is due thirty days after it was asked for, not on the day it was asked for", () => {
    const requestedAt = new Date("2026-11-24T14:05:00.000Z");
    expect(accountDeletionDueAt(requestedAt).toISOString()).toBe(
      "2026-12-24T14:05:00.000Z",
    );
  });

  it("gives every instant to exactly one of the two: cancellable, or the worker's", () => {
    const requestedAt = new Date("2026-11-24T14:05:00.000Z");
    const due = accountDeletionDueAt(requestedAt).getTime();

    for (const offset of [-86_400_000, -1, 0, 1, 86_400_000]) {
      const now = new Date(due + offset);
      const cancellable = requestedAt > accountDeletionCutoff(now);
      // The processor's own condition, spelled the way it spells it.
      const workerRefuses =
        now.getTime() - requestedAt.getTime() < ACCOUNT_DELETION_COOLDOWN_MS;
      expect(cancellable, `offset ${offset}`).toBe(workerRefuses);
      expect(cancellable, `offset ${offset}`).toBe(offset < 0);
    }
  });

  it("is declared once: none of its readers keeps a copy of the number", () => {
    const src = join(__dirname, "..");
    for (const reader of [
      "users/users.service.ts",
      "jobs/jobs.service.ts",
      "jobs/processors/account-deletion.processor.ts",
    ]) {
      const text = readFileSync(join(src, reader), "utf8");
      expect(text, reader).toMatch(
        /from "[./]+(users\/)?account-deletion-window"/,
      );
      expect(text, reader).not.toMatch(
        /DELETE_COOLDOWN|COOLDOWN_MS = 30|30 \* DAYS/,
      );
    }
  });
});

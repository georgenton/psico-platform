import { describe, expect, it, vi } from "vitest";
// The hygiene logic lives in a runnable ops script; we import the extracted,
// side-effect-free helper (the CLI bootstrap is guarded behind isMain).
import { runWeeklySummaryHygiene } from "../../scripts/pr2b-weekly-summary-hygiene.mjs";

describe("pr2b-weekly-summary-hygiene", () => {
  it("dry-run: counts only, writes nothing, prints just weekly_summaries_found", async () => {
    const deleteMany = vi.fn();
    const prisma = {
      weeklySummary: {
        count: vi.fn().mockResolvedValue(7),
        deleteMany,
      },
    };
    const lines: string[] = [];

    const res = await runWeeklySummaryHygiene({
      prisma,
      apply: false,
      log: (m: string) => lines.push(m),
    });

    expect(res).toEqual({ found: 7 });
    // Never mutates in dry-run.
    expect(deleteMany).not.toHaveBeenCalled();
    // Exactly one aggregate line — no ids/emails/headline/narrative.
    expect(lines).toEqual(["weekly_summaries_found=7"]);
  });

  it("apply: deletes the table and reports only the deleted count; idempotent on a second run", async () => {
    // Stateful mock: the table starts with 7 rows, then is empty.
    let remaining = 7;
    const prisma = {
      weeklySummary: {
        count: vi.fn().mockImplementation(async () => remaining),
        deleteMany: vi.fn().mockImplementation(async () => {
          const count = remaining;
          remaining = 0;
          return { count };
        }),
      },
    };
    const lines: string[] = [];
    const log = (m: string) => lines.push(m);

    // First apply — wipes 7.
    const first = await runWeeklySummaryHygiene({ prisma, apply: true, log });
    expect(first).toEqual({ deleted: 7 });

    // Second apply — nothing left; idempotent.
    const second = await runWeeklySummaryHygiene({ prisma, apply: true, log });
    expect(second).toEqual({ deleted: 0 });

    expect(lines).toEqual([
      "weekly_summaries_deleted=7",
      "weekly_summaries_deleted=0",
    ]);
  });

  it("privacy: the emitted lines never carry identifiers or row content", async () => {
    const prisma = {
      weeklySummary: {
        count: vi.fn().mockResolvedValue(3),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const lines: string[] = [];
    const log = (m: string) => lines.push(m);

    await runWeeklySummaryHygiene({ prisma, apply: false, log });
    await runWeeklySummaryHygiene({ prisma, apply: true, log });

    const blob = lines.join("\n");
    for (const forbidden of [
      "userId",
      "@", // emails
      "headline",
      "narrative",
      "calma",
    ]) {
      expect(blob).not.toContain(forbidden);
    }
    // Only the two aggregate count lines were emitted.
    expect(lines).toEqual([
      "weekly_summaries_found=3",
      "weekly_summaries_deleted=3",
    ]);
  });
});

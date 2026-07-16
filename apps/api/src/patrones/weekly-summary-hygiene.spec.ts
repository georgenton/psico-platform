import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// The hygiene logic lives in a runnable ops script; we import the extracted,
// side-effect-free helper (the CLI bootstrap is guarded behind isMain).
import { runWeeklySummaryHygiene } from "../../scripts/pr2b-weekly-summary-hygiene.mjs";

const SCRIPT_PATH = fileURLToPath(
  new URL("../../scripts/pr2b-weekly-summary-hygiene.mjs", import.meta.url),
);

describe("pr2b-weekly-summary-hygiene · helper", () => {
  it("dry-run: counts only, writes nothing, emits exactly one line", async () => {
    const deleteMany = vi.fn();
    const create = vi.fn();
    const upsert = vi.fn();
    const prisma = {
      weeklySummary: {
        count: vi.fn().mockResolvedValue(7),
        deleteMany,
        create,
        upsert,
      },
    };
    const lines: string[] = [];

    const res = await runWeeklySummaryHygiene({
      prisma,
      apply: false,
      log: (m: string) => lines.push(m),
    });

    expect(res).toEqual({ found: 7 });
    expect(deleteMany).not.toHaveBeenCalled();
    // Exactly one aggregate line — no ids/emails/headline/narrative.
    expect(lines).toEqual(["weekly_summaries_found=7"]);
  });

  it("apply: deletes and reports only the deleted count; idempotent second run → 0", async () => {
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

    expect(await runWeeklySummaryHygiene({ prisma, apply: true, log })).toEqual(
      {
        deleted: 7,
      },
    );
    expect(await runWeeklySummaryHygiene({ prisma, apply: true, log })).toEqual(
      {
        deleted: 0,
      },
    );

    expect(lines).toEqual([
      "weekly_summaries_deleted=7",
      "weekly_summaries_deleted=0",
    ]);
  });

  it("contract: a LOSS, not a rebuild — never regenerates (no create/upsert)", async () => {
    // Pins the honest contract: the script deletes and stops. It does NOT
    // reconstruct historical summaries (regenerate only produces the current
    // week). If a future edit reached for create/upsert here, this fails.
    const create = vi.fn();
    const upsert = vi.fn();
    const prisma = {
      weeklySummary: {
        count: vi.fn().mockResolvedValue(3),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
        create,
        upsert,
      },
    };

    await runWeeklySummaryHygiene({ prisma, apply: true, log: () => {} });

    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("privacy: emitted lines never carry identifiers or row content", async () => {
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
    for (const forbidden of ["userId", "@", "headline", "narrative", "calma"]) {
      expect(blob).not.toContain(forbidden);
    }
    expect(lines).toEqual([
      "weekly_summaries_found=3",
      "weekly_summaries_deleted=3",
    ]);
  });
});

describe("pr2b-weekly-summary-hygiene · CLI stdout discipline", () => {
  it("routes errors to stderr and keeps stdout empty (no banner, no verbose)", () => {
    // Run the real CLI with DATABASE_URL unset. It must error on stderr and
    // write NOTHING to stdout — proving there is no banner/verbose line that
    // could precede (or replace) the single count line on the happy path.
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const res = spawnSync(process.execPath, [SCRIPT_PATH], {
      env,
      encoding: "utf8",
    });

    expect(res.status).toBe(1);
    expect(res.stdout).toBe(""); // strictly counts-only: nothing else on stdout
    expect(res.stderr).toContain("DATABASE_URL is required.");
  });
});

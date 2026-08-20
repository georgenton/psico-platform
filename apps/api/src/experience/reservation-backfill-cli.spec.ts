import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  runReservationBackfillCli,
  renderReport,
  type BackfillClientHandle,
} from "./reservation-backfill-cli";
import {
  BackfillAbort,
  BackfillFailure,
  BACKFILL_ANOMALY,
  type BackfillReport,
} from "./experience-reservation-backfill";

/**
 * C.3B (#639) — the entry point, EXECUTED.
 *
 * The bug this file exists for shipped through a full green suite: the CLI did
 * `new PrismaClient()` with no adapter and threw on construction, and the only
 * test that named the file read its source. A ratchet can tell you a string is
 * present; it cannot tell you the program starts.
 *
 * So every case here drives the real `runReservationBackfillCli` — real
 * argument parsing, real dispatch, real disposal — with the client factory as
 * the only seam. What it proves is behaviour: which flags reach which command,
 * that a bad flag never opens a connection, and that the pool is released on
 * every path including the failing ones.
 */

const mocks = vi.hoisted(() => ({
  measure: vi.fn(),
  apply: vi.fn(),
}));

vi.mock("./experience-reservation-backfill", async (importOriginal) => {
  // The real module, with only the two commands replaced: `BackfillAbort`,
  // `BackfillFailure` and `BACKFILL_ANOMALY` must stay genuine, or the
  // `instanceof` branches in the CLI would never be taken.
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    measureReservations: mocks.measure,
    applyReservations: mocks.apply,
  };
});

const REPORT: BackfillReport = {
  rowsConsidered: 3,
  rowsLegacy: 1,
  rowsAlreadyMaterialised: 2,
  rowsWithPositionDrift: 0,
  rowsIdentityFromGuideContext: 3,
  rowsPositionCorroborated: 3,
  rowsWithUnresolvedPosition: 0,
  groups: 2,
  reservationsExisting: 1,
  reservationsToCreate: 1,
  reservationsCreated: 0,
  reservationsReplayed: 0,
  columnsFilled: 0,
  anomalies: [],
  applied: false,
};

/** A handle that records whether it was released. */
function handleSpy() {
  const disposed = { count: 0 };
  const factory = vi.fn(
    (): BackfillClientHandle => ({
      prisma: {} as BackfillClientHandle["prisma"],
      dispose: async () => {
        disposed.count += 1;
      },
    }),
  );
  return { factory, disposed };
}

beforeEach(() => {
  // Counts are the assertion in most of these, so they start from zero rather
  // than from whatever the previous case left behind.
  mocks.measure.mockReset();
  mocks.apply.mockReset();
});

function sink() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (l: string) => out.push(l),
    stderr: (l: string) => err.push(l),
  };
}

describe("reservation backfill CLI — arguments are validated before anything is built", () => {
  const bad = [
    ["no flag at all", []],
    ["both at once", ["--measure", "--apply"]],
    ["measure twice", ["--measure", "--measure"]],
    ["apply twice", ["--apply", "--apply"]],
    ["an unknown flag", ["--measure", "--force"]],
    ["only an unknown flag", ["--dry-run"]],
  ] as const;

  for (const [name, argv] of bad) {
    it(`${name}: exit 2, usage, and NO client constructed`, async () => {
      const { factory } = handleSpy();
      const s = sink();
      const code = await runReservationBackfillCli({
        argv,
        createClient: factory,
        stdout: s.stdout,
        stderr: s.stderr,
      });
      expect(code).toBe(2);
      // The one that matters: a command that was never going to run must not
      // have opened a pool to find that out.
      expect(factory).toHaveBeenCalledTimes(0);
      expect(s.err.join("\n")).toContain("--measure | --apply");
      expect(s.out).toEqual([]);
    });
  }

  it("tolerates the `--` pnpm inserts", async () => {
    // `pnpm run x -- --measure` really does deliver a bare `--` in argv.
    const { factory } = handleSpy();
    mocks.measure.mockResolvedValue(REPORT);
    const s = sink();
    const code = await runReservationBackfillCli({
      argv: ["--", "--measure"],
      createClient: factory,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(mocks.measure).toHaveBeenCalledTimes(1);
  });
});

describe("reservation backfill CLI — dispatch and disposal", () => {
  it("--measure runs measure exactly once, never apply, and releases the client", async () => {
    const { factory, disposed } = handleSpy();
    mocks.measure.mockResolvedValue(REPORT);
    mocks.apply.mockReset();
    const s = sink();

    const code = await runReservationBackfillCli({
      argv: ["--measure"],
      createClient: factory,
      stdout: s.stdout,
      stderr: s.stderr,
    });

    expect(code).toBe(0);
    expect(mocks.measure).toHaveBeenCalledTimes(1);
    expect(mocks.apply).toHaveBeenCalledTimes(0);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(disposed.count).toBe(1);
    expect(s.out.join("\n")).toContain(
      "EXPERIENCE_RESERVATION_BACKFILL=measured",
    );
  });

  it("--apply runs apply exactly once, never measure, and releases the client", async () => {
    const { factory, disposed } = handleSpy();
    mocks.apply.mockResolvedValue({ ...REPORT, applied: true });
    mocks.measure.mockReset();
    const s = sink();

    const code = await runReservationBackfillCli({
      argv: ["--apply"],
      createClient: factory,
      stdout: s.stdout,
      stderr: s.stderr,
    });

    expect(code).toBe(0);
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.measure).toHaveBeenCalledTimes(0);
    expect(disposed.count).toBe(1);
  });

  it("a measured set with anomalies exits 3 without pretending it failed", async () => {
    const { factory, disposed } = handleSpy();
    mocks.measure.mockResolvedValue({
      ...REPORT,
      anomalies: [
        {
          kind: BACKFILL_ANOMALY.guideContextUnresolved,
          bookSlug: "b",
          chapterOrder: 1,
        },
      ],
    });
    const s = sink();
    const code = await runReservationBackfillCli({
      argv: ["--measure"],
      createClient: factory,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(3);
    expect(disposed.count).toBe(1);
    expect(s.out.join("\n")).toContain("ROW_GUIDE_CONTEXT_UNRESOLVED");
  });

  it("an abort renders its anomalies, says nothing was written, and releases", async () => {
    const { factory, disposed } = handleSpy();
    mocks.measure.mockRejectedValue(
      new BackfillAbort([
        {
          kind: BACKFILL_ANOMALY.guideContextIdentityMismatch,
          bookSlug: "b",
          chapterOrder: 2,
        },
      ]),
    );
    const s = sink();
    const code = await runReservationBackfillCli({
      argv: ["--measure"],
      createClient: factory,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(3);
    expect(disposed.count).toBe(1);
    expect(s.err.join("\n")).toContain("nothing was written");
    expect(s.out.join("\n")).toContain("ROW_GUIDE_CONTEXT_IDENTITY_MISMATCH");
  });

  it("a failure prints the CODE and never the driver's message, and releases", async () => {
    const { factory, disposed } = handleSpy();
    mocks.measure.mockRejectedValue(
      new BackfillFailure(
        "EXPERIENCE_RESERVATION_RACE",
        "connection to postgres://user:secret@host failed",
      ),
    );
    const s = sink();
    const code = await runReservationBackfillCli({
      argv: ["--measure"],
      createClient: factory,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(4);
    expect(disposed.count).toBe(1);
    const printed = s.err.join("\n");
    expect(printed).toContain("EXPERIENCE_RESERVATION_RACE");
    expect(printed).not.toContain("secret");
    expect(printed).not.toContain("postgres://");
  });

  it("an unexpected error still releases the client before it propagates", async () => {
    const { factory, disposed } = handleSpy();
    mocks.measure.mockRejectedValue(new Error("boom"));
    const s = sink();
    await expect(
      runReservationBackfillCli({
        argv: ["--measure"],
        createClient: factory,
        stdout: s.stdout,
        stderr: s.stderr,
      }),
    ).rejects.toThrow("boom");
    // The point of the `finally`: a pool left open hangs the process.
    expect(disposed.count).toBe(1);
  });
});

describe("reservation backfill CLI — what the report says out loud", () => {
  it("names the identity source and denies that position was one", () => {
    const printed = renderReport(REPORT);
    expect(printed).toContain("ROWS_IDENTITY_FROM_GUIDE_CONTEXT=3");
    expect(printed).toContain("POSITION_USED_AS_IDENTITY=false");
    // The retired counter, gone rather than kept as a misleading zero.
    expect(printed).not.toContain("ROWS_ADOPTING_CURRENT_POSITION");
    expect(printed).not.toContain("ADOPT");
  });

  it("reports drift as an observation, not as a warning about a guess", () => {
    const printed = renderReport({
      ...REPORT,
      rowsWithPositionDrift: 2,
      rowsPositionCorroborated: 1,
    });
    expect(printed).toContain("ROWS_WITH_POSITION_DRIFT=2");
    expect(printed).toContain("Identity is unaffected");
    expect(printed).not.toMatch(/irreversible/i);
  });

  it("anomaly lines carry catalog coordinates and nothing else", () => {
    const printed = renderReport({
      ...REPORT,
      anomalies: [
        {
          kind: BACKFILL_ANOMALY.guideContextUnresolved,
          bookSlug: "emociones-en-construccion",
          chapterOrder: 1,
          experienceKey: "eec-c1",
          guideKey: "eec-c1",
        },
      ],
    });
    expect(printed).toContain(
      "ROW_GUIDE_CONTEXT_UNRESOLVED book=emociones-en-construccion chapter=1",
    );
  });
});

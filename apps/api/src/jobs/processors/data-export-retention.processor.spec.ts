import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

import { DataExportRetentionProcessor } from "./data-export-retention.processor";
import { JobName } from "../queue-names";
import {
  DATA_EXPORT_RETENTION_DAYS,
  DATA_EXPORT_STATUS,
} from "../../users/data-export-retention";

/**
 * The sweep that deletes a data export once its retention elapses.
 *
 * Two properties matter more than the happy path:
 *
 *   - the ORDER. Object first, row second. If the delete fails the row stays
 *     READY so tomorrow retries, and the file — still present — stays
 *     downloadable. Clearing the row first would leave an object nothing names,
 *     unreachable AND un-deletable, because the key is derived from the row.
 *   - the BOUNDARY. Retention is 30 days because the request cooldown is 30
 *     days; expiring earlier would leave a user with no file and no way to ask
 *     for a replacement.
 */

const USER = "cmql4vasx0000abcdefghijkl";
const NOW = "2026-11-01T03:30:00.000Z";
const DAY = 24 * 60 * 60 * 1000;

function daysBeforeNow(days: number): Date {
  return new Date(new Date(NOW).getTime() - days * DAY);
}

function buildPrisma(rows: { id: string; userId: string }[] = []) {
  return {
    dataExportRequest: {
      findMany: vi.fn().mockResolvedValue(rows),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function buildStorage() {
  return { deleteObject: vi.fn().mockResolvedValue(undefined) };
}

function job(
  data: Record<string, unknown> = {},
  name: string = JobName.RUN_DATA_EXPORT_RETENTION,
): Job<never> {
  return { name, data } as unknown as Job<never>;
}

describe("DataExportRetentionProcessor", () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let storage: ReturnType<typeof buildStorage>;

  beforeEach(() => {
    prisma = buildPrisma();
    storage = buildStorage();
  });

  function make(rows: { id: string; userId: string }[] = []) {
    prisma = buildPrisma(rows);
    return new DataExportRetentionProcessor(prisma as never, storage as never);
  }

  it("rejects an unknown job name", async () => {
    await expect(make().process(job({}, "something-else"))).rejects.toThrow(
      /unknown job name/,
    );
  });

  it("deletes the object, THEN marks the row EXPIRED and clears fileUrl", async () => {
    const svc = make([{ id: "req-1", userId: USER }]);
    await svc.process(job({ nowIso: NOW }));

    expect(storage.deleteObject).toHaveBeenCalledWith(
      `data-exports/${USER}/req-1.json`,
    );
    expect(prisma.dataExportRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "req-1", status: DATA_EXPORT_STATUS.READY },
      data: { status: DATA_EXPORT_STATUS.EXPIRED, fileUrl: null },
    });
  });

  it("selects only READY rows that have bytes and are past the cutoff", async () => {
    const svc = make([]);
    await svc.process(job({ nowIso: NOW }));

    const where = prisma.dataExportRequest.findMany.mock.calls[0]![0]
      .where as Record<string, unknown>;
    expect(where.status).toBe(DATA_EXPORT_STATUS.READY);
    expect(where.fileUrl).toEqual({ not: null });

    // The cutoff is exactly the retention window behind the given instant.
    const cutoff = daysBeforeNow(DATA_EXPORT_RETENTION_DAYS);
    expect(where.OR).toEqual([
      { completedAt: { lte: cutoff } },
      { completedAt: null, createdAt: { lte: cutoff } },
    ]);
  });

  it("puts the boundary at exactly the cooldown, so there is never a gap", async () => {
    // The whole reason retention is 30 and not 7: a shorter window would delete
    // the file while a replacement is still refused, leaving the user with
    // neither for the remainder of the cooldown.
    expect(DATA_EXPORT_RETENTION_DAYS).toBe(30);

    const svc = make([]);
    await svc.process(job({ nowIso: NOW }));
    const where = prisma.dataExportRequest.findMany.mock.calls[0]![0].where as {
      OR: { completedAt: { lte: Date } }[];
    };
    const cutoff = where.OR[0]!.completedAt.lte;

    // A 30-day-old export is due; a 29-day-old one is not. Asserted against the
    // query's own cutoff rather than by re-deriving it, so the test cannot drift
    // from the code it checks.
    expect(daysBeforeNow(30).getTime()).toBeLessThanOrEqual(cutoff.getTime());
    expect(daysBeforeNow(29).getTime()).toBeGreaterThan(cutoff.getTime());
  });

  it("leaves the row READY when R2 refuses, so the file stays downloadable", async () => {
    storage.deleteObject.mockRejectedValueOnce(new Error("R2 unavailable"));
    const svc = make([{ id: "req-1", userId: USER }]);

    // The pass completes rather than throwing: the sweep's job is to make
    // progress, and one stubborn object must not keep the rest alive.
    await svc.process(job({ nowIso: NOW }));

    expect(prisma.dataExportRequest.updateMany).not.toHaveBeenCalled();
  });

  it("does not let one failure stop the rows after it", async () => {
    storage.deleteObject
      .mockRejectedValueOnce(new Error("R2 unavailable"))
      .mockResolvedValueOnce(undefined);
    const svc = make([
      { id: "bad", userId: USER },
      { id: "good", userId: USER },
    ]);

    await svc.process(job({ nowIso: NOW }));

    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(prisma.dataExportRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.dataExportRequest.updateMany.mock.calls[0]![0].where.id).toBe(
      "good",
    );
  });

  it("is idempotent: a second pass over an already-deleted object still settles the row", async () => {
    // `DeleteObject` answers success for a key that is already gone, so a retry
    // after a partial pass is safe rather than merely tolerated.
    const svc = make([{ id: "req-1", userId: USER }]);
    await svc.process(job({ nowIso: NOW }));
    await svc.process(job({ nowIso: NOW }));

    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(prisma.dataExportRequest.updateMany).toHaveBeenCalledTimes(2);
    // The status guard in the WHERE is what makes the second write a no-op
    // against a row another pass already expired.
    for (const call of prisma.dataExportRequest.updateMany.mock.calls) {
      expect(call[0].where.status).toBe(DATA_EXPORT_STATUS.READY);
    }
  });

  it("deletes nothing and writes nothing on a dry run", async () => {
    const svc = make([{ id: "req-1", userId: USER }]);
    await svc.process(job({ nowIso: NOW, dryRun: true }));

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.dataExportRequest.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when nothing is due", async () => {
    const svc = make([]);
    await svc.process(job({ nowIso: NOW }));

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.dataExportRequest.updateMany).not.toHaveBeenCalled();
  });

  it("never touches a key outside the owner's prefixes", async () => {
    const svc = make([
      { id: "req-1", userId: USER },
      { id: "req-2", userId: "cmqlzzzzz0009abcdefghijkl" },
    ]);
    await svc.process(job({ nowIso: NOW }));

    // Each key is built from ITS OWN row's userId, so the second row's object
    // lives under the second user's prefix — never the first's.
    for (const call of storage.deleteObject.mock.calls) {
      expect(call[0]).toMatch(/^data-exports\/cm[a-z0-9]+\/req-\d\.json$/);
    }
    expect(storage.deleteObject.mock.calls[0]![0]).toContain(USER);
    expect(storage.deleteObject.mock.calls[1]![0]).not.toContain(USER);
  });
});

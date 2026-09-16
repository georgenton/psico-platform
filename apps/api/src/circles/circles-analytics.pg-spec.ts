import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CIRCLE_SMALL_CELL_THRESHOLD,
  CirclesAnalyticsService,
  weekStartOf,
} from "./circles-analytics.service";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * The analytics plane against REAL PostgreSQL.
 *
 * Three things here cannot be tested against a mock, and each of them is a
 * promise rather than a detail:
 *
 *   · **Deduplication.** "One contribution per seat" is a UNIQUE index. Two
 *     submissions arriving at once is a race the database settles, and a mock
 *     would settle it the way the test author expected.
 *   · **Retention.** Folding and deleting must be idempotent and must not lose
 *     a row that arrives mid-run. That is a question about the cutoff and the
 *     transaction, not about the code's intent.
 *   · **The refusals in the schema.** A third `piece`, a third topic, a topic
 *     with a comma in it: all rejected by CHECK constraints, which only exist
 *     in a real server.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

const API_DIR = process.cwd();
const DB = `circles_analytics_${randomBytes(6).toString("hex")}`;

function withDatabase(url: string, db: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${db}`;
  return parsed.toString();
}

suite("circles · analytics against real PostgreSQL", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let service: CirclesAnalyticsService;

  /** A seat id that looks like one but belongs to nothing. */
  const seat = () => `seat_${randomBytes(8).toString("hex")}`;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });

    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    service = new CirclesAnalyticsService(prisma as unknown as PrismaService);
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  }, 60_000);

  const record = (participantId: string, over: Record<string, unknown> = {}) =>
    service.recordFeedback({
      activityId: "act-analytics",
      participantId,
      templateKey: "duo-lo-que-me-ayuda",
      templateVersion: 2,
      topics: ["comunicacion"],
      usefulness: "YES",
      noticeVersion: "2026-09-15.1",
      helpOpens: [],
      ...over,
    });

  describe("one seat, one contribution", () => {
    it("replaces rather than adds when the same seat answers twice", async () => {
      const p = seat();
      await record(p, { topics: ["comunicacion"], usefulness: "YES" });
      await record(p, { topics: ["convivencia"], usefulness: "NO" });

      const rows = await prisma.circleFeedback.findMany({
        where: { participantId: p },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.topics).toEqual(["convivencia"]);
      expect(rows[0]!.usefulness).toBe("NO");
    });

    it("settles two concurrent submissions into one row", async () => {
      // Both upserts race for the same unique key. Whatever PostgreSQL does
      // with the loser, the invariant is the same: one row, not two votes.
      const p = seat();
      const results = await Promise.allSettled([
        record(p, { usefulness: "YES" }),
        record(p, { usefulness: "SOME" }),
      ]);
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);

      const rows = await prisma.circleFeedback.findMany({
        where: { participantId: p },
      });
      expect(rows).toHaveLength(1);
    });

    it("keeps a help counter per (seat, question, piece), replaced not summed", async () => {
      const p = seat();
      await record(p, {
        helpOpens: [
          { fieldKey: "que-ayuda", piece: "explanation", opens: 2 },
          { fieldKey: "que-ayuda", piece: "example", opens: 1 },
        ],
      });
      // The browser sends a TOTAL for the session. A resubmission of the same
      // form must not double it.
      await record(p, {
        helpOpens: [{ fieldKey: "que-ayuda", piece: "explanation", opens: 3 }],
      });

      const rows = await prisma.circleHelpOpen.findMany({
        where: { participantId: p },
        orderBy: { piece: "asc" },
      });
      expect(rows.map((r) => [r.piece, r.opens])).toEqual([
        ["example", 1],
        ["explanation", 3],
      ]);
    });
  });

  describe("the schema refuses what the DTO refuses", () => {
    it("rejects a third kind of help", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "CircleHelpOpen"
             ("id","activityId","participantId","templateKey","templateVersion",
              "fieldKey","piece","opens","updatedAt")
           VALUES ('h-bad','a','p','t',1,'f','summary',1,now())`,
        ),
      ).rejects.toThrow(/CircleHelpOpen_piece_is_known/);
    });

    it("rejects a topic that is not a key", async () => {
      // The one that matters: a sentence wearing an array.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "CircleFeedback"
             ("id","activityId","participantId","templateKey","templateVersion",
              "topics","noticeVersion","updatedAt")
           VALUES ('f-bad','a','p-bad','t',1,
                   ARRAY['me siento mal cuando llega tarde'],'v1',now())`,
        ),
      ).rejects.toThrow(/CircleFeedback_topics_are_keys/);
    });

    it("rejects a third topic", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "CircleFeedback"
             ("id","activityId","participantId","templateKey","templateVersion",
              "topics","noticeVersion","updatedAt")
           VALUES ('f-three','a','p-three','t',1,
                   ARRAY['comunicacion','convivencia','separacion'],'v1',now())`,
        ),
      ).rejects.toThrow(/CircleFeedback_topics_at_most_two/);
    });
  });

  describe("retention folds, then forgets", () => {
    it("turns aged contributions into counts and deletes the rows", async () => {
      const old = new Date(Date.UTC(2026, 0, 12, 10, 0, 0));
      const seats = Array.from({ length: 3 }, seat);
      for (const p of seats) {
        await record(p, { topics: ["apoyo-cotidiano"], usefulness: "SOME" });
        await prisma.circleFeedback.update({
          where: { participantId: p },
          data: { createdAt: old },
        });
      }

      const now = new Date(Date.UTC(2026, 2, 1));
      const first = await service.sweep(now);
      expect(first.deletedContributions).toBeGreaterThanOrEqual(3);

      const left = await prisma.circleFeedback.findMany({
        where: { participantId: { in: seats } },
      });
      expect(left, "the linkable rows are gone").toHaveLength(0);

      const fact = await prisma.circleWeeklyFact.findFirst({
        where: {
          weekStart: weekStartOf(old),
          metric: "topic",
          dimension: "apoyo-cotidiano",
        },
      });
      expect(fact?.value).toBe(3);
      expect(fact?.contributors).toBe(3);
    });

    it("is idempotent: a second sweep with nothing new changes nothing", async () => {
      const now = new Date(Date.UTC(2026, 2, 1));
      const before = await prisma.circleWeeklyFact.findMany({
        orderBy: [{ metric: "asc" }, { dimension: "asc" }],
        select: { metric: true, dimension: true, value: true },
      });
      const second = await service.sweep(now);
      expect(second.deletedContributions).toBe(0);
      expect(second.foldedWeeks).toBe(0);

      const after = await prisma.circleWeeklyFact.findMany({
        orderBy: [{ metric: "asc" }, { dimension: "asc" }],
        select: { metric: true, dimension: true, value: true },
      });
      expect(after).toEqual(before);
    });

    it("leaves a contribution that has not aged out", async () => {
      const p = seat();
      await record(p);
      await service.sweep(new Date());
      const still = await prisma.circleFeedback.findUnique({
        where: { participantId: p },
      });
      expect(still, "inside the window, so it stays").not.toBeNull();
    });

    it("drops weekly facts older than twelve months", async () => {
      await prisma.circleWeeklyFact.create({
        data: {
          weekStart: new Date(Date.UTC(2024, 0, 1)),
          templateKey: "duo-lo-que-me-ayuda",
          templateVersion: 1,
          metric: "topic",
          dimension: "comunicacion",
          value: 99,
          contributors: 99,
        },
      });
      await service.sweep(new Date(Date.UTC(2026, 2, 1)));
      const ancient = await prisma.circleWeeklyFact.findFirst({
        where: { weekStart: new Date(Date.UTC(2024, 0, 1)) },
      });
      expect(ancient).toBeNull();
    });
  });

  describe("withdrawing a permission removes what it allowed", () => {
    it("deletes both the answer and the counters for those seats", async () => {
      const p = seat();
      await record(p, {
        helpOpens: [{ fieldKey: "momento", piece: "example", opens: 1 }],
      });

      const removed = await service.forgetContributions([p]);
      expect(removed).toBe(2);
      expect(
        await prisma.circleFeedback.findUnique({ where: { participantId: p } }),
      ).toBeNull();
      expect(
        await prisma.circleHelpOpen.findMany({ where: { participantId: p } }),
      ).toHaveLength(0);
    });
  });

  describe("small cells are suppressed, and cannot be read back", () => {
    it("says «insufficient sample» below the threshold, not zero", async () => {
      const few = Array.from({ length: CIRCLE_SMALL_CELL_THRESHOLD - 1 }, seat);
      for (const p of few) await record(p, { topics: ["separacion"] });

      const summary = await service.summary({ windowDays: 365 });
      const cells = summary.declaredTopics.flatMap((w) => w.cells);
      const cell = cells.find((c) => c.label === "separacion");
      expect(cell?.kind).toBe("suppressed");
      // A zero would be a claim about the world. This is a statement about the
      // sample, and the difference is the whole point of the threshold.
      expect(JSON.stringify(cell)).not.toContain('"value"');
    });

    it("reports the cell once enough distinct seats are behind it", async () => {
      const enough = Array.from({ length: CIRCLE_SMALL_CELL_THRESHOLD }, seat);
      for (const p of enough) await record(p, { topics: ["convivencia"] });

      const summary = await service.summary({ windowDays: 365 });
      const cell = summary.declaredTopics
        .flatMap((w) => w.cells)
        .find((c) => c.label === "convivencia");
      expect(cell?.kind).toBe("value");
    });

    it("returns no seat, no activity and no content anywhere", async () => {
      const p = seat();
      await record(p, { topics: ["otro"] });
      const serialized = JSON.stringify(await service.summary({}));
      expect(serialized).not.toContain(p);
      expect(serialized).not.toContain("act-analytics");
      for (const forbidden of ["participantId", "activityId", "userId"]) {
        expect(serialized, forbidden).not.toContain(forbidden);
      }
    });
  });
});

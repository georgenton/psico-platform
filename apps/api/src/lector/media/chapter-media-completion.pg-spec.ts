import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { HttpException } from "@nestjs/common";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { backfillContentCore } from "../../content-core/backfill";
import { ContentAccessService } from "../../content-core/access/content-access.service";
import type { PrismaService } from "../../prisma";
import { LearningCatalogResolver } from "../../learning/learning-catalog.resolver";
import { LearningEventRepository } from "../../learning/learning-event.repository";
import { ChapterMediaService } from "./chapter-media.service";
import { ChapterMediaCatalogRegistry } from "./chapter-media.catalog";
import { chapterMediaCompletionIdempotencyKey } from "./chapter-media-idempotency";

/**
 * GR-2 — the media completion against REAL PostgreSQL.
 *
 * What this proves, on real rows and real constraints:
 *
 *   - a first completion writes exactly ONE row;
 *   - a replay (reload, double `ended`, a second device, a network retry)
 *     writes NOTHING and reports `replayed`;
 *   - another media, or another VERSION of the same media, is a different
 *     completion and gets its own row;
 *   - a DRAFT item, an unauthorised reader, and an unresolvable editorial
 *     context all write ZERO rows;
 *   - an infrastructure failure after the insert rolls the insert back;
 *   - the same derived key with different semantics fails CLOSED.
 *
 * The definitions here are FIXTURES, injected into the service. They never
 * enter the productive registry.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "gr2_media_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const BOOK_SLUG = "gr2-media-book";
const PRO_USER = { userId: "u-gr2-pro", email: "gr2-pro@test.local" };
const FREE_USER = { userId: "u-gr2-free", email: "gr2-free@test.local" };
const OTHER_PRO = { userId: "u-gr2-pro-2", email: "gr2-pro-2@test.local" };

function audiobook(mediaKey: string, mediaVersion: number, chapterOrder = 1) {
  return {
    mediaKey,
    mediaVersion,
    bookSlug: BOOK_SLUG,
    chapterOrder,
    kind: "AUDIOBOOK",
    status: "PUBLISHED",
    title: "Audiolibro de prueba",
    description: "Fixture.",
    durationSec: null,
    accessPolicy: chapterOrder === 1 ? "PRO_ONLY" : "BOOK_ENTITLEMENT",
    source: { kind: "CHAPTER_AUDIO" },
    posterObjectKey: null,
    transcriptObjectKey: null,
    chapters: [],
  };
}

const FIXTURES = [
  audiobook("fx-audiobook-v1", 1),
  audiobook("fx-audiobook-v2", 2),
  audiobook("fx-ch2-audiobook-v1", 1, 2),
  audiobook("fx-orphan-v1", 1, 3),
  {
    // A catalog key, not a credential (see the catalog spec).
    mediaKey: "fx-podcast-v1", // gitleaks:allow
    mediaVersion: 1,
    bookSlug: BOOK_SLUG,
    chapterOrder: 1,
    kind: "PODCAST",
    status: "PUBLISHED",
    title: "Podcast de prueba",
    description: "Fixture.",
    durationSec: 600,
    accessPolicy: "BOOK_ENTITLEMENT",
    source: { kind: "R2", objectKey: "media/gr2/podcast-1.mp3" },
    posterObjectKey: null,
    transcriptObjectKey: null,
    chapters: [],
  },
  {
    mediaKey: "fx-video-draft",
    mediaVersion: 1,
    bookSlug: BOOK_SLUG,
    chapterOrder: 1,
    kind: "VIDEO",
    status: "DRAFT",
    title: "Video de prueba",
    description: "Fixture.",
    durationSec: null,
    accessPolicy: null,
    source: null,
    posterObjectKey: null,
    transcriptObjectKey: null,
    chapters: [],
  },
];

suite("GR-2 · chapter media completion (real PostgreSQL)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let repository: LearningEventRepository;
  let service: ChapterMediaService;

  const rows = (userId: string) =>
    prisma.learningEvent.findMany({
      where: { userId, kind: "CHAPTER_MEDIA_COMPLETED" },
      orderBy: { createdAt: "asc" },
    });

  function build(
    events: Pick<LearningEventRepository, "appendValidated">,
  ): ChapterMediaService {
    const storage = {
      getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/x"),
    };
    const lector = {
      getAudio: vi.fn().mockResolvedValue({
        url: "https://signed.example/audio",
        durationSec: 600,
        transcript: [],
        metadata: {
          title: "t",
          subtitle: "s",
          artist: "a",
          artworkUrl: "warm",
        },
      }),
    };
    const stream = { createAccess: vi.fn(), isConfigured: () => false };
    return new ChapterMediaService(
      prisma as unknown as PrismaService,
      storage as never,
      new ContentAccessService(prisma as unknown as PrismaService),
      lector as never,
      stream as never,
      new LearningCatalogResolver(prisma as unknown as PrismaService),
      events as LearningEventRepository,
      new ChapterMediaCatalogRegistry(FIXTURES),
    );
  }

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
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    await prisma.user.createMany({
      data: [
        { id: PRO_USER.userId, email: PRO_USER.email, name: "Pro" },
        { id: FREE_USER.userId, email: FREE_USER.email, name: "Free" },
        { id: OTHER_PRO.userId, email: OTHER_PRO.email, name: "Pro 2" },
      ],
    });

    // A PRO book so chapter 1 is the free preview and chapter 2 is gated.
    const book = await prisma.book.create({
      data: { slug: BOOK_SLUG, title: "GR2 Media", plan: "PRO" },
    });
    const mkChapter = async (order: number) => {
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order, title: `Cap ${order}` },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "texto",
        },
      });
      return ch;
    };
    const ch1 = await mkChapter(1);
    await mkChapter(2);

    await prisma.audio.create({
      data: {
        chapterId: ch1.id,
        title: "Cap 1",
        fileUrl: "audio/gr2/cap-1.mp3",
        durationSeconds: 600,
      },
    });

    // The real Content Core pipeline: only chapters 1 and 2 get published units.
    await backfillContentCore(prisma);

    // Chapter 3 exists ONLY in the legacy tables — its editorial context can
    // never resolve, which is exactly the case `fx-orphan-v1` exercises.
    await mkChapter(3);

    repository = new LearningEventRepository(prisma);
    service = build(repository);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("the enum, after every migration, ends with GR-2's value appended", async () => {
    // The from-scratch path: this database ran `prisma migrate deploy` over the
    // whole history, so it pins where GR-2's additive value landed. The upgrade
    // path up to CC-7.2 is pinned separately in
    // `learning/learning-event-migration.pg-spec.ts`.
    const values = await pool.query<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'LearningEventKind'
        ORDER BY e.enumsortorder`,
    );
    expect(values.rows.map((r) => r.enumlabel)).toEqual([
      "UNIT_OPENED",
      "UNIT_COMPLETED",
      "BLOCK_DWELL",
      "GUIDE_SESSION_STARTED",
      "GUIDE_SESSION_COMPLETED",
      "HIGHLIGHT_CREATED",
      "ANNOTATION_CREATED",
      "RESONANCE_CONFIRMED",
      "CONCEPT_EXPLORED",
      "ACTIVE_RECALL_ATTEMPTED",
      "PRACTICE_COMPLETED",
      "CHAPTER_MEDIA_COMPLETED",
    ]);
  });

  it("a first completion writes exactly one row, with a server-derived key", async () => {
    const result = await service.complete(
      PRO_USER.userId,
      "PRO",
      "fx-audiobook-v1",
    );
    expect(result).toEqual({ created: true, replayed: false });

    const persisted = await rows(PRO_USER.userId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.idempotencyKey).toBe(
      chapterMediaCompletionIdempotencyKey("fx-audiobook-v1", 1),
    );
    expect(persisted[0]!.schemaVersion).toBe(1);
    expect(persisted[0]!.payload).toEqual({
      mediaKey: "fx-audiobook-v1",
      mediaKind: "AUDIOBOOK",
      mediaVersion: 1,
      unitKey: expect.any(String),
    });
    expect(persisted[0]!.editionId).not.toBeNull();
    expect(persisted[0]!.unitId).not.toBeNull();
  });

  it("a replay — reload, double ended, second device, retry — adds no row", async () => {
    // Four more calls: the same person finishing the same media again.
    for (let i = 0; i < 4; i += 1) {
      const result = await service.complete(
        PRO_USER.userId,
        "PRO",
        "fx-audiobook-v1",
      );
      expect(result).toEqual({ created: false, replayed: true });
    }
    expect(await rows(PRO_USER.userId)).toHaveLength(1);
  });

  it("another media, and another VERSION, each get their own row", async () => {
    await service.complete(PRO_USER.userId, "PRO", "fx-podcast-v1");
    await service.complete(PRO_USER.userId, "PRO", "fx-audiobook-v2");

    const persisted = await rows(PRO_USER.userId);
    expect(persisted).toHaveLength(3);
    expect(
      persisted.map((r) => (r.payload as { mediaKey: string }).mediaKey).sort(),
    ).toEqual(["fx-audiobook-v1", "fx-audiobook-v2", "fx-podcast-v1"]);
    // The two versions derive DIFFERENT keys, which is what separates them.
    expect(chapterMediaCompletionIdempotencyKey("fx-audiobook-v1", 1)).not.toBe(
      chapterMediaCompletionIdempotencyKey("fx-audiobook-v2", 2),
    );
  });

  it("the same key belongs to one person only — another account gets its own row", async () => {
    await service.complete(OTHER_PRO.userId, "PRO", "fx-audiobook-v1");
    expect(await rows(OTHER_PRO.userId)).toHaveLength(1);
    expect(await rows(PRO_USER.userId)).toHaveLength(3);
  });

  it("a DRAFT item writes zero rows", async () => {
    const before = (await rows(PRO_USER.userId)).length;
    await expect(
      service.complete(PRO_USER.userId, "PRO", "fx-video-draft"),
    ).rejects.toMatchObject({ message: "MEDIA_NOT_AVAILABLE" });
    expect(await rows(PRO_USER.userId)).toHaveLength(before);
  });

  it("an unknown media key writes zero rows", async () => {
    const before = (await rows(PRO_USER.userId)).length;
    await expect(
      service.complete(PRO_USER.userId, "PRO", "fx-does-not-exist"),
    ).rejects.toMatchObject({ message: "MEDIA_NOT_FOUND" });
    expect(await rows(PRO_USER.userId)).toHaveLength(before);
  });

  it("an unauthorised reader writes zero rows (shared entitlement gate)", async () => {
    // A FREE reader on chapter 2 of a PRO book: the ONE content policy denies.
    await expect(
      service.complete(FREE_USER.userId, "FREE", "fx-ch2-audiobook-v1"),
    ).rejects.toBeInstanceOf(HttpException);
    expect(await rows(FREE_USER.userId)).toHaveLength(0);

    // …and the format's own PRO_ONLY policy denies chapter 1 too.
    await expect(
      service.complete(FREE_USER.userId, "FREE", "fx-audiobook-v1"),
    ).rejects.toBeInstanceOf(HttpException);
    expect(await rows(FREE_USER.userId)).toHaveLength(0);
  });

  it("an unresolvable editorial context writes zero rows", async () => {
    const before = (await rows(PRO_USER.userId)).length;
    await expect(
      service.complete(PRO_USER.userId, "PRO", "fx-orphan-v1"),
    ).rejects.toBeInstanceOf(HttpException);
    expect(await rows(PRO_USER.userId)).toHaveLength(before);
  });

  it("an infrastructure failure after the insert rolls the insert back", async () => {
    const before = (await rows(PRO_USER.userId)).length;

    // Insert for real, then fail. If the transaction were not real, the row
    // would survive this and the count would grow.
    const exploding = {
      appendValidated: async (input: never, db?: never) => {
        const result = await repository.appendValidated(input, db);
        throw new Error("infrastructure exploded after the write");
        return result;
      },
    } as unknown as LearningEventRepository;

    await expect(
      build(exploding).complete(PRO_USER.userId, "PRO", "fx-ch2-audiobook-v1"),
    ).rejects.toThrow("infrastructure exploded after the write");

    expect(await rows(PRO_USER.userId)).toHaveLength(before);
  });

  it("the same derived key with different semantics fails CLOSED", async () => {
    // Squat the key this media would derive, with a DIFFERENT payload. The
    // comparator must refuse to call that a replay.
    const squatted = chapterMediaCompletionIdempotencyKey(
      "fx-ch2-audiobook-v1",
      1,
    );
    await prisma.$executeRaw`
      INSERT INTO "LearningEvent"(id, "userId", kind, "idempotencyKey", "schemaVersion", payload, "createdAt")
      VALUES ('gr2-squat-row', ${PRO_USER.userId}, 'CHAPTER_MEDIA_COMPLETED', ${squatted}, 1,
              '{"mediaKey":"fx-ch2-audiobook-v1","mediaKind":"PODCAST","mediaVersion":1,"unitKey":"otro"}'::jsonb,
              now())`;

    const before = (await rows(PRO_USER.userId)).length;
    await expect(
      service.complete(PRO_USER.userId, "PRO", "fx-ch2-audiobook-v1"),
    ).rejects.toMatchObject({ message: "LEARNING_EVENT_IDEMPOTENCY_CONFLICT" });
    expect(await rows(PRO_USER.userId)).toHaveLength(before);
  });
});

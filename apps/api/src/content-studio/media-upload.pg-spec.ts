import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MediaUploadService } from "./media-upload.service";
import {
  ChapterMediaCatalogRegistry,
  validateChapterMediaDefinition,
} from "../lector/media/chapter-media.catalog";
import { CodeChapterMediaDefinitionRepository } from "../lector/media/chapter-media-definition.repository";
import { DatabaseChapterMediaRepository } from "../lector/media/database-chapter-media.repository";
import { HybridChapterMediaRepository } from "../lector/media/hybrid-chapter-media.repository";
import { chapterMediaCompletionIdempotencyKey } from "../lector/media/chapter-media-idempotency";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";

/**
 * C2B — the audiobook replacement invariant, on real Postgres.
 *
 * `Audio.fileUrl` is a MUTABLE pointer and the published audiobook resolves
 * through it. That is fine while there is one master and fatal the moment there
 * are two: moving the pointer to v2's bytes would make v1 resolve to v2, so
 * somebody who completed v1 would find it now plays a recording they never
 * heard.
 *
 * The whole publish transaction exists to prevent exactly that, and this suite
 * is the proof. It needs a real database because the ordering — freeze, THEN
 * move — only means something if both happen in one transaction.
 *
 * Runs only when TEST_DATABASE_URL is set; skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "c2b_media_db";
const API_DIR = process.cwd();
const BOOK = "libro-c2b";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const audio = (bytes: string) => ({
  mimetype: "audio/mp4",
  size: bytes.length,
  buffer: Buffer.from(bytes),
});

suite("Content Studio · audiobook master replacement (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: MediaUploadService;
  let hybrid: HybridChapterMediaRepository;
  let put: ReturnType<typeof vi.fn>;
  let del: ReturnType<typeof vi.fn>;
  let chapterId: string;
  let adminId: string;

  const V1_KEY = "media/libro-c2b/c1/audiobook/old000000000000.m4a";

  beforeAll(async () => {
    const root = new Pool({ connectionString: base });
    await root.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await root.query(`CREATE DATABASE "${DB}"`);
    await root.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const user = await prisma.user.create({
      data: { email: "c2b@test.local", name: "Admin", role: "ADMIN" },
    });
    adminId = user.id;
    const book = await prisma.book.create({
      data: { slug: BOOK, title: "Libro C2B" },
    });
    const chapter = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });
    chapterId = chapter.id;

    // The chapter already has a playable audiobook whose bytes live at V1_KEY.
    await prisma.audio.create({
      data: {
        chapterId,
        title: "Audiolibro",
        fileUrl: V1_KEY,
        durationSeconds: 600,
      },
    });
    await prisma.chapterMediaVersion.create({
      data: {
        mediaKey: "libro-c2b-c1-audiobook-v1",
        mediaVersion: 1,
        bookSlug: BOOK,
        chapterOrder: 1,
        kind: "AUDIOBOOK",
        editorialStatus: "PUBLISHED",
        publishedAt: new Date(),
        definitionJson: validateChapterMediaDefinition({
          mediaKey: "libro-c2b-c1-audiobook-v1",
          mediaVersion: 1,
          bookSlug: BOOK,
          chapterOrder: 1,
          kind: "AUDIOBOOK",
          status: "PUBLISHED",
          title: "Audiolibro · capítulo 1",
          description: "El máster original.",
          durationSec: 600,
          accessPolicy: "PRO_ONLY",
          source: { kind: "CHAPTER_AUDIO" },
          posterObjectKey: null,
          transcriptObjectKey: null,
          chapters: [],
        }) as unknown as object,
      },
    });

    put = vi.fn().mockResolvedValue(undefined);
    del = vi.fn().mockResolvedValue(undefined);
    service = new MediaUploadService(
      prisma as unknown as PrismaService,
      { putObject: put, deleteObject: del } as unknown as StorageService,
    );
    hybrid = new HybridChapterMediaRepository(
      new DatabaseChapterMediaRepository(prisma as unknown as PrismaService),
      new CodeChapterMediaDefinitionRepository(
        new ChapterMediaCatalogRegistry([]),
      ),
    );
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  let draftId: string;
  let v2Key: string;

  it("upload stages v2 privately and changes NOTHING a reader can hear", async () => {
    const result = await service.uploadAudiobook(
      BOOK,
      1,
      audio("nuevos-bytes-v2"),
      660,
      adminId,
    );
    draftId = result.draftId;

    // A new master is a new identity — v1's completion must not come to mean it.
    expect(result.mediaKey).toBe("libro-c2b-c1-audiobook-v2");
    expect(result.mediaVersion).toBe(2);

    v2Key = put.mock.calls[0]![1] as string;
    expect(v2Key).toMatch(
      /^media\/libro-c2b\/c1\/audiobook\/[0-9a-f]{16}\.m4a$/,
    );
    expect(v2Key).not.toBe(V1_KEY);

    // The pointer has not moved, and the offer is unchanged.
    const audioRow = await prisma.audio.findFirstOrThrow({
      where: { chapterId },
    });
    expect(audioRow.fileUrl).toBe(V1_KEY);

    const offer = await hybrid.listPublicForChapter(BOOK, 1);
    expect(offer.map((d) => d.mediaKey)).toEqual(["libro-c2b-c1-audiobook-v1"]);
    expect(offer[0]!.source).toEqual({ kind: "CHAPTER_AUDIO" });
  });

  it("publish freezes v1 to its exact bytes BEFORE moving the pointer", async () => {
    await service.publishStagedMaster(draftId);

    const audioRow = await prisma.audio.findFirstOrThrow({
      where: { chapterId },
    });
    expect(audioRow.fileUrl).toBe(v2Key);
    expect(audioRow.durationSeconds).toBe(660);

    // v1 no longer chases the pointer — it names the bytes it always played.
    const v1 = await hybrid.getExact("libro-c2b-c1-audiobook-v1");
    expect(v1!.source).toEqual({ kind: "R2", objectKey: V1_KEY });

    // v2 is the current master and resolves through Audio.
    const v2 = await hybrid.getExact("libro-c2b-c1-audiobook-v2");
    expect(v2!.source).toEqual({ kind: "CHAPTER_AUDIO" });
    expect(v2!.mediaVersion).toBe(2);
  });

  it("freezing changed the SOURCE and nothing else about v1", async () => {
    const v1 = await hybrid.getExact("libro-c2b-c1-audiobook-v1");

    // Not an editorial edit: the same version, representing the same bytes.
    expect(v1!.mediaKey).toBe("libro-c2b-c1-audiobook-v1");
    expect(v1!.mediaVersion).toBe(1);
    expect(v1!.title).toBe("Audiolibro · capítulo 1");
    expect(v1!.description).toBe("El máster original.");
    expect(v1!.durationSec).toBe(600);
    expect(v1!.accessPolicy).toBe("PRO_ONLY");
    expect(v1!.status).toBe("PUBLISHED");
  });

  it("completion identity: v1 keeps its own, v2 gets a distinct one", async () => {
    const k1 = chapterMediaCompletionIdempotencyKey(
      "libro-c2b-c1-audiobook-v1",
      1,
    );
    const k2 = chapterMediaCompletionIdempotencyKey(
      "libro-c2b-c1-audiobook-v2",
      2,
    );

    // Somebody who finished v1 still finished v1 — and has not finished v2.
    expect(k1).not.toBe(k2);
    expect(k1).toBe(
      chapterMediaCompletionIdempotencyKey("libro-c2b-c1-audiobook-v1", 1),
    );
  });

  it("the chapter offers ONE current audiobook, with v1 still resolvable", async () => {
    const offer = await hybrid.listPublicForChapter(BOOK, 1);
    const audiobooks = offer.filter((d) => d.kind === "AUDIOBOOK");

    // Both versions exist and both resolve; the reader is offered the current
    // one rather than a menu of every master ever recorded.
    expect(audiobooks.map((d) => d.mediaVersion).sort()).toEqual([1, 2]);
    expect(await hybrid.getExact("libro-c2b-c1-audiobook-v1")).not.toBeNull();
    expect(await hybrid.getExact("libro-c2b-c1-audiobook-v2")).not.toBeNull();
  });

  it("refuses to replace a legacy URL-backed master instead of breaking it", async () => {
    // A full URL cannot be frozen to an object key we do not have, and guessing
    // one would make the old version resolve to unverified bytes.
    await prisma.audio.updateMany({
      where: { chapterId },
      data: { fileUrl: "https://legacy.example/audio/old.mp3" },
    });
    const staged = await service.uploadAudiobook(
      BOOK,
      1,
      audio("otro-master"),
      700,
      adminId,
    );

    await expect(
      service.publishStagedMaster(staged.draftId),
    ).rejects.toMatchObject({
      response: { code: "AUDIOBOOK_LEGACY_MASTER_REQUIRES_MIGRATION" },
    });

    // And it refused without touching the pointer.
    const row = await prisma.audio.findFirstOrThrow({ where: { chapterId } });
    expect(row.fileUrl).toBe("https://legacy.example/audio/old.mp3");
  });
});

suite("Content Studio · podcast masters (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: MediaUploadService;
  let hybrid: HybridChapterMediaRepository;
  let put: ReturnType<typeof vi.fn>;
  let adminId: string;

  const DB2 = "c2b_podcast_db";

  beforeAll(async () => {
    const root = new Pool({ connectionString: base });
    await root.query(`DROP DATABASE IF EXISTS "${DB2}" WITH (FORCE)`);
    await root.query(`CREATE DATABASE "${DB2}"`);
    await root.end();

    const url = withDatabase(base as string, DB2);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const user = await prisma.user.create({
      data: { email: "c2b-pod@test.local", name: "Admin", role: "ADMIN" },
    });
    adminId = user.id;
    const book = await prisma.book.create({
      data: { slug: BOOK, title: "Libro C2B" },
    });
    await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });

    put = vi.fn().mockResolvedValue(undefined);
    service = new MediaUploadService(
      prisma as unknown as PrismaService,
      {
        putObject: put,
        deleteObject: vi.fn().mockResolvedValue(undefined),
      } as unknown as StorageService,
    );
    hybrid = new HybridChapterMediaRepository(
      new DatabaseChapterMediaRepository(prisma as unknown as PrismaService),
      new CodeChapterMediaDefinitionRepository(
        new ChapterMediaCatalogRegistry([]),
      ),
    );
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it("PODCAST_0 — a chapter starts with none", async () => {
    expect(await hybrid.listPublicForChapter(BOOK, 1)).toHaveLength(0);
  });

  it("PODCAST_1 — an uploaded episode stays private until published", async () => {
    const first = await service.uploadPodcast(
      BOOK,
      1,
      audio("episodio-uno"),
      { durationSec: 300, title: "Episodio 1", description: "El primero." },
      adminId,
    );

    // Staged, not published.
    expect(await hybrid.listPublicForChapter(BOOK, 1)).toHaveLength(0);

    await service.publishStagedMaster(first.draftId);
    const offer = await hybrid.listPublicForChapter(BOOK, 1);
    expect(offer).toHaveLength(1);
    expect(offer[0]!.title).toBe("Episodio 1");
    expect(offer[0]!.source?.kind).toBe("R2");
  });

  it("PODCAST_N — a second episode does not hide the first", async () => {
    const second = await service.uploadPodcast(
      BOOK,
      1,
      audio("episodio-dos"),
      { durationSec: 420, title: "Episodio 2", description: "El segundo." },
      adminId,
    );
    await service.publishStagedMaster(second.draftId);

    const offer = await hybrid.listPublicForChapter(BOOK, 1);
    expect(offer).toHaveLength(2);
    expect(offer.map((d) => d.title).sort()).toEqual([
      "Episodio 1",
      "Episodio 2",
    ]);
    // Independent identities, so completing one says nothing about the other.
    expect(new Set(offer.map((d) => d.mediaKey)).size).toBe(2);
  });

  it("never persists a public URL for a master", async () => {
    const rows = await prisma.chapterMediaVersion.findMany();
    const json = JSON.stringify(rows.map((r) => r.definitionJson));

    expect(json).not.toMatch(/https?:\/\//);
    expect(json).not.toContain("r2.dev");
    expect(json).not.toContain("X-Amz-Signature");
  });
});

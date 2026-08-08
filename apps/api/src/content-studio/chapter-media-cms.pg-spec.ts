import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChapterMediaAdminService } from "./chapter-media-admin.service";
import {
  ChapterMediaCatalogRegistry,
  EEC_C1_PODCAST,
  EEC_C1_VIDEO,
  validateChapterMediaDefinition,
} from "../lector/media/chapter-media.catalog";
import { CodeChapterMediaDefinitionRepository } from "../lector/media/chapter-media-definition.repository";
import { DatabaseChapterMediaRepository } from "../lector/media/database-chapter-media.repository";
import { HybridChapterMediaRepository } from "../lector/media/hybrid-chapter-media.repository";
import { chapterMediaCompletionIdempotencyKey } from "../lector/media/chapter-media-idempotency";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * C2A — administering media definitions, on real Postgres.
 *
 * The claims a mock cannot make honestly:
 *
 *   the `@@unique([mediaKey, editorialStatus])` constraint, which is what makes
 *   a published definition immutable rather than merely discouraged;
 *
 *   that a CMS draft is invisible to the runtime even while it holds a fully
 *   playable definition;
 *
 *   and the one that would be expensive to get wrong — that adopting a
 *   code-owned definition and publishing it leaves COMPLETION IDENTITY exactly
 *   where it was. `mediaKey + mediaVersion` is what a finished listen is keyed
 *   on, so if adoption moved either, everyone who already finished this podcast
 *   would quietly un-finish it.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cms_media_db";
const API_DIR = process.cwd();

const BOOK = "emociones-en-construccion";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("Content Studio · chapter media catalog (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let admin: ChapterMediaAdminService;
  let hybrid: HybridChapterMediaRepository;
  let adminUserId: string;

  /** What a reader's manifest would contain for this chapter. */
  async function publicOffer() {
    return hybrid.listPublicForChapter(BOOK, 1);
  }

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
      data: { email: "media-admin@test.local", name: "Admin", role: "ADMIN" },
    });
    adminUserId = user.id;
    const book = await prisma.book.create({
      data: { slug: BOOK, title: "Emociones en Construcción" },
    });
    await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });

    admin = new ChapterMediaAdminService(prisma as unknown as PrismaService);
    hybrid = new HybridChapterMediaRepository(
      new DatabaseChapterMediaRepository(prisma as unknown as PrismaService),
      new CodeChapterMediaDefinitionRepository(
        new ChapterMediaCatalogRegistry([EEC_C1_PODCAST, EEC_C1_VIDEO]),
      ),
    );
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it("starts empty — the table changes nothing until a row is published", async () => {
    expect(await prisma.chapterMediaVersion.count()).toBe(0);

    const offer = await publicOffer();
    expect(offer.map((d) => d.mediaKey)).toEqual([
      "eec-c1-podcast-v1",
      "eec-c1-video-v1",
    ]);
    expect(offer[0]!.title).toBe(EEC_C1_PODCAST.title);
  });

  it("adoption clones the definition and stays invisible to readers", async () => {
    const { draftId } = await admin.adopt(
      BOOK,
      1,
      "eec-c1-podcast-v1",
      adminUserId,
    );

    const row = await prisma.chapterMediaVersion.findUniqueOrThrow({
      where: { id: draftId },
    });
    expect(row.editorialStatus).toBe("DRAFT");
    expect(row.mediaKey).toBe("eec-c1-podcast-v1");
    expect(row.mediaVersion).toBe(1);

    // The clone is exact, provider reference included.
    expect(row.definitionJson).toEqual(EEC_C1_PODCAST);

    // And the reader sees precisely what they saw a moment ago.
    const offer = await publicOffer();
    expect(offer[0]!.title).toBe(EEC_C1_PODCAST.title);
    expect(await hybrid.getExact("eec-c1-podcast-v1")).toEqual(EEC_C1_PODCAST);
  });

  it("editing the draft still changes nothing public", async () => {
    const row = await prisma.chapterMediaVersion.findFirstOrThrow({
      where: { mediaKey: "eec-c1-podcast-v1" },
    });

    await admin.updateDraft(row.id, {
      title: "Podcast · capítulo 1 (edición del CMS)",
      description: "Una descripción reescrita desde Pulso.",
      durationSec: 61,
      chapters: [{ startSec: 0, label: "Apertura" }],
    });

    const offer = await publicOffer();
    expect(offer[0]!.title).toBe(EEC_C1_PODCAST.title);
    expect(offer[0]!.durationSec).toBe(EEC_C1_PODCAST.durationSec);
  });

  it("publishing swaps authority without moving identity", async () => {
    const row = await prisma.chapterMediaVersion.findFirstOrThrow({
      where: { mediaKey: "eec-c1-podcast-v1" },
    });
    const before = await hybrid.getExact("eec-c1-podcast-v1");

    await admin.publishDraft(row.id);

    const after = await hybrid.getExact("eec-c1-podcast-v1");
    expect(after!.title).toBe("Podcast · capítulo 1 (edición del CMS)");
    expect(after!.durationSec).toBe(61);

    // Same media, edited copy: key, version and the master itself are untouched.
    expect(after!.mediaKey).toBe(before!.mediaKey);
    expect(after!.mediaVersion).toBe(before!.mediaVersion);
    expect(after!.source).toEqual(before!.source);
    expect(after!.accessPolicy).toBe(before!.accessPolicy);
    expect(after!.status).toBe("PUBLISHED");

    const offer = await publicOffer();
    expect(offer.map((d) => d.mediaKey)).toEqual([
      "eec-c1-podcast-v1",
      "eec-c1-video-v1",
    ]);
    expect(offer[0]!.title).toBe("Podcast · capítulo 1 (edición del CMS)");
  });

  it("MEDIA_COMPLETION_IDENTITY_CHANGED=false — the P0 ratchet", async () => {
    // A listener who finished this podcast before the CMS existed must still
    // have finished the same thing now that the CMS owns it.
    const def = await hybrid.getExact("eec-c1-podcast-v1");
    const keyAfterAdoption = chapterMediaCompletionIdempotencyKey(
      def!.mediaKey,
      def!.mediaVersion,
    );
    const keyFromCode = chapterMediaCompletionIdempotencyKey(
      EEC_C1_PODCAST.mediaKey,
      EEC_C1_PODCAST.mediaVersion,
    );

    expect(keyAfterAdoption).toBe(keyFromCode);
  });

  it("refuses to edit or publish a published definition", async () => {
    const row = await prisma.chapterMediaVersion.findFirstOrThrow({
      where: { mediaKey: "eec-c1-podcast-v1" },
    });

    await expect(
      admin.updateDraft(row.id, {
        title: "Otro intento",
        description: "…",
        durationSec: null,
        chapters: [],
      }),
    ).rejects.toMatchObject({
      response: { code: "MEDIA_DEFINITION_PUBLISHED" },
    });

    await expect(admin.publishDraft(row.id)).rejects.toMatchObject({
      response: { code: "MEDIA_DEFINITION_PUBLISHED" },
    });
  });

  it("cannot mint a second published row for the same key", async () => {
    // The constraint is what makes immutability real rather than merely a
    // service-level rule somebody could route around.
    await expect(
      prisma.chapterMediaVersion.create({
        data: {
          mediaKey: "eec-c1-podcast-v1",
          mediaVersion: 1,
          bookSlug: BOOK,
          chapterOrder: 1,
          kind: "PODCAST",
          editorialStatus: "PUBLISHED",
          definitionJson: EEC_C1_PODCAST as unknown as object,
        },
      }),
    ).rejects.toThrow();
  });

  it("a corrupt row is skipped, not fatal to the chapter", async () => {
    await prisma.chapterMediaVersion.create({
      data: {
        mediaKey: "eec-c1-video-v1",
        mediaVersion: 1,
        bookSlug: BOOK,
        chapterOrder: 1,
        kind: "VIDEO",
        editorialStatus: "PUBLISHED",
        definitionJson: { nonsense: true } as unknown as object,
      },
    });

    const offer = await publicOffer();
    // The podcast survives, and the video falls back to its code definition.
    expect(offer.map((d) => d.mediaKey)).toEqual([
      "eec-c1-podcast-v1",
      "eec-c1-video-v1",
    ]);
    expect(offer[1]!.status).toBe("DRAFT");

    await prisma.chapterMediaVersion.deleteMany({
      where: { mediaKey: "eec-c1-video-v1" },
    });
  });

  it("announces a missing format as Coming Soon, with no master", async () => {
    const book2 = await prisma.book.create({
      data: { slug: "familias-ensambladas", title: "Familias" },
    });
    await prisma.chapter.create({
      data: { bookId: book2.id, order: 3, title: "C3" },
    });

    const { draftId, mediaKey } = await admin.createComingSoon(
      "familias-ensambladas",
      3,
      "PODCAST",
      "Podcast · capítulo 3",
      "Una conversación sobre el capítulo.",
      adminUserId,
    );
    expect(mediaKey).toBe("fe-c3-podcast-v1");

    const emptyRepo = new HybridChapterMediaRepository(
      new DatabaseChapterMediaRepository(prisma as unknown as PrismaService),
      new CodeChapterMediaDefinitionRepository(
        new ChapterMediaCatalogRegistry([]),
      ),
    );
    // Still a draft: nothing public.
    expect(
      await emptyRepo.listPublicForChapter("familias-ensambladas", 3),
    ).toHaveLength(0);

    await admin.publishDraft(draftId);

    const offer = await emptyRepo.listPublicForChapter(
      "familias-ensambladas",
      3,
    );
    expect(offer).toHaveLength(1);
    // Published, and honest: announced without pretending a file exists.
    expect(offer[0]!.status).toBe("DRAFT");
    expect(offer[0]!.source).toBeNull();
    expect(offer[0]!.accessPolicy).toBeNull();
  });

  it("a newer database version supersedes code in the offer", async () => {
    const v2 = validateChapterMediaDefinition({
      ...EEC_C1_PODCAST,
      mediaKey: "eec-c1-podcast-v2",
      mediaVersion: 2,
      title: "Podcast · capítulo 1 (v2)",
    });
    await prisma.chapterMediaVersion.create({
      data: {
        mediaKey: "eec-c1-podcast-v2",
        mediaVersion: 2,
        bookSlug: BOOK,
        chapterOrder: 1,
        kind: "PODCAST",
        editorialStatus: "PUBLISHED",
        definitionJson: v2 as unknown as object,
      },
    });

    const offer = await publicOffer();
    expect(offer[0]!.mediaVersion).toBe(2);

    // …and v1 stays resolvable, so an in-flight listen is never orphaned.
    expect((await hybrid.getExact("eec-c1-podcast-v1"))!.mediaVersion).toBe(1);
  });
});

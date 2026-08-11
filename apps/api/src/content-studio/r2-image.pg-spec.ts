import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillContentCore } from "../content-core/backfill";
import {
  publishDraftRevision,
  saveUnitDraft,
} from "../content-core/content-draft";
import { ContentStudioAssetsService } from "./content-studio-assets.service";
import { StorageService } from "../storage";

/**
 * Uploading an illustration for a chapter that has no legacy row, against REAL
 * object storage.
 *
 * The chapter-image path used to resolve through `Chapter`; it now resolves
 * through the manifest, and the only way to know that reaches storage rather
 * than merely type-checking is to send bytes. Runs only when both a scratch
 * database and R2 credentials are present, so CI — which has neither — skips it.
 */

const DB = "r2_image_smoke_db";
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const hasR2 = Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME,
);
const suite = hasDb && hasR2 ? describe : describe.skip;

// A 1×1 PNG. The smallest thing that is genuinely a PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

suite("R2 · illustrating a chapter with no legacy row", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let assets: ContentStudioAssetsService;
  let storage: StorageService;

  beforeAll(async () => {
    const base = process.env.TEST_DATABASE_URL as string;
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = new URL(base);
    url.pathname = `/${DB}`;
    execSync("pnpm exec prisma migrate deploy", {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url.toString() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    storage = new StorageService(new ConfigServiceStub() as never);
    assets = new ContentStudioAssetsService(prisma as never, storage as never);

    const book = await prisma.book.create({
      data: { slug: "libro-r2", title: "R2", plan: "PRO", totalChapters: 1 },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "Uno" },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: "Uno" },
    });
    await backfillContentCore(prisma);

    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: "libro-r2" },
    });
    const draft = await prisma.revision.findFirst({
      where: { editionId: edition.id, status: "DRAFT" },
      orderBy: { number: "desc" },
    });
    if (draft) await publishDraftRevision(prisma, edition.id, draft.id);

    // Chapter 2: native, no `Chapter` row anywhere.
    const published = await prisma.edition.findUniqueOrThrow({
      where: { id: edition.id },
    });
    const saved = await saveUnitDraft(prisma, {
      editionId: edition.id,
      expectedRevisionId: published.publishedRevisionId as string,
      unitKey: "native-illustrated",
      title: "Dos, nativo",
      placement: { order: 2, partNumber: null, partTitle: null },
      blocks: [{ kind: "PARAGRAPH", content: "Texto." }],
    });
    await publishDraftRevision(prisma, edition.id, saved.revisionId);
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("stores the bytes and scopes the key to that chapter", async () => {
    const result = await assets.uploadChapterImage("libro-r2", 2, {
      mimetype: "image/png",
      size: PNG.length,
      buffer: PNG,
    } as never);

    expect(result.imageUrl).toMatch(
      /\/content\/libro-r2\/chapter-2\/images\/[0-9a-f]{16}\.png$/,
    );
    // No legacy row was needed, and none was created.
    const book = await prisma.book.findUniqueOrThrow({
      where: { slug: "libro-r2" },
    });
    expect(await prisma.chapter.count({ where: { bookId: book.id } })).toBe(1);

    // Put back what it took. A smoke that leaves objects behind turns into
    // litter in somebody's bucket, one run at a time.
    const key = new URL(result.imageUrl).pathname.replace(/^\//, "");
    await storage.deleteObject(key);
  }, 120_000);
});

/** Reads the same env the app does, without booting Nest. */
class ConfigServiceStub {
  get(key: string) {
    return process.env[key];
  }
}

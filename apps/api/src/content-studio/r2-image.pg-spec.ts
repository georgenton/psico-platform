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
import { isAllowedAssetKey } from "../shared/content-asset";
import { StorageService } from "../storage";

/**
 * Uploading an illustration for a chapter that has no legacy row, against REAL
 * object storage.
 *
 * The chapter-image path used to resolve through `Chapter`; it now resolves
 * through the manifest, and the only way to know that reaches storage rather
 * than merely type-checking is to send bytes.
 *
 * OPT-IN, by an explicit flag rather than by sniffing for credentials. CI sets
 * placeholder R2 values so the app can boot, and a "are the variables set?"
 * guard reads those as real and tries to reach a bucket that does not exist.
 * Talking to an external service is something a run should have to ask for:
 *
 *   CONTENT_STUDIO_R2_SMOKE=1 pnpm --filter @psico/api pg:locks
 *
 * Deletes the object it uploaded, because a smoke that leaves files behind
 * becomes litter in somebody's bucket one run at a time.
 */

const DB = "r2_image_smoke_db";
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const optedIn = process.env.CONTENT_STUDIO_R2_SMOKE === "1";
const suite = hasDb && optedIn ? describe : describe.skip;

// A 1×1 JPEG. Smallest thing that is genuinely a JPEG — the format the
// production canary actually uploaded.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

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

  /**
   * The test the old smoke should have been.
   *
   * It proved a PUT succeeded and stopped there — which is exactly the gap the
   * production canary fell into: bytes landed, and the browser could not read
   * them. Nothing short of an unauthenticated GET that returns image bytes
   * proves this feature works.
   */
  async function uploadAndFetch(mimetype: string, bytes: Buffer, ext: string) {
    const result = await assets.uploadChapterImage("libro-r2", 2, {
      mimetype,
      size: bytes.length,
      buffer: bytes,
    } as never);

    // What is persisted is a stable path on our own API, not a bucket URL.
    expect(result.imageUrl).toMatch(
      new RegExp(
        `^/api/content-assets/content/libro-r2/chapter-2/images/[0-9a-f]{16}\\.${ext}$`,
      ),
    );

    const key = result.imageUrl.replace("/api/content-assets/", "");
    // The route's own decision, exercised rather than assumed.
    expect(isAllowedAssetKey(key)).toBe(true);

    // What the route would redirect to. Fetched with NO credentials and no
    // Authorization header — a browser following a 302 sends neither.
    const signed = await storage.getSignedUrl(key, 300);
    const res = await fetch(signed, { headers: {} });

    return { key, res };
  }

  it("serves a PNG to an unauthenticated GET", async () => {
    const { key, res } = await uploadAndFetch("image/png", PNG, "png");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(PNG.length);
    // Really the bytes we uploaded, not an XML error document.
    expect(body.subarray(0, 8)).toEqual(PNG.subarray(0, 8));

    await storage.deleteObject(key);
  }, 120_000);

  it("serves a JPEG to an unauthenticated GET", async () => {
    // The canary uploaded a JPG, so a PNG-only smoke would have missed the one
    // format a real editor actually used.
    const { key, res } = await uploadAndFetch("image/jpeg", JPEG, "jpg");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(JPEG.length);
    // SOI marker: this is a JPEG, not an error page with a 200.
    expect(body[0]).toBe(0xff);
    expect(body[1]).toBe(0xd8);

    await storage.deleteObject(key);
  }, 120_000);

  it("proves the raw bucket URL is NOT publicly readable", async () => {
    // The other half of the contract. If this ever starts returning 200 the
    // bucket has been made public and protected media is exposed.
    const { key } = await uploadAndFetch("image/png", PNG, "png");
    // Built from the account and bucket rather than `R2_PUBLIC_URL`, which in a
    // dev environment is a stub that resolves nowhere — and a DNS failure would
    // "prove" the bucket is private for the wrong reason.
    const origin = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

    const raw = await fetch(`${origin}/${process.env.R2_BUCKET_NAME}/${key}`, {
      headers: {},
    });
    expect(raw.status).not.toBe(200);

    await storage.deleteObject(key);
  }, 120_000);

  it("creates no legacy row to hold an image", async () => {
    const book = await prisma.book.findUniqueOrThrow({
      where: { slug: "libro-r2" },
    });
    expect(await prisma.chapter.count({ where: { bookId: book.id } })).toBe(1);
  });
});

/** Reads the same env the app does, without booting Nest. */
class ConfigServiceStub {
  get(key: string) {
    return process.env[key];
  }
}

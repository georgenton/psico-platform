import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../backfill";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";
import { readBookManifest, type BookManifest } from "./content-manifest";

/**
 * Content Core (CC-6A.1) — book manifest discovery, on Postgres 18.
 *
 * Seeds a 3-chapter book (parts + descriptions), reads its manifest BEFORE
 * backfill (legacy) and AFTER (content-core), and asserts: the core manifest is
 * complete + ordered; legacy↔core parity; a not-backfilled book falls back to
 * legacy; a DRAFT pointer / an edition without a published revision throw
 * CONTENT_CORE_INTEGRITY_ERROR; a retired unit never appears; reads perform zero
 * writes; BOOK_NOT_FOUND for an unknown slug. Own dedicated DB.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc6a1_manifest_db";
const API_DIR = process.cwd();
const SLUG = "manifest-book";
const EDITION_KEY = "manifest-book-1e";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite(
  "Content Core · CC-6A.1 book manifest discovery (real PostgreSQL)",
  () => {
    let prisma: PrismaClient;
    let pool: Pool;
    let editionId: string;
    let unitKeys: string[];
    let legacyManifest: BookManifest;
    let coreManifest: BookManifest;

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

      const book = await prisma.book.create({
        data: { slug: SLUG, title: "Manifest" },
      });
      const chapters = [
        { order: 1, title: "Uno", description: null },
        { order: 2, title: "Dos", description: "resumen del dos" },
        { order: 3, title: "Tres", description: null },
      ];
      const created = [];
      for (const c of chapters) {
        const ch = await prisma.chapter.create({
          data: {
            bookId: book.id,
            order: c.order,
            title: c.title,
            description: c.description,
            partNumber: 1,
            partTitle: "Parte uno",
          },
        });
        await prisma.chapterBlock.create({
          data: {
            chapterId: ch.id,
            order: 0,
            kind: "PARAGRAPH",
            content: `contenido ${c.order}`,
          },
        });
        created.push(ch);
      }
      unitKeys = created.map((c) => unitKeyFromLegacyChapterId(c.id));

      legacyManifest = await readBookManifest(prisma, SLUG); // pre-backfill
      await backfillContentCore(prisma);
      coreManifest = await readBookManifest(prisma, SLUG); // post-backfill

      const ed = await prisma.edition.findUnique({
        where: { editionKey: EDITION_KEY },
      });
      editionId = ed!.id;
    }, 180_000);

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
      if (pool) await pool.end();
      const admin = new Pool({ connectionString: base });
      await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
      await admin.end();
    });

    it("serves the complete, ordered content-core manifest", () => {
      expect(coreManifest.source).toBe("content-core");
      expect(coreManifest.editionKey).toBe(EDITION_KEY);
      expect(coreManifest.revisionNumber).toBe(1);
      expect(coreManifest.units.map((u) => u.order)).toEqual([1, 2, 3]);
      expect(coreManifest.units.map((u) => u.unitKey)).toEqual(unitKeys);
      expect(coreManifest.units[1].summary).toBe("resumen del dos");
      expect(coreManifest.units[0].partTitle).toBe("Parte uno");
    });

    it("falls back to a legacy manifest for a book never backfilled", async () => {
      const book = await prisma.book.create({
        data: { slug: "legacy-only", title: "Solo" },
      });
      await prisma.chapter.create({
        data: { bookId: book.id, order: 1, title: "L" },
      });
      const m = await readBookManifest(prisma, "legacy-only");
      expect(m.source).toBe("legacy");
      expect(m.editionKey).toBe("legacy-only-1e");
      expect(m.revisionNumber).toBeNull();
      expect(m.units).toHaveLength(1);
    });

    it("legacy and content-core manifests are identical (parity)", () => {
      expect(legacyManifest.source).toBe("legacy");
      expect(coreManifest.source).toBe("content-core");
      expect(coreManifest.editionKey).toBe(legacyManifest.editionKey);
      expect(coreManifest.units).toEqual(legacyManifest.units);
    });

    it("reads perform zero writes", async () => {
      const snapshot = async () => ({
        revisions: await prisma.revision.count(),
        revisionUnits: await prisma.revisionUnit.count(),
        contentUnits: await prisma.contentUnit.count(),
        chapters: await prisma.chapter.count(),
      });
      const before = await snapshot();
      await readBookManifest(prisma, SLUG);
      await readBookManifest(prisma, SLUG);
      expect(await snapshot()).toEqual(before);
    });

    it("BOOK_NOT_FOUND for an unknown slug", async () => {
      await expect(readBookManifest(prisma, "no-such-book")).rejects.toThrow(
        /BOOK_NOT_FOUND/,
      );
    });

    it("an edition with no published revision throws CONTENT_CORE_INTEGRITY_ERROR", async () => {
      const work = await prisma.work.create({
        data: { workKey: "inc-w", title: "Inc", authorName: "N" },
      });
      // The edition's key derives from the slug, so a book with that slug resolves
      // to this incomplete edition (publishedRevisionId is null).
      await prisma.edition.create({
        data: {
          workId: work.id,
          editionKey: "incomplete-book-1e",
          slug: "incomplete-book",
          label: "Inc",
        },
      });
      await expect(readBookManifest(prisma, "incomplete-book")).rejects.toThrow(
        /CONTENT_CORE_INTEGRITY_ERROR/,
      );
    });

    it("a retired unit (ContentUnit not in the published revision) never appears", async () => {
      await prisma.contentUnit.create({
        data: { editionId, unitKey: "retired-unit-cc6a1" },
      });
      const m = await readBookManifest(prisma, SLUG);
      expect(m.units.map((u) => u.unitKey)).not.toContain("retired-unit-cc6a1");
      expect(m.units).toHaveLength(3); // unchanged
    });

    // LAST — repoints Edition.publishedRevisionId at a DRAFT (irrecoverable).
    it("a DRAFT published pointer throws CONTENT_CORE_INTEGRITY_ERROR", async () => {
      const draft = await prisma.revision.create({
        data: { editionId, number: 99, status: "DRAFT" },
      });
      await prisma.edition.update({
        where: { id: editionId },
        data: { publishedRevisionId: draft.id },
      });
      await expect(readBookManifest(prisma, SLUG)).rejects.toThrow(
        /CONTENT_CORE_INTEGRITY_ERROR/,
      );
    });
  },
);

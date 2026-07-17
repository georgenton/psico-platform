import { execSync } from "node:child_process";
import {
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../backfill";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "../lib/block-key";
import { ContentAccessService } from "./content-access.service";
import { ContentReadService } from "../read/content-read.service";

/**
 * CC-6E — content access parity on real PostgreSQL 18.
 *
 * Proves the SAME FREE/PRO decision reaches every content surface (read unit,
 * marks GET, mark writes, manifest) and that Content Core keys don't bypass it:
 * knowing an editionKey/unitKey/blockKey never grants access. The decision is
 * identical whether the unit would be served from legacy or content-core, and a
 * corrupt core unit still surfaces as 500 for an ENTITLED reader.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc6e_access_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("Content Core · CC-6E access parity (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let access: ContentAccessService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let read: ContentReadService;

  const proEdition = "familias-ensambladas-1e";
  const freeEdition = "emociones-en-construccion-1e";
  let proUnitCh1 = "";
  let proUnitCh2 = "";
  let freeUnitCh2 = "";
  let proCh2BlockKey = "";
  let proCh2Id = ""; // legacy ChapterBlock id (for the legacy-path write test)

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    access = new ContentAccessService(prisma as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    read = new ContentReadService(prisma as any);

    // A PRO book (2 chapters) + a FREE book (2 chapters), each backfilled to
    // Content Core so unitKeys/blockKeys exist for the read + write paths.
    const proBook = await prisma.book.create({
      data: { slug: "familias-ensambladas", title: "Familias", plan: "PRO" },
    });
    const proCh1 = await prisma.chapter.create({
      data: { bookId: proBook.id, order: 1, title: "Uno" },
    });
    const proCh2 = await prisma.chapter.create({
      data: { bookId: proBook.id, order: 2, title: "Dos" },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: proCh1.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "P1",
      },
    });
    const proCh2Block = await prisma.chapterBlock.create({
      data: {
        chapterId: proCh2.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "P2",
      },
    });
    proCh2Id = proCh2Block.id;
    proCh2BlockKey = blockKeyFromLegacyId(proCh2Block.id);
    proUnitCh1 = unitKeyFromLegacyChapterId(proCh1.id);
    proUnitCh2 = unitKeyFromLegacyChapterId(proCh2.id);

    const freeBook = await prisma.book.create({
      data: {
        slug: "emociones-en-construccion",
        title: "Emociones",
        plan: "FREE",
      },
    });
    const freeCh1 = await prisma.chapter.create({
      data: { bookId: freeBook.id, order: 1, title: "Uno" },
    });
    const freeCh2 = await prisma.chapter.create({
      data: { bookId: freeBook.id, order: 2, title: "Dos" },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: freeCh1.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "F1",
      },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: freeCh2.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "F2",
      },
    });
    freeUnitCh2 = unitKeyFromLegacyChapterId(freeCh2.id);

    await backfillContentCore(prisma);
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("FREE + an allowed chapter → 200 (free preview of the PRO book's ch1; any FREE-book chapter)", async () => {
    await expect(
      access.assertCanReadUnit({
        userId: "u",
        userPlan: "FREE",
        editionKey: proEdition,
        unitKey: proUnitCh1,
      }),
    ).resolves.toBeUndefined();
    await expect(
      access.assertCanReadUnit({
        userId: "u",
        userPlan: "FREE",
        editionKey: freeEdition,
        unitKey: freeUnitCh2,
      }),
    ).resolves.toBeUndefined();
  });

  it("FREE + a PRO chapter via /content → 403 PRO_REQUIRED", async () => {
    await expect(
      access.assertCanReadUnit({
        userId: "u",
        userPlan: "FREE",
        editionKey: proEdition,
        unitKey: proUnitCh2,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("PRO + a PRO chapter → 200", async () => {
    await expect(
      access.assertCanReadUnit({
        userId: "u",
        userPlan: "PRO",
        editionKey: proEdition,
        unitKey: proUnitCh2,
      }),
    ).resolves.toBeUndefined();
  });

  it("manifest keys don't bypass: a FREE user with the manifest unitKey of a PRO chapter is denied", async () => {
    // The manifest itself is product-visible (book exists → allowed)…
    await expect(
      access.assertCanSeeBook({
        userId: "u",
        userPlan: "FREE",
        bookSlug: "familias-ensambladas",
      }),
    ).resolves.toBeUndefined();
    // …but its unitKey for chapter 2 still cannot open the content.
    await expect(
      access.assertCanReadUnit({
        userId: "u",
        userPlan: "FREE",
        editionKey: proEdition,
        unitKey: proUnitCh2,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("marks GET without entitlement → 403 (same policy as the read)", async () => {
    await expect(
      access.assertCanReadUnit({
        userId: "u",
        userPlan: "FREE",
        editionKey: proEdition,
        unitKey: proUnitCh2,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("highlight/annotation create without entitlement → 403, by blockKey AND legacy blockId (dual source)", async () => {
    await expect(
      access.assertCanWriteMark({
        userId: "u",
        userPlan: "FREE",
        blockKey: proCh2BlockKey,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      access.assertCanWriteMark({
        userId: "u",
        userPlan: "FREE",
        blockId: proCh2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // A PRO user may write either way.
    await expect(
      access.assertCanWriteMark({
        userId: "u",
        userPlan: "PRO",
        blockKey: proCh2BlockKey,
      }),
    ).resolves.toBeUndefined();
  });

  it("corruption still surfaces as 500 for an ENTITLED reader (access passes, read throws)", async () => {
    // Corrupt the PRO edition: keep the published pointer, but flip the pointed
    // revision to DRAFT. That's an integrity fault (a published pointer to
    // non-PUBLISHED content) — NOT merely an unpublished edition, which would
    // legally fall back to legacy. A PRO user (who passes the gate) must still
    // hit the fault loudly — never a masked success or a silent legacy serve.
    const edition = await prisma.edition.findUniqueOrThrow({
      where: { editionKey: proEdition },
    });
    const revisionId = edition.publishedRevisionId as string;
    await prisma.revision.update({
      where: { id: revisionId },
      data: { status: "DRAFT" },
    });
    try {
      await expect(
        access.assertCanReadUnit({
          userId: "u",
          userPlan: "PRO",
          editionKey: proEdition,
          unitKey: proUnitCh1,
        }),
      ).resolves.toBeUndefined(); // access is fine
      await expect(
        read.readUnit(proEdition, proUnitCh1),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    } finally {
      await prisma.revision.update({
        where: { id: revisionId },
        data: { status: "PUBLISHED" },
      });
    }
  });
});

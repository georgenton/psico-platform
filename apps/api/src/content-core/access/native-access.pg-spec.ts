import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";

import { ContentAccessService } from "./content-access.service";
import { resolveUnitTarget } from "./content-access";

/**
 * #580 — Content Core answers entitlement with no legacy rows at all.
 *
 * The whole point of the issue is that the old resolver could only work while
 * every unit came from a legacy Chapter: it parsed `-1e` off the edition key to
 * find a `Book.slug`, matched the unit key against `uuidv5(Chapter.id)`, and
 * read "free" off `Chapter.order === 1`. Content Studio is about to be able to
 * create a unit that has none of those, so this fixture builds exactly that and
 * proves the real service authorizes it.
 *
 * Deliberately hostile to every old assumption:
 *
 *   - the edition key is `book-2026-primary` — no `-1e`, nothing to slice;
 *   - there is NO Book row with that slug;
 *   - there is NO Chapter row for either unit;
 *   - the unit keys are ordinary strings, not uuidv5 of anything.
 *
 * If any legacy dependency were still mandatory, none of this could resolve.
 */

const DB = "cc580_native_access_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("#580 · entitlement without a single legacy row", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let access: ContentAccessService;

  /** Nothing about this key is legacy-shaped. */
  const EDITION_KEY = "book-2026-primary";
  const PREVIEW_UNIT = "unit-intro";
  const PAID_UNIT = "unit-deep";

  let editionId = "";
  let previewUnitId = "";
  let paidUnitId = "";
  let revisionId = "";

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
    access = new ContentAccessService(prisma as never);

    // A complete Content Core edition, built directly. No Book, no Chapter.
    const work = await prisma.work.create({
      data: { workKey: "work-2026", title: "Nativo", authorName: "Autora" },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: EDITION_KEY,
        slug: "nativo-2026",
        label: "Edición nativa",
        // The fact that used to live on `Book.plan`.
        accessPlan: "PRO",
      },
    });
    editionId = edition.id;

    const revision = await prisma.revision.create({
      data: { editionId, number: 1, status: "DRAFT" },
    });
    revisionId = revision.id;

    async function makeUnit(
      unitKey: string,
      isFreePreview: boolean,
      order: number,
    ) {
      const unit = await prisma.contentUnit.create({
        data: { editionId, unitKey, isFreePreview },
      });
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: `Título ${unitKey}` },
      });
      // A pure Content Core block: `legacyBlockId` stays null, because there is
      // no ChapterBlock anywhere in this fixture.
      const block = await prisma.contentBlock.create({
        data: { unitId: unit.id, blockKey: `bk-${unitKey}` },
      });
      await prisma.blockVersion.create({
        data: {
          contentBlockId: block.id,
          unitVersionId: version.id,
          order: 1,
          kind: "PARAGRAPH",
          content: `Texto de ${unitKey}.`,
          contentHash: `hash-${unitKey}`,
        },
      });
      await prisma.revisionUnit.create({
        data: { revisionId, unitId: unit.id, unitVersionId: version.id, order },
      });
      return unit.id;
    }

    previewUnitId = await makeUnit(PREVIEW_UNIT, true, 1);
    paidUnitId = await makeUnit(PAID_UNIT, false, 2);

    await prisma.revision.update({
      where: { id: revisionId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.edition.update({
      where: { id: editionId },
      data: { publishedRevisionId: revisionId },
    });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("the fixture really has no legacy rows to lean on", async () => {
    // Asserted, not assumed: if a Book or Chapter existed, every test below
    // could be passing through the old path without anyone noticing.
    expect(await prisma.book.count()).toBe(0);
    expect(await prisma.chapter.count()).toBe(0);
    expect(EDITION_KEY.endsWith("-1e")).toBe(false);
  });

  describe("resolution", () => {
    it("resolves the target from Content Core alone", async () => {
      const target = await resolveUnitTarget(prisma, EDITION_KEY, PAID_UNIT);
      expect(target.bookPlan).toBe("PRO");
      expect(target.isFreePreview).toBe(false);
      // No Book row exists, and the gate never needed one.
      expect(target.bookId).toBeNull();
    });

    it("knows which unit is the designated preview", async () => {
      const target = await resolveUnitTarget(prisma, EDITION_KEY, PREVIEW_UNIT);
      expect(target.isFreePreview).toBe(true);
    });

    it("still fails closed on an unknown edition or unit", async () => {
      await expect(
        resolveUnitTarget(prisma, "no-such-edition", PREVIEW_UNIT),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        resolveUnitTarget(prisma, EDITION_KEY, "no-such-unit"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("the entitlement decision", () => {
    const asFree = { userId: "u1", userPlan: "FREE", editionKey: EDITION_KEY };
    const asPro = { userId: "u2", userPlan: "PRO", editionKey: EDITION_KEY };

    it("lets a FREE reader open the designated preview", async () => {
      await expect(
        access.assertCanReadUnit({ ...asFree, unitKey: PREVIEW_UNIT }),
      ).resolves.toBeUndefined();
    });

    it("denies a FREE reader the gated unit", async () => {
      await expect(
        access.assertCanReadUnit({ ...asFree, unitKey: PAID_UNIT }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets a PRO reader open the gated unit", async () => {
      await expect(
        access.assertCanReadUnit({ ...asPro, unitKey: PAID_UNIT }),
      ).resolves.toBeUndefined();
    });

    it("knowing the keys grants nothing", async () => {
      // The keys are in the manifest, so they are not a secret. The decision has
      // to come from the edition's own plan, every time.
      await expect(
        access.assertCanReadUnit({ ...asFree, unitKey: PAID_UNIT }),
      ).rejects.toThrow("PRO_REQUIRED");
    });
  });

  describe("reordering does not move the paywall", () => {
    it("keeps the preview free and the paid unit paid after a swap", async () => {
      // THE reason the designation is a flag and not a position. Swapping the
      // manifest order is an editorial act; it must not hand a reader a PRO
      // chapter, and must not take away the one they were promised.
      await prisma.revisionUnit.updateMany({
        where: { revisionId, unitId: previewUnitId },
        data: { order: 99 },
      });
      await prisma.revisionUnit.updateMany({
        where: { revisionId, unitId: paidUnitId },
        data: { order: 1 },
      });

      const asFree = {
        userId: "u1",
        userPlan: "FREE",
        editionKey: EDITION_KEY,
      };

      // The preview moved to last place and is still free.
      await expect(
        access.assertCanReadUnit({ ...asFree, unitKey: PREVIEW_UNIT }),
      ).resolves.toBeUndefined();

      // The paid unit moved to FIRST place and is still paid. Under the old
      // positional rule this exact state would have given it away.
      await expect(
        access.assertCanReadUnit({ ...asFree, unitKey: PAID_UNIT }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Put the manifest back. `(revisionId, order)` is unique, so the slot has
      // to be vacated before it can be reoccupied — the same dance a real
      // reorder will have to do.
      await prisma.revisionUnit.updateMany({
        where: { revisionId, unitId: paidUnitId },
        data: { order: 2 },
      });
      await prisma.revisionUnit.updateMany({
        where: { revisionId, unitId: previewUnitId },
        data: { order: 1 },
      });
    });
  });

  describe("access metadata is server-owned", () => {
    it("a FREE edition gates nothing, and only the server can say so", async () => {
      // Flipping the edition's plan changes the decision — and the only way to
      // flip it is a server-side write. Nothing a client sends participates.
      await prisma.edition.update({
        where: { id: editionId },
        data: { accessPlan: "FREE" },
      });

      await expect(
        access.assertCanReadUnit({
          userId: "u1",
          userPlan: "FREE",
          editionKey: EDITION_KEY,
          unitKey: PAID_UNIT,
        }),
      ).resolves.toBeUndefined();

      await prisma.edition.update({
        where: { id: editionId },
        data: { accessPlan: "PRO" },
      });
    });
  });
});

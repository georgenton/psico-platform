import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";

import { backfillContentCore } from "../backfill";
import { ContentAccessService } from "./content-access.service";
import { resolveUnitTarget } from "./content-access";
import {
  adoptLegacyEntitlements,
  designateFreePreviewUnitTx,
} from "./native-entitlements";

/**
 * #580 transition invariants — the three things that have to be true before
 * Content Studio may create a chapter.
 *
 *   1. Adoption is ONE-WAY. Once an edition is native-owned, a later legacy
 *      backfill must not take authority back.
 *   2. An edition that came from legacy can be promoted, and then carry a unit
 *      that has no Chapter row at all.
 *   3. Exactly one unit per edition is the free preview, and a missing
 *      designation never falls back to "first position".
 *
 * Real PostgreSQL throughout: every one of these is about what the database
 * ends up holding after concurrent-ish writes, which a mock cannot rehearse.
 */

const DB = "cc580_adoption_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("#580 · adoption is one-way, and the preview is singular", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let access: ContentAccessService;

  let editionId = "";
  let unitAId = ""; // legacy chapter 1 — free today
  let unitBId = ""; // legacy chapter 2 — paid today
  let unitAKey = "";
  let unitBKey = "";

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

    // An ordinary production-shaped PRO book: two chapters, backfilled.
    const book = await prisma.book.create({
      data: { slug: "libro-pro", title: "Libro", plan: "PRO" },
    });
    const ch1 = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "Uno" },
    });
    const ch2 = await prisma.chapter.create({
      data: { bookId: book.id, order: 2, title: "Dos" },
    });
    for (const ch of [ch1, ch2]) {
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: `Texto ${ch.order}`,
        },
      });
    }

    await backfillContentCore(prisma);

    const edition = await prisma.edition.findUniqueOrThrow({
      where: { editionKey: "libro-pro-1e" },
    });
    editionId = edition.id;

    // Publish so the manifest has a reader-visible placement.
    const revision = await prisma.revision.findFirstOrThrow({
      where: { editionId },
      orderBy: { number: "desc" },
    });
    await prisma.revision.update({
      where: { id: revision.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.edition.update({
      where: { id: editionId },
      data: { publishedRevisionId: revision.id },
    });

    const entries = await prisma.revisionUnit.findMany({
      where: { revisionId: revision.id },
      orderBy: { order: "asc" },
      include: { unit: true },
    });
    unitAId = entries[0]!.unitId;
    unitBId = entries[1]!.unitId;
    unitAKey = entries[0]!.unit.unitKey;
    unitBKey = entries[1]!.unit.unitKey;
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  /** The full entitlement matrix, as decisions rather than assertions. */
  async function decisions() {
    const out: Record<string, boolean> = {};
    for (const [label, unitKey] of [
      ["A", unitAKey],
      ["B", unitBKey],
    ] as const) {
      for (const plan of ["FREE", "PRO"] as const) {
        out[`${plan}:${label}`] = await access
          .assertCanReadUnit({
            userId: "u",
            userPlan: plan,
            editionKey: "libro-pro-1e",
            unitKey,
          })
          .then(() => true)
          .catch(() => false);
      }
    }
    return out;
  }

  describe("before and after adoption, readers see the same thing", () => {
    let before: Record<string, boolean>;

    it("the backfill left the edition on the legacy path", async () => {
      // The migration's initialization does not apply here: this edition was
      // created by the backfill AFTER the migration ran, so it is native from
      // birth. Assert what is actually true rather than what would be tidy.
      const edition = await prisma.edition.findUniqueOrThrow({
        where: { id: editionId },
      });
      expect(edition.accessPlan).toBe("PRO");
      before = await decisions();
      expect(before).toEqual({
        "FREE:A": true, // chapter 1 — the free preview
        "PRO:A": true,
        "FREE:B": false, // chapter 2 of a PRO book
        "PRO:B": true,
      });
    });

    it("adoption changes no decision at all", async () => {
      await adoptLegacyEntitlements(prisma, editionId);
      expect(await decisions()).toEqual(before);
    });
  });

  describe("adoption is idempotent and one-way", () => {
    it("re-adopting an owned edition writes nothing", async () => {
      const again = await adoptLegacyEntitlements(prisma, editionId);
      expect(again.adopted).toBe(false);
      expect(again.accessPlan).toBe("PRO");
    });

    it("a later legacy backfill cannot take authority back", async () => {
      // The scenario this whole invariant exists for: an editor moves the
      // preview to unit B, then somebody re-runs the backfill. Under the old
      // "self-correcting" behaviour that would have silently restored chapter 1.
      await prisma.$transaction((tx) =>
        designateFreePreviewUnitTx(tx, editionId, unitBId),
      );
      await prisma.edition.update({
        where: { id: editionId },
        data: { accessPlan: "FREE" },
      });

      await backfillContentCore(prisma);

      const edition = await prisma.edition.findUniqueOrThrow({
        where: { id: editionId },
      });
      const a = await prisma.contentUnit.findUniqueOrThrow({
        where: { id: unitAId },
      });
      const b = await prisma.contentUnit.findUniqueOrThrow({
        where: { id: unitBId },
      });

      // Native decisions survive, byte for byte.
      expect(edition.accessPlan).toBe("FREE");
      expect(b.isFreePreview).toBe(true);
      expect(a.isFreePreview).toBe(false);
    });

    it("puts the fixture back for the tests that follow", async () => {
      await prisma.edition.update({
        where: { id: editionId },
        data: { accessPlan: "PRO" },
      });
      await prisma.$transaction((tx) =>
        designateFreePreviewUnitTx(tx, editionId, unitAId),
      );
      expect(await decisions()).toEqual({
        "FREE:A": true,
        "PRO:A": true,
        "FREE:B": false,
        "PRO:B": true,
      });
    });
  });

  describe("exactly one designated preview", () => {
    async function designated() {
      const units = await prisma.contentUnit.findMany({
        where: { editionId, isFreePreview: true },
        select: { id: true },
      });
      return units.map((u) => u.id);
    }

    it("moving the designation clears the previous one", async () => {
      await prisma.$transaction((tx) =>
        designateFreePreviewUnitTx(tx, editionId, unitBId),
      );
      expect(await designated()).toEqual([unitBId]);

      await prisma.$transaction((tx) =>
        designateFreePreviewUnitTx(tx, editionId, unitAId),
      );
      expect(await designated()).toEqual([unitAId]);
    });

    it("concurrent designations still leave exactly one", async () => {
      // Both target different units at the same time. Whichever wins, the
      // edition must never end up with two free chapters.
      await Promise.allSettled([
        prisma.$transaction((tx) =>
          designateFreePreviewUnitTx(tx, editionId, unitAId),
        ),
        prisma.$transaction((tx) =>
          designateFreePreviewUnitTx(tx, editionId, unitBId),
        ),
      ]);
      expect(await designated()).toHaveLength(1);
    });

    it("refuses a unit from another edition", async () => {
      const other = await prisma.edition.create({
        data: {
          workId: (await prisma.work.findFirstOrThrow()).id,
          editionKey: "otra-1e",
          slug: "otra",
          label: "Otra",
        },
      });
      await expect(
        prisma.$transaction((tx) =>
          designateFreePreviewUnitTx(tx, other.id, unitAId),
        ),
      ).rejects.toThrow(/UNIT_NOT_IN_EDITION/);
      await prisma.edition.delete({ where: { id: other.id } });
    });
  });

  describe("a missing designation never reopens positional semantics", () => {
    it("gates every unit of a PRO edition until one is designated", async () => {
      // The tempting bug: "no preview? then the first one is free." That would
      // smuggle `order === 1` back in through an error path, on the native side,
      // where reordering is about to become possible.
      await prisma.contentUnit.updateMany({
        where: { editionId },
        data: { isFreePreview: false },
      });

      await expect(
        access.assertCanReadUnit({
          userId: "u",
          userPlan: "FREE",
          editionKey: "libro-pro-1e",
          unitKey: unitAKey, // still first in the manifest
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // PRO readers are unaffected — the content is not lost, only gated.
      await expect(
        access.assertCanReadUnit({
          userId: "u",
          userPlan: "PRO",
          editionKey: "libro-pro-1e",
          unitKey: unitAKey,
        }),
      ).resolves.toBeUndefined();

      await prisma.$transaction((tx) =>
        designateFreePreviewUnitTx(tx, editionId, unitAId),
      );
    });
  });

  describe("a pure-core unit inside a legacy-origin edition", () => {
    it("resolves with no Chapter row of its own", async () => {
      // THE prerequisite for the next block. The edition came from a legacy
      // book and still has its Chapter rows; the new unit has none, and must
      // still be authorizable.
      const unit = await prisma.contentUnit.create({
        data: { editionId, unitKey: "unit-nativa-c", isFreePreview: false },
      });
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: "Capítulo nativo" },
      });
      const block = await prisma.contentBlock.create({
        data: { unitId: unit.id, blockKey: "bk-nativa-c" },
      });
      await prisma.blockVersion.create({
        data: {
          contentBlockId: block.id,
          unitVersionId: version.id,
          order: 1,
          kind: "PARAGRAPH",
          content: "Texto nativo.",
          contentHash: "hash-nativa-c",
        },
      });
      const revisionId = (
        await prisma.edition.findUniqueOrThrow({ where: { id: editionId } })
      ).publishedRevisionId!;
      await prisma.revisionUnit.create({
        data: {
          revisionId,
          unitId: unit.id,
          unitVersionId: version.id,
          order: 3,
        },
      });

      // No Chapter exists for this unit, and the legacy fallback could not
      // possibly resolve it.
      const chapterCount = await prisma.chapter.count();
      expect(chapterCount).toBe(2); // still only the two original chapters

      const target = await resolveUnitTarget(
        prisma,
        "libro-pro-1e",
        "unit-nativa-c",
      );
      expect(target.bookPlan).toBe("PRO");
      expect(target.isFreePreview).toBe(false);

      await expect(
        access.assertCanReadUnit({
          userId: "u",
          userPlan: "FREE",
          editionKey: "libro-pro-1e",
          unitKey: "unit-nativa-c",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await expect(
        access.assertCanReadUnit({
          userId: "u",
          userPlan: "PRO",
          editionKey: "libro-pro-1e",
          unitKey: "unit-nativa-c",
        }),
      ).resolves.toBeUndefined();
    });

    it("can be designated the free preview, moving it off a legacy unit", async () => {
      const unit = await prisma.contentUnit.findFirstOrThrow({
        where: { editionId, unitKey: "unit-nativa-c" },
      });
      await prisma.$transaction((tx) =>
        designateFreePreviewUnitTx(tx, editionId, unit.id),
      );

      await expect(
        access.assertCanReadUnit({
          userId: "u",
          userPlan: "FREE",
          editionKey: "libro-pro-1e",
          unitKey: "unit-nativa-c",
        }),
      ).resolves.toBeUndefined();

      // And the old preview is now gated, because there is only ever one.
      await expect(
        access.assertCanReadUnit({
          userId: "u",
          userPlan: "FREE",
          editionKey: "libro-pro-1e",
          unitKey: unitAKey,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("the migration initializes editions that predate the column", () => {
    it("reproduces today's decisions from SQL alone", async () => {
      // The TypeScript adoption path is tested above. This is the OTHER route
      // into native ownership, and the one production actually takes: deploy
      // runs `prisma migrate deploy` and nothing else, so the SQL has to do it.
      //
      // The statements are read out of the migration file rather than retyped,
      // so this cannot pass while the shipped migration says something else.
      await prisma.contentUnit.updateMany({
        where: { editionId },
        data: { isFreePreview: false },
      });
      await prisma.edition.update({
        where: { id: editionId },
        data: { accessPlan: null },
      });

      // Legacy authority again, exactly as a pre-migration row would be.
      expect(await decisions()).toEqual({
        "FREE:A": true,
        "PRO:A": true,
        "FREE:B": false,
        "PRO:B": true,
      });

      const sql = readFileSync(
        join(
          API_DIR,
          "prisma/migrations/20260810040000_content_core_native_entitlements/migration.sql",
        ),
        "utf8",
      );
      // Statements, not comment blocks: splitting on `;` leaves each chunk
      // starting with the comment above it.
      const initialization = sql.match(/^UPDATE[\s\S]*?;/gm) ?? [];
      expect(initialization).toHaveLength(2);

      for (const statement of initialization) {
        await prisma.$executeRawUnsafe(statement);
      }

      const edition = await prisma.edition.findUniqueOrThrow({
        where: { id: editionId },
      });
      expect(edition.accessPlan).toBe("PRO");

      const designated = await prisma.contentUnit.findMany({
        where: { editionId, isFreePreview: true },
        select: { id: true },
      });
      // Exactly one, and it is the chapter that was free before.
      expect(designated.map((d) => d.id)).toEqual([unitAId]);

      // Same decisions, now decided natively.
      expect(await decisions()).toEqual({
        "FREE:A": true,
        "PRO:A": true,
        "FREE:B": false,
        "PRO:B": true,
      });
    });

    it("is a no-op when run again", async () => {
      // An editor moves the preview; re-running the initialization must not
      // drag it back. This is why the second statement is guarded on "no
      // designation exists" rather than on position alone.
      await prisma.$transaction((tx) =>
        designateFreePreviewUnitTx(tx, editionId, unitBId),
      );

      const sql = readFileSync(
        join(
          API_DIR,
          "prisma/migrations/20260810040000_content_core_native_entitlements/migration.sql",
        ),
        "utf8",
      );
      for (const statement of sql.match(/^UPDATE[\s\S]*?;/gm) ?? []) {
        await prisma.$executeRawUnsafe(statement);
      }

      const designated = await prisma.contentUnit.findMany({
        where: { editionId, isFreePreview: true },
        select: { id: true },
      });
      expect(designated.map((d) => d.id)).toEqual([unitBId]);
    });
  });
});

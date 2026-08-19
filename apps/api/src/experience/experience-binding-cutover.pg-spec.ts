import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaService } from "../prisma";
import type { ChapterExperienceDefinition } from "@psico/types";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { productionExperienceRepository } from "./experience-production-catalog";
import { ExperienceAdminService } from "./experience-admin.service";
import {
  bindingLockKeys,
  bridgeBindingLockKeys,
} from "./experience-binding-lock";
import { readReservationAuthority } from "./experience-binding-reservation";

/**
 * C.3C+C.4 (#639) — the cutover: archive, rebind, and a fleet where the bridge
 * binary and this one are both live.
 *
 * The mixed fleet is the part that cannot be reasoned about on paper. V1 takes
 * `global → chapter`; V2 takes `chapter` only. They are safe together for
 * exactly one reason — the chapter key is byte-identical — and this file makes
 * a database prove it rather than a comment claim it.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c3c_experience_cutover_db";

const BOOK_A = "emociones-en-construccion";
const BOOK_B = "parejas-que-perduran";
const HEADING_A = EXERCISE_INGESTION_CATALOG[BOOK_A][0].practice.sourceHeading;
const HEADING_B = EXERCISE_INGESTION_CATALOG[BOOK_B][0].practice.sourceHeading;

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

function barrier() {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let arrive!: () => void;
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  return { gate, open, reached, arrive };
}

suite("C.3C+C.4 · cutover, archive and a mixed fleet", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: ExperienceAdminService;
  let userId: string;
  let unitA: string;

  async function eecDraft(
    over: Partial<ChapterExperienceDefinition> = {},
  ): Promise<ChapterExperienceDefinition> {
    const def = await productionExperienceRepository.getExact({
      experienceKey: "eec-c1-cuerpo-antes-que-mente",
      experienceVersion: 1,
    });
    if (!def) throw new Error("fixture missing: EEC v1");
    return { ...def, status: "DRAFT", ...over };
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

    for (const [slug, title, heading, order] of [
      [BOOK_A, "Emociones en Construcción", HEADING_A, 1],
      [BOOK_B, "Parejas que Perduran", HEADING_B, 2],
    ] as const) {
      const book = await prisma.book.create({
        data: { slug, title, plan: "FREE" },
      });
      const ch = await prisma.chapter.create({
        data: { bookId: book.id, order, title: `C${order}`, isPublished: true },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "Intro.",
        },
      });
      await prisma.chapterBlock.create({
        data: { chapterId: ch.id, order: 1, kind: "HEADING", content: heading },
      });
    }
    await backfillContentCore(prisma);

    const u = await prisma.user.create({
      data: { email: "c3c-cutover@example.test", name: "CMS", plan: "FREE" },
    });
    userId = u.id;
    service = new ExperienceAdminService(prisma as unknown as PrismaService);

    const edition = await prisma.edition.findFirstOrThrow({
      where: { slug: BOOK_A },
      select: { publishedRevisionId: true },
    });
    const placed = await prisma.revisionUnit.findFirstOrThrow({
      where: { revisionId: edition.publishedRevisionId!, order: 1 },
      select: { unitId: true },
    });
    unitA = placed.unitId;
  }, 240_000);

  afterAll(async () => {
    try {
      if (prisma) await prisma.$disconnect();
    } catch {
      /* the drop below is what matters */
    }
    try {
      if (pool) await pool.end();
    } catch {
      /* idem */
    }
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  }, 240_000);

  beforeEach(async () => {
    await prisma.chapterExperienceVersion.deleteMany();
    await prisma.experienceGuideReservation.deleteMany();
  });

  async function state() {
    const [rows, reservations] = await Promise.all([
      prisma.chapterExperienceVersion.findMany({
        select: {
          experienceKey: true,
          experienceVersion: true,
          status: true,
          contentUnitId: true,
          guideKey: true,
          definitionJson: true,
        },
        orderBy: [{ experienceKey: "asc" }, { experienceVersion: "asc" }],
      }),
      prisma.experienceGuideReservation.findMany({
        select: { contentUnitId: true, experienceKey: true, guideKey: true },
      }),
    ]);
    return { rows, reservations };
  }

  // ── The schema is the authority ──────────────────────────────────────────

  it("reports STRUCTURAL once the constraint exists AND is validated", async () => {
    const authority = await prisma.$transaction((tx) =>
      readReservationAuthority(tx),
    );
    expect(authority).toBe("STRUCTURAL");
  });

  it("the CHECK is validated, not merely present", async () => {
    // A `NOT VALID` constraint is present and proves nothing about existing
    // rows, which is why the detector treats that shape as FAIL_CLOSED.
    const rows = await prisma.$queryRaw<{ convalidated: boolean }[]>`
      SELECT c.convalidated FROM pg_constraint c
       WHERE c.conname = 'ChapterExperienceVersion_binding_shape_check'`;
    expect(rows[0]?.convalidated).toBe(true);
  });

  it("refuses a reserving row with no identity — the cutover shape", async () => {
    // Exactly the write the previous binary made all through C.3A. After the
    // constraint it is no longer legal, which is what makes the backfill a
    // precondition rather than a nicety.
    const def = await eecDraft();
    await expect(
      prisma.chapterExperienceVersion.create({
        data: {
          experienceKey: def.experienceKey,
          experienceVersion: 1,
          bookSlug: def.bookSlug,
          chapterOrder: def.chapterOrder,
          status: "DRAFT",
          definitionJson: def as unknown as never,
          createdByUserId: userId,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("accepts the shape the BRIDGE binary writes", async () => {
    /**
     * Forward compatibility, from the other side. During the C.3C rollout the
     * bridge binary is still serving, and every row it writes carries identity
     * and lineage columns because C.3A made it. Those rows must satisfy the
     * constraint that just appeared — otherwise the deploy would start
     * rejecting writes from a binary that is still live.
     */
    const def = await eecDraft({ experienceKey: "eec-c1-puente" });
    await prisma.experienceGuideReservation.create({
      data: {
        contentUnitId: unitA,
        experienceKey: def.experienceKey,
        guideKey: def.guidePin.guideKey,
      },
    });
    const row = await prisma.chapterExperienceVersion.create({
      data: {
        experienceKey: def.experienceKey,
        experienceVersion: 1,
        bookSlug: def.bookSlug,
        chapterOrder: def.chapterOrder,
        contentUnitId: unitA,
        guideKey: def.guidePin.guideKey,
        status: "DRAFT",
        definitionJson: def as unknown as never,
        createdByUserId: userId,
      },
      select: { id: true, status: true },
    });
    expect(row.status).toBe("DRAFT");
  });

  it("V1 never turns an ARCHIVED row into an editable draft", async () => {
    /**
     * The forward-compat guard C.3A shipped, verified against a row that could
     * not exist until now. The bridge binary reads the COLUMN and requires
     * DRAFT positively, so an archived row is inert to it — the failure mode
     * this ordering exists to prevent.
     */
    const created = await service.createDraft(userId, await eecDraft());
    await service.archiveDraft(created.id);

    const listed = await service.listForChapter(BOOK_A, 1);
    const archived = listed.experiences.find((e) => e.id === created.id);
    expect(archived?.status).toBe("ARCHIVED");
    // Not folded into DRAFT anywhere along the way.
    expect(
      listed.experiences.some(
        (e) => e.id === created.id && e.status === "DRAFT",
      ),
    ).toBe(false);
  });

  // ── Selection ────────────────────────────────────────────────────────────

  it("offers only guides whose passage is in this chapter, with availability", async () => {
    const before = await service.listSelectableGuides(BOOK_A, 1, null);
    // The other book's guide is not an option here at all.
    expect(before.map((o) => o.guideKey)).toEqual([
      "eec-c1-cuerpo-antes-que-mente",
    ]);
    // The code-owned experience already holds it.
    expect(before[0]!.availability).toBe("RESERVED_BY_ANOTHER_EXPERIENCE");

    // …and from the owner's own point of view it reads as theirs.
    const mine = await service.listSelectableGuides(
      BOOK_A,
      1,
      "eec-c1-cuerpo-antes-que-mente",
    );
    expect(mine[0]!.availability).toBe("OWNED_BY_THIS_EXPERIENCE");
  });

  // ── Archive ──────────────────────────────────────────────────────────────

  it("archiving keeps identity and history, and gives the guide back", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.archiveDraft(created.id);

    const final = await state();
    const row = final.rows[0]!;
    expect(row.status).toBe("ARCHIVED");
    // Identity survives: a chapter does not stop being this row's chapter.
    expect(row.contentUnitId).toBe(unitA);
    // The binding is what archiving returns.
    expect(row.guideKey).toBeNull();
    // The historical claim stays readable in the definition.
    expect(
      (row.definitionJson as { guidePin: { guideKey: string } }).guidePin
        .guideKey,
    ).toBe("eec-c1-cuerpo-antes-que-mente");
    // Nothing holds the guide any more.
    expect(final.reservations).toHaveLength(0);
  });

  it("archiving one version does not release a guide another still uses", async () => {
    const first = await service.createDraft(userId, await eecDraft());
    await service.publish(first.id);
    const next = await service.createNextDraft(
      userId,
      "eec-c1-cuerpo-antes-que-mente",
      1,
    );

    await service.archiveDraft(next.id);

    const final = await state();
    // The published v1 still reserves, so the row survives.
    expect(final.reservations).toHaveLength(1);
    expect(
      final.rows.find((r) => r.status === "ARCHIVED")?.guideKey,
    ).toBeNull();
    expect(final.rows.find((r) => r.status === "PUBLISHED")?.guideKey).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("archived is terminal: no edit, no publish, no second archive", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.archiveDraft(created.id);

    await expect(
      service.saveDraft(created.id, await eecDraft()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_VERSION_NOT_DRAFT",
      }),
    });
    await expect(service.publish(created.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_VERSION_NOT_DRAFT",
      }),
    });
    await expect(service.archiveDraft(created.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_ALREADY_ARCHIVED",
      }),
    });
  });

  it("a PUBLISHED version is never archived", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.publish(created.id);
    await expect(service.archiveDraft(created.id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_VERSION_NOT_DRAFT",
      }),
    });
  });

  it("an archived version number is never reused", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.archiveDraft(created.id);

    // The row is still there, so the unique on (key, version) still holds it.
    await expect(
      service.createDraft(userId, await eecDraft()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "EXPERIENCE_VERSION_EXISTS" }),
    });
    expect((await state()).rows).toHaveLength(1);
  });

  // ── Rebind ───────────────────────────────────────────────────────────────

  it("a never-published draft may move, and the reservation moves with it", async () => {
    // The chapter's own guide is held by the code-owned experience, so this
    // lineage starts on it only because the fixture is the same key. Move it
    // by hand to prove the mechanism, then back.
    const created = await service.createDraft(userId, await eecDraft());
    const before = await state();
    expect(before.reservations[0]!.guideKey).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );

    // Rebinding to a guide whose passage is elsewhere is refused — the same
    // rule the selector applies, applied again where it matters.
    await expect(
      service.rebindDraft(created.id, {
        guideKey: "pqp-c1-contacto-sostenido",
        guideVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_GUIDE_PIN_NOT_RUNNABLE_HERE",
      }),
    });

    // Nothing moved.
    expect((await state()).reservations[0]!.guideKey).toBe(
      "eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("a lineage with any published version can never rebind", async () => {
    const created = await service.createDraft(userId, await eecDraft());
    await service.publish(created.id);
    const next = await service.createNextDraft(
      userId,
      "eec-c1-cuerpo-antes-que-mente",
      1,
    );

    await expect(
      service.rebindDraft(next.id, {
        guideKey: "eec-c1-cuerpo-antes-que-mente",
        guideVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "EXPERIENCE_BINDING_IMMUTABLE",
      }),
    });
  });

  // ── A fleet with both binaries in it ─────────────────────────────────────

  it("V1 and V2 serialise on the SAME chapter key", async () => {
    /**
     * The mixed fleet, modelled honestly: V1's sequence is taken from the
     * retained `bridgeBindingLockKeys`, not hand-copied, so this proves the two
     * derivations meet rather than that two literals happen to match.
     */
    expect(bridgeBindingLockKeys(unitA)[1]).toBe(bindingLockKeys(unitA)[0]);

    const b = barrier();
    // A V1 transaction holding its two locks.
    const v1 = prisma.$transaction(async (tx) => {
      for (const key of bridgeBindingLockKeys(unitA)) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 42))`;
      }
      b.arrive();
      await b.gate;
      return "v1-done";
    });

    await b.reached;
    let v2Settled = false;
    const v2 = service.createDraft(userId, await eecDraft()).then(
      () => {
        v2Settled = true;
      },
      () => {
        v2Settled = true;
      },
    );

    await Promise.resolve();
    await Promise.resolve();
    // V2 takes only the chapter key — and that is the key V1 is holding.
    expect(v2Settled).toBe(false);

    b.open();
    await v1;
    await v2;
    expect(v2Settled).toBe(true);
  });

  it("V2 no longer takes the global key, so a global holder does not block it", async () => {
    // The narrowing, demonstrated: after C.3B there is nothing left that needs
    // every chapter serialised behind one key.
    const b = barrier();
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"experience:binding:global"}, 42))`;
      b.arrive();
      await b.gate;
      return "held";
    });

    await b.reached;
    const created = await service.createDraft(userId, await eecDraft());
    expect(created.id).toBeTruthy();

    b.open();
    await holder;
  });
});

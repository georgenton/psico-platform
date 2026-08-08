import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "./backfill";
import { backfillAnchors } from "./anchors";
import { ingestUnitV2, type IngestBlockInput } from "./ingest-v2";
import {
  describeEditionDraft,
  publishDraftRevision,
  saveUnitDraft,
} from "./content-draft";
import { unitKeyFromLegacyChapterId } from "./lib/block-key";

/**
 * Content Studio (Block A) — draft and publish as separate acts, on Postgres 18.
 *
 * Everything here is a claim a mock cannot make honestly: the edition lock, the
 * `@@unique([editionId, number])` constraint, the published-pointer swap, and
 * whether a reader's highlight is still attached to something after an editor
 * rewrites the paragraph under it.
 *
 * The invariant the whole vertical rests on is `DRAFT_NEVER_PUBLIC`: saving must
 * change nothing a reader can see, no matter how many times it happens.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cs_draft_db";
const API_DIR = process.cwd();

const ORIGINAL = "Un párrafo original que el lector ya conoce de memoria.";
const EDITED = "Un párrafo reescrito por el editor en el estudio de contenido.";
const SECOND = "Segundo bloque, completamente distinto del primero, dos.";
const CH2_ORIGINAL = "Capítulo dos, su párrafo inicial tal como se publicó.";
const CH2_EDITED = "Capítulo dos, reescrito después de tocar el capítulo uno.";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}
function p(content: string): IngestBlockInput {
  return { kind: "PARAGRAPH", content };
}

suite("Content Studio · draft lifecycle (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let editionId: string;
  let unitKey: string;
  let unit2Key: string;
  let highlightId: string;
  let annotationId: string;
  let anchoredBlockId: string;

  /** The unit's published block contents, as a reader would receive them. */
  async function publishedContent(key: string): Promise<string[]> {
    const ed = await prisma.edition.findUnique({ where: { id: editionId } });
    const ru = await prisma.revisionUnit.findFirst({
      where: { revisionId: ed!.publishedRevisionId!, unit: { unitKey: key } },
    });
    const bvs = await prisma.blockVersion.findMany({
      where: { unitVersionId: ru!.unitVersionId },
      orderBy: { order: "asc" },
    });
    return bvs.map((bv) => bv.content);
  }

  async function contentOfRevision(
    revisionId: string,
    key: string,
  ): Promise<string[]> {
    const ru = await prisma.revisionUnit.findFirst({
      where: { revisionId, unit: { unitKey: key } },
    });
    if (!ru) return [];
    const bvs = await prisma.blockVersion.findMany({
      where: { unitVersionId: ru.unitVersionId },
      orderBy: { order: "asc" },
    });
    return bvs.map((bv) => bv.content);
  }

  /** The revision an editor opening the book right now would be editing from. */
  async function currentBase(): Promise<string> {
    const draft = await prisma.revision.findFirst({
      where: { editionId, status: "DRAFT" },
      orderBy: { number: "desc" },
      select: { id: true },
    });
    if (draft) return draft.id;
    const ed = await prisma.edition.findUnique({ where: { id: editionId } });
    return ed!.publishedRevisionId!;
  }

  const placement = { order: 1, partNumber: null, partTitle: null };
  const placement2 = { order: 2, partNumber: null, partTitle: null };

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

    const user = await prisma.user.create({
      data: { email: "studio@test.local", name: "Studio" },
    });
    const book = await prisma.book.create({
      data: { slug: "studio-book", title: "Studio" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });
    const ch2 = await prisma.chapter.create({
      data: { bookId: book.id, order: 2, title: "C2" },
    });
    unitKey = unitKeyFromLegacyChapterId(ch.id);
    unit2Key = unitKeyFromLegacyChapterId(ch2.id);

    const b1 = await prisma.chapterBlock.create({
      data: {
        chapterId: ch.id,
        order: 0,
        kind: "PARAGRAPH",
        content: ORIGINAL,
      },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 1, kind: "PARAGRAPH", content: SECOND },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch2.id,
        order: 0,
        kind: "PARAGRAPH",
        content: CH2_ORIGINAL,
      },
    });

    // A reader's marks on the paragraph the editor is about to rewrite. Both
    // are synthetic; no real user content is involved.
    const h = await prisma.highlight.create({
      data: { userId: user.id, blockId: b1.id, startOffset: 0, endOffset: 3 },
    });
    highlightId = h.id;
    const a = await prisma.annotation.create({
      data: { userId: user.id, blockId: b1.id, text: "nota sintética" },
    });
    annotationId = a.id;

    await backfillContentCore(prisma);
    await backfillAnchors(prisma);

    const ed = await prisma.edition.findUnique({
      where: { editionKey: "studio-book-1e" },
    });
    editionId = ed!.id;

    const anchored = await prisma.highlight.findUnique({
      where: { id: highlightId },
      select: { contentBlockId: true },
    });
    anchoredBlockId = anchored!.contentBlockId!;
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("saves a draft without changing one word the reader receives", async () => {
    const before = await prisma.edition.findUnique({
      where: { id: editionId },
      select: { publishedRevisionId: true },
    });

    const saved = await saveUnitDraft(prisma, {
      editionId,
      expectedRevisionId: await currentBase(),
      unitKey,
      title: "C1",
      placement,
      blocks: [p(EDITED), p(SECOND)],
    });

    const after = await prisma.edition.findUnique({
      where: { id: editionId },
      select: { publishedRevisionId: true },
    });

    // The pointer did not move, so the reader is untouched.
    expect(after!.publishedRevisionId).toBe(before!.publishedRevisionId);
    expect(await publishedContent(unitKey)).toEqual([ORIGINAL, SECOND]);
    // …and the draft really does hold the new words.
    expect(await contentOfRevision(saved.revisionId, unitKey)).toEqual([
      EDITED,
      SECOND,
    ]);
  });

  it("accumulates a second chapter's edit on top of the first", async () => {
    // The property that makes a studio usable: editing chapter 2 must not
    // silently revert chapter 1 by rebasing onto the published revision.
    const saved = await saveUnitDraft(prisma, {
      editionId,
      expectedRevisionId: await currentBase(),
      unitKey: unit2Key,
      title: "C2",
      placement: placement2,
      blocks: [p(CH2_EDITED)],
    });

    expect(await contentOfRevision(saved.revisionId, unitKey)).toEqual([
      EDITED,
      SECOND,
    ]);
    expect(await contentOfRevision(saved.revisionId, unit2Key)).toEqual([
      CH2_EDITED,
    ]);
    // Still nothing public.
    expect(await publishedContent(unitKey)).toEqual([ORIGINAL, SECOND]);
  });

  it("keeps exactly one active draft, archiving the one it superseded", async () => {
    const drafts = await prisma.revision.findMany({
      where: { editionId, status: "DRAFT" },
    });
    const archived = await prisma.revision.findMany({
      where: { editionId, status: "ARCHIVED" },
    });

    expect(drafts).toHaveLength(1);
    // Two saves so far: the first draft was superseded, not deleted.
    expect(archived.length).toBeGreaterThanOrEqual(1);
  });

  it("allocates revision numbers without colliding with persisted drafts", async () => {
    const all = await prisma.revision.findMany({
      where: { editionId },
      select: { number: true },
    });
    const numbers = all.map((r) => r.number);

    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("publishes the draft, and only then does the reader see it", async () => {
    const draft = await prisma.revision.findFirst({
      where: { editionId, status: "DRAFT" },
      orderBy: { number: "desc" },
    });

    const published = await publishDraftRevision(prisma, editionId, draft!.id);

    expect(published.revisionId).toBe(draft!.id);
    expect(await publishedContent(unitKey)).toEqual([EDITED, SECOND]);
    expect(await publishedContent(unit2Key)).toEqual([CH2_EDITED]);

    const ed = await prisma.edition.findUnique({ where: { id: editionId } });
    expect(ed!.publishedRevisionId).toBe(draft!.id);
  });

  it("leaves the reader's highlight and annotation exactly where they were", async () => {
    // The paragraph they marked was rewritten and then published. The mark must
    // still exist and still point at the same stable block.
    const h = await prisma.highlight.findUnique({ where: { id: highlightId } });
    const a = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });
    const cb = await prisma.contentBlock.findUnique({
      where: { id: anchoredBlockId },
    });

    expect(h).not.toBeNull();
    expect(a).not.toBeNull();
    expect(cb).not.toBeNull();
    expect(h!.contentBlockId).toBe(anchoredBlockId);
  });

  it("keeps the superseded revision resolvable", async () => {
    const older = await prisma.revision.findFirst({
      where: { editionId, status: "ARCHIVED" },
      orderBy: { number: "asc" },
    });

    // Archived is not deleted: its manifest and content are still readable.
    expect(older).not.toBeNull();
    const content = await contentOfRevision(older!.id, unitKey);
    expect(content.length).toBeGreaterThan(0);
  });

  it("refuses to publish a revision that is no longer the active draft", async () => {
    const archived = await prisma.revision.findFirst({
      where: { editionId, status: "ARCHIVED" },
      orderBy: { number: "asc" },
    });

    await expect(
      publishDraftRevision(prisma, editionId, archived!.id),
    ).rejects.toThrow("CONTENT_DRAFT_NOT_ACTIVE");
  });

  it("retires a draft that an external ingest has overtaken", async () => {
    // An editor's draft, then a maintenance ingest that publishes something
    // else. The draft can no longer be published without dropping the ingest.
    const draft = await saveUnitDraft(prisma, {
      editionId,
      expectedRevisionId: await currentBase(),
      unitKey,
      title: "C1",
      placement,
      blocks: [p("Un borrador que quedará obsoleto.")],
    });

    await ingestUnitV2(prisma, {
      editionId,
      unitKey,
      title: "C1",
      placement,
      blocks: [p("Contenido publicado por un ingest de mantenimiento.")],
    });

    const after = await prisma.revision.findUnique({
      where: { id: draft.revisionId },
      select: { status: true },
    });
    expect(after!.status).toBe("ARCHIVED");

    // The ingest is what the reader gets, and it published atomically.
    expect(await publishedContent(unitKey)).toEqual([
      "Contenido publicado por un ingest de mantenimiento.",
    ]);
  });

  it("lets one concurrent save win and refuses the other outright", async () => {
    // Both tabs hold the SAME token, because both read the base before either
    // wrote. The lock decides who is first; the token decides that the second
    // does not get to overwrite them. Before the token existed this produced two
    // revisions, the later silently burying the earlier.
    const shared = await currentBase();
    const before = await prisma.revision.count({ where: { editionId } });

    const results = await Promise.allSettled([
      saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: shared,
        unitKey,
        title: "C1",
        placement,
        blocks: [p("Guardado concurrente número uno, texto suficiente.")],
      }),
      saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: shared,
        unitKey,
        title: "C1",
        placement,
        blocks: [p("Guardado concurrente número dos, texto suficiente.")],
      }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String((failed[0] as PromiseRejectedResult).reason)).toContain(
      "CONTENT_DRAFT_CONFLICT",
    );

    const all = await prisma.revision.findMany({
      where: { editionId },
      select: { number: true, status: true },
    });
    expect(all.length).toBe(before + 1);
    expect(new Set(all.map((r) => r.number)).size).toBe(all.length);
    expect(all.filter((r) => r.status === "DRAFT")).toHaveLength(1);
  });

  it("serialises a save racing a maintenance ingest", async () => {
    const before = await prisma.revision.count({ where: { editionId } });

    await Promise.allSettled([
      saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: await currentBase(),
        unitKey,
        title: "C1",
        placement,
        blocks: [p("Una edición del estudio compitiendo con un ingest.")],
      }),
      ingestUnitV2(prisma, {
        editionId,
        unitKey,
        title: "C1",
        placement,
        blocks: [p("Un ingest compitiendo con una edición del estudio.")],
      }),
    ]);

    const all = await prisma.revision.findMany({
      where: { editionId },
      select: { number: true, status: true },
    });
    const numbers = all.map((r) => r.number);
    const ed = await prisma.edition.findUnique({ where: { id: editionId } });
    const published = await prisma.revision.findUnique({
      where: { id: ed!.publishedRevisionId! },
      select: { status: true },
    });

    // The count is deliberately a RANGE, not an equality. When the ingest wins
    // the lock, the save that follows finds itself overtaken and is rejected as
    // stale WITHOUT writing anything — which is the behaviour we want, so a test
    // demanding two new revisions would be demanding the wrong thing.
    expect(all.length).toBeGreaterThanOrEqual(before + 1);
    expect(all.length).toBeLessThanOrEqual(before + 2);

    // What must hold either way: no number collision, a pointer that resolves to
    // a genuinely published revision, and never two open drafts.
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(published!.status).toBe("PUBLISHED");
    expect(all.filter((r) => r.status === "DRAFT").length).toBeLessThanOrEqual(
      1,
    );
  });

  describe("optimistic concurrency", () => {
    it("refuses a save from a tab whose base moved, and writes nothing", async () => {
      // Two tabs open the same chapter. One saves; the other must not be able to
      // overwrite work it never saw.
      const staleToken = await currentBase();

      await saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: staleToken,
        unitKey,
        title: "C1",
        placement,
        blocks: [p("Lo que guardó la primera pestaña, texto suficiente.")],
      });

      const before = await prisma.revision.count({ where: { editionId } });

      await expect(
        saveUnitDraft(prisma, {
          editionId,
          expectedRevisionId: staleToken,
          unitKey,
          title: "C1",
          placement,
          blocks: [p("Lo que intentó la segunda pestaña, ya obsoleto.")],
        }),
      ).rejects.toThrow("CONTENT_DRAFT_CONFLICT");

      // The refusal is total: no revision, no unit version, no block version.
      expect(await prisma.revision.count({ where: { editionId } })).toBe(
        before,
      );
    });

    it("lets the stale tab continue once it reloads", async () => {
      const fresh = await currentBase();

      const saved = await saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: fresh,
        unitKey,
        title: "C1",
        placement,
        blocks: [p("La segunda pestaña recargó y ahora sí guarda bien.")],
      });

      expect(saved.revisionId).not.toBe(fresh);
    });

    it("refuses a token that an external ingest has overtaken", async () => {
      const editorToken = await currentBase();

      await ingestUnitV2(prisma, {
        editionId,
        unitKey,
        title: "C1",
        placement,
        blocks: [p("Mantenimiento que adelanta al editor una vez más.")],
      });

      const before = await prisma.revision.count({ where: { editionId } });

      // The editor's draft was archived by the ingest, so their token no longer
      // names the base — the stale text cannot be resurrected.
      await expect(
        saveUnitDraft(prisma, {
          editionId,
          expectedRevisionId: editorToken,
          unitKey,
          title: "C1",
          placement,
          blocks: [p("Texto viejo del editor que no debe revivir.")],
        }),
      ).rejects.toThrow("CONTENT_DRAFT_CONFLICT");

      expect(await prisma.revision.count({ where: { editionId } })).toBe(
        before,
      );
    });
  });

  describe("edition-level draft description", () => {
    it("reports which chapters a draft would change", async () => {
      const base = await currentBase();
      await saveUnitDraft(prisma, {
        editionId,
        expectedRevisionId: base,
        unitKey: unit2Key,
        title: "C2",
        placement: placement2,
        blocks: [p("Sólo el capítulo dos cambia en este borrador.")],
      });

      const described = await describeEditionDraft(prisma, editionId);

      expect(described.draftRevisionId).not.toBeNull();
      expect(described.changedUnitKeys).toEqual([unit2Key]);
    });
  });
});

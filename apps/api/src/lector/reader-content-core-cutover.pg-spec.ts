import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../content-core/backfill";
import { backfillAnchors } from "../content-core/anchors";
import { ingestUnitV2 } from "../content-core/ingest-v2";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { readContentUnit } from "../content-core/read/content-read";
import { readUnitMarks } from "../content-core/read/content-marks";
import { resolveReaderChapter } from "./reader-chapter-resolver";

/**
 * El corte: cuándo deja Content Core de ser una copia y pasa a ser EL texto.
 *
 * Hasta ahora el lector servía `ChapterBlock` siempre que un capítulo legado
 * respaldara la unidad, así que una revisión publicada podía traer el texto
 * definitivo mientras el lector seguía mostrando el anterior — y nada lo decía.
 *
 * La regla es que el capítulo legado responde SOLO mientras siga siendo un
 * espejo fiel: todos los bloques publicados con `legacyBlockId`. La primera
 * ingesta introduce bloques que Content Core creó de cero, y a partir de ahí
 * manda Content Core. Esta suite lo demuestra sobre PostgreSQL real, con dos
 * capítulos, para poder afirmar también que el otro no se movió.
 *
 * Corre solo con TEST_DATABASE_URL (CI `test:locks`).
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "reader_cutover_db";
const API_DIR = process.cwd();

const A1 = "Capítulo uno, primer párrafo del piloto, con su texto original.";
const A2 = "Capítulo uno, segundo párrafo del piloto, distinto del anterior.";
const A3 = "Capítulo uno, tercer párrafo del piloto, cierra la muestra breve.";
const B1 = "Capítulo dos, párrafo único que nadie va a tocar en esta prueba.";

const FINAL_1 =
  "Definitivo: apertura reescrita por completo para la versión final.";
const FINAL_2 =
  "Definitivo: un segundo párrafo que tampoco estaba en el piloto.";

const withDatabase = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

suite("Lector · el corte a Content Core (PostgreSQL real)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let bookId: string;
  let editionId: string;
  let chapter1Id: string;
  let chapter2Id: string;
  let unitKey1: string;
  let unitKey2: string;
  let userId: string;
  let highlightId: string;
  let annotationId: string;
  let pilotRevisionId: string;

  const readerFor = (order: number) =>
    resolveReaderChapter(prisma, {
      bookId,
      bookSlug: "cutover-book",
      order,
    });

  const publish = (unitKey: string, blocks: string[], title: string) =>
    ingestUnitV2(prisma, {
      editionId,
      unitKey,
      title,
      placement: {
        order: unitKey === unitKey1 ? 1 : 2,
        partNumber: null,
        partTitle: null,
      },
      blocks: blocks.map((content) => ({ kind: "PARAGRAPH", content })),
    });

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
      data: { email: "cutover@test.local", name: "Cutover" },
    });
    userId = user.id;
    const book = await prisma.book.create({
      data: { slug: "cutover-book", title: "Cutover" },
    });
    bookId = book.id;

    const c1 = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "Piloto C1" },
    });
    chapter1Id = c1.id;
    unitKey1 = unitKeyFromLegacyChapterId(c1.id);
    const blocks: { id: string }[] = [];
    for (const [i, content] of [A1, A2, A3].entries()) {
      blocks.push(
        await prisma.chapterBlock.create({
          data: { chapterId: c1.id, order: i, kind: "PARAGRAPH", content },
        }),
      );
    }
    const c2 = await prisma.chapter.create({
      data: { bookId: book.id, order: 2, title: "Piloto C2" },
    });
    chapter2Id = c2.id;
    unitKey2 = unitKeyFromLegacyChapterId(c2.id);
    await prisma.chapterBlock.create({
      data: { chapterId: c2.id, order: 0, kind: "PARAGRAPH", content: B1 },
    });

    // Marcas del piloto sobre el segundo párrafo del capítulo 1.
    const h = await prisma.highlight.create({
      data: {
        userId,
        blockId: blocks[1].id,
        startOffset: 0,
        endOffset: 12,
      },
    });
    highlightId = h.id;
    const a = await prisma.annotation.create({
      data: { userId, blockId: blocks[1].id, text: "nota del piloto" },
    });
    annotationId = a.id;

    await backfillContentCore(prisma);
    await backfillAnchors(prisma);

    const ed = await prisma.edition.findUnique({
      where: { editionKey: "cutover-book-1e" },
    });
    editionId = ed!.id;
    pilotRevisionId = ed!.publishedRevisionId!;
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ── el estado de partida, para que los negativos signifiquen algo ─────────

  it("antes de ingerir, el espejo sigue intacto y el lector responde por el capítulo legado", async () => {
    const t = await readerFor(1);
    expect(t.source).toBe("legacy");
    expect(t.chapterId).toBe(chapter1Id);
  });

  // ── 1 · publicación nueva → lector nuevo ─────────────────────────────────

  it("publicar el texto definitivo cambia lo que el lector sirve", async () => {
    await publish(unitKey1, [FINAL_1, FINAL_2], "Definitivo C1");

    const t = await readerFor(1);
    expect(t.source).toBe("content-core");
    expect(t.contentUnitId).toBeTruthy();

    const unit = await readContentUnit(prisma, "cutover-book-1e", unitKey1);
    expect(unit.source).toBe("content-core");
    expect(unit.blocks.map((b) => b.content)).toEqual([FINAL_1, FINAL_2]);
    // Y el texto del piloto ya no está en lo que se sirve.
    expect(unit.blocks.some((b) => b.content === A1)).toBe(false);
  });

  it("sigue siendo el capítulo 1", async () => {
    const t = await readerFor(1);
    expect(t.order).toBe(1);
  });

  // ── 2 · revisión vieja preservada ────────────────────────────────────────

  it("la revisión del piloto sigue existiendo, con su texto", async () => {
    const old = await prisma.revision.findUnique({
      where: { id: pilotRevisionId },
    });
    expect(old).not.toBeNull();

    const ru = await prisma.revisionUnit.findFirst({
      where: { revisionId: pilotRevisionId, unit: { unitKey: unitKey1 } },
    });
    const bvs = await prisma.blockVersion.findMany({
      where: { unitVersionId: ru!.unitVersionId },
      orderBy: { order: "asc" },
    });
    expect(bvs.map((b) => b.content)).toEqual([A1, A2, A3]);

    // Y los ChapterBlock del piloto tampoco se han borrado.
    const legacy = await prisma.chapterBlock.count({
      where: { chapterId: chapter1Id },
    });
    expect(legacy).toBe(3);
  });

  // ── 3 · ningún otro capítulo cambia ──────────────────────────────────────

  it("el capítulo 2 sigue sirviéndose por su fila legada, sin tocar", async () => {
    const t = await readerFor(2);
    expect(t.source).toBe("legacy");
    expect(t.chapterId).toBe(chapter2Id);

    const unit = await readContentUnit(prisma, "cutover-book-1e", unitKey2);
    expect(unit.blocks.map((b) => b.content)).toEqual([B1]);
    // Todos sus bloques conservan origen legado: sigue siendo espejo.
    const ru = await prisma.revisionUnit.findFirst({
      where: {
        revisionId: (await prisma.edition.findUnique({
          where: { id: editionId },
        }))!.publishedRevisionId!,
        unit: { unitKey: unitKey2 },
      },
    });
    const nativeBlocks = await prisma.blockVersion.count({
      where: {
        unitVersionId: ru!.unitVersionId,
        contentBlock: { legacyBlockId: null },
      },
    });
    expect(nativeBlocks).toBe(0);
  });

  // ── 4 · reingesta no duplica ─────────────────────────────────────────────

  it("reingerir el mismo texto no duplica bloques ni crea identidades nuevas", async () => {
    const before = await readContentUnit(prisma, "cutover-book-1e", unitKey1);
    const beforeKeys = before.blocks.map((b) => b.blockKey);

    const res = await publish(unitKey1, [FINAL_1, FINAL_2], "Definitivo C1");

    const after = await readContentUnit(prisma, "cutover-book-1e", unitKey1);
    expect(after.blocks).toHaveLength(2);
    // Mismas identidades: el emparejador las lleva hacia adelante por hash.
    expect(after.blocks.map((b) => b.blockKey)).toEqual(beforeKeys);
    expect(res.blocksNew).toBe(0);
    expect(res.blocksMatched).toBe(2);

    // Y una unidad no acumula ContentBlock por reingerir.
    const unit = await prisma.contentUnit.findFirst({
      where: { editionId, unitKey: unitKey1 },
    });
    const total = await prisma.contentBlock.count({
      where: { unitId: unit!.id },
    });
    expect(total).toBe(5); // 3 del piloto (con lápida) + 2 definitivos
  });

  // ── 5 · las marcas no se desplazan ───────────────────────────────────────

  it("conserva las marcas del piloto en la base, sin reasignarlas a otro bloque", async () => {
    const h = await prisma.highlight.findUnique({ where: { id: highlightId } });
    const a = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });
    expect(h).not.toBeNull();
    expect(a).not.toBeNull();

    // Siguen apuntando al bloque del piloto que marcaron, no a uno nuevo.
    const pilotRu = await prisma.revisionUnit.findFirst({
      where: { revisionId: pilotRevisionId, unit: { unitKey: unitKey1 } },
    });
    const pilotBlockIds = (
      await prisma.blockVersion.findMany({
        where: { unitVersionId: pilotRu!.unitVersionId },
        select: { contentBlockId: true },
      })
    ).map((b) => b.contentBlockId);
    expect(pilotBlockIds).toContain(h!.contentBlockId);
    expect(pilotBlockIds).toContain(a!.contentBlockId);
  });

  it("no las muestra sobre el texto definitivo, que es otro párrafo", async () => {
    const unit = await readContentUnit(prisma, "cutover-book-1e", unitKey1);
    const marks = await readUnitMarks(
      prisma,
      userId,
      "cutover-book-1e",
      unitKey1,
    );
    const servedKeys = new Set(unit.blocks.map((b) => b.blockKey));

    // Esta es la regla que aplica el lector: solo se pinta lo que cae en un
    // bloque que se está sirviendo. El resto queda guardado y fuera de la página.
    const placed = marks.highlights.filter((m) => servedKeys.has(m.blockKey));
    expect(placed).toHaveLength(0);
    expect(marks.highlights).toHaveLength(1); // sigue existiendo
    expect(
      marks.annotations.filter((m) => servedKeys.has(m.blockKey)),
    ).toHaveLength(0);
    expect(marks.annotations).toHaveLength(1);
  });

  it("una marca sobre el texto definitivo SÍ se pinta", async () => {
    const unit = await readContentUnit(prisma, "cutover-book-1e", unitKey1);
    const first = unit.blocks[0];
    const created = await prisma.highlight.create({
      data: {
        userId,
        contentBlockId: (await prisma.contentBlock.findUnique({
          where: { blockKey: first.blockKey },
        }))!.id,
        blockVersionId: first.blockVersionId,
        startOffset: 0,
        endOffset: 10,
      },
    });

    const marks = await readUnitMarks(
      prisma,
      userId,
      "cutover-book-1e",
      unitKey1,
    );
    const servedKeys = new Set(unit.blocks.map((b) => b.blockKey));
    const placed = marks.highlights.filter((m) => servedKeys.has(m.blockKey));
    expect(placed.map((m) => m.id)).toEqual([created.id]);
    // El control: sin este caso, "0 marcas pintadas" pasaría también si el
    // lector hubiera dejado de pintar marcas del todo.
    expect(placed[0].blockKey).toBe(first.blockKey);
  });
});

import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../content-core/backfill";
import { backfillAnchors } from "../content-core/anchors";
import { ingestUnitV2 } from "../content-core/ingest-v2";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { LectorService } from "./lector.service";
import { resolveReaderChapter } from "./reader-chapter-resolver";
import { dropWhenIdle } from "../test/pg-drop";

/**
 * El corte, visto desde el avance de una persona.
 *
 * `reader-content-core-cutover.pg-spec.ts` ya demuestra que el lector cambia de
 * fuente cuando una ingesta rompe el espejo, y que las marcas sobreviven. Esta
 * suite pregunta lo que faltaba y no se puede responder contando filas: **¿qué
 * ve quien ya iba por la mitad?**
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 *
 * El avance está anclado a UNA de las dos identidades —el esquema declara
 * `chapterId` **o** `contentUnitId`, nunca los dos— y el camino nativo busca
 * por `(userId, contentUnitId)`. El día del corte no encuentra la fila legada,
 * así que la crea **a cero**.
 *
 * Medido en staging el 2026-11-13, antes de reabrir el capítulo 1 de EEC: 7
 * posiciones de lectura en ese capítulo, las siete con `contentUnitId` nulo, y
 * una con el capítulo **terminado** (85 %, 1 560 s, `completedAt` puesto). Sin
 * la siembra, esa persona habría abierto el capítulo que ya acabó y lo habría
 * visto sin empezar — con su fila intacta en la base. Contarla no bastaba.
 *
 * ── Y la vuelta atrás ──────────────────────────────────────────────────────
 *
 * La siembra es aditiva a propósito: **la fila legada no se toca**. Así, volver
 * a apuntar la revisión publicada a la anterior devuelve a la persona a su fila
 * de siempre, con sus cifras. Lo que NO vuelve es lo que se escribiera por la
 * vía nativa después del corte, y eso se comprueba aquí en vez de prometerse.
 *
 * Corre solo con TEST_DATABASE_URL (CI `test:locks`).
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "reader_cutover_progress_db";
const API_DIR = process.cwd();

const P1 = "Primer párrafo del piloto, por el que esta persona iba leyendo.";
const P2 = "Segundo párrafo del piloto, que la ingesta va a dejar fuera.";
const P3 = "Tercer párrafo del piloto, que sobrevive con su identidad.";
const FINAL_TITULAR = "Referencias";

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

suite("el corte conserva el avance de quien ya iba leyendo", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let lector: LectorService;
  let bookId: string;
  let chapterId: string;
  let unitKey: string;
  let editionId: string;
  let pilotRevisionId: string;
  let userId: string;
  let bloqueP1: string;
  let bloqueP2: string;

  const LEIDO = {
    progressPct: 85,
    timeSpentSec: 1560,
  };

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB);
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
    lector = new LectorService(
      prisma as never,
      { get: () => undefined } as never,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );

    const user = await prisma.user.create({
      data: { email: "corte@test.local", name: "Corte" },
    });
    userId = user.id;
    const book = await prisma.book.create({
      data: { slug: "corte-libro", title: "Corte", isPublished: true },
    });
    bookId = book.id;
    const c1 = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "Capítulo uno" },
    });
    chapterId = c1.id;
    unitKey = unitKeyFromLegacyChapterId(c1.id);

    const creados: { id: string }[] = [];
    for (const [i, content] of [P1, P2, P3].entries()) {
      creados.push(
        await prisma.chapterBlock.create({
          data: { chapterId: c1.id, order: i, kind: "PARAGRAPH", content },
        }),
      );
    }
    bloqueP1 = creados[0]!.id;
    bloqueP2 = creados[1]!.id;

    // El avance de siempre: anclado al capítulo LEGADO, terminado, y con el
    // sitio por el que iba apuntando a un bloque que sobrevive a la ingesta.
    await prisma.readingSession.create({
      data: {
        userId,
        chapterId: c1.id,
        lastBlockId: bloqueP1,
        progressPct: LEIDO.progressPct,
        timeSpentSec: LEIDO.timeSpentSec,
        completedAt: new Date("2026-11-01T10:00:00.000Z"),
      },
    });

    await backfillContentCore(prisma);
    await backfillAnchors(prisma);
    const ed = await prisma.edition.findUnique({
      where: { editionKey: "corte-libro-1e" },
    });
    editionId = ed!.id;
    pilotRevisionId = ed!.publishedRevisionId!;
  }, 240_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB);
    await admin.end();
  });

  // ── el estado de partida, para que lo de después signifique algo ──────────

  it("antes de la ingesta, el lector responde por el capítulo legado", async () => {
    const t = await resolveReaderChapter(prisma, {
      bookId,
      bookSlug: "corte-libro",
      order: 1,
    });
    expect(t.source).toBe("legacy");
  });

  it("y el avance que se presenta es el de siempre", async () => {
    const r = await lector.getChapter(userId, "PRO" as never, "corte-libro", 1);
    expect(r.session.progressPct).toBe(LEIDO.progressPct);
    expect(r.session.timeSpentSec).toBe(LEIDO.timeSpentSec);
    expect(r.session.completedAt).not.toBeNull();
    expect(r.session.lastBlockId).toBe(bloqueP1);
  });

  // ── el corte ──────────────────────────────────────────────────────────────

  it("una ingesta que renombra un bloque rompe el espejo", async () => {
    // Exactamente la forma de la limpieza editorial del capítulo 1 de EEC: un
    // encabezado renombrado —que la identidad no puede emparejar— y un bloque
    // retirado. El renombrado acuña un `ContentBlock` sin origen legado, y ése
    // es el momento en que Content Core deja de ser una copia.
    await ingestUnitV2(prisma, {
      editionId,
      unitKey,
      title: "Capítulo uno",
      placement: { order: 1, partNumber: null, partTitle: null },
      blocks: [
        { kind: "PARAGRAPH", content: P1 },
        { kind: "HEADING", content: FINAL_TITULAR },
        { kind: "PARAGRAPH", content: P3 },
      ],
    });

    const t = await resolveReaderChapter(prisma, {
      bookId,
      bookSlug: "corte-libro",
      order: 1,
    });
    expect(t.source).toBe("content-core");
  });

  // ── §6 · las seis comprobaciones ─────────────────────────────────────────

  it("1 · el progreso que se presenta es el que la persona tenía", async () => {
    const r = await lector.getChapter(userId, "PRO" as never, "corte-libro", 1);
    expect(r.session.progressPct).toBe(LEIDO.progressPct);
  });

  it("2 · el lugar desde el que continúa la lectura sigue resolviendo", async () => {
    const r = await lector.getChapter(userId, "PRO" as never, "corte-libro", 1);
    // Traducido al vocabulario que esta página direcciona: el cliente recibe
    // una clave que está entre los bloques servidos, no el id legado que no
    // encontraría.
    expect(r.session.lastBlockId).not.toBeNull();
    expect(r.blocks.map((b) => b.id)).toContain(r.session.lastBlockId);
    // Y es el MISMO párrafo, no «el primero que hubiera».
    const sitio = r.blocks.find((b) => b.id === r.session.lastBlockId);
    expect(sitio?.content).toBe(P1);
  });

  it("3 · el tiempo y el estado de completado se conservan", async () => {
    const r = await lector.getChapter(userId, "PRO" as never, "corte-libro", 1);
    expect(r.session.timeSpentSec).toBe(LEIDO.timeSpentSec);
    expect(r.session.completedAt).not.toBeNull();
  });

  it("4 · y la fila legada NO se tocó, que es lo que hace reversible el corte", async () => {
    const legada = await prisma.readingSession.findUnique({
      where: { userId_chapterId: { userId, chapterId } },
    });
    expect(legada).not.toBeNull();
    expect(legada!.progressPct).toBe(LEIDO.progressPct);
    expect(legada!.timeSpentSec).toBe(LEIDO.timeSpentSec);
    expect(legada!.completedAt).not.toBeNull();
    expect(legada!.lastBlockId).toBe(bloqueP1);
    // Y la nueva es otra fila, con la identidad nativa.
    const nativas = await prisma.readingSession.count({
      where: { userId, contentUnitId: { not: null } },
    });
    expect(nativas).toBe(1);
  });

  it("5 · un bloque retirado no deja el sitio apuntando a la nada", async () => {
    // La otra persona iba por el párrafo que la ingesta dejó fuera. Lo honesto
    // es no mandar ancla: la frase por la que iba no está en esta página.
    const otro = await prisma.user.create({
      data: { email: "otro@test.local", name: "Otro" },
    });
    await prisma.readingSession.create({
      data: {
        userId: otro.id,
        chapterId,
        lastBlockId: bloqueP2,
        progressPct: 40,
        timeSpentSec: 300,
      },
    });
    const r = await lector.getChapter(
      otro.id,
      "PRO" as never,
      "corte-libro",
      1,
    );
    // Las cifras sí viajan; el ancla no se inventa.
    expect(r.session.progressPct).toBe(40);
    expect(r.session.timeSpentSec).toBe(300);
    expect(r.session.lastBlockId).toBeNull();
  });

  it("6 · quien no tenía nada empieza a cero, sin heredar lo de otro", async () => {
    const nuevo = await prisma.user.create({
      data: { email: "nuevo@test.local", name: "Nuevo" },
    });
    const r = await lector.getChapter(
      nuevo.id,
      "PRO" as never,
      "corte-libro",
      1,
    );
    expect(r.session.progressPct).toBe(0);
    expect(r.session.timeSpentSec).toBe(0);
    expect(r.session.completedAt).toBeNull();
    expect(r.session.lastBlockId).toBeNull();
  });

  it("7 · una fila nativa EN BLANCO del hueco también se siembra", async () => {
    // La precondición de orden, cerrada en código en vez de sólo en el
    // runbook. Si la ingesta llega antes que este despliegue, quien abra el
    // capítulo en ese hueco deja una fila nativa a cero — y la siembra, si
    // sólo mirara «¿existe?», no volvería a mirarla nunca. La pérdida sería de
    // ida.
    const tardio = await prisma.user.create({
      data: { email: "hueco@test.local", name: "Hueco" },
    });
    await prisma.readingSession.create({
      data: {
        userId: tardio.id,
        chapterId,
        progressPct: 62,
        timeSpentSec: 700,
      },
    });
    // Lo que el hueco habría dejado: fila nativa sin nada registrado.
    const unidad = await prisma.contentUnit.findFirst({
      where: { blocks: { some: { legacyBlockId: { not: null } } } },
      select: { id: true },
    });
    await prisma.readingSession.create({
      data: { userId: tardio.id, contentUnitId: unidad!.id },
    });

    const r = await lector.getChapter(
      tardio.id,
      "PRO" as never,
      "corte-libro",
      1,
    );
    expect(r.session.progressPct).toBe(62);
    expect(r.session.timeSpentSec).toBe(700);

    // Y no duplica filas: siembra la que había.
    const nativas = await prisma.readingSession.count({
      where: { userId: tardio.id, contentUnitId: { not: null } },
    });
    expect(nativas).toBe(1);
  });

  it("8 · pero una fila nativa CON avance propio no se pisa", async () => {
    // El control contrario: quien ya leyó por la vía nativa tiene su avance, y
    // la siembra no lo sustituye por el legado.
    const avanzado = await prisma.user.create({
      data: { email: "avanzado@test.local", name: "Avanzado" },
    });
    await prisma.readingSession.create({
      data: {
        userId: avanzado.id,
        chapterId,
        progressPct: 10,
        timeSpentSec: 60,
      },
    });
    const unidad = await prisma.contentUnit.findFirst({
      where: { blocks: { some: { legacyBlockId: { not: null } } } },
      select: { id: true },
    });
    await prisma.readingSession.create({
      data: {
        userId: avanzado.id,
        contentUnitId: unidad!.id,
        progressPct: 77,
        timeSpentSec: 900,
      },
    });

    const r = await lector.getChapter(
      avanzado.id,
      "PRO" as never,
      "corte-libro",
      1,
    );
    expect(r.session.progressPct).toBe(77);
    expect(r.session.timeSpentSec).toBe(900);
  });

  // ── §6 · la vuelta atrás ──────────────────────────────────────────────────

  describe("volver atrás", () => {
    it("repuntar la revisión publicada devuelve el texto anterior", async () => {
      // El avance escrito por la vía nativa DESPUÉS del corte, para poder
      // decir con precisión qué vuelve y qué no.
      await prisma.readingSession.updateMany({
        where: { userId, contentUnitId: { not: null } },
        data: { progressPct: 99, timeSpentSec: 9999 },
      });

      await prisma.edition.update({
        where: { id: editionId },
        data: { publishedRevisionId: pilotRevisionId },
      });

      const t = await resolveReaderChapter(prisma, {
        bookId,
        bookSlug: "corte-libro",
        order: 1,
      });
      expect(t.source).toBe("legacy");
    });

    it("y con él el avance de siempre, intacto", async () => {
      const r = await lector.getChapter(
        userId,
        "PRO" as never,
        "corte-libro",
        1,
      );
      expect(r.session.progressPct).toBe(LEIDO.progressPct);
      expect(r.session.timeSpentSec).toBe(LEIDO.timeSpentSec);
      expect(r.session.completedAt).not.toBeNull();
      expect(r.session.lastBlockId).toBe(bloqueP1);
    });

    it("lo que NO vuelve es lo escrito por la vía nativa, y se dice", async () => {
      // La precondición de la vuelta atrás, como caso en vez de como promesa:
      // la fila nativa conserva su 99 % y nadie lo va a ver mientras el lector
      // responda por el camino legado. Volver a cortar lo recuperaría.
      const nativa = await prisma.readingSession.findFirst({
        where: { userId, contentUnitId: { not: null } },
      });
      expect(nativa!.progressPct).toBe(99);
      expect(nativa!.timeSpentSec).toBe(9999);
    });
  });
});

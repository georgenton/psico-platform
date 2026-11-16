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
import { openNativeReadingSession } from "./native-session-open";
import { dropWhenIdle } from "../test/pg-drop";

/**
 * La inicialización del avance nativo, con alguien escribiendo a la vez.
 *
 * `reader-cutover-progress.pg-spec.ts` ya demuestra que el corte conserva el
 * avance en los casos **secuenciales**: prepara el estado, abre, y mira. Esta
 * suite pregunta lo que esa forma no puede responder — **¿qué pasa cuando dos
 * cosas ocurren a la vez?** — y lo pregunta con dos conexiones de verdad a
 * PostgreSQL, no con un doble del método.
 *
 * ── Las dos intercalaciones ────────────────────────────────────────────────
 *
 *   1. **Dos primeras aperturas.** Las dos leen «no existe sesión» y las dos
 *      intentan crearla. Con `create` suelto, una gana y la otra se cae con
 *      P2002 — la fila sigue siendo una, pero a esa persona el capítulo no se
 *      le abre.
 *   2. **Una escritura durante la inicialización.** Entre comprobar que la fila
 *      está en blanco y escribir la semilla legada hay tres consultas. Un
 *      latido o un «capítulo terminado» que llegue en ese hueco quedaba
 *      sustituido después por las cifras legadas.
 *
 * ── Por qué hay costuras y por qué están declaradas ───────────────────────
 *
 * La ventana es de milisegundos, y una carrera que «casi siempre» falla no es
 * una regresión: sería una prueba que pasa cuando el código está roto. Así que
 * `openNativeReadingSession` acepta dos puntos de control —`afterRead` y
 * `beforeWrite`— que **sólo** usa esta suite; producción la llama sin ellos.
 *
 * Y la intercalación la escriben los **escritores reales**: `heartbeat` y
 * `completeChapter` del servicio, sobre la segunda conexión. Una protección que
 * esos dos no respeten no protege nada, así que se comprueba contra ellos y no
 * contra SQL escrito a mano.
 *
 * Corre solo con TEST_DATABASE_URL (CI `test:locks`).
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "native_session_concurrency_db";
const API_DIR = process.cwd();
const SLUG = "concurrencia-libro";

const P1 = "Primer párrafo, por el que esta persona iba leyendo.";
const P2 = "Segundo párrafo, que sobrevive a la ingesta.";
const FINAL_TITULAR = "Referencias";

/** Lo que la persona tenía en el capítulo legado, en todos los casos. */
const LEGADO = { progressPct: 0.85, timeSpentSec: 1560 };

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/**
 * Una cita a `n` bandas: nadie pasa hasta que han llegado todos.
 *
 * Es lo que convierte «dos peticiones casi simultáneas» en una intercalación
 * exacta, y por tanto lo que hace que el control por mutación sea determinista
 * en vez de probable.
 */
function cita(n: number): () => Promise<void> {
  let llegados = 0;
  let abrir!: () => void;
  const puerta = new Promise<void>((resolve) => {
    abrir = resolve;
  });
  return async () => {
    llegados += 1;
    if (llegados >= n) abrir();
    await puerta;
  };
}

suite("la inicialización del avance nativo, con escrituras simultáneas", () => {
  let poolA: Pool;
  let poolB: Pool;
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  let lectorA: LectorService;
  let lectorB: LectorService;
  let bookId: string;
  let chapterId: string;
  let unidadId: string;
  let claveServida: string;

  /** Alguien con avance en el capítulo legado y nada por la vía nativa. */
  async function conAvanceLegado(
    email: string,
    extra: { completedAt?: Date; lastBlockId?: string } = {},
  ): Promise<string> {
    const u = await prismaA.user.create({ data: { email, name: email } });
    await prismaA.readingSession.create({
      data: {
        userId: u.id,
        chapterId,
        progressPct: LEGADO.progressPct,
        timeSpentSec: LEGADO.timeSpentSec,
        ...extra,
      },
    });
    return u.id;
  }

  /** La fila nativa en blanco que dejan `startBook` o una visita en el hueco. */
  async function conFilaEnBlanco(userId: string): Promise<void> {
    await prismaA.readingSession.create({
      data: { userId, contentUnitId: unidadId },
    });
  }

  async function nativaDe(userId: string) {
    return prismaA.readingSession.findUnique({
      where: { userId_contentUnitId: { userId, contentUnitId: unidadId } },
    });
  }

  async function legadaDe(userId: string) {
    return prismaA.readingSession.findUnique({
      where: { userId_chapterId: { userId, chapterId } },
    });
  }

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

    // DOS conexiones, no dos clientes sobre el mismo pool: la intercalación que
    // hay que demostrar es entre peticiones concurrentes, y un pool compartido
    // podría serializarlas sin que nadie se enterase.
    poolA = new Pool({ connectionString: url });
    poolB = new Pool({ connectionString: url });
    prismaA = new PrismaClient({ adapter: new PrismaPg(poolA) });
    prismaB = new PrismaClient({ adapter: new PrismaPg(poolB) });
    const servicio = (p: PrismaClient) =>
      new LectorService(
        p as never,
        { get: () => undefined } as never,
        {} as never,
        new ContentAccessService(p as never) as never,
      );
    lectorA = servicio(prismaA);
    lectorB = servicio(prismaB);

    const book = await prismaA.book.create({
      data: { slug: SLUG, title: "Concurrencia", isPublished: true },
    });
    bookId = book.id;
    const c1 = await prismaA.chapter.create({
      data: { bookId: book.id, order: 1, title: "Capítulo uno" },
    });
    chapterId = c1.id;

    for (const [i, content] of [P1, P2].entries()) {
      await prismaA.chapterBlock.create({
        data: { chapterId: c1.id, order: i, kind: "PARAGRAPH", content },
      });
    }

    await backfillContentCore(prismaA);
    await backfillAnchors(prismaA);
    const ed = await prismaA.edition.findUnique({
      where: { editionKey: `${SLUG}-1e` },
    });

    // La misma forma que la limpieza editorial de C01: un encabezado nuevo que
    // la identidad no puede emparejar acuña un bloque sin origen legado, y con
    // eso Content Core deja de ser copia. Es lo que enciende el camino nativo.
    await ingestUnitV2(prismaA, {
      editionId: ed!.id,
      unitKey: unitKeyFromLegacyChapterId(c1.id),
      title: "Capítulo uno",
      placement: { order: 1, partNumber: null, partTitle: null },
      blocks: [
        { kind: "PARAGRAPH", content: P1 },
        { kind: "HEADING", content: FINAL_TITULAR },
        { kind: "PARAGRAPH", content: P2 },
      ],
    });

    const unidad = await prismaA.contentUnit.findFirst({
      where: { blocks: { some: { legacyBlockId: { not: null } } } },
      select: { id: true, blocks: { select: { blockKey: true }, take: 1 } },
    });
    unidadId = unidad!.id;
    claveServida = unidad!.blocks[0]!.blockKey;
  }, 240_000);

  afterAll(async () => {
    if (prismaA) await prismaA.$disconnect();
    if (prismaB) await prismaB.$disconnect();
    if (poolA) await poolA.end();
    if (poolB) await poolB.end();
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB);
    await admin.end();
  });

  // ── 1 · dos primeras aperturas ───────────────────────────────────────────

  it("dos primeras aperturas simultáneas abren la misma sesión, y ninguna falla", async () => {
    const userId = await conAvanceLegado("dos-aperturas@test.local");

    // Las dos leen «no existe», y las dos llegan a escribir a la vez.
    const puertaLectura = cita(2);
    const puertaEscritura = cita(2);
    const costuras = {
      afterRead: puertaLectura,
      beforeWrite: puertaEscritura,
    };

    const [a, b] = await Promise.all([
      openNativeReadingSession(
        prismaA,
        { userId, contentUnitId: unidadId },
        costuras,
      ),
      openNativeReadingSession(
        prismaB,
        { userId, contentUnitId: unidadId },
        costuras,
      ),
    ]);

    // Las DOS abren, y abren la misma.
    expect(a.id).toBe(b.id);

    // Sigue habiendo una sola sesión por persona y unidad.
    const nativas = await prismaA.readingSession.count({
      where: { userId, contentUnitId: { not: null } },
    });
    expect(nativas).toBe(1);

    // Y la siembra del corte entró: nadie había escrito nada.
    const fila = await nativaDe(userId);
    expect(fila!.progressPct).toBe(LEGADO.progressPct);
    expect(fila!.timeSpentSec).toBe(LEGADO.timeSpentSec);

    // La fila legada, intacta, que es lo que hace reversible el corte.
    const legada = await legadaDe(userId);
    expect(legada!.progressPct).toBe(LEGADO.progressPct);
    expect(legada!.timeSpentSec).toBe(LEGADO.timeSpentSec);
  });

  it("una ráfaga de aperturas simultáneas tampoco multiplica filas", async () => {
    const userId = await conAvanceLegado("rafaga@test.local");
    const puertaLectura = cita(4);
    const puertaEscritura = cita(4);
    const costuras = {
      afterRead: puertaLectura,
      beforeWrite: puertaEscritura,
    };

    const abiertas = await Promise.all([
      openNativeReadingSession(
        prismaA,
        { userId, contentUnitId: unidadId },
        costuras,
      ),
      openNativeReadingSession(
        prismaB,
        { userId, contentUnitId: unidadId },
        costuras,
      ),
      openNativeReadingSession(
        prismaA,
        { userId, contentUnitId: unidadId },
        costuras,
      ),
      openNativeReadingSession(
        prismaB,
        { userId, contentUnitId: unidadId },
        costuras,
      ),
    ]);

    expect(new Set(abiertas.map((s) => s.id)).size).toBe(1);
    const nativas = await prismaA.readingSession.count({
      where: { userId, contentUnitId: { not: null } },
    });
    expect(nativas).toBe(1);
  });

  // ── 2 · un latido durante la inicialización ──────────────────────────────

  it("un latido durante la inicialización se conserva, y la siembra no lo sustituye", async () => {
    const userId = await conAvanceLegado("latido@test.local");
    await conFilaEnBlanco(userId);

    // El escritor REAL, sobre la segunda conexión, exactamente en el hueco
    // entre «la fila está en blanco» y la escritura de la semilla.
    const abierta = await openNativeReadingSession(
      prismaA,
      { userId, contentUnitId: unidadId },
      {
        beforeWrite: async () => {
          const r = await lectorB.heartbeat(userId, {
            bookId,
            chapterOrder: 1,
            contentUnitId: unidadId,
            lastBlockId: claveServida,
            timeSpentDeltaSec: 30,
            progressPct: 0.1,
          });
          expect(r.ok).toBe(true);
        },
      },
    );

    // Lo que esa persona acaba de leer se conserva, y es lo que se le devuelve.
    expect(abierta.progressPct).toBeCloseTo(0.1, 6);
    expect(abierta.timeSpentSec).toBe(30);
    expect(abierta.lastBlockId).toBe(claveServida);

    // Y no es sólo lo devuelto: la fila dice lo mismo.
    const fila = await nativaDe(userId);
    expect(fila!.progressPct).toBeCloseTo(0.1, 6);
    expect(fila!.timeSpentSec).toBe(30);

    // La fila legada no se tocó.
    const legada = await legadaDe(userId);
    expect(legada!.progressPct).toBe(LEGADO.progressPct);
    expect(legada!.timeSpentSec).toBe(LEGADO.timeSpentSec);
  });

  // ── 3 · terminar el capítulo durante la inicialización ───────────────────

  it("y un «capítulo terminado» durante la inicialización tampoco se pierde", async () => {
    const userId = await conAvanceLegado("completado@test.local");
    await conFilaEnBlanco(userId);

    const abierta = await openNativeReadingSession(
      prismaA,
      { userId, contentUnitId: unidadId },
      {
        beforeWrite: async () => {
          const r = await lectorB.completeChapter(userId, SLUG, 1, unidadId);
          expect(r.ok).toBe(true);
        },
      },
    );

    // Terminado, no «sembrado al 85 %»: la semilla habría puesto 0.85 y 1560 s.
    expect(abierta.progressPct).toBe(1);
    expect(abierta.completedAt).not.toBeNull();
    expect(abierta.timeSpentSec).toBe(0);

    const fila = await nativaDe(userId);
    expect(fila!.progressPct).toBe(1);
    expect(fila!.completedAt).not.toBeNull();

    // La legada sigue SIN completar: terminar por la vía nativa no la toca.
    const legada = await legadaDe(userId);
    expect(legada!.completedAt).toBeNull();
    expect(legada!.progressPct).toBe(LEGADO.progressPct);
  });

  // ── 4 · los controles contrarios ─────────────────────────────────────────

  it("sin nadie escribiendo a la vez, la siembra del corte sigue entrando", async () => {
    // El control que impide «arreglar» esto no sembrando nunca.
    const userId = await conAvanceLegado("sin-carrera@test.local");
    await conFilaEnBlanco(userId);

    const abierta = await openNativeReadingSession(prismaA, {
      userId,
      contentUnitId: unidadId,
    });
    expect(abierta.progressPct).toBe(LEGADO.progressPct);
    expect(abierta.timeSpentSec).toBe(LEGADO.timeSpentSec);
  });

  it("y el sitio sembrado sigue traduciéndose a los bloques que se sirven", async () => {
    // El avance viaja, y el ancla llega en el vocabulario que esta página
    // direcciona. Lo comprueba el lector completo, no la función suelta.
    const bloqueLegado = await prismaA.chapterBlock.findFirst({
      where: { chapterId, content: P1 },
      select: { id: true },
    });
    const userId = await conAvanceLegado("posicion@test.local", {
      lastBlockId: bloqueLegado!.id,
    });

    const r = await lectorA.getChapter(userId, "PRO" as never, SLUG, 1);
    expect(r.session.progressPct).toBe(LEGADO.progressPct);
    expect(r.session.lastBlockId).not.toBeNull();
    expect(r.blocks.map((b) => b.id)).toContain(r.session.lastBlockId);
    const sitio = r.blocks.find((b) => b.id === r.session.lastBlockId);
    expect(sitio?.content).toBe(P1);
  });
});

import { execSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { backfillContentCore } from "../content-core/backfill";
import { materializableExercisePairs } from "../content-core/exercise-ingestion-catalog";
import {
  seedPracticeHeadings,
  seedRetiredPairExercises,
  seedRetiredPairHeadings,
} from "../content-core/test-support/seed-practice-headings";
import { preArchiveCheck } from "./experience-pre-archive";
import { GUIDE_READER_ANCHOR } from "@psico/types";

import { dropWhenIdle } from "../test/pg-drop";

/**
 * B4 / ADR 0026 — el procedimiento previo al archivado, contra PostgreSQL real.
 *
 * B2 midió, con su control negativo, que archivar el piloto **sin su reserva**
 * deja su identidad capturable: el intento de tomar su `guideKey` pasaba de
 * 409 a 201 en cuanto se borraba la fila. De ahí este procedimiento, y de ahí
 * que lo que más importe aquí sean las negativas y la concurrencia: una
 * comprobación previa que se equivoque en el sentido optimista es peor que no
 * tenerla, porque autoriza un archivado con los deberes sin hacer.
 *
 * Corre bajo `test:locks` (con `TEST_DATABASE_URL`); se salta si no está.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "b4_pre_archive_db";
const BOOK = "emociones-en-construccion";
const HEADING = materializableExercisePairs(BOOK)[0]!.practice.sourceHeading;

const PIN = {
  experienceKey: GUIDE_READER_ANCHOR.guideKey,
  experienceVersion: 1,
};

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

suite("B4 · comprobación previa al archivado (PostgreSQL real)", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let userId: string;
  let unitId: string;

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

    const book = await prisma.book.create({
      data: { slug: BOOK, title: "Emociones en Construcción", plan: "FREE" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1", isPublished: true },
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
      data: { chapterId: ch.id, order: 1, kind: "HEADING", content: HEADING },
    });
    await seedPracticeHeadings(prisma, ch.id, BOOK);
    // El piloto histórico: su par de ejercicios se siembra explícitamente,
    // porque esta suite describe el mundo en el que ese piloto YA se ingirió.
    await seedRetiredPairHeadings(prisma, BOOK);
    await backfillContentCore(prisma);
    await seedRetiredPairExercises(prisma, BOOK);

    const u = await prisma.user.create({
      data: { email: "b4-pre-archive@example.test", name: "QA", plan: "FREE" },
    });
    userId = u.id;

    const unidad = await prisma.contentUnit.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    unitId = unidad!.id;
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB);
    await admin.end();
  }, 60_000);

  beforeEach(async () => {
    await prisma.guideSession.deleteMany({});
    await prisma.experienceGuideReservation.deleteMany({});
  });

  /**
   * Una sesión que satisface `GuideSession_state_machine`: ACTIVE con cursor
   * y pasos por hacer, COMPLETED sin cursor y con todos hechos. Escribirla a
   * mano sin respetar esa invariante habría probado contra una fila que la
   * base real nunca aceptaría.
   */
  const sesion = (status: "ACTIVE" | "COMPLETED") =>
    prisma.guideSession.create({
      data: {
        userId,
        guideKey: PIN.experienceKey,
        guideVersion: 1,
        status,
        stepsCompleted: status === "COMPLETED" ? 3 : 1,
        totalSteps: 3,
        currentStepKey: status === "COMPLETED" ? null : "paso-1",
        ...(status === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });

  it("sin sesiones, una identidad del BUILD sigue necesitando su reserva", async () => {
    // B5 — la primera versión decía «nada que proteger» en cuanto esta base
    // no tenía sesiones, y eso daba por decidido en silencio que la clave
    // quedaba libre. El ADR 0026 fija la invariante sobre la IDENTIDAD, no
    // sobre los datos de una instalación: la misma clave viaja en cada
    // despliegue del build, y puede tener sesiones en bases que ésta no ve.
    const r = await preArchiveCheck(prisma, PIN);

    expect(r.verdict).toBe("NEEDS_RESERVATION");
    expect(r.sessions).toBe(0);
    expect(r.reservationExists).toBe(false);
  });

  it("con sesiones y sin reserva: archivar ahora dejaría la identidad libre", async () => {
    await sesion("COMPLETED");
    const r = await preArchiveCheck(prisma, PIN);

    expect(r.verdict).toBe("NEEDS_RESERVATION");
    expect(r.sessions).toBe(1);
    expect(r.applied).toBe(false);
    // Y en seco no escribe nada.
    expect(await prisma.experienceGuideReservation.count()).toBe(0);
  });

  it("con --apply crea la reserva y no toca las sesiones", async () => {
    const abierta = await sesion("ACTIVE");
    const r = await preArchiveCheck(prisma, PIN, true);

    expect(r.verdict).toBe("READY");
    expect(r.applied).toBe(true);
    const reservas = await prisma.experienceGuideReservation.findMany({});
    expect(reservas).toHaveLength(1);
    expect(reservas[0]).toMatchObject({
      experienceKey: PIN.experienceKey,
      guideKey: PIN.experienceKey,
      contentUnitId: unitId,
    });

    // La sesión, intacta: misma versión, mismo avance, mismo estado.
    const despues = await prisma.guideSession.findUnique({
      where: { id: abierta.id },
    });
    expect(despues).toMatchObject({
      guideVersion: abierta.guideVersion,
      status: "ACTIVE",
      stepsCompleted: abierta.stepsCompleted,
    });
  });

  it("volver a correrlo es un NOOP, no un error", async () => {
    await sesion("ACTIVE");
    await preArchiveCheck(prisma, PIN, true);
    const segunda = await preArchiveCheck(prisma, PIN, true);

    expect(segunda.verdict).toBe("READY");
    expect(segunda.applied).toBe(false);
    expect(await prisma.experienceGuideReservation.count()).toBe(1);
  });

  it("dos ejecuciones simultáneas crean UNA reserva, no dos ni un error", async () => {
    // La concurrencia que el encargo pide: si dos operadores lanzan el
    // procedimiento a la vez, el índice único decide y la segunda se encuentra
    // el trabajo hecho. Lo que no puede pasar es que una de las dos reviente
    // y deje a quien la lanzó creyendo que no se hizo.
    await sesion("ACTIVE");
    const [a, b] = await Promise.all([
      preArchiveCheck(prisma, PIN, true),
      preArchiveCheck(prisma, PIN, true),
    ]);

    expect(a.verdict).toBe("READY");
    expect(b.verdict).toBe("READY");
    expect([a.applied, b.applied].filter(Boolean).length).toBeLessThanOrEqual(
      2,
    );
    expect(await prisma.experienceGuideReservation.count()).toBe(1);
  });

  it("si la unidad ya reserva esa clave para otro linaje, se niega", async () => {
    // No se arregla aquí: es una contradicción editorial que alguien tiene
    // que mirar. Intentarlo y dejar que la base diga que no sería peor
    // diagnóstico que nombrarla.
    await sesion("ACTIVE");
    await prisma.experienceGuideReservation.create({
      data: {
        contentUnitId: unitId,
        experienceKey: "otro-linaje",
        guideKey: PIN.experienceKey,
      },
    });

    const r = await preArchiveCheck(prisma, PIN, true);
    expect(r.verdict).toBe("CONFLICT");
    expect(r.conflictingReservation).toMatchObject({
      experienceKey: "otro-linaje",
    });
    // Y no escribió: sigue habiendo una sola reserva, la ajena.
    expect(await prisma.experienceGuideReservation.count()).toBe(1);
  });

  it("una identidad que no existe no se inventa", async () => {
    const r = await preArchiveCheck(prisma, {
      experienceKey: "no-existe-esta-clave",
      experienceVersion: 1,
    });
    expect(r.verdict).toBe("UNRESOLVED");
    expect(await prisma.experienceGuideReservation.count()).toBe(0);
  });
});

/**
 * Y lo que la reserva protege, una vez creada: las pruebas negativas de
 * captura, contra los índices reales.
 */
suite("B4 · la reserva histórica impide capturar la identidad", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let unitId: string;
  const DB2 = "b4_pre_archive_capture_db";

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB2);
    await admin.query(`CREATE DATABASE "${DB2}"`);
    await admin.end();

    const url = withDatabase(base as string, DB2);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const book = await prisma.book.create({
      data: { slug: BOOK, title: "EEC", plan: "FREE" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1", isPublished: true },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: "x" },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 1, kind: "HEADING", content: HEADING },
    });
    // La ingesta ancla cada práctica a su encabezado editorial; sin ellos
    // `backfillContentCore` se niega, y con razón.
    await seedPracticeHeadings(prisma, ch.id, BOOK);
    await backfillContentCore(prisma);
    const unidad = await prisma.contentUnit.findFirst({ select: { id: true } });
    unitId = unidad!.id;

    await prisma.experienceGuideReservation.create({
      data: {
        contentUnitId: unitId,
        experienceKey: PIN.experienceKey,
        guideKey: PIN.experienceKey,
      },
    });
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB2);
    await admin.end();
  }, 60_000);

  it("otra experiencia no puede tomar su guideKey", async () => {
    await expect(
      prisma.experienceGuideReservation.create({
        data: {
          contentUnitId: unitId,
          experienceKey: "intruso",
          guideKey: PIN.experienceKey,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("y su experienceKey no puede apuntar a otra guía", async () => {
    await expect(
      prisma.experienceGuideReservation.create({
        data: {
          contentUnitId: unitId,
          experienceKey: PIN.experienceKey,
          guideKey: "otra-guia",
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("dos intentos simultáneos de captura fallan los dos", async () => {
    const intentos = await Promise.allSettled([
      prisma.experienceGuideReservation.create({
        data: {
          contentUnitId: unitId,
          experienceKey: "intruso-a",
          guideKey: PIN.experienceKey,
        },
      }),
      prisma.experienceGuideReservation.create({
        data: {
          contentUnitId: unitId,
          experienceKey: "intruso-b",
          guideKey: PIN.experienceKey,
        },
      }),
    ]);
    expect(intentos.every((i) => i.status === "rejected")).toBe(true);
  });

  it("control negativo — otro capítulo SÍ puede reservar la misma guía", async () => {
    // El candado es por unidad, y tiene que seguir siéndolo: si esto fallara,
    // la protección sería global y rompería capítulos que no tienen nada que
    // ver. Las negativas de arriba sólo significan algo con esto al lado.
    // Una segunda unidad en la MISMA edición, creada a mano: lo que esta
    // prueba necesita es otra unidad, no otra ingesta.
    const edicion = await prisma.contentUnit.findUnique({
      where: { id: unitId },
      select: { editionId: true },
    });
    const otra = await prisma.contentUnit.create({
      data: {
        editionId: edicion!.editionId,
        unitKey: "11111111-1111-5111-8111-111111111111",
      },
      select: { id: true },
    });

    await expect(
      prisma.experienceGuideReservation.create({
        data: {
          contentUnitId: otra!.id,
          experienceKey: PIN.experienceKey,
          guideKey: PIN.experienceKey,
        },
      }),
    ).resolves.toBeTruthy();
  });
});

/**
 * B5 — la carrera que producía un READY falso.
 *
 * `createMany({skipDuplicates})` salta ante CUALQUIER violación de unicidad,
 * y hay dos índices en juego. Un cero significaba, indistinguiblemente, «ya
 * estaba» y «otro se llevó la guía para otro linaje». La primera versión
 * respondía READY a las dos — un falso READY justo en el caso que este
 * procedimiento existe para evitar.
 *
 * Las dos carreras, por separado, contra PostgreSQL real.
 */
suite("B5 · dos escritores compitiendo", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let unitId: string;
  let userId: string;
  const DB3 = "b5_pre_archive_race_db";

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB3);
    await admin.query(`CREATE DATABASE "${DB3}"`);
    await admin.end();

    const url = withDatabase(base as string, DB3);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const book = await prisma.book.create({
      data: { slug: BOOK, title: "EEC", plan: "FREE" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1", isPublished: true },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: "x" },
    });
    await prisma.chapterBlock.create({
      data: { chapterId: ch.id, order: 1, kind: "HEADING", content: HEADING },
    });
    await seedPracticeHeadings(prisma, ch.id, BOOK);
    await seedRetiredPairHeadings(prisma, BOOK);
    await backfillContentCore(prisma);
    await seedRetiredPairExercises(prisma, BOOK);

    const u = await prisma.user.create({
      data: { email: "b5-race@example.test", name: "QA", plan: "FREE" },
    });
    userId = u.id;
    const unidad = await prisma.contentUnit.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    unitId = unidad!.id;
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB3);
    await admin.end();
  }, 60_000);

  beforeEach(async () => {
    await prisma.guideSession.deleteMany({});
    await prisma.experienceGuideReservation.deleteMany({});
    await prisma.guideSession.create({
      data: {
        userId,
        guideKey: PIN.experienceKey,
        guideVersion: 1,
        status: "ACTIVE",
        stepsCompleted: 1,
        totalSteps: 3,
        currentStepKey: "paso-1",
      },
    });
  });

  it("la MISMA reserva, dos veces a la vez: idempotente y las dos READY", async () => {
    const [a, b] = await Promise.all([
      preArchiveCheck(prisma, PIN, true),
      preArchiveCheck(prisma, PIN, true),
    ]);

    expect(a.verdict).toBe("READY");
    expect(b.verdict).toBe("READY");
    expect(await prisma.experienceGuideReservation.count()).toBe(1);
  });

  it("OTRO linaje ya tenía la guía: conflicto, no READY", async () => {
    // Esta la atrapa la lectura previa, y ya pasaba antes del arreglo de B5:
    // se comprobó quitando la relectura posterior y este caso siguió en
    // verde. Se queda porque describe el escenario de cabecera, pero **no es
    // el control negativo del fallo** — ése es el siguiente.
    await prisma.experienceGuideReservation.create({
      data: {
        contentUnitId: unitId,
        experienceKey: "otro-linaje-se-adelanto",
        guideKey: PIN.experienceKey,
      },
    });

    const r = await preArchiveCheck(prisma, PIN, true);

    expect(r.verdict).toBe("CONFLICT");
    expect(r.verdict).not.toBe("READY");
    expect(r.conflictingReservation).toMatchObject({
      experienceKey: "otro-linaje-se-adelanto",
    });
    // Y la reserva que hacía falta sigue sin existir: decirlo es el punto.
    expect(
      await prisma.experienceGuideReservation.findFirst({
        where: { experienceKey: PIN.experienceKey },
      }),
    ).toBeNull();
  });

  it("el conflicto que aparece ENTRE la lectura y la escritura", async () => {
    // El control negativo del fallo de B5, y el único de este archivo que
    // cae sin el arreglo: comprobado quitando la relectura posterior, este
    // caso —y sólo éste— pasó a fallar.
    //
    // La lectura previa no ve nada, así que el veredicto provisional sería
    // NEEDS_RESERVATION; el intruso entra justo después, `createMany` salta
    // por el índice `(unidad, guideKey)` y devuelve cero — indistinguible de
    // «ya estaba». Con el contador como fuente, eso era un READY falso.
    const original = prisma.experienceGuideReservation.createMany.bind(
      prisma.experienceGuideReservation,
    );
    let interceptado = false;
    (
      prisma.experienceGuideReservation as unknown as {
        createMany: typeof original;
      }
    ).createMany = (async (args: Parameters<typeof original>[0]) => {
      if (!interceptado) {
        interceptado = true;
        await prisma.experienceGuideReservation.create({
          data: {
            contentUnitId: unitId,
            experienceKey: "intruso-en-la-ventana",
            guideKey: PIN.experienceKey,
          },
        });
      }
      return original(args);
    }) as typeof original;

    try {
      const r = await preArchiveCheck(prisma, PIN, true);
      expect(r.verdict).toBe("CONFLICT");
      expect(r.conflictingReservation).toMatchObject({
        experienceKey: "intruso-en-la-ventana",
      });
    } finally {
      (
        prisma.experienceGuideReservation as unknown as {
          createMany: typeof original;
        }
      ).createMany = original;
    }
  });
});

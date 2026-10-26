import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { StorageService } from "../../storage";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../../test/e2e-app";
import { backfillContentCore } from "../../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../../content-core/exercise-ingestion-catalog";
import {
  EEC_C1_AUDIOBOOK,
  EEC_C1_PODCAST,
  EEC_C1_VIDEO,
} from "./chapter-media.catalog";
import { seedPracticeHeadings } from "../../content-core/test-support/seed-practice-headings";

import { dropWhenIdle } from "../../test/pg-drop";

/**
 * GR-2 — the chapter-media WIRE, end to end: real Nest app, real JWT, real
 * PostgreSQL, the PRODUCTIVE catalog.
 *
 * This spec is about the CONTRACT, not the lifecycle: the completion's
 * idempotency has its own pg-spec, and it is not repeated here. What is pinned
 * here is what a client actually receives —
 *
 *   - the manifest's exact shape, with no provider or storage field;
 *   - the access response as a real discriminated union carrying a URL;
 *   - `201 { created: true, replayed: false }` the first time and
 *     `200 { created: false, replayed: true }` on the replay;
 *   - a body with ANY property → `400 MEDIA_INVALID_PAYLOAD`, and zero rows.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "gr2_media_http_db";

const BOOK_SLUG = "emociones-en-construccion";
const AUDIOBOOK = EEC_C1_AUDIOBOOK.mediaKey;

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("GR-2 · chapter media HTTP contract (real app + real PostgreSQL)", () => {
  let h: E2EHarness;
  let prisma: PrismaClient;
  let pool: Pool;
  let token = "";

  const http = () => request(h.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const events = () => prisma.learningEvent.count();

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
      data: {
        slug: BOOK_SLUG,
        title: "Emociones en Construcción",
        isPublished: true,
        plan: "PRO",
      },
    });
    const chapter = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1", isPublished: true },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: chapter.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Intro.",
      },
    });
    // The backfill ingests the chapter's practice from its real heading; without
    // it there is no editorial unit for the completion to resolve against.
    await prisma.chapterBlock.create({
      data: {
        chapterId: chapter.id,
        order: 1,
        kind: "HEADING",
        content:
          EXERCISE_INGESTION_CATALOG[BOOK_SLUG][0].practice.sourceHeading,
      },
    });
    // The catalog says the audiobook is PUBLISHED with `source: CHAPTER_AUDIO`,
    // so the access path signs THIS row. A storage key, not a URL.
    await prisma.audio.create({
      data: {
        chapterId: chapter.id,
        title: "Audiolibro · capítulo 1",
        fileUrl: "audio/emociones-en-construccion/cap-1.m4a",
        durationSeconds: 1140,
      },
    });
    // Encabezados del catálogo de ejercicios, sembrados desde el catálogo.
    for (const c of await prisma.chapter.findMany({
      select: { id: true, bookId: true },
    })) {
      const bk = await prisma.book.findUnique({
        where: { id: c.bookId },
        select: { slug: true },
      });
      if (bk) await seedPracticeHeadings(prisma, c.id, bk.slug);
    }
    await backfillContentCore(prisma);

    const user = await prisma.user.create({
      data: { email: "gr2-http@example.test", name: "PRO", plan: "PRO" },
    });

    h = await createE2EApp({ prisma });
    const jwt = h.app.get(JwtService);
    token = jwt.sign({
      sub: user.id,
      email: user.email,
      ar: user.authRevision,
    });
  }, 180_000);

  afterAll(async () => {
    // Guarded: when setup throws, the harness never existed and the teardown
    // error would bury the real failure.
    if (h) await closeE2EApp(h);
    await prisma?.$disconnect();
    await pool?.end();
  });

  beforeEach(async () => {
    await prisma.learningEvent.deleteMany();
  });

  // ── The two reads ────────────────────────────────────────────────────────

  it("the manifest answers the exact documented shape", async () => {
    const res = await http()
      .get(`/api/lector/${BOOK_SLUG}/1/media`)
      .set(auth())
      .expect(200);

    expect(Object.keys(res.body).sort()).toEqual([
      "bookSlug",
      "chapterOrder",
      "items",
    ]);
    expect(res.body.bookSlug).toBe(BOOK_SLUG);
    expect(res.body.chapterOrder).toBe(1);

    const items = res.body.items as {
      mediaKey: string;
      availability: string;
    }[];
    const byKey = Object.fromEntries(items.map((i) => [i.mediaKey, i]));
    expect(Object.keys(byKey).sort()).toEqual(
      [AUDIOBOOK, EEC_C1_PODCAST.mediaKey, EEC_C1_VIDEO.mediaKey].sort(),
    );

    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual([
        "availability",
        "chapters",
        "description",
        "durationSec",
        "hasCaptions",
        "hasTranscript",
        "kind",
        "mediaKey",
        "mediaVersion",
        "title",
      ]);
    }
    expect(byKey[AUDIOBOOK].availability).toBe("AVAILABLE");
    // Announced, not produced — and the API says so instead of showing a player.
    expect(byKey[EEC_C1_VIDEO.mediaKey].availability).toBe("COMING_SOON");

    // The manifest signs nothing and names no provider.
    const serialized = JSON.stringify(res.body);
    for (const term of ["objectKey", "videoUid", "accessPolicy", "provider"]) {
      expect(serialized.includes(term), term).toBe(false);
    }
  });

  it("access answers the audio branch of the union, with a URL", async () => {
    const res = await http()
      .get(`/api/lector/media/${AUDIOBOOK}/access`)
      .set(auth())
      .expect(200);

    expect(Object.keys(res.body).sort()).toEqual([
      "expiresAt",
      "kind",
      "mediaKey",
      "mediaVersion",
      "posterUrl",
      "transcriptUrl",
      "url",
    ]);
    expect(res.body.kind).toBe("AUDIOBOOK");
    expect(res.body.mediaKey).toBe(AUDIOBOOK);
    expect(typeof res.body.url).toBe("string");
    expect(Number.isNaN(Date.parse(res.body.expiresAt))).toBe(false);

    // The video branch's field never leaks into the audio branch.
    expect(res.body).not.toHaveProperty("embedUrl");
    expect(res.body).not.toHaveProperty("defaultTextTrack");

    // Never cached: the URL is a bearer.
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  // ── The command ──────────────────────────────────────────────────────────

  it("answers 201 the first time and 200 on the replay, with the same shape", async () => {
    const fresh = await http()
      .post(`/api/lector/media/${AUDIOBOOK}/complete`)
      .set(auth())
      .send({})
      .expect(201);
    expect(fresh.body).toEqual({ created: true, replayed: false });
    expect(await events()).toBe(1);

    const replay = await http()
      .post(`/api/lector/media/${AUDIOBOOK}/complete`)
      .set(auth())
      .send({})
      .expect(200);
    expect(replay.body).toEqual({ created: false, replayed: true });
    // The replay wrote nothing.
    expect(await events()).toBe(1);
  });

  it("accepts an absent body exactly like `{}`", async () => {
    const res = await http()
      .post(`/api/lector/media/${AUDIOBOOK}/complete`)
      .set(auth())
      .expect(201);
    expect(res.body).toEqual({ created: true, replayed: false });
  });

  it("rejects ANY property with a value-free 400 and writes nothing", async () => {
    const bodies: Record<string, unknown>[] = [
      { userId: "impostor-actor" },
      { mediaKind: "VIDEO" },
      { mediaVersion: 1 },
      { unitKey: "otro-capitulo" },
      { watchedSeconds: 100 },
    ];

    for (const body of bodies) {
      const res = await http()
        .post(`/api/lector/media/${AUDIOBOOK}/complete`)
        .set(auth())
        .send(body)
        .expect(400);

      expect(res.body.code).toBe("MEDIA_INVALID_PAYLOAD");
      // Value-free: the message IS the code, and there are no details.
      expect(res.body.message).toBe("MEDIA_INVALID_PAYLOAD");
      expect(res.body.details).toBeUndefined();

      // Neither the rejected field names nor their string values come back.
      // (Numbers are not checked: the envelope carries a status code and a
      // path, so a bare `1` would match by coincidence, not by leakage.)
      const serialized = JSON.stringify(res.body);
      for (const key of Object.keys(body)) {
        expect(serialized.includes(key), key).toBe(false);
      }
      for (const value of Object.values(body)) {
        if (typeof value !== "string") continue;
        expect(serialized.includes(value), value).toBe(false);
      }
      expect(await events()).toBe(0);
    }
  });

  /**
   * Un libro retirado no genera acceso a sus medios.
   *
   * El servicio de medios resuelve el libro por su cuenta —dos veces: en el
   * manifiesto y en la concesión— y no pasaba por la guarda del lector. La
   * segunda es la que FIRMA una URL, así que el que importa es que ni siquiera
   * llegue a pedirla.
   *
   * Se retira el libro de la fixture y se devuelve al terminar, para no
   * duplicar todo el andamiaje del catálogo por un caso.
   */
  /**
   * Un libro retirado no genera acceso a sus medios.
   *
   * La versión anterior de esta prueba usaba el audiolibro, y el audiolibro
   * no demostraba nada nuevo: su fuente es `CHAPTER_AUDIO`, que ya pasaba por
   * el lector y por tanto por su guarda. La rama que faltaba es la que firma
   * contra el proveedor —R2— y que llega por `getAccess` sin tocar el lector.
   *
   * Y la afirmación también cambia. «El cuerpo no trae URL» es compatible con
   * haberla generado y haberla descartado después. Lo que se afirma aquí es
   * que el FIRMADOR no se llama: se espía `StorageService.getSignedUrl`, que
   * es quien emite la URL de R2.
   */
  describe("con el libro retirado", () => {
    // Esta versión de Vitest tipa `MockInstance<Args, Return>`; con la forma
    // de una sola firma el tipo no cuadra.
    let firmar: MockInstance<[key: string, expiresIn: number], Promise<string>>;

    beforeAll(async () => {
      await prisma.book.update({
        where: { slug: BOOK_SLUG },
        data: { isPublished: false },
      });
    });

    afterAll(async () => {
      await prisma.book.update({
        where: { slug: BOOK_SLUG },
        data: { isPublished: true },
      });
    });

    beforeEach(() => {
      firmar = vi.spyOn(h.app.get(StorageService), "getSignedUrl");
    });

    afterEach(() => {
      firmar.mockRestore();
    });

    it("el manifiesto no responde", async () => {
      await http()
        .get(`/api/lector/${BOOK_SLUG}/1/media`)
        .set(auth())
        .expect(404);
    });

    it("el podcast (R2) ni siquiera llega a firmarse", async () => {
      const res = await http()
        .get(`/api/lector/media/${EEC_C1_PODCAST.mediaKey}/access`)
        .set(auth())
        .expect(404);

      // Lo que de verdad prueba que no se generó acceso.
      expect(firmar).not.toHaveBeenCalled();
      expect(res.body).not.toHaveProperty("url");
    });

    it("y con el libro publicado ese mismo medio SÍ se firma", async () => {
      // Guard the guard: sin esto, la prueba de arriba pasaría igual si la
      // ruta estuviera rota por cualquier otro motivo.
      await prisma.book.update({
        where: { slug: BOOK_SLUG },
        data: { isPublished: true },
      });
      try {
        await http()
          .get(`/api/lector/media/${EEC_C1_PODCAST.mediaKey}/access`)
          .set(auth())
          .expect(200);
        expect(firmar).toHaveBeenCalledTimes(1);
      } finally {
        await prisma.book.update({
          where: { slug: BOOK_SLUG },
          data: { isPublished: false },
        });
      }
    });
  });

  it("every media route requires a JWT", async () => {
    await http().get(`/api/lector/${BOOK_SLUG}/1/media`).expect(401);
    await http().get(`/api/lector/media/${AUDIOBOOK}/access`).expect(401);
    await http()
      .post(`/api/lector/media/${AUDIOBOOK}/complete`)
      .send({})
      .expect(401);
    expect(await events()).toBe(0);
  });
});

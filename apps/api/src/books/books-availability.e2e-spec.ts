import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { JwtService } from "@nestjs/jwt";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";

/**
 * Un libro retirado no se abre por la puerta de atrás.
 *
 * La lista ya filtraba por publicación, y eso bastaba para que el catálogo
 * dijera la verdad. Lo que nadie comprobaba es lo que pasa cuando alguien
 * llega por una RUTA DIRECTA: el id, el slug, un enlace que circuló, una
 * recomendación vieja. Ahí no hay lista que filtre.
 *
 * Estas pruebas recorren la matriz por HTTP, con la app real y PostgreSQL
 * real, porque el defecto vive en la resolución y no en la capa de servicio:
 * `findFirst({ OR: [{ id }, { slug }] })` encuentra el libro igual, esté
 * publicado o no.
 *
 * Lo que NO se toca, y por eso tiene su propia prueba:
 *
 *   - El ADMIN conserva su previsualización, que ya existe y es una operación
 *     administrativa explícita en su propio controlador con rol.
 *   - El progreso de una persona sigue existiendo; lo que no hace es abrir un
 *     libro retirado. Tener una fila de avance no es un derecho de lectura
 *     sobre todo el libro, y confundirlos sería justo la puerta que esto
 *     cierra.
 *   - Un libro publicado sigue sirviéndose igual, que es el guard the guard
 *     de todo lo demás.
 */

const DB = "books_availability_db";
const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();

suite("disponibilidad · rutas directas a un libro retirado", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let h: E2EHarness;

  let tokenLector = "";
  let tokenConAvance = "";
  let tokenAdmin = "";
  let idRetirado = "";
  let idPublicado = "";
  let capRetirado = "";
  let capPublicado = "";
  let capAdoptado = "";

  const RETIRADO = "libro-retirado-matriz";
  /** Retirado Y adoptado por Content Core, pero sin revisión publicada. */
  const ADOPTADO = "libro-retirado-adoptado";
  const PUBLICADO = "libro-publicado-matriz";
  const INEXISTENTE = "libro-que-no-existe-matriz";

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = new URL(base as string);
    url.pathname = `/${DB}`;
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url.toString() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    /** Un libro con un capítulo legible, publicado o no según se pida. */
    async function hacerLibro(slug: string, publicado: boolean) {
      const book = await prisma.book.create({
        data: {
          slug,
          title: slug,
          plan: "FREE",
          totalChapters: 1,
          isPublished: publicado,
        },
      });
      const cap = await prisma.chapter.create({
        data: {
          bookId: book.id,
          order: 1,
          title: `Capítulo de ${slug}`,
          isPublished: true,
        },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: cap.id,
          order: 0,
          kind: "PARAGRAPH",
          content: `Texto de ${slug}`,
        },
      });
      return { bookId: book.id, chapterId: cap.id };
    }

    const retirado = await hacerLibro(RETIRADO, false);
    const publicado = await hacerLibro(PUBLICADO, true);
    idRetirado = retirado.bookId;
    idPublicado = publicado.bookId;
    capRetirado = retirado.chapterId;
    capPublicado = publicado.chapterId;

    // El caso que la rama nativa deja pasar: la AUTORIZACIÓN se resuelve por
    // la edición —tiene `accessPlan`, así que no toca `Book`— pero la LECTURA
    // cae al respaldo legado porque no hay revisión publicada. Dos fronteras
    // distintas, y la segunda tenía su propia consulta sin filtrar.
    const adoptado = await hacerLibro(ADOPTADO, false);
    capAdoptado = adoptado.chapterId;
    const obra = await prisma.work.create({
      data: { workKey: `w-${ADOPTADO}`, title: ADOPTADO, authorName: "A" },
    });
    const edicion = await prisma.edition.create({
      data: {
        workId: obra.id,
        editionKey: `${ADOPTADO}-1e`, // gitleaks:allow — un slug de libro
        slug: ADOPTADO,
        label: "Primera",
        accessPlan: "FREE",
        publishedRevisionId: null,
      },
    });
    await prisma.contentUnit.create({
      data: {
        editionId: edicion.id,
        unitKey: unitKeyFromLegacyChapterId(adoptado.chapterId),
        isFreePreview: true,
      },
    });

    const mkUser = (email: string, role: "USER" | "ADMIN" = "USER") =>
      prisma.user.create({
        data: { email, name: email, plan: "FREE", role },
      });

    const uLector = await mkUser("lector@matriz.local");
    const uAvance = await mkUser("con-avance@matriz.local");
    const uAdmin = await mkUser("admin@matriz.local", "ADMIN");

    // Alguien que YA leyó en el libro antes de que se retirara. Su fila de
    // avance se conserva; la pregunta es si además abre el libro.
    await prisma.userProgress.create({
      data: {
        userId: uAvance.id,
        chapterId: retirado.chapterId,
        completedAt: new Date(),
      },
    });

    h = await createE2EApp({ prisma });
    const jwt = h.app.get(JwtService);
    const mint = (u: { id: string; email: string; authRevision: number }) =>
      jwt.sign({ sub: u.id, email: u.email, ar: u.authRevision });
    tokenLector = mint(uLector);
    tokenConAvance = mint(uAvance);
    tokenAdmin = mint(uAdmin);
  }, 300_000);

  afterAll(async () => {
    await closeE2EApp(h);
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  const get = (ruta: string, token?: string) => {
    const r = request(h.app.getHttpServer()).get(ruta);
    return token ? r.set("Authorization", `Bearer ${token}`) : r;
  };

  describe("quien no tiene derecho previo no lo obtiene por ninguna vía", () => {
    it("ni por la lista", async () => {
      const res = await get("/api/books", tokenLector).expect(200);
      const cuerpo = res.body as Record<string, unknown>;
      const lista = (Array.isArray(cuerpo) ? cuerpo : cuerpo.books) as Array<{
        slug: string;
      }>;
      expect(Array.isArray(lista), JSON.stringify(cuerpo).slice(0, 200)).toBe(
        true,
      );
      const slugs = lista.map((b) => b.slug);
      expect(slugs).toContain(PUBLICADO);
      expect(slugs).not.toContain(RETIRADO);
    });

    it("ni por el slug", async () => {
      await get(`/api/books/${RETIRADO}`, tokenLector).expect(404);
    });

    it("ni por el id", async () => {
      await get(`/api/books/${idRetirado}`, tokenLector).expect(404);
    });

    it("ni sin sesión", async () => {
      await get(`/api/books/${RETIRADO}`).expect(404);
    });

    it("ni abriendo el lector por enlace directo", async () => {
      await get(`/api/lector/${RETIRADO}/1`, tokenLector).expect(404);
      await get(`/api/lector/${idRetirado}/1`, tokenLector).expect(404);
    });

    it("y la negativa es opaca: no distingue retirado de inexistente", async () => {
      // Si el retirado respondiera distinto del inexistente, la propia
      // respuesta confirmaría que el libro existe — que es la mitad de lo que
      // se intenta averiguar sondeando slugs.
      const retirado = await get(`/api/books/${RETIRADO}`, tokenLector).expect(
        404,
      );
      const inexistente = await get(
        `/api/books/${INEXISTENTE}`,
        tokenLector,
      ).expect(404);
      expect(retirado.body.code).toBe(inexistente.body.code);
      expect(retirado.body.statusCode).toBe(inexistente.body.statusCode);
    });
  });

  /**
   * Content Core tiene sus propias rutas y su propio resolutor. Cerrar el
   * lector no las cierra: una pasa por `assertCanSeeBook` y la otra por el
   * respaldo legado, y ninguno de los dos miraba la publicación del libro.
   */
  describe("tampoco por las rutas de Content Core", () => {
    it("ni el manifiesto del libro", async () => {
      await get(`/api/content/books/${RETIRADO}/manifest`, tokenLector).expect(
        404,
      );
    });

    it("ni la lectura directa de una unidad por el respaldo legado", async () => {
      await get(
        `/api/content/editions/${RETIRADO}-1e/units/${unitKeyFromLegacyChapterId(capRetirado)}`,
        tokenLector,
      ).expect(404);
    });

    it("ni cuando la edición está adoptada y la lectura cae al respaldo legado", async () => {
      // La autorización pasa por la rama NATIVA —la edición tiene
      // `accessPlan`, así que no mira `Book`— y la lectura, sin revisión
      // publicada, cae a `buildLegacyRead`, que encontraba el libro por su
      // slug sin comprobar publicación y devolvía sus bloques. Dos fronteras,
      // y cerrar sólo la de autorización no cierra la de lectura.
      const res = await get(
        `/api/content/editions/${ADOPTADO}-1e/units/${unitKeyFromLegacyChapterId(capAdoptado)}`,
        tokenLector,
      );
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(`Texto de ${ADOPTADO}`);
    });

    it("y el libro publicado sigue respondiendo por las dos", async () => {
      await get(`/api/content/books/${PUBLICADO}/manifest`, tokenLector).expect(
        200,
      );
      await get(
        `/api/content/editions/${PUBLICADO}-1e/units/${unitKeyFromLegacyChapterId(capPublicado)}`,
        tokenLector,
      ).expect(200);
    });
  });

  describe("lo que esto NO puede romper", () => {
    it("un libro publicado se sirve igual, por slug y por id", async () => {
      await get(`/api/books/${PUBLICADO}`, tokenLector).expect(200);
      await get(`/api/books/${idPublicado}`, tokenLector).expect(200);
      const lector = await get(
        `/api/lector/${PUBLICADO}/1`,
        tokenLector,
      ).expect(200);
      expect(JSON.stringify(lector.body)).toContain(`Texto de ${PUBLICADO}`);
    });

    it("la vía administrativa sigue abierta al ADMIN sobre un libro retirado", async () => {
      // Lo que se afirma —y lo que no—. La previsualización de Content Studio
      // pide una revisión BORRADOR concreta, y este fixture no la monta: un
      // 400 por falta de ese parámetro es exactamente lo que debe contestar.
      //
      // Lo que sí prueba, que es lo que esta matriz necesita: cerrar el
      // lector no cerró la puerta administrativa. El ADMIN llega al manejador
      // sobre un libro retirado —no se topa con 404 ni con 403— mientras que
      // la prueba siguiente comprueba que nadie más llega.
      const res = await get(
        `/api/pulso/content/books/${RETIRADO}/chapters/1/preview`,
        tokenAdmin,
      );
      expect([404, 403]).not.toContain(res.status);
      expect(res.status).toBe(400);
    });

    it("esa vía sigue siendo sólo del ADMIN", async () => {
      await get(
        `/api/pulso/content/books/${RETIRADO}/chapters/1/preview`,
        tokenLector,
      ).expect(403);
    });

    it("el avance de quien ya leyó se conserva, aunque no abra el libro", async () => {
      // Las dos mitades importan. La fila sigue ahí —no se borra historial—
      // y aun así el libro no se abre: un progreso no es una autorización de
      // lectura sobre todo el libro.
      const filas = await prisma.userProgress.count({
        where: { chapter: { bookId: idRetirado } },
      });
      expect(filas).toBe(1);
      await get(`/api/books/${RETIRADO}`, tokenConAvance).expect(404);
      await get(`/api/lector/${RETIRADO}/1`, tokenConAvance).expect(404);
    });
  });
});

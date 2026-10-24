import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { JwtService } from "@nestjs/jwt";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { practiceContentFor } from "../content-core/exercise-ingestion";
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
  let unitKeyNativa = "";
  let idNativo = "";
  let practicaRetirada = "";
  let practicaPublicada = "";

  const RETIRADO = "libro-retirado-matriz";
  /** Retirado Y adoptado por Content Core, pero sin revisión publicada. */
  const ADOPTADO = "libro-retirado-adoptado";
  /**
   * Retirado y adoptado CON revisión publicada — la forma que la base alojada
   * tiene de verdad. El backfill escribe `accessPlan` desde `book.plan` y
   * publica la revisión, así que todo libro legado con backfill entra por la
   * rama NATIVA: la autorización se resuelve sin tocar `Book` y la lectura
   * sale de la revisión, no del respaldo legado. Comprobado contra staging.
   */
  const NATIVO = "libro-retirado-nativo";
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

    // La edición NATIVA completa, con su revisión publicada y su texto.
    const nativo = await hacerLibro(NATIVO, false);
    idNativo = nativo.bookId;
    const obraN = await prisma.work.create({
      data: { workKey: `w-${NATIVO}`, title: NATIVO, authorName: "A" },
    });
    const edicionN = await prisma.edition.create({
      data: {
        workId: obraN.id,
        editionKey: `${NATIVO}-1e`, // gitleaks:allow — un slug de libro
        slug: NATIVO,
        label: "Primera",
        accessPlan: "FREE",
      },
    });
    const revisionN = await prisma.revision.create({
      data: {
        editionId: edicionN.id,
        number: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.edition.update({
      where: { id: edicionN.id },
      data: { publishedRevisionId: revisionN.id },
    });
    unitKeyNativa = unitKeyFromLegacyChapterId(nativo.chapterId);
    const unidadN = await prisma.contentUnit.create({
      data: {
        editionId: edicionN.id,
        unitKey: unitKeyNativa,
        isFreePreview: true,
      },
    });
    const versionN = await prisma.contentUnitVersion.create({
      data: { unitId: unidadN.id, title: `Cap. 1 de ${NATIVO}` },
    });
    const bloqueN = await prisma.contentBlock.create({
      data: { unitId: unidadN.id, blockKey: `bk-${NATIVO}` },
    });
    await prisma.blockVersion.create({
      data: {
        contentBlockId: bloqueN.id,
        unitVersionId: versionN.id,
        order: 1,
        kind: "PARAGRAPH",
        content: `Texto nativo de ${NATIVO}.`,
        contentHash: `hash-${NATIVO}`,
      },
    });
    await prisma.revisionUnit.create({
      data: {
        revisionId: revisionN.id,
        unitId: unidadN.id,
        unitVersionId: versionN.id,
        order: 1,
      },
    });

    // Una práctica de catálogo en cada libro. Su `Exercise.id` ES la clave
    // del catálogo, escrita literalmente en este repositorio público, así que
    // la ruta entra por «ID» en la matriz: cualquiera con sesión la adivina.
    const practicas = (
      EXERCISE_INGESTION_CATALOG["emociones-en-construccion"] ?? []
    )
      .map((p) => p.practice)
      .filter((p) => p.interaction !== undefined);
    const definicion = practicas[0];
    if (!definicion) throw new Error("el catálogo no trae prácticas");
    practicaRetirada = `${definicion.exerciseKey}-retirada`;
    practicaPublicada = `${definicion.exerciseKey}-publicada`;
    for (const [id, chapterId] of [
      [practicaRetirada, retirado.chapterId],
      [practicaPublicada, publicado.chapterId],
    ] as const) {
      await prisma.exercise.create({
        data: {
          id,
          chapterId,
          order: 1,
          title: "Práctica de prueba",
          type: "REFLECTION",
          // El contrato de Prisma para `Json` no acepta un
          // `Record<string, unknown>` sin más; el valor es el del catálogo.
          content: practiceContentFor(
            definicion,
            "block-key-1",
          ) as unknown as Prisma.InputJsonValue,
        },
      });
    }

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

    it("ni la lectura de una unidad por la rama NATIVA, con revisión publicada", async () => {
      // El caso que de verdad corre en la base alojada, y el que quedaba
      // abierto: la autorización se resolvía por la edición —`accessPlan` no
      // es nulo, así que no se consultaba `Book`— y la lectura salía de la
      // revisión publicada, también sin mirar `Book`. El manifiesto cerraba
      // la puerta y ésta la dejaba abierta para la MISMA edición.
      //
      // El `unitKey` no es un secreto: es `uuidv5` del id del capítulo con un
      // espacio de nombres publicado en este repositorio, y el lector ya lo
      // entrega a todo cliente. «La clave la tenía quien abrió el libro
      // mientras estaba publicado» es exactamente el enlace que circuló.
      const res = await get(
        `/api/content/editions/${NATIVO}-1e/units/${unitKeyNativa}`,
        tokenLector,
      );
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("Texto nativo");
    });

    it("ni sus marcas, que entran por la misma puerta", async () => {
      const res = await get(
        `/api/content/editions/${NATIVO}-1e/units/${unitKeyNativa}/marks`,
        tokenLector,
      );
      expect(res.status).toBe(404);
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

  describe("ni por las rutas que no comprobaban nada", () => {
    it("ni la práctica de catálogo, cuya clave está en el repositorio público", async () => {
      // El manejador no tomaba usuario, no resolvía libro y no preguntaba
      // nada: devolvía título e interacción de cualquier `Exercise.id`.
      const res = await get(
        `/api/learning/practices/${practicaRetirada}`,
        tokenLector,
      );
      expect(res.status).toBe(404);
      // Y la negativa es la misma que la de una práctica inexistente.
      expect(res.body?.code ?? res.body?.message).toBe("PRACTICE_NOT_FOUND");
    });

    it("y la del libro publicado sigue respondiendo", async () => {
      const res = await get(
        `/api/learning/practices/${practicaPublicada}`,
        tokenLector,
      );
      expect(res.status).toBe(200);
      expect(res.body.exerciseKey).toBe(practicaPublicada);
    });

    it("ni el descubrimiento de experiencias del capítulo", async () => {
      // Consultaba `chapterExperienceVersion` por slug sin tocar `Book` en
      // ningún punto, y devuelve la copia editorial del recorrido. Hoy es
      // LATENTE —no hay versiones publicadas— pero el contrato se afirma en
      // el código, no en el estado de una tabla: la lista vacía es la misma
      // respuesta honesta que la de un capítulo sin recorrido.
      const res = await get(
        `/api/experiences/discovery/${RETIRADO}/1`,
        tokenLector,
      );
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
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

    it("una edición NATIVA PURA, sin fila `Book`, no gana ninguna exigencia", async () => {
      // La condición tolera la ausencia a propósito: Content Core puede
      // publicar obras que no existen como `Book`, y su disponibilidad la
      // decide el estado de su revisión, que vive en otro sitio.
      const obra = await prisma.work.create({
        data: { workKey: "w-pura", title: "Pura", authorName: "A" },
      });
      const ed = await prisma.edition.create({
        data: {
          workId: obra.id,
          editionKey: "obra-pura-1e", // gitleaks:allow — un slug de edición
          slug: "obra-sin-libro-legado",
          label: "Primera",
          accessPlan: "FREE",
        },
      });
      const rev = await prisma.revision.create({
        data: {
          editionId: ed.id,
          number: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      await prisma.edition.update({
        where: { id: ed.id },
        data: { publishedRevisionId: rev.id },
      });
      const u = await prisma.contentUnit.create({
        data: { editionId: ed.id, unitKey: "u-pura", isFreePreview: true },
      });
      const v = await prisma.contentUnitVersion.create({
        data: { unitId: u.id, title: "Escena única" },
      });
      const b = await prisma.contentBlock.create({
        data: { unitId: u.id, blockKey: "bk-pura" },
      });
      await prisma.blockVersion.create({
        data: {
          contentBlockId: b.id,
          unitVersionId: v.id,
          order: 1,
          kind: "PARAGRAPH",
          content: "Texto de una obra sin libro legado.",
          contentHash: "hash-pura",
        },
      });
      await prisma.revisionUnit.create({
        data: {
          revisionId: rev.id,
          unitId: u.id,
          unitVersionId: v.id,
          order: 1,
        },
      });

      const res = await get(
        "/api/content/editions/obra-pura-1e/units/u-pura",
        tokenLector,
      );
      expect(res.status).toBe(200);
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

    it("el progreso de aprendizaje tampoco se consulta mientras esté retirada, y no se borra", async () => {
      // Decisión declarada, no accidente. Retirar una obra la retira entera:
      // desaparece del catálogo, de la pantalla de inicio y de su propia
      // vista de progreso. Mostrar una barra de avance de un libro que ya no
      // está en ningún sitio sería incoherente, y abrir aquí una excepción
      // significaría abrir la MISMA puerta por la que se sirve el texto
      // —`assertCanReadUnit` responde a las dos preguntas—, que es
      // exactamente lo que este cambio cierra.
      //
      // Nada se pierde: las filas siguen ahí y vuelven enteras el día que la
      // obra se publique otra vez.
      const res = await get(
        `/api/learning/progress?bookSlug=${RETIRADO}`,
        tokenConAvance,
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      const filas = await prisma.userProgress.count({
        where: { chapter: { bookId: idRetirado } },
      });
      expect(filas).toBe(1);
    });

    it("y la pantalla de inicio deja de ofrecer un enlace muerto", async () => {
      // Consecuencia de cerrar la frontera, y defecto si no se atiende: la
      // tarjeta de «continuar» no miraba la publicación, así que seguía
      // mostrando portada, autoría y capítulo de la obra retirada con un
      // enlace que ahora responde 404. Ofrecer eso en la pantalla de inicio
      // es peor que no ofrecer nada, porque parece que se puede seguir.
      const res = await get("/api/home", tokenConAvance);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(RETIRADO);
    });
  });
});

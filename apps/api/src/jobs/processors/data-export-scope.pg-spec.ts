/**
 * Qué sale en una exportación de datos, y de quién.
 *
 * Lo que ya está cubierto por pruebas unitarias no se repite: que sólo el
 * dueño pueda DESCARGAR su export, que un extraño reciba 404 y no 403, que
 * una clave fuera de su prefijo se rechace, y que una expirada dé 410. Todo
 * eso vive en `users.service.spec.ts` y vigila el acceso al archivo.
 *
 * Lo que nadie comprobaba es lo de DENTRO: con una Prisma simulada, que el
 * archivo contenga sólo las filas de quien lo pidió es una afirmación sobre
 * los mocks, no sobre las consultas. Aquí hay dos personas reales en una base
 * real, cada una con sus datos, y se mira el contenido.
 *
 * Se comprueba además que el aviso de alcance sea cierto. Un export que omite
 * categorías y no lo dice deja a alguien creyendo que tiene todo lo suyo.
 */

import { execSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DataExportProcessor } from "./data-export.processor";

const DB = "data_export_scope_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("alcance de la exportación de datos", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let payload: Record<string, unknown>;

  const ANA = "user-ana";
  const BRUNO = "user-bruno";

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

    // Dos personas con datos propios y claramente distinguibles.
    for (const [id, email, ciudad] of [
      [ANA, "ana@ejemplo.local", "Guayaquil"],
      [BRUNO, "bruno@ejemplo.local", "Cuenca"],
    ]) {
      await prisma.user.create({
        data: { id, email, name: id, city: ciudad, plan: "FREE" },
      });
      await prisma.userPreferences.create({ data: { userId: id } });
    }

    // Contenido compartido: un libro, que NO es de nadie en particular.
    const libro = await prisma.book.create({
      data: { slug: "libro-de-prueba", title: "Libro", plan: "FREE" },
    });
    // El progreso ancla a un capítulo, no a un libro. Cada persona completa
    // uno distinto del MISMO libro: así el libro es contenido compartido y el
    // capítulo es el dato que las distingue.
    const capAna = await prisma.chapter.create({
      data: { bookId: libro.id, order: 1, title: "Capitulo de Ana" },
    });
    const capBruno = await prisma.chapter.create({
      data: { bookId: libro.id, order: 2, title: "Capitulo de Bruno" },
    });
    await prisma.userProgress.create({
      data: { userId: ANA, chapterId: capAna.id },
    });
    await prisma.userProgress.create({
      data: { userId: BRUNO, chapterId: capBruno.id },
    });

    // El procesador se construye con las dependencias que el payload necesita;
    // nada de almacenamiento ni de correo se toca en esta prueba.
    const processor = new DataExportProcessor(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    payload = (await (
      processor as unknown as {
        buildPayload(userId: string): Promise<Record<string, unknown>>;
      }
    ).buildPayload(ANA)) as Record<string, unknown>;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("entrega los datos de quien lo pidió", () => {
    const user = payload.user as { id: string; email: string; city: string };
    expect(user.id).toBe(ANA);
    expect(user.email).toBe("ana@ejemplo.local");
    expect(user.city).toBe("Guayaquil");
  });

  it("no entrega NADA de la otra persona", () => {
    // La comprobación sobre el archivo entero, no campo a campo: cualquier
    // consulta mal acotada que se añada mañana aparecería aquí.
    const texto = JSON.stringify(payload);
    expect(texto).not.toContain(BRUNO);
    expect(texto).not.toContain("bruno@ejemplo.local");
    expect(texto).not.toContain("Cuenca");
    expect(texto).not.toContain("Capitulo de Bruno");
  });

  it("su progreso de lectura es el suyo, no el de la otra persona", () => {
    // El export reescribe la fila de Prisma en una forma propia y legible
    // (`chapterTitle`, no `chapter.title`), que es lo que de verdad recibe la
    // persona. Se afirma sobre esa forma.
    const progreso = payload.progress as Array<{ chapterTitle: string | null }>;
    expect(progreso).toHaveLength(1);
    expect(progreso[0]?.chapterTitle).toBe("Capitulo de Ana");
  });

  it("el contenido compartido se nombra, pero no se reclama como propio", () => {
    // El libro aparece porque su progreso lo referencia. Eso es describir
    // dónde iba leyendo, no apropiarse del catálogo: el export no debe
    // confundir «lo que leí» con «lo que es mío».
    expect(JSON.stringify(payload)).toContain("libro-de-prueba");
  });

  describe("el aviso de alcance dice la verdad", () => {
    const nota = () =>
      ((payload._meta as { note: string }) ?? { note: "" }).note;

    it("no promete sprints que ya cerraron", () => {
      // Decía que el Diario y Eco llegarían «en el Sprint S6/S9». Ambos están
      // en producción desde hace meses y sus datos siguen sin exportarse, así
      // que la nota dejaba creer que la ausencia era temporal.
      expect(nota()).not.toMatch(/Sprint S\d/i);
      expect(nota()).not.toMatch(/will add|not yet included/i);
    });

    it("dice por qué el Diario no puede venir como texto legible", () => {
      // Es la razón real y no una promesa: el servidor no tiene la clave.
      expect(nota().toLowerCase()).toContain("cifrados de extremo a extremo");
      expect(nota().toLowerCase()).toContain("no tiene la clave");
    });

    it("nombra lo que sí incluye y admite lo que falta", () => {
      const n = nota().toLowerCase();
      for (const incluido of ["perfil", "progreso", "suscripción"]) {
        expect(n).toContain(incluido);
      }
      expect(n).toContain("tampoco incluye");
    });
  });
});

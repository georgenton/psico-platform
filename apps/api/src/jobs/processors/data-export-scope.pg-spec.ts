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

import {
  createThrowawayDatabase,
  type ThrowawayDatabase,
} from "../../test/throwaway-database";
import { DataExportProcessor } from "./data-export.processor";

const API_DIR = process.cwd();

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("alcance de la exportación de datos", () => {
  let desechable: ThrowawayDatabase;
  let prisma: PrismaClient;
  let pool: Pool;
  let payload: Record<string, unknown>;

  const ANA = "user-ana";
  const BRUNO = "user-bruno";

  beforeAll(async () => {
    // Nombre único por ejecución; no se borra nada previo. El `DROP` sobre un
    // nombre fijo destruía cualquier base homónima, de quien fuera.
    desechable = await createThrowawayDatabase(base as string, "export_scope");
    const url = desechable.url;
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
    await desechable?.drop();
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
      // en producción desde hace meses y sus datos siguen sin exportarse.
      expect(nota()).not.toMatch(/Sprint S\d/i);
      expect(nota()).not.toMatch(/will add|not yet included/i);
    });

    it("no promete fechas ni atención manual sin definir", () => {
      expect(nota()).not.toMatch(/escríbenos|contáct|próximamente|pronto/i);
    });

    it("separa lo que incluye, lo que exige tu clave y lo que falta", () => {
      const n = nota().toLowerCase();
      expect(n).toContain("incluye");
      expect(n).toContain("requiere tu clave");
      expect(n).toContain("no está incluido");
    });

    it("atribuye la imposibilidad SÓLO a lo que de verdad está cifrado", () => {
      // Trinquete contra la afirmación general que la revisión señaló: decir
      // que «las conversaciones con Eco» están cifradas y el servidor no puede
      // leerlas es falso para las RESPUESTAS, que se guardan en
      // `assistantText` en claro. La frase que lo excusaba no puede volver.
      const n = nota().toLowerCase();
      expect(n).not.toMatch(/conversaciones con eco[^.]{0,40}cifrad/);
      expect(n).not.toMatch(/eco[^.]{0,30}no tiene la clave/);
      // Y lo que sí debe decir: que lo cifrado son TUS mensajes.
      expect(n).toMatch(/mensajes que tú escribiste a eco/);
    });

    it("las respuestas de Eco figuran como omisión, no como imposibilidad", () => {
      const n = nota().toLowerCase();
      const iOmision = n.indexOf("no está incluido");
      const iRespuestas = n.indexOf("las respuestas de eco");
      expect(iOmision).toBeGreaterThanOrEqual(0);
      expect(iRespuestas).toBeGreaterThan(iOmision);
    });
  });

  /**
   * Las pruebas de arriba comprueban la nota contra sí misma: que no prometa
   * sprints, que separe tres grupos, que ordene una frase antes que otra. Eso
   * no basta, y aquí está la prueba de que no bastaba: la nota declaraba
   * ausentes los ajustes de notificaciones mientras el payload los traía, y
   * declaraba ausente «tu registro de ánimo» mientras el bloque `user` traía
   * el ánimo actual. Ninguna de las dos cosas podía detectarse leyendo sólo
   * la nota.
   *
   * Esto la coteja contra el archivo real. La tabla es la bisagra: añadir una
   * sección al export sin nombrarla en la nota rompe la primera prueba, y
   * nombrarla entre lo ausente rompe la segunda.
   */
  describe("la nota coincide con el archivo que de verdad se entrega", () => {
    const nota = () =>
      ((payload._meta as { note: string }) ?? { note: "" }).note;

    /** Clave del payload → cómo la nota tiene que nombrarla. */
    const NOMBRADO: Record<string, string> = {
      user: "tu perfil",
      profile: "tu perfil",
      preferences: "tus preferencias",
      readerPreferences: "ajustes del lector",
      notificationSettings: "de notificaciones",
      privacySettings: "de privacidad",
      progress: "tu progreso de lectura",
      subscription: "tu suscripción",
      guideSessions: "tus sesiones de guía",
    };

    const tramos = () => {
      const n = nota();
      const iClave = n.indexOf("Requiere tu clave");
      const iFalta = n.indexOf("No está incluido");
      expect(iClave).toBeGreaterThan(0);
      expect(iFalta).toBeGreaterThan(iClave);
      return {
        incluye: n.slice(0, iClave).toLowerCase(),
        falta: n.slice(iFalta).toLowerCase(),
      };
    };

    it("nombra entre lo incluido cada sección que el archivo trae", () => {
      const { incluye } = tramos();
      const claves = Object.keys(payload).filter((k) => k !== "_meta");
      // Guard the guard: si el payload se queda sin secciones, la prueba de
      // abajo pasaría por vacuidad.
      expect(claves.length).toBeGreaterThanOrEqual(8);
      for (const clave of claves) {
        const frase = NOMBRADO[clave];
        expect(
          frase,
          `el payload trae "${clave}" y la tabla de esta prueba no sabe cómo lo nombra la nota`,
        ).toBeDefined();
        expect(incluye, `la nota no nombra "${clave}"`).toContain(frase);
      }
    });

    it("no declara ausente ninguna sección que el archivo trae", () => {
      const { falta } = tramos();
      for (const clave of Object.keys(payload).filter((k) => k !== "_meta")) {
        expect(
          falta,
          `la nota dice que falta "${clave}" y el archivo lo trae`,
        ).not.toContain(NOMBRADO[clave]);
      }
    });

    it("distingue el ánimo actual, que sí viaja, del historial, que no", () => {
      const user = payload.user as Record<string, unknown>;
      // El ánimo actual está en el archivo aunque su valor sea nulo: lo que
      // importa es que la clave viaja, porque es lo que la nota promete.
      expect(Object.keys(user)).toContain("mood");
      expect(Object.keys(user)).toContain("moodUpdatedAt");
      const { incluye, falta } = tramos();
      expect(incluye).toContain("tu ánimo actual");
      expect(falta).toContain("el historial de tu ánimo");
      // Y no puede volver la fórmula que los confundía.
      expect(falta).not.toMatch(/tu registro de ánimo/);
    });

    it("el Diario y los mensajes a Eco no vienen, y la nota no insinúa que sí", () => {
      // Ni una línea: este export no consulta esas tablas. Si algún día las
      // consulta, esta prueba falla y hay que reescribir el grupo del medio.
      const texto = JSON.stringify(payload);
      expect(texto).not.toContain("textCiphertext");
      expect(texto).not.toContain("textNonce");
      expect(Object.keys(payload)).not.toContain("diary");
      expect(Object.keys(payload)).not.toContain("eco");
      // «requiere tu clave» a secas se lee como «está, pero cifrado». Tiene
      // que decir también que hoy no se recoge.
      const n = nota().toLowerCase();
      expect(n).toMatch(/tampoco viene cifrado|no lo recoge/);
    });
  });
});

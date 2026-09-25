import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

import {
  QA_PERSONAS,
  QA_PERSONAS_FOREIGN_ACCOUNT,
  QA_PERSONAS_NO_PASSWORD,
  QA_PERSONAS_WEAK_PASSWORD,
  QA_PERSONA_EMAILS,
  applyQaPersonas,
  assertIsOwnPersona,
  readPersonasPassword,
} from "./personas";
import {
  QA_FIXTURE_DATABASE_LOOKS_REAL,
  QA_FIXTURE_FORBIDDEN_IN_PRODUCTION,
  QA_FIXTURE_NOT_AUTHORIZED,
} from "./visual-fixture";

/**
 * Lo que estas pruebas vigilan es a quién puede tocar esta herramienta.
 *
 * Las tres barreras del fixture ya tienen su propia suite; aquí se comprueba
 * que las hereda de verdad —no que existan— y se añade la cuarta, que es la
 * suya: no escribir jamás sobre una cuenta que no sea una de sus cuatro.
 */

function setPosture(vars: Record<string, string | undefined>): void {
  for (const key of [
    "PSICO_ENV",
    "NODE_ENV",
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_PROJECT_ID",
    "RAILWAY_SERVICE_ID",
  ]) {
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v;
  }
}

/**
 * Un id como los de verdad: opaco y sin relación con el correo. El doble
 * devolvía `id-<correo>`, y con eso la prueba de privacidad de abajo fallaba
 * por culpa del doble, no del producto. Codificar el correo tampoco valdría:
 * seguiría siendo el correo, sólo que disfrazado.
 */
const idOpaco = (email: string) =>
  "cmq" + createHash("sha256").update(email).digest("hex").slice(0, 18);

/** Una base de pruebas: sólo cuentas en dominios reservados. */
function fakePrisma(
  emails: string[] = [],
  existentes: string[] = [],
): { prisma: PrismaClient; upserts: unknown[] } {
  const upserts: unknown[] = [];
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue(emails.map((email) => ({ email }))),
      findUnique: vi.fn(({ where }: { where: { email: string } }) =>
        Promise.resolve(
          existentes.includes(where.email)
            ? { id: idOpaco(where.email) }
            : null,
        ),
      ),
      upsert: vi.fn((args: unknown) => {
        upserts.push(args);
        const email = (args as { where: { email: string } }).where.email;
        return Promise.resolve({ id: idOpaco(email) });
      }),
    },
    onboardingState: { upsert: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
  return { prisma, upserts };
}

const CLAVE = "clave-de-prueba-larga";
const hashFalso = async (p: string) => `hash(${p})`;

beforeEach(() => {
  delete process.env.QA_PERSONAS_PASSWORD;
  delete process.env.ALLOW_QA_VISUAL_FIXTURE;
});

describe("el catálogo de personas", () => {
  it("cubre los cuatro estados que la auditoría necesita", () => {
    expect(QA_PERSONAS.map((p) => p.slug)).toEqual([
      "QA_FREE",
      "QA_PRO",
      "QA_CRYPTO",
      "QA_AUTHOR",
    ]);
    expect(QA_PERSONAS.find((p) => p.slug === "QA_PRO")?.plan).toBe("PRO");
    expect(QA_PERSONAS.find((p) => p.slug === "QA_AUTHOR")?.role).toBe(
      "AUTHOR",
    );
  });

  it("vive entera en dominios que nadie puede recibir", () => {
    // RFC 2606: `.test` no se delega. Si alguien añade una persona en un
    // dominio enrutable, esto lo para antes de que se cree la cuenta.
    for (const email of QA_PERSONA_EMAILS) {
      expect(email.split("@").pop()).toMatch(/\.(test|example|invalid)$/);
    }
  });
});

describe("la contraseña", () => {
  it("no tiene valor por defecto: sin ella no hay ejecución", () => {
    expect(() => readPersonasPassword({})).toThrow(QA_PERSONAS_NO_PASSWORD);
  });

  it("rechaza una demasiado corta", () => {
    expect(() =>
      readPersonasPassword({ QA_PERSONAS_PASSWORD: "corta" }),
    ).toThrow(QA_PERSONAS_WEAK_PASSWORD);
  });

  it("acepta una suficientemente larga", () => {
    expect(readPersonasPassword({ QA_PERSONAS_PASSWORD: CLAVE })).toBe(CLAVE);
  });
});

describe("la cuarta barrera: sólo sus propias cuentas", () => {
  it("acepta cada una de las suyas", () => {
    for (const email of QA_PERSONA_EMAILS) {
      expect(() => assertIsOwnPersona(email)).not.toThrow();
    }
  });

  it("se niega ante cualquier otra dirección", () => {
    // La pregunta que protege a una persona real de un upsert equivocado.
    for (const ajeno of [
      "alguien@gmail.com",
      "otro@psico.test",
      "qa-free@otro-dominio.test",
    ]) {
      expect(() => assertIsOwnPersona(ajeno)).toThrow(
        QA_PERSONAS_FOREIGN_ACCOUNT,
      );
    }
  });
});

describe("hereda las barreras del fixture", () => {
  it("se niega en producción antes de mirar la base", async () => {
    setPosture({ PSICO_ENV: "production" });
    process.env.QA_PERSONAS_PASSWORD = CLAVE;
    const { prisma } = fakePrisma();
    await expect(applyQaPersonas(prisma, { apply: true })).rejects.toThrow(
      QA_FIXTURE_FORBIDDEN_IN_PRODUCTION,
    );
    // Ni una consulta: se negó antes.
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("en staging exige la autorización explícita", async () => {
    setPosture({ PSICO_ENV: "staging" });
    process.env.QA_PERSONAS_PASSWORD = CLAVE;
    const { prisma } = fakePrisma();
    await expect(applyQaPersonas(prisma, { apply: true })).rejects.toThrow(
      QA_FIXTURE_NOT_AUTHORIZED,
    );
  });

  it("falta la contraseña: lo dice antes de intentar conectarse", async () => {
    // Antes devolvía `UNEXPECTED_ERROR`, porque intentaba leer las cuentas
    // primero y el fallo de conexión se saneaba. Un operador que olvidó la
    // variable necesita que se lo digan, no un error genérico.
    setPosture({ NODE_ENV: "test" });
    const { prisma } = fakePrisma();
    await expect(applyQaPersonas(prisma, { apply: true })).rejects.toThrow(
      QA_PERSONAS_NO_PASSWORD,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("se niega si la base contiene una dirección enrutable", async () => {
    setPosture({ NODE_ENV: "test" });
    process.env.QA_PERSONAS_PASSWORD = CLAVE;
    const { prisma } = fakePrisma(["alguien@gmail.com"]);
    await expect(applyQaPersonas(prisma, { apply: true })).rejects.toThrow(
      QA_FIXTURE_DATABASE_LOOKS_REAL,
    );
  });
});

describe("qué escribe", () => {
  beforeEach(() => {
    setPosture({ NODE_ENV: "test" });
    process.env.QA_PERSONAS_PASSWORD = CLAVE;
  });

  it("en seco no toca una sola fila", async () => {
    const { prisma, upserts } = fakePrisma();
    const r = await applyQaPersonas(prisma, { apply: false, hash: hashFalso });
    expect(r.applied).toBe(false);
    expect(upserts).toHaveLength(0);
    expect(r.personas.map((p) => p.outcome)).toEqual([
      "would-create",
      "would-create",
      "would-create",
      "would-create",
    ]);
  });

  it("crea las cuatro con su rol y su plan", async () => {
    const { prisma, upserts } = fakePrisma();
    const r = await applyQaPersonas(prisma, { apply: true, hash: hashFalso });
    expect(upserts).toHaveLength(4);
    const porSlug = Object.fromEntries(r.personas.map((p) => [p.slug, p]));
    expect(porSlug.QA_FREE.plan).toBe("FREE");
    expect(porSlug.QA_PRO.plan).toBe("PRO");
    expect(porSlug.QA_AUTHOR.role).toBe("AUTHOR");
    // Cada upsert apunta a una dirección de la lista, y a ninguna otra.
    for (const u of upserts) {
      const email = (u as { where: { email: string } }).where.email;
      expect(QA_PERSONA_EMAILS).toContain(email);
    }
  });

  it("no rota la contraseña de una cuenta que ya existe", async () => {
    const { prisma, upserts } = fakePrisma([], QA_PERSONA_EMAILS.slice());
    await applyQaPersonas(prisma, { apply: true, hash: hashFalso });
    for (const u of upserts) {
      // `update` no lleva passwordHash: una sesión abierta no se cae a media
      // auditoría porque alguien volvió a lanzar la herramienta.
      expect(
        (u as { update: Record<string, unknown> }).update,
      ).not.toHaveProperty("passwordHash");
    }
  });

  it("la rota sólo si se pide", async () => {
    const { prisma, upserts } = fakePrisma([], QA_PERSONA_EMAILS.slice());
    await applyQaPersonas(prisma, {
      apply: true,
      rotatePasswords: true,
      hash: hashFalso,
    });
    for (const u of upserts) {
      expect((u as { update: Record<string, unknown> }).update).toHaveProperty(
        "passwordHash",
      );
    }
  });

  it("el informe no contiene ninguna dirección ni ninguna contraseña", async () => {
    const { prisma } = fakePrisma();
    const r = await applyQaPersonas(prisma, { apply: true, hash: hashFalso });
    const serializado = JSON.stringify(r);
    for (const email of QA_PERSONA_EMAILS) {
      expect(serializado).not.toContain(email);
    }
    expect(serializado).not.toContain(CLAVE);
    expect(serializado).not.toContain("hash(");
  });
});

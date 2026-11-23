import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import {
  reserveVerificationSend,
  VERIFICATION_SEND_MAX_PER_WINDOW,
  type ReserveVerificationSendInput,
} from "./verification-send-budget";
import { dropWhenIdle } from "../test/pg-drop";

/**
 * El cupo de correos de verificación por cuenta, con dos peticiones a la vez.
 *
 * La prueba unitaria del servicio sólo puede ver la FORMA —una transacción, el
 * cerrojo antes del recuento—, porque su `$transaction` es un doble que no
 * serializa nada. Lo que hay que demostrar aquí es lo otro: que con dos
 * conexiones de verdad a PostgreSQL, compitiendo por el último hueco, **sólo
 * una lo consume**.
 *
 * ── El defecto que esto cierra ─────────────────────────────────────────────
 *
 * La primera versión contaba los tokens de la cuenta y después creaba uno, en
 * dos sentencias sueltas. Con dos envíos ya en la ventana, dos peticiones
 * simultáneas leían «dos», pasaban las dos, y la cuenta quedaba con cuatro.
 *
 * ── Por qué hay una costura, y por qué no basta una cita a dos bandas ──────
 *
 * La ventana es de milisegundos, y una carrera que «casi siempre» se pierde no
 * es una regresión. Así que `reserveVerificationSend` acepta `afterCount`, que
 * corre ya dentro del cerrojo, después de contar y antes de decidir; producción
 * no la pasa.
 *
 * Pero una cita que esperase a que llegaran las dos se bloquearía para siempre
 * con el arreglo puesto: la segunda petición no puede contar mientras la
 * primera tiene el cerrojo, así que nunca llega. La puerta, por eso, se abre
 * por la primera de dos razones:
 *
 *   - **la otra también contó** — sólo posible sin cerrojo, y entonces las dos
 *     han leído el mismo número antes de que ninguna escriba: el defecto,
 *     reproducido de forma determinista;
 *   - **la otra está esperando el cerrojo**, visto en `pg_locks` desde una
 *     tercera conexión. Eso no es un plazo vencido: es la prueba de que la
 *     contención fue real y de que fue el cerrojo quien la resolvió.
 *
 * La última comprobación de cada caso es precisamente cuál de las dos abrió
 * la puerta. Sin ella, dos peticiones que por azar no se solaparan pasarían
 * la prueba sin haber competido.
 *
 * Corre solo con TEST_DATABASE_URL (CI `test:locks`).
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "verification_send_budget_db";
const API_DIR = process.cwd();

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

suite("el cupo de verificación por cuenta, con peticiones simultáneas", () => {
  let poolA: Pool;
  let poolB: Pool;
  let observer: Pool;
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  let tokens = 0;

  /** Alguien con `n` correos de verificación ya enviados en la última hora. */
  async function cuentaConEnvios(email: string, n: number): Promise<string> {
    const u = await prismaA.user.create({ data: { email, name: email } });
    for (let i = 0; i < n; i++) {
      await prismaA.emailVerificationToken.create({
        data: {
          userId: u.id,
          tokenHash: `previo-${email}-${i}`,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
          createdAt: new Date(Date.now() - 10 * 60_000),
        },
      });
    }
    return u.id;
  }

  function entrada(userId: string): ReserveVerificationSendInput {
    tokens += 1;
    return {
      userId,
      tokenHash: `nuevo-${tokens}`,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    };
  }

  /** ¿Hay alguien en ESTA base esperando un cerrojo consultivo? */
  async function alguienEsperaElCerrojo(): Promise<boolean> {
    const { rows } = await observer.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_locks l
         JOIN pg_database d ON d.oid = l.database
        WHERE d.datname = current_database()
          AND l.locktype = 'advisory'
          AND NOT l.granted`,
    );
    return rows[0]!.n > 0;
  }

  /**
   * La puerta de la carrera: retiene a la primera petición que haya contado
   * hasta que la otra también cuente, o hasta verla bloqueada en el cerrojo.
   * Anota cuál de las dos cosas ocurrió.
   */
  function puertaDeCarrera() {
    const estado = {
      llegadas: 0,
      abiertaPor: null as null | "las-dos-contaron" | "la-otra-espera",
    };
    const afterCount = async () => {
      estado.llegadas += 1;
      if (estado.llegadas >= 2) {
        estado.abiertaPor ??= "las-dos-contaron";
        return;
      }
      const limite = Date.now() + 8_000;
      while (Date.now() < limite) {
        if (estado.llegadas >= 2) return;
        if (await alguienEsperaElCerrojo()) {
          estado.abiertaPor = "la-otra-espera";
          return;
        }
        await sleep(10);
      }
      throw new Error(
        "la otra petición ni contó ni quedó esperando el cerrojo: no compitieron",
      );
    };
    return { estado, seams: { afterCount } };
  }

  async function enVentana(userId: string): Promise<number> {
    return prismaA.emailVerificationToken.count({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 3600_000) },
      },
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
    // podría serializarlas sin que nadie se enterase. Y una tercera, sólo para
    // mirar `pg_locks` sin hacer cola detrás de ninguna de las dos.
    poolA = new Pool({ connectionString: url });
    poolB = new Pool({ connectionString: url });
    observer = new Pool({ connectionString: url, max: 1 });
    prismaA = new PrismaClient({ adapter: new PrismaPg(poolA) });
    prismaB = new PrismaClient({ adapter: new PrismaPg(poolB) });
  }, 240_000);

  afterAll(async () => {
    if (prismaA) await prismaA.$disconnect();
    if (prismaB) await prismaB.$disconnect();
    if (poolA) await poolA.end();
    if (poolB) await poolB.end();
    if (observer) await observer.end();
    const admin = new Pool({ connectionString: base });
    await dropWhenIdle(admin, DB);
    await admin.end();
  });

  it("dos peticiones por el último hueco: sólo una lo consume", async () => {
    const userId = await cuentaConEnvios(
      "ultimo-hueco@test.local",
      VERIFICATION_SEND_MAX_PER_WINDOW - 1,
    );
    const { estado, seams } = puertaDeCarrera();

    const [a, b] = await Promise.all([
      reserveVerificationSend(prismaA, entrada(userId), seams),
      reserveVerificationSend(prismaB, entrada(userId), seams),
    ]);

    // Una reserva, una negativa.
    expect([a.reserved, b.reserved].filter(Boolean)).toHaveLength(1);
    // Y la cuenta queda exactamente en el techo, no por encima.
    expect(await enVentana(userId)).toBe(VERIFICATION_SEND_MAX_PER_WINDOW);
    // La que perdió contó DESPUÉS de que la otra confirmara: vio el techo.
    const perdedora = a.reserved ? b : a;
    expect(perdedora.sentInWindow).toBe(VERIFICATION_SEND_MAX_PER_WINDOW);
    // Compitieron de verdad, y fue el cerrojo quien lo resolvió.
    expect(estado.abiertaPor).toBe("la-otra-espera");
  });

  it("control: con hueco para las dos, las dos reservan", async () => {
    // Sin este caso, un cerrojo que negara a todo el que esperase pasaría la
    // prueba de arriba por la razón equivocada.
    const userId = await cuentaConEnvios(
      "dos-huecos@test.local",
      VERIFICATION_SEND_MAX_PER_WINDOW - 2,
    );
    const { estado, seams } = puertaDeCarrera();

    const [a, b] = await Promise.all([
      reserveVerificationSend(prismaA, entrada(userId), seams),
      reserveVerificationSend(prismaB, entrada(userId), seams),
    ]);

    expect(a.reserved && b.reserved).toBe(true);
    expect(await enVentana(userId)).toBe(VERIFICATION_SEND_MAX_PER_WINDOW);
    expect(estado.abiertaPor).toBe("la-otra-espera");
  });

  it("cuentas distintas no se esperan entre sí", async () => {
    // El cerrojo va por cuenta. Si fuera global, esta puerta se abriría por
    // «la otra espera» en vez de por «las dos contaron».
    const ana = await cuentaConEnvios("ana-cupo@test.local", 2);
    const luis = await cuentaConEnvios("luis-cupo@test.local", 2);
    const { estado, seams } = puertaDeCarrera();

    const [a, b] = await Promise.all([
      reserveVerificationSend(prismaA, entrada(ana), seams),
      reserveVerificationSend(prismaB, entrada(luis), seams),
    ]);

    expect(a.reserved && b.reserved).toBe(true);
    expect(estado.abiertaPor).toBe("las-dos-contaron");
  });

  it("una cuenta guardada con mayúsculas recibe el reenvío aunque se pida en minúsculas", async () => {
    // El defecto medido en staging el 2026-11-23: `register()` guarda la
    // dirección tal cual, y 3 de 19 cuentas tenían mayúsculas. El reenvío la
    // pasaba a minúsculas antes de una búsqueda exacta, contestaba 200 y no
    // hacía nada. Aquí contra PostgreSQL, que es donde `mode: "insensitive"`
    // tiene que funcionar de verdad.
    const jobs = { enqueueEmail: vi.fn().mockResolvedValue(undefined) };
    const auth = new AuthService(
      prismaA as never,
      { sign: () => "token-de-prueba" } as never,
      { get: () => "https://app.example.test" } as never,
      { send: vi.fn() } as never,
      { isEnabled: () => false } as never,
      jobs as never,
    );
    const guardada = "Mayus-Cupo@Test.local";
    const u = await prismaA.user.create({
      data: { email: guardada, name: "Mayúsculas" },
    });

    await auth.resendVerification({ email: "mayus-cupo@test.local" });

    expect(await enVentana(u.id)).toBe(1);
    expect(jobs.enqueueEmail).toHaveBeenCalledTimes(1);
    // Se entrega a la dirección COMO ESTÁ GUARDADA.
    expect(jobs.enqueueEmail.mock.calls[0]![0].to).toBe(guardada);

    // Y si dos cuentas difieren sólo en mayúsculas, no se adivina.
    await prismaA.user.create({
      data: { email: "MAYUS-CUPO@test.local", name: "Gemela" },
    });
    await auth.resendVerification({ email: "mayus-cupo@test.local" });
    expect(jobs.enqueueEmail).toHaveBeenCalledTimes(1);
    const ultimo = await prismaA.authEvent.findFirst({
      where: { type: "EMAIL_VERIFICATION_REQUESTED", userId: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(ultimo!.metadata).toMatchObject({ reason: "AMBIGUOUS_CASE" });
  });

  it("el correo del registro cuenta en el mismo cupo que los reenvíos", async () => {
    // Por el servicio entero y contra la base real: el registro reserva su
    // hueco por el mismo camino, de modo que tras él sólo caben dos reenvíos.
    const resend = { send: vi.fn().mockResolvedValue(undefined) };
    const jobs = { enqueueEmail: vi.fn().mockResolvedValue(undefined) };
    const config = {
      get: (k: string) =>
        ({
          JWT_REFRESH_EXPIRES_IN: "30d",
          APP_URL: "https://app.example.test",
        })[k],
    };
    const auth = new AuthService(
      prismaA as never,
      { sign: () => "token-de-prueba" } as never,
      config as never,
      resend as never,
      { isEnabled: () => false } as never,
      jobs as never,
    );

    const email = "registro-cupo@test.local";
    await auth.register({ email, password: "UnaClave-larga-9", name: "Reg" });
    const user = await prismaA.user.findUniqueOrThrow({ where: { email } });

    // El envío del registro no se espera en la respuesta: aguarda a su fila.
    for (let i = 0; i < 100 && (await enVentana(user.id)) < 1; i++) {
      await sleep(20);
    }
    expect(await enVentana(user.id)).toBe(1);
    expect(resend.send).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i++) {
      await auth.resendVerification({ email });
    }

    // Uno del registro + dos reenvíos = el techo. El tercero se negó.
    expect(await enVentana(user.id)).toBe(VERIFICATION_SEND_MAX_PER_WINDOW);
    expect(jobs.enqueueEmail).toHaveBeenCalledTimes(2);
    const eventos = await prismaA.authEvent.findMany({
      where: { userId: user.id, type: "EMAIL_VERIFICATION_REQUESTED" },
      orderBy: { createdAt: "asc" },
    });
    expect(eventos.map((e) => e.metadata)).toEqual([
      { queued: true },
      { queued: true },
      { skipped: true, reason: "ADDRESS_RATE_LIMITED", sentInWindow: 3 },
    ]);
  });
});

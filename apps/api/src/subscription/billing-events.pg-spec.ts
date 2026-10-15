/**
 * Los eventos de suscripción, aplicados contra una base real.
 *
 * Lo que las pruebas unitarias ya cubren —firma inválida, idempotencia por id
 * de evento, mapeo de precios y de estados— no se repite aquí. Lo que una
 * Prisma simulada no puede demostrar es lo que esta suite busca:
 *
 *  1. Que dos personas con suscripciones distintas no se pisen.
 *  2. Qué pasa de verdad cuando los eventos llegan FUERA DE ORDEN, que es algo
 *     que el propio Stripe advierte que puede ocurrir.
 *
 * El proveedor de pagos está simulado: `stripe` se reemplaza por un doble que
 * devuelve el evento que cada caso quiera. Nada sale a la red, no hay claves
 * reales y no se cobra nada. Lo real es la base y el código que escribe en
 * ella, que es lo que está bajo prueba.
 */

import { execSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mockConstructEvent = vi.fn();

vi.mock("stripe", () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: mockConstructEvent },
    invoices: { list: vi.fn() },
    subscriptions: { retrieve: vi.fn(), update: vi.fn() },
  }));
  (MockStripe as unknown as { Stripe: unknown }).Stripe = MockStripe;
  return { default: MockStripe, Stripe: MockStripe };
});

const DB = "billing_events_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("eventos de suscripción contra PostgreSQL real", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  // Tipado laxo a propósito: el proveedor se construye con dependencias
  // reales y el doble de Stripe, y su firma completa no aporta aquí.
  let provider: {
    handleWebhook(raw: Buffer, sig: string): Promise<void>;
  };

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

    const { StripeProvider } =
      await import("./providers/stripe/stripe.provider");
    // El doble de configuración responde por clave. Devolver el mismo valor
    // para todas hacía que ningún precio mapeara a un plan y los seis casos
    // terminaran en FREE: un fallo del arnés que se lee igual que un defecto
    // del producto, y por eso conviene que cada clave diga lo suyo.
    const CONFIG: Record<string, string> = {
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro_monthly",
      STRIPE_PRO_YEARLY_PRICE_ID: "price_pro_yearly",
      STRIPE_B2B_PRICE_ID: "price_b2b",
    };
    provider = new StripeProvider(
      prisma as never,
      {
        get: (clave: string) => CONFIG[clave],
      } as never,
    ) as unknown as typeof provider;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.subscription.deleteMany({});
    await prisma.stripeEvent.deleteMany({});
    await prisma.user.deleteMany({});
    for (const [id, email, cus] of [
      [ANA, "ana@ejemplo.local", "cus_ana"],
      [BRUNO, "bruno@ejemplo.local", "cus_bruno"],
    ]) {
      await prisma.user.create({
        data: { id, email, name: id, plan: "FREE", stripeCustomerId: cus },
      });
    }
  });

  /** Un evento de suscripción con el periodo y el estado que se pidan. */
  function evento(opts: {
    id: string;
    userId: string;
    subId: string;
    status: string;
    priceId?: string;
    created?: number;
    type?: string;
  }) {
    const ahora = Math.floor(Date.now() / 1000);
    return {
      id: opts.id,
      type: opts.type ?? "customer.subscription.updated",
      created: opts.created ?? ahora,
      data: {
        object: {
          id: opts.subId,
          status: opts.status,
          metadata: { userId: opts.userId },
          customer: `cus_${opts.userId.split("-")[1]}`,
          start_date: ahora,
          billing_cycle_anchor: ahora + 2_592_000,
          cancel_at_period_end: false,
          items: {
            data: [
              {
                price: { id: opts.priceId ?? "price_pro_monthly" },
                current_period_start: ahora,
                current_period_end: ahora + 2_592_000,
              },
            ],
          },
        },
      },
    };
  }

  const entregar = async (e: ReturnType<typeof evento>) => {
    mockConstructEvent.mockReturnValue(e);
    await provider.handleWebhook(Buffer.from("{}"), "sig");
  };

  const planDe = async (userId: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).plan;

  it("aplica una suscripción y sube el plan de esa persona", async () => {
    await entregar(
      evento({ id: "evt_1", userId: ANA, subId: "sub_ana", status: "active" }),
    );
    expect(await planDe(ANA)).toBe("PRO");
  });

  it("la suscripción de una persona no toca a la otra", async () => {
    await entregar(
      evento({ id: "evt_1", userId: ANA, subId: "sub_ana", status: "active" }),
    );
    expect(await planDe(ANA)).toBe("PRO");
    expect(await planDe(BRUNO)).toBe("FREE");

    const deBruno = await prisma.subscription.findMany({
      where: { userId: BRUNO },
    });
    expect(deBruno).toHaveLength(0);
  });

  it("dos suscripciones simultáneas quedan separadas", async () => {
    await entregar(
      evento({ id: "evt_1", userId: ANA, subId: "sub_ana", status: "active" }),
    );
    await entregar(
      evento({
        id: "evt_2",
        userId: BRUNO,
        subId: "sub_bruno",
        status: "active",
        priceId: "price_b2b",
      }),
    );
    const ana = await prisma.subscription.findUniqueOrThrow({
      where: { userId: ANA },
    });
    const bruno = await prisma.subscription.findUniqueOrThrow({
      where: { userId: BRUNO },
    });
    expect(ana.stripeSubscriptionId).toBe("sub_ana");
    expect(bruno.stripeSubscriptionId).toBe("sub_bruno");
    expect(ana.userId).not.toBe(bruno.userId);
  });

  it("un evento repetido no se aplica dos veces", async () => {
    const e = evento({
      id: "evt_repetido",
      userId: ANA,
      subId: "sub_ana",
      status: "active",
    });
    await entregar(e);
    await entregar(e);
    const filas = await prisma.stripeEvent.findMany({
      where: { stripeEventId: "evt_repetido" },
    });
    expect(filas).toHaveLength(1);
    expect(await planDe(ANA)).toBe("PRO");
  });

  it("una cancelación posterior deja a la persona en FREE", async () => {
    await entregar(
      evento({ id: "evt_1", userId: ANA, subId: "sub_ana", status: "active" }),
    );
    await entregar(
      evento({
        id: "evt_2",
        userId: ANA,
        subId: "sub_ana",
        status: "canceled",
        type: "customer.subscription.deleted",
      }),
    );
    expect(await planDe(ANA)).toBe("FREE");
  });

  /**
   * El caso que motiva esta suite.
   *
   * Stripe advierte que sus eventos pueden llegar desordenados. El contrato
   * actual aplica cada uno tal cual: `syncSubscription` hace un upsert sin
   * comparar nada contra lo ya guardado. Esta prueba NO afirma que eso esté
   * bien; documenta qué ocurre, que es lo que hacía falta para decidir.
   */
  it("fuera de orden: un evento viejo aplicado después REVIVE el plan", async () => {
    const viejo = evento({
      id: "evt_viejo",
      userId: ANA,
      subId: "sub_ana",
      status: "active",
      created: 1_000,
    });
    const nuevo = evento({
      id: "evt_nuevo",
      userId: ANA,
      subId: "sub_ana",
      status: "canceled",
      type: "customer.subscription.deleted",
      created: 2_000,
    });

    // Orden correcto: alta y luego baja → FREE.
    await entregar(viejo);
    await entregar(nuevo);
    expect(await planDe(ANA)).toBe("FREE");

    // Mismo par, al revés — que es exactamente lo que una reentrega tardía
    // produce. El id es distinto porque la idempotencia va por evento, no por
    // suscripción: no protege de esto.
    await prisma.stripeEvent.deleteMany({});
    await entregar({ ...nuevo, id: "evt_nuevo_b" });
    await entregar({ ...viejo, id: "evt_viejo_b" });

    // El resultado final depende del orden de llegada, no del orden real de
    // los hechos. Queda registrado como hallazgo, con su decisión pendiente.
    expect(await planDe(ANA)).toBe("PRO");
  });
});

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
  createThrowawayDatabase,
  type ThrowawayDatabase,
} from "../test/throwaway-database";
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

/**
 * El estado que Stripe devolvería hoy por cada suscripción.
 *
 * Es la pieza del arnés que el arreglo de D-ORD vuelve imprescindible: el
 * proveedor ya no aplica el objeto del evento, sino el que `retrieve`
 * devuelve. Un evento viejo y la verdad actual pasan a ser dos cosas
 * distintas, y aquí se pueden expresar por separado.
 */
const estadoEnStripe = new Map<string, unknown>();

/**
 * Una puerta para detener la relectura de Stripe en un punto exacto.
 *
 * Las pruebas de intercalación no pueden depender de que el planificador
 * ordene dos promesas a su gusto: eso prueba lo que salió ese día. Con esto,
 * la prueba decide cuándo avanza cada manejador y puede afirmar qué llegó a
 * ocurrir y qué no.
 */
let puertaRetrieve: {
  abrir: () => void;
  esperar: Promise<void>;
  llamadas: number;
} | null = null;

const abrirPuerta = () => {
  let abrir: () => void = () => {};
  const esperar = new Promise<void>((res) => {
    abrir = res;
  });
  puertaRetrieve = { abrir, esperar, llamadas: 0 };
  return puertaRetrieve;
};

const leerDeStripe = async (id: string) => {
  if (puertaRetrieve) {
    puertaRetrieve.llamadas += 1;
    // Sólo la PRIMERA relectura se detiene; las siguientes pasan de largo.
    if (puertaRetrieve.llamadas === 1) await puertaRetrieve.esperar;
  }
  const actual = estadoEnStripe.get(id);
  if (!actual) throw new Error(`Stripe double: no hay suscripción ${id}`);
  return actual;
};

const mockRetrieve = vi.fn(leerDeStripe);

vi.mock("stripe", () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: mockConstructEvent },
    invoices: { list: vi.fn() },
    subscriptions: { retrieve: mockRetrieve, update: vi.fn() },
  }));
  (MockStripe as unknown as { Stripe: unknown }).Stripe = MockStripe;
  return { default: MockStripe, Stripe: MockStripe };
});

const API_DIR = process.cwd();

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("eventos de suscripción contra PostgreSQL real", () => {
  let desechable: ThrowawayDatabase;
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
    // Nombre único por ejecución, y borrado acotado a lo que esta suite creó.
    // El `DROP ... WITH (FORCE)` sobre un nombre fijo destruía cualquier base
    // homónima —de quien fuera— cerrándole las conexiones abiertas.
    desechable = await createThrowawayDatabase(
      base as string,
      "billing_events",
    );
    const url = desechable.url;
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
    await desechable?.drop();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRetrieve.mockImplementation(leerDeStripe);
    puertaRetrieve = null;
    estadoEnStripe.clear();
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

  /**
   * Entrega un evento. Por defecto publica también su objeto como el estado
   * actual en Stripe, que es el caso normal: el evento acaba de ocurrir.
   *
   * `desincronizado: true` entrega el evento SIN tocar ese estado, que es lo
   * que produce una reentrega tardía — el evento dice una cosa y Stripe ya
   * dice otra.
   */
  const entregar = async (
    e: ReturnType<typeof evento>,
    opts: { desincronizado?: boolean } = {},
  ) => {
    if (!opts.desincronizado) {
      estadoEnStripe.set(e.data.object.id, e.data.object);
    }
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
   * El caso que motiva esta suite, ahora como REGRESIÓN y no como retrato.
   *
   * La versión anterior entregaba el par al revés y afirmaba `PRO`: dejaba
   * escrito que un evento viejo revivía el plan después de una baja. Eso
   * documentaba el defecto; no lo impedía. Aquí se exige el resultado
   * correcto.
   *
   * Lo que lo arregla no es ordenar por `created` —Stripe desaconseja
   * explícitamente usar ese campo para ordenar, porque va en segundos y dos
   * eventos distintos pueden compartirlo— sino releer la suscripción. El
   * evento pasa a ser la señal de que algo cambió; el estado lo dice Stripe.
   */
  it("fuera de orden: un evento viejo NO revive el plan", async () => {
    const alta = evento({
      id: "evt_alta",
      userId: ANA,
      subId: "sub_ana",
      status: "active",
      created: 1_000,
    });
    const baja = evento({
      id: "evt_baja",
      userId: ANA,
      subId: "sub_ana",
      status: "canceled",
      type: "customer.subscription.deleted",
      created: 2_000,
    });

    // Orden correcto: alta y luego baja → FREE.
    await entregar(alta);
    await entregar(baja);
    expect(await planDe(ANA)).toBe("FREE");

    // Y ahora la reentrega tardía del alta. En Stripe la suscripción sigue
    // cancelada; sólo llega otra vez el sobre viejo.
    await entregar(
      { ...alta, id: "evt_alta_reentregada" },
      {
        desincronizado: true,
      },
    );
    expect(await planDe(ANA)).toBe("FREE");
  });

  it("al revés también: la baja llega primero y el alta después", async () => {
    // El mismo par, invertido en la red. La verdad en Stripe es la baja.
    const alta = evento({
      id: "evt_alta",
      userId: ANA,
      subId: "sub_ana",
      status: "active",
      created: 1_000,
    });
    const baja = evento({
      id: "evt_baja",
      userId: ANA,
      subId: "sub_ana",
      status: "canceled",
      type: "customer.subscription.deleted",
      created: 2_000,
    });

    await entregar(baja);
    await entregar({ ...alta, id: "evt_alta_b" }, { desincronizado: true });
    expect(await planDe(ANA)).toBe("FREE");
  });

  it("empate temporal: el mismo segundo no decide, decide Stripe", async () => {
    // Stripe avisa de que dos eventos distintos pueden compartir `created`.
    // Con el mismo segundo en los dos, cualquier orden de llegada tiene que
    // dar el mismo resultado, porque ninguno de los dos ordena nada.
    const t = 1_700_000_000;
    const alta = evento({
      id: "evt_empate_alta",
      userId: ANA,
      subId: "sub_ana",
      status: "active",
      created: t,
    });
    const baja = evento({
      id: "evt_empate_baja",
      userId: ANA,
      subId: "sub_ana",
      status: "canceled",
      type: "customer.subscription.deleted",
      created: t,
    });

    await entregar(alta);
    await entregar(baja); // la verdad en Stripe queda: cancelada
    expect(await planDe(ANA)).toBe("FREE");

    // Reentrega del alta con el MISMO segundo. Un desempate por reloj no
    // podría decidir; la relectura sí.
    await entregar(
      { ...alta, id: "evt_empate_alta_b" },
      {
        desincronizado: true,
      },
    );
    expect(await planDe(ANA)).toBe("FREE");
  });

  it("una suscripción anterior no toca a la vigente", async () => {
    // Ana se da de baja de sub_vieja y contrata sub_nueva. Después llega,
    // tarde, la baja de la vieja: no puede quitarle el plan que ya paga.
    await entregar(
      evento({
        id: "evt_v1",
        userId: ANA,
        subId: "sub_vieja",
        status: "active",
      }),
    );
    await entregar(
      evento({
        id: "evt_v2",
        userId: ANA,
        subId: "sub_vieja",
        status: "canceled",
        type: "customer.subscription.deleted",
      }),
    );
    expect(await planDe(ANA)).toBe("FREE");

    await entregar(
      evento({
        id: "evt_n1",
        userId: ANA,
        subId: "sub_nueva",
        status: "active",
      }),
    );
    expect(await planDe(ANA)).toBe("PRO");

    // La baja tardía de la suscripción ya sustituida.
    await entregar(
      evento({
        id: "evt_v2_tarde",
        userId: ANA,
        subId: "sub_vieja",
        status: "canceled",
        type: "customer.subscription.deleted",
      }),
    );
    expect(await planDe(ANA)).toBe("PRO");
    const fila = await prisma.subscription.findUniqueOrThrow({
      where: { userId: ANA },
    });
    expect(fila.stripeSubscriptionId).toBe("sub_nueva");
  });

  it("dos entregas simultáneas del mismo evento dejan una sola fila", async () => {
    const e = evento({
      id: "evt_concurrente",
      userId: ANA,
      subId: "sub_ana",
      status: "active",
    });
    estadoEnStripe.set(e.data.object.id, e.data.object);
    mockConstructEvent.mockReturnValue(e);

    // A la vez, no una después de otra: es la carrera que `findUnique` +
    // `create` no cerraba.
    const resultados = await Promise.allSettled([
      provider.handleWebhook(Buffer.from("{}"), "sig"),
      provider.handleWebhook(Buffer.from("{}"), "sig"),
    ]);
    // Ninguna de las dos puede dejar la base a medias; si una falla, falla
    // hacia fuera para que Stripe reintente.
    expect(resultados.some((r) => r.status === "fulfilled")).toBe(true);

    const filas = await prisma.stripeEvent.findMany({
      where: { stripeEventId: "evt_concurrente" },
    });
    expect(filas).toHaveLength(1);
    expect(await planDe(ANA)).toBe("PRO");
  });

  it("un fallo parcial se reintenta y acaba aplicándose", async () => {
    const e = evento({
      id: "evt_a_medias",
      userId: ANA,
      subId: "sub_ana",
      status: "active",
    });
    estadoEnStripe.set(e.data.object.id, e.data.object);

    // Primer intento: la relectura se cae a mitad del proceso.
    mockRetrieve.mockRejectedValueOnce(new Error("Stripe caído"));
    mockConstructEvent.mockReturnValue(e);
    await expect(
      provider.handleWebhook(Buffer.from("{}"), "sig"),
    ).rejects.toThrow();

    // El efecto no se aplicó Y el evento NO quedó sellado como hecho: ésa es
    // la diferencia con el contrato anterior, que lo marcaba procesado y
    // perdía el efecto para siempre.
    expect(await planDe(ANA)).toBe("FREE");
    const reclamado = await prisma.stripeEvent.findUniqueOrThrow({
      where: { stripeEventId: "evt_a_medias" },
    });
    expect(reclamado.processedAt).toBeNull();

    // Reintento de Stripe: el mismo evento, ahora sí.
    await entregar(e);
    expect(await planDe(ANA)).toBe("PRO");
    const sellado = await prisma.stripeEvent.findUniqueOrThrow({
      where: { stripeEventId: "evt_a_medias" },
    });
    expect(sellado.processedAt).not.toBeNull();
  });

  /**
   * Las tres garantías que una revisión pidió acreditar, y que releer por sí
   * solo NO da. Cada una se monta con la puerta, no con un `Promise.all` que
   * dependa del planificador.
   */
  describe("concurrencia entre eventos distintos", () => {
    const esperarUnPoco = () => new Promise((r) => setTimeout(r, 400));

    it("una lectura anterior no puede escribir después de una posterior", async () => {
      // El escenario exacto: A obtiene «activa», B obtiene y persiste
      // «cancelada», A intenta persistir después. Sin serializar, A pisa a B.
      await entregar(
        evento({
          id: "evt_base",
          userId: ANA,
          subId: "sub_ana",
          status: "active",
        }),
      );
      expect(await planDe(ANA)).toBe("PRO");

      const puerta = abrirPuerta();

      // A: un `updated` que, cuando lea, verá «activa».
      const eventoA = evento({
        id: "evt_A",
        userId: ANA,
        subId: "sub_ana",
        status: "active",
      });
      estadoEnStripe.set("sub_ana", eventoA.data.object);
      mockConstructEvent.mockReturnValue(eventoA);
      const A = provider.handleWebhook(Buffer.from("{}"), "sig");

      // Se deja que A entre en el candado y se detenga en la relectura.
      await esperarUnPoco();
      expect(puerta.llamadas).toBe(1);

      // B: la baja. Mientras A está detenido, la verdad en Stripe cambia.
      const eventoB = evento({
        id: "evt_B",
        userId: ANA,
        subId: "sub_ana",
        status: "canceled",
        type: "customer.subscription.deleted",
      });
      estadoEnStripe.set("sub_ana", eventoB.data.object);
      mockConstructEvent.mockReturnValue(eventoB);
      const B = provider.handleWebhook(Buffer.from("{}"), "sig");

      // ESTA es la afirmación que prueba el mecanismo: B ni siquiera ha
      // llegado a leer. Está esperando el candado que A tiene tomado, así que
      // la intercalación «A lee / B lee / B escribe / A escribe» no puede
      // montarse. Sin candado, aquí habría 2 llamadas.
      await esperarUnPoco();
      expect(puerta.llamadas).toBe(1);

      puerta.abrir();
      await A;
      await B;

      // B leyó DESPUÉS de que A confirmara, así que vio la cancelación y la
      // escribió al final. La lectura vieja de A no sobrevive.
      expect(puerta.llamadas).toBe(2);
      expect(await planDe(ANA)).toBe("FREE");
    });

    it("el candado es por persona: dos personas no se bloquean entre sí", async () => {
      // Guard the guard: si el candado fuera global, la prueba de arriba
      // pasaría por serializarlo todo y el webhook se volvería un cuello de
      // botella. Aquí se comprueba que sólo serializa a quien comparte fila.
      const puerta = abrirPuerta();

      const deAna = evento({
        id: "evt_ana",
        userId: ANA,
        subId: "sub_ana",
        status: "active",
      });
      estadoEnStripe.set("sub_ana", deAna.data.object);
      mockConstructEvent.mockReturnValue(deAna);
      const A = provider.handleWebhook(Buffer.from("{}"), "sig");
      await esperarUnPoco();
      expect(puerta.llamadas).toBe(1);

      const deBruno = evento({
        id: "evt_bruno",
        userId: BRUNO,
        subId: "sub_bruno",
        status: "active",
        priceId: "price_b2b",
      });
      estadoEnStripe.set("sub_bruno", deBruno.data.object);
      mockConstructEvent.mockReturnValue(deBruno);
      const B = provider.handleWebhook(Buffer.from("{}"), "sig");

      // Bruno sí puede leer mientras Ana está detenida: su fila es otra.
      await esperarUnPoco();
      expect(puerta.llamadas).toBe(2);

      puerta.abrir();
      await Promise.all([A, B]);
      expect(await planDe(ANA)).toBe("PRO");
      expect(await planDe(BRUNO)).toBe("B2B");
    });

    it("un evento tardío de la anterior no desplaza a la nueva, también en concurrencia", async () => {
      // Ana cancela sub_vieja y contrata sub_nueva. La baja tardía de la
      // vieja llega A LA VEZ que el alta de la nueva.
      await entregar(
        evento({
          id: "evt_v1",
          userId: ANA,
          subId: "sub_vieja",
          status: "active",
        }),
      );
      await entregar(
        evento({
          id: "evt_v2",
          userId: ANA,
          subId: "sub_vieja",
          status: "canceled",
          type: "customer.subscription.deleted",
        }),
      );

      const puerta = abrirPuerta();

      // Primero entra el alta de la nueva y se detiene en la relectura.
      const alta = evento({
        id: "evt_n1",
        userId: ANA,
        subId: "sub_nueva",
        status: "active",
      });
      estadoEnStripe.set("sub_nueva", alta.data.object);
      mockConstructEvent.mockReturnValue(alta);
      const N = provider.handleWebhook(Buffer.from("{}"), "sig");
      await esperarUnPoco();
      expect(puerta.llamadas).toBe(1);

      // Y ahora la baja tardía de la vieja, que espera el candado.
      const tardio = evento({
        id: "evt_v2_tarde",
        userId: ANA,
        subId: "sub_vieja",
        status: "canceled",
        type: "customer.subscription.deleted",
      });
      mockConstructEvent.mockReturnValue(tardio);
      const T = provider.handleWebhook(Buffer.from("{}"), "sig");
      await esperarUnPoco();
      expect(puerta.llamadas).toBe(1);

      puerta.abrir();
      await N;
      await T;

      // La guarda de identidad se evaluó DENTRO del candado, con la fila ya
      // escrita por el alta: la baja tardía se encontró el sitio ocupado por
      // sub_nueva y no lo tocó.
      expect(await planDe(ANA)).toBe("PRO");
      const fila = await prisma.subscription.findUniqueOrThrow({
        where: { userId: ANA },
      });
      expect(fila.stripeSubscriptionId).toBe("sub_nueva");
      expect(fila.status).toBe("ACTIVE");
    });
  });

  describe("reclamación y recuperación", () => {
    it("un fallo ENTRE aplicar el efecto y sellarlo se recupera sin duplicar", async () => {
      const e = evento({
        id: "evt_sin_sellar",
        userId: ANA,
        subId: "sub_ana",
        status: "active",
      });
      estadoEnStripe.set("sub_ana", e.data.object);
      mockConstructEvent.mockReturnValue(e);

      // El sello falla una vez, justo después de que el efecto ya se aplicó.
      const sellar = prisma.stripeEvent.update.bind(prisma.stripeEvent);
      let falladoYa = false;
      (prisma.stripeEvent as { update: unknown }).update = async (
        args: Parameters<typeof sellar>[0],
      ) => {
        if (!falladoYa) {
          falladoYa = true;
          throw new Error("se cayó antes de sellar");
        }
        return sellar(args);
      };

      await expect(
        provider.handleWebhook(Buffer.from("{}"), "sig"),
      ).rejects.toThrow();

      // El efecto SÍ se aplicó y el evento quedó sin sellar.
      expect(await planDe(ANA)).toBe("PRO");
      const aMedias = await prisma.stripeEvent.findUniqueOrThrow({
        where: { stripeEventId: "evt_sin_sellar" },
      });
      expect(aMedias.processedAt).toBeNull();

      // Reintento de Stripe. No duplica —la relectura converge al mismo
      // estado y la fila de suscripción es única por persona— y esta vez
      // sella.
      await provider.handleWebhook(Buffer.from("{}"), "sig");
      (prisma.stripeEvent as { update: unknown }).update = sellar;

      expect(await planDe(ANA)).toBe("PRO");
      expect(await prisma.subscription.count({ where: { userId: ANA } })).toBe(
        1,
      );
      const filas = await prisma.stripeEvent.findMany({
        where: { stripeEventId: "evt_sin_sellar" },
      });
      expect(filas).toHaveLength(1);
      expect(filas[0]?.processedAt).not.toBeNull();
    });

    it("una reclamación inconclusa no bloquea el evento para siempre", async () => {
      // No hay estado «en proceso» con dueño ni plazo: una fila sin sellar es
      // simplemente reaplicable. Se simula el intento muerto escribiéndola a
      // mano, que es lo que deja un proceso que se cayó.
      await prisma.stripeEvent.create({
        data: {
          stripeEventId: "evt_huerfano",
          type: "customer.subscription.updated",
          processedAt: null,
        },
      });

      const e = evento({
        id: "evt_huerfano",
        userId: ANA,
        subId: "sub_ana",
        status: "active",
      });
      await entregar(e);

      expect(await planDe(ANA)).toBe("PRO");
      const sellado = await prisma.stripeEvent.findUniqueOrThrow({
        where: { stripeEventId: "evt_huerfano" },
      });
      expect(sellado.processedAt).not.toBeNull();
    });
  });

  it("un evento sin dueño declarado no toca a nadie", async () => {
    const huerfano = evento({
      id: "evt_sin_dueno",
      userId: ANA,
      subId: "sub_huerfana",
      status: "active",
    });
    huerfano.data.object.metadata = {} as { userId: string };
    await entregar(huerfano);
    expect(await planDe(ANA)).toBe("FREE");
    expect(await prisma.subscription.count()).toBe(0);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExpectedUnavailableException } from "../shared/filters/expected-unavailable.exception";
import { DEMO_THERAPIST_IDS } from "./demo-therapists";
import { TerapiaService } from "./terapia.service";

/**
 * Las guardas de `TerapiaService`, SOLAS.
 *
 * `terapia-offer.e2e-spec.ts` las prueba por HTTP, pero en ese árbol hay otra
 * detrás: `PaymentService` vuelve a negarse antes de llamar al proveedor. Eso
 * es lo que se quería —y significa que, si alguien quitara la guarda del
 * reintento de pago de ESTE servicio, por HTTP no se notaría nada—.
 *
 * Aquí el pago es un doble que cobra sin preguntar. Lo que lo detenga tiene que
 * ser este servicio.
 */

const USER = "user-1";
const DEMO = DEMO_THERAPIST_IDS[0];
const VUELTA = ["https://ok.invalid", "https://no.invalid"] as const;

function sesion(therapistId: string, over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: USER,
    therapistId,
    therapist: {
      id: therapistId,
      name: "Nombre",
      initials: "N",
      title: "T",
      avatarUrl: null,
      coverToken: "warm",
      modalities: ["INDIVIDUAL"],
      specialties: [],
      priceUsd: 40,
      currency: "USD",
      avgRating: 4.9,
      reviewsCount: 64,
    },
    scheduledAt: new Date(),
    durationMin: 50,
    modality: "INDIVIDUAL",
    status: "SCHEDULED",
    paymentStatus: "PENDING",
    priceUsd: 40,
    currency: "USD",
    roomUrl: null,
    intentionCiphertext: null,
    intentionNonce: null,
    checkInMood: null,
    sharedEntryIds: [],
    feedbackRating: null,
    ...over,
  };
}

function montar(oferta: string | undefined) {
  const modelo = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  });
  const prisma = {
    therapist: modelo(),
    therapistFavorite: modelo(),
    therapistReview: modelo(),
    therapySession: modelo(),
    therapyPrescription: modelo(),
    therapyNotification: modelo(),
  };
  const video = { createRoom: vi.fn(), createJoinToken: vi.fn() };
  // Cobra sin preguntar: la segunda guarda NO está aquí a propósito.
  const pagos = {
    createTherapyCheckout: vi
      .fn()
      .mockResolvedValue({ url: "u", stripeCheckoutSessionId: "cs" }),
  };
  const config = {
    get: vi.fn((k: string) => (k === "THERAPY_OFFER" ? oferta : undefined)),
  };
  const service = new TerapiaService(
    prisma as never,
    video as never,
    pagos as never,
    config as never,
  );
  const llamadas = () =>
    Object.entries(prisma).flatMap(([m, api]) =>
      Object.entries(api)
        .filter(([, f]) => f.mock.calls.length > 0)
        .map(([n]) => `${m}.${n}`),
    );
  return { service, prisma, video, pagos, llamadas };
}

async function error(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error("no rechazó");
}

const reserva = (therapistId: string) => ({
  therapistId,
  slotIso: new Date(Date.now() + 86_400_000).toISOString(),
  modality: "INDIVIDUAL" as const,
  successUrl: VUELTA[0],
  cancelUrl: VUELTA[1],
});
const MANANA = new Date(Date.now() + 86_400_000).toISOString();

/** Todos los métodos de oferta, llamados sin pasar por un controlador. */
const OFERTA: Array<[string, (s: TerapiaService) => Promise<unknown>]> = [
  ["listTherapists", (s) => s.listTherapists(USER, {})],
  ["getFilters", (s) => s.getFilters()],
  ["getTherapist", (s) => s.getTherapist(USER, "pro")],
  ["listReviews", (s) => s.listReviews("pro", 1, 10)],
  ["toggleFavorite", (s) => s.toggleFavorite(USER, "pro")],
  ["getAvailability", (s) => s.getAvailability("pro", 14)],
  ["createBooking", (s) => s.createBooking(USER, reserva("pro"))],
  ["rescheduleSession", (s) => s.rescheduleSession(USER, "s1", MANANA)],
  ["retryCheckout", (s) => s.retryCheckout(USER, "s1", ...VUELTA)],
];

describe.each([
  ["sin configurar", undefined],
  ["vacía", ""],
  ["apagada", "off"],
  ["ilegible", "ábrela"],
])("oferta %s", (_caso, valor) => {
  it.each(OFERTA)("%s: 503 antes de leer nada", async (_n, llamar) => {
    const { service, pagos, video, llamadas } = montar(valor);
    const e = await error(llamar(service));
    // Declarado: si dejara de serlo, el filtro escribiría una traza y una
    // alerta por cada intento, en rutas que cualquiera con sesión puede pedir.
    expect(e).toBeInstanceOf(ExpectedUnavailableException);
    expect((e.getResponse() as { code: string }).code).toBe(
      "THERAPY_OFFER_CLOSED",
    );
    expect(llamadas()).toEqual([]);
    expect(pagos.createTherapyCheckout).not.toHaveBeenCalled();
    expect(video.createRoom).not.toHaveBeenCalled();
  });
});

describe("oferta abierta, sesión de una ficha de demostración, sin segunda guarda", () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar("on");
    m.prisma.therapySession.findUnique.mockResolvedValue(sesion(DEMO));
  });

  it.each([
    [
      "retryCheckout",
      (s: TerapiaService) => s.retryCheckout(USER, "s1", ...VUELTA),
    ],
    [
      "rescheduleSession",
      (s: TerapiaService) => s.rescheduleSession(USER, "s1", MANANA),
    ],
    ["joinSession", (s: TerapiaService) => s.joinSession(USER, "s1", "n")],
    [
      "updateSessionPrep",
      (s: TerapiaService) =>
        s.updateSessionPrep(USER, "s1", { sharedEntryIds: [] }),
    ],
  ])("%s: 409 y lo único que leyó es la sesión", async (_n, llamar) => {
    const e = await error(llamar(m.service));
    expect(e.getStatus()).toBe(409);
    expect((e.getResponse() as { code: string }).code).toBe(
      "THERAPY_DEMO_SESSION",
    );
    expect(m.llamadas()).toEqual(["therapySession.findUnique"]);
    expect(m.pagos.createTherapyCheckout).not.toHaveBeenCalled();
    expect(m.video.createRoom).not.toHaveBeenCalled();
    expect(m.video.createJoinToken).not.toHaveBeenCalled();
  });

  it("createBooking: 404 sin leer nada, aunque la fila exista y esté activa", async () => {
    m.prisma.therapist.findUnique.mockResolvedValue({
      id: DEMO,
      isActive: true,
      modalities: ["INDIVIDUAL"],
    });
    const e = await error(m.service.createBooking(USER, reserva(DEMO)));
    expect(e.getStatus()).toBe(404);
    expect(m.llamadas()).toEqual([]);
    expect(m.pagos.createTherapyCheckout).not.toHaveBeenCalled();
  });
});

describe("oferta abierta, sesión real (control contrario)", () => {
  it("el reintento de pago llega al cobro con el profesional de la sesión", async () => {
    const m = montar("on");
    m.prisma.therapySession.findUnique.mockResolvedValue(sesion("pro"));
    const res = await m.service.retryCheckout(USER, "s1", ...VUELTA);
    expect(res.checkoutUrl).toBe("u");
    expect(m.pagos.createTherapyCheckout.mock.calls[0]![0]).toMatchObject({
      therapistId: "pro",
    });
  });
});

describe("lo que se publica de la puerta", () => {
  it.each([
    ["cerrada", undefined, false],
    ["abierta", "on", true],
  ])("%s: en la lista de sesiones y en el detalle", async (_c, valor, open) => {
    const m = montar(valor);
    m.prisma.therapySession.findUnique.mockResolvedValue(sesion("pro"));
    expect((await m.service.listSessions(USER)).offer).toEqual({ open });
    expect((await m.service.getSessionPrep(USER, "s1")).offer).toEqual({
      open,
    });
    expect((await m.service.getHub(USER)).offer).toEqual({ open });
  });
});

/**
 * El trinquete de las guardas: valen mientras no haya otra puerta al lado.
 *
 * Un módulo nuevo que leyera fichas, pidiera un cobro o abriera una sala por su
 * cuenta no pasaría por nada de lo de arriba, y ninguna de esas pruebas lo
 * notaría. Si hace falta de verdad, que sea una decisión: se añade aquí después
 * de ponerle su guarda.
 */
describe("no hay otro camino", () => {
  const SRC = resolve(__dirname, "..");

  const fuentes = (dir = SRC): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return fuentes(p);
      return /\.ts$/.test(e.name) && !/(spec|testing)\.ts$/.test(e.name)
        ? [p]
        : [];
    });

  const quienes = (patron: RegExp) =>
    fuentes()
      .filter((f) => patron.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f))
      .sort();

  it("sólo el servicio de terapia lee fichas de terapeuta", () => {
    expect(quienes(/\bprisma\.therapist\w*\./)).toEqual([
      "terapia/terapia.service.ts",
    ]);
  });

  it("sólo el servicio de terapia crea sesiones", () => {
    expect(quienes(/\.therapySession\.(?:create|upsert|createMany)\(/)).toEqual(
      ["terapia/terapia.service.ts"],
    );
  });

  it("el cobro lo pide el servicio de terapia y lo hace PaymentService", () => {
    expect(quienes(/\.createTherapyCheckout\(/)).toEqual([
      "subscription/payment.service.ts",
      "terapia/terapia.service.ts",
    ]);
  });

  it("sólo el servicio de terapia abre salas", () => {
    expect(quienes(/\.createRoom\(/)).toEqual(["terapia/terapia.service.ts"]);
  });
});

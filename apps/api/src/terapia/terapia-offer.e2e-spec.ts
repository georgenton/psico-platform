import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { STRIPE_PROVIDER } from "../subscription/providers/provider-tokens";
import { closeE2EApp, createE2EApp, type E2EHarness } from "../test/e2e-app";
import { DEMO_THERAPIST_IDS } from "./demo-therapists";
import { TerapiaController } from "./terapia.controller";
import { VIDEO_PROVIDER } from "./tokens";

/**
 * Toda ruta de terapia por HTTP, con la oferta cerrada y con la oferta abierta.
 *
 * ── Qué se prueba y por qué por HTTP ──────────────────────────────────────
 *
 * Lo que había que cerrar no era un método: era lo que una persona con sesión
 * podía hacer escribiendo la dirección. Una prueba de servicio aprobaría igual
 * si un controlador se saltara la guarda, así que aquí se arranca la aplicación
 * como `main.ts` y se piden todas las rutas.
 *
 * Los proveedores van sustituidos —pago y vídeo— y Prisma es un doble, de modo
 * que «no llegó a pasar nada» se comprueba y no se supone: cero llamadas a los
 * dos proveedores, y ningún método de Prisma salvo la relectura de la persona
 * que hace la autenticación en cada petición (ADR 0015).
 *
 * ── El trinquete ──────────────────────────────────────────────────────────
 *
 * `RUTAS` clasifica cada ruta del controlador, y la primera prueba la compara
 * con los metadatos reales. Añadir una ruta sin clasificarla rompe la suite; y
 * clasificarla como oferta la somete a todo lo de abajo.
 */

const USER_ID = "user-terapia";
const EMAIL = "terapia@psico.test";

/** Un profesional que NO es de demostración. */
const PROFESIONAL = "pro-real-1";
const DEMO = DEMO_THERAPIST_IDS[0];
const SESION = "sesion-1";

const MANANA = new Date(Date.now() + 24 * 3600_000).toISOString();
const PASADO_MANANA = new Date(Date.now() + 48 * 3600_000).toISOString();

const VUELTA = {
  successUrl: "https://staging.feelverse.app/dashboard/terapia/sesiones",
  cancelUrl: "https://staging.feelverse.app/dashboard/terapia/terapeutas",
};

type Clase =
  /** Sin sesión: las líneas de ayuda. No es oferta. */
  | "publica"
  /** Descubrir, reservar, pagar o mover. La puerta la cierra. */
  | "oferta"
  /** Lo que alguien ya tuviera. La puerta NO la cierra. */
  | "continuidad";

interface Ruta {
  clase: Clase;
  /** Cómo se pide. `therapistId` elige la ficha en las rutas que llevan una. */
  pedir: (therapistId: string) => { url: string; cuerpo?: object };
}

const RUTAS: Record<string, Ruta> = {
  "GET crisis": { clase: "publica", pedir: () => ({ url: "crisis" }) },
  "POST crisis/log": {
    clase: "publica",
    pedir: () => ({ url: "crisis/log", cuerpo: { trigger: "HOME_BUTTON" } }),
  },

  "GET therapists/filters": {
    clase: "oferta",
    pedir: () => ({ url: "therapists/filters" }),
  },
  "GET therapists": { clase: "oferta", pedir: () => ({ url: "therapists" }) },
  "GET therapists/:id": {
    clase: "oferta",
    pedir: (t) => ({ url: `therapists/${t}` }),
  },
  "GET therapists/:id/reviews": {
    clase: "oferta",
    pedir: (t) => ({ url: `therapists/${t}/reviews` }),
  },
  "POST therapists/:id/favorite": {
    clase: "oferta",
    pedir: (t) => ({ url: `therapists/${t}/favorite`, cuerpo: {} }),
  },
  "GET therapists/:id/availability": {
    clase: "oferta",
    pedir: (t) => ({ url: `therapists/${t}/availability?days=14` }),
  },
  "POST bookings": {
    clase: "oferta",
    pedir: (t) => ({
      url: "bookings",
      cuerpo: {
        therapistId: t,
        slotIso: MANANA,
        modality: "INDIVIDUAL",
        ...VUELTA,
      },
    }),
  },
  "PATCH sessions/:id/reschedule": {
    clase: "oferta",
    pedir: () => ({
      url: `sessions/${SESION}/reschedule`,
      cuerpo: { newSlotIso: PASADO_MANANA },
    }),
  },
  "POST bookings/:id/retry-checkout": {
    clase: "oferta",
    pedir: () => ({ url: `bookings/${SESION}/retry-checkout`, cuerpo: VUELTA }),
  },

  "GET hub": { clase: "continuidad", pedir: () => ({ url: "hub" }) },
  "GET sessions": { clase: "continuidad", pedir: () => ({ url: "sessions" }) },
  "GET sessions/:id/prep": {
    clase: "continuidad",
    pedir: () => ({ url: `sessions/${SESION}/prep` }),
  },
  "PATCH sessions/:id/prep": {
    clase: "continuidad",
    pedir: () => ({
      url: `sessions/${SESION}/prep`,
      cuerpo: { sharedEntryIds: [] },
    }),
  },
  "POST sessions/:id/join": {
    clase: "continuidad",
    pedir: () => ({ url: `sessions/${SESION}/join`, cuerpo: {} }),
  },
  "POST sessions/:id/feedback": {
    clase: "continuidad",
    pedir: () => ({
      url: `sessions/${SESION}/feedback`,
      cuerpo: { rating: 4 },
    }),
  },
  "POST sessions/:id/technical-report": {
    clase: "continuidad",
    pedir: () => ({
      url: `sessions/${SESION}/technical-report`,
      cuerpo: { issue: "OTHER", description: "Se cortó el audio" },
    }),
  },
  "POST sessions/:id/cancel": {
    clase: "continuidad",
    pedir: () => ({
      url: `sessions/${SESION}/cancel`,
      cuerpo: { reason: "No puedo" },
    }),
  },
  "GET prescriptions": {
    clase: "continuidad",
    pedir: () => ({ url: "prescriptions" }),
  },
  "PATCH prescriptions/:id": {
    clase: "continuidad",
    pedir: () => ({ url: "prescriptions/rx-1", cuerpo: { completed: true } }),
  },
  "GET notifications": {
    clase: "continuidad",
    pedir: () => ({ url: "notifications" }),
  },
  "PATCH notifications/:id/read": {
    clase: "continuidad",
    pedir: () => ({ url: "notifications/av-1/read", cuerpo: {} }),
  },
  "POST notifications/read-all": {
    clase: "continuidad",
    pedir: () => ({ url: "notifications/read-all", cuerpo: {} }),
  },
};

const deClase = (clase: Clase) =>
  Object.keys(RUTAS).filter((r) => RUTAS[r]!.clase === clase);

/** Rutas de oferta que reciben el id de una ficha (y no el de una sesión). */
const CON_FICHA = [
  "GET therapists/:id",
  "GET therapists/:id/reviews",
  "POST therapists/:id/favorite",
  "GET therapists/:id/availability",
  "POST bookings",
];

/** Lo que se niega sobre una sesión de demostración aun con todo abierto. */
const SOBRE_SESION = [
  "PATCH sessions/:id/reschedule",
  "POST bookings/:id/retry-checkout",
  "POST sessions/:id/join",
  "PATCH sessions/:id/prep",
];

/** Las rutas tal y como las declara el controlador. */
function rutasDelControlador(): string[] {
  const proto = TerapiaController.prototype as unknown as Record<
    string,
    unknown
  >;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== "constructor")
    .flatMap((n) => {
      const handler = proto[n] as object;
      const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as
        | RequestMethod
        | undefined;
      if (metodo === undefined) return [];
      const ruta = Reflect.getMetadata(PATH_METADATA, handler) as string;
      return [`${RequestMethod[metodo]} ${ruta.replace(/^\//, "")}`];
    });
}

/**
 * Todos los métodos de Prisma que se llamaron, como `modelo.método`. Se
 * enumera el doble entero y no los modelos que se nos ocurran.
 */
function llamadasPrisma(h: E2EHarness): string[] {
  const out: string[] = [];
  for (const [modelo, api] of Object.entries(
    h.prisma as unknown as Record<string, unknown>,
  )) {
    if (typeof api !== "object" || api === null) continue;
    for (const [metodo, fn] of Object.entries(api as Record<string, unknown>)) {
      const mock = (fn as { mock?: { calls: unknown[] } }).mock;
      if (mock && mock.calls.length > 0) out.push(`${modelo}.${metodo}`);
    }
  }
  return out.sort();
}

const ESCRITURA = /\.(create|update|updateMany|upsert|delete|deleteMany)$/;

function ficha(id: string) {
  return {
    id,
    name: "Nombre de la ficha",
    initials: "NF",
    title: "Psicóloga clínica",
    avatarUrl: null,
    coverToken: "warm",
    licenseNumber: "LIC-1",
    licenseVerified: true,
    bioShort: "Bio",
    bioLong: null,
    approach: null,
    specialties: ["ansiedad"],
    modalities: ["INDIVIDUAL"],
    languages: ["es-EC"],
    genderId: null,
    priceUsd: 40,
    currency: "USD",
    acceptsInsurance: false,
    avgRating: 4.9,
    reviewsCount: 64,
    isActive: true,
    popularity: 10,
    firstSessionPolicy: null,
    cancellationPolicy: null,
    videoPresentationUrl: null,
    availability: [],
  };
}

function sesion(therapistId: string, over: Record<string, unknown> = {}) {
  return {
    id: SESION,
    userId: USER_ID,
    therapistId,
    therapist: ficha(therapistId),
    // Ahora mismo: dentro de la ventana de la sala.
    scheduledAt: new Date(),
    durationMin: 50,
    modality: "INDIVIDUAL",
    status: "SCHEDULED",
    paymentStatus: "PENDING",
    priceUsd: 40,
    currency: "USD",
    roomUrl: null,
    intentionCiphertext: "cifrado",
    intentionNonce: "nonce",
    checkInMood: null,
    sharedEntryIds: [],
    feedbackRating: null,
    ...over,
  };
}

/** Estados en los que la puerta NO abre. */
const CERRADA: Array<[string, string | undefined]> = [
  ["sin configurar", undefined],
  ["cadena vacía (como guarda Coolify una variable borrada)", ""],
  ["apagada", "off"],
  ["valor ilegible", "ábrela"],
];

describe("la oferta de terapia, por HTTP", () => {
  let h: E2EHarness;
  let token: string;
  let pago: ReturnType<typeof vi.spyOn>;
  let crearSala: ReturnType<typeof vi.spyOn>;
  let crearToken: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h = await createE2EApp();
    token = h.app.get(JwtService).sign({ sub: USER_ID, email: EMAIL, ar: 0 });
  }, 30_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  beforeEach(async () => {
    await h.resetMocks();
    h.prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: EMAIL,
      role: "USER",
      plan: "FREE",
      authRevision: 0,
      isActive: true,
    });
    pago = vi
      .spyOn(
        h.app.get(STRIPE_PROVIDER, { strict: false }),
        "createTherapyCheckout",
      )
      .mockResolvedValue({
        url: "https://checkout.invalid/cs_doble",
        stripeCheckoutSessionId: "cs_doble",
      });
    const video = h.app.get(VIDEO_PROVIDER, { strict: false });
    crearSala = vi.spyOn(video, "createRoom").mockResolvedValue({
      roomUrl: "fake-room://doble",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    crearToken = vi.spyOn(video, "createJoinToken").mockResolvedValue({
      joinToken: "doble",
      expiresAt: new Date(Date.now() + 3600_000),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  /**
   * Fija `THERAPY_OFFER` en la MISMA instancia de configuración que usan el
   * servicio y la guarda del pago. Sólo esa clave: las demás siguen siendo las
   * reales del arnés.
   */
  function puerta(valor: string | undefined) {
    const config = h.app.get(ConfigService);
    const original = config.get.bind(config) as (...a: unknown[]) => unknown;
    vi.spyOn(config, "get").mockImplementation(((...a: unknown[]) =>
      a[0] === "THERAPY_OFFER" ? valor : original(...a)) as never);
  }

  function pedir(
    nombre: string,
    { therapistId = PROFESIONAL, conSesion = true } = {},
  ) {
    const [metodo] = nombre.split(" ");
    const { url, cuerpo } = RUTAS[nombre]!.pedir(therapistId);
    const cliente = request(h.app.getHttpServer());
    const ruta = `/api/terapia/${url}`;
    const req =
      metodo === "GET"
        ? cliente.get(ruta)
        : metodo === "POST"
          ? cliente.post(ruta).send(cuerpo)
          : cliente.patch(ruta).send(cuerpo);
    return conSesion ? req.set("Authorization", `Bearer ${token}`) : req;
  }

  /** Cero proveedores y cero Prisma, salvo la relectura de la autenticación. */
  function nadaOcurrio() {
    expect(pago).not.toHaveBeenCalled();
    expect(crearSala).not.toHaveBeenCalled();
    expect(crearToken).not.toHaveBeenCalled();
    expect(llamadasPrisma(h)).toEqual(["user.findUnique"]);
  }

  // ── El trinquete ────────────────────────────────────────────────────────

  it("clasifica TODAS las rutas del controlador, y ninguna de más", () => {
    expect(rutasDelControlador().sort()).toEqual(Object.keys(RUTAS).sort());
    // Control: si la lectura de metadatos dejara de ver rutas, lo de arriba
    // compararía dos listas vacías.
    expect(rutasDelControlador().length).toBeGreaterThan(20);
    expect(deClase("oferta")).toHaveLength(9);
  });

  // ── Cerrada ─────────────────────────────────────────────────────────────

  describe("cerrada", () => {
    it("arranca cerrada por AUSENCIA, sin tocar la configuración", async () => {
      // La única prueba que no fija el valor: es el estado que sirve staging.
      expect(process.env.THERAPY_OFFER).toBeUndefined();
      const res = await pedir("GET therapists");
      expect(res.status).toBe(503);
      expect(res.body.code).toBe("THERAPY_OFFER_CLOSED");
      nadaOcurrio();
    });

    describe.each(CERRADA)("%s", (_caso, valor) => {
      it.each(deClase("oferta"))("%s → 503 y no pasa nada", async (nombre) => {
        puerta(valor);
        // Si la guarda faltara, la ruta encontraría de todo y seguiría.
        h.prisma.therapist.findUnique.mockResolvedValue(ficha(PROFESIONAL));
        h.prisma.therapist.findMany.mockResolvedValue([ficha(PROFESIONAL)]);
        h.prisma.therapist.count.mockResolvedValue(1);
        h.prisma.therapySession.findUnique.mockResolvedValue(
          sesion(PROFESIONAL),
        );

        const res = await pedir(nombre);

        expect(res.status).toBe(503);
        expect(res.body.code).toBe("THERAPY_OFFER_CLOSED");
        // Lo que vería una persona: castellano, nunca el código.
        expect(res.body.message).toBe(
          "Todavía no ofrecemos sesiones de terapia.",
        );
        nadaOcurrio();
      });
    });

    it.each(deClase("oferta"))(
      "%s con una ficha de demostración → el mismo 503",
      async (nombre) => {
        puerta(undefined);
        h.prisma.therapySession.findUnique.mockResolvedValue(sesion(DEMO));
        const res = await pedir(nombre, { therapistId: DEMO });
        expect(res.status).toBe(503);
        expect(res.body.code).toBe("THERAPY_OFFER_CLOSED");
        nadaOcurrio();
      },
    );

    it.each([...deClase("oferta"), ...deClase("continuidad")])(
      "%s sigue exigiendo sesión",
      async (nombre) => {
        puerta(undefined);
        const res = await pedir(nombre, { conSesion: false });
        expect(res.status).toBe(401);
      },
    );

    it("las líneas de ayuda no dependen de la puerta ni de la sesión", async () => {
      puerta(undefined);
      const res = await pedir("GET crisis", { conSesion: false });
      expect(res.status).toBe(200);
      expect(res.body.lines.length).toBeGreaterThan(0);
    });
  });

  // ── Cerrada: lo que alguien ya tuviera con un profesional real ──────────

  describe("cerrada: una operación real conserva su recorrido", () => {
    beforeEach(() => {
      puerta(undefined);
      const s = sesion(PROFESIONAL, { paymentStatus: "PAID" });
      h.prisma.therapySession.findUnique.mockResolvedValue(s);
      h.prisma.therapySession.findFirst.mockResolvedValue(s);
      h.prisma.therapySession.findMany.mockResolvedValue([s]);
      h.prisma.therapySession.update.mockResolvedValue(s);
      h.prisma.therapyPrescription.findMany.mockResolvedValue([]);
      h.prisma.therapyPrescription.findUnique.mockResolvedValue({
        id: "rx-1",
        userId: USER_ID,
      });
      h.prisma.therapyPrescription.update.mockResolvedValue({
        id: "rx-1",
        kind: "BOOK",
        targetId: "b",
        createdAt: new Date(),
      });
      h.prisma.therapyNotification.findFirst.mockResolvedValue({ id: "av-1" });
      h.prisma.therapyNotification.findMany.mockResolvedValue([]);
      h.prisma.therapyNotification.count.mockResolvedValue(0);
      h.prisma.therapyNotification.findUnique.mockResolvedValue({
        id: "av-1",
        userId: USER_ID,
      });
      h.prisma.therapyNotification.update.mockResolvedValue({});
      h.prisma.therapyNotification.updateMany.mockResolvedValue({ count: 0 });
      h.prisma.therapyTechnicalReport.create.mockResolvedValue({ id: "tr-1" });
    });

    it.each(deClase("continuidad"))("%s sigue contestando", async (nombre) => {
      const res = await pedir(nombre);
      expect([200, 201]).toContain(res.status);
    });

    it("la sala de una sesión real se sigue abriendo", async () => {
      const res = await pedir("POST sessions/:id/join");
      expect(res.status).toBe(200);
      expect(crearSala).toHaveBeenCalledTimes(1);
      expect(crearToken).toHaveBeenCalledTimes(1);
    });

    it("el hub dice que está cerrada, no presenta a nadie y enlaza el historial", async () => {
      const res = await pedir("GET hub");
      expect(res.body.offer).toEqual({ open: false });
      expect(res.body.intro).toBe("Todavía no ofrecemos sesiones de terapia.");
      expect(res.body.activeTherapist).toBeNull();
      expect(res.body.history).toEqual({
        sessions: true,
        prescriptions: false,
        notifications: true,
      });
      // Su próxima sesión sí: es suya.
      expect(res.body.nextSession.id).toBe(SESION);
    });

    it("pero no se paga ni se mueve a un hueco nuevo: eso es oferta", async () => {
      for (const nombre of [
        "POST bookings/:id/retry-checkout",
        "PATCH sessions/:id/reschedule",
      ]) {
        const res = await pedir(nombre);
        expect(res.status).toBe(503);
      }
      expect(pago).not.toHaveBeenCalled();
      expect(h.prisma.therapySession.update).not.toHaveBeenCalled();
    });
  });

  // ── Una sesión de demostración: se conserva y no avanza ─────────────────

  describe.each([
    ["cerrada", undefined],
    ["abierta", "on"],
  ])(
    "una sesión de una ficha de demostración, con la oferta %s",
    (_c, valor) => {
      beforeEach(() => {
        puerta(valor);
        const s = sesion(DEMO, { paymentStatus: "PENDING" });
        h.prisma.therapySession.findUnique.mockResolvedValue(s);
        h.prisma.therapySession.findFirst.mockResolvedValue(null);
        h.prisma.therapySession.findMany.mockResolvedValue([s]);
        h.prisma.therapySession.update.mockResolvedValue(s);
        h.prisma.therapyPrescription.findMany.mockResolvedValue([]);
        h.prisma.therapyNotification.findFirst.mockResolvedValue(null);
        h.prisma.therapyTechnicalReport.create.mockResolvedValue({
          id: "tr-1",
        });
      });

      it.each(["POST sessions/:id/join", "PATCH sessions/:id/prep"])(
        "%s → 409, sin escribir y sin proveedor",
        async (nombre) => {
          const res = await pedir(nombre);
          expect(res.status).toBe(409);
          expect(res.body.code).toBe("THERAPY_DEMO_SESSION");
          expect(res.body.message).toMatch(/perfil de demostración/);
          expect(crearSala).not.toHaveBeenCalled();
          expect(crearToken).not.toHaveBeenCalled();
          expect(llamadasPrisma(h).filter((c) => ESCRITURA.test(c))).toEqual(
            [],
          );
        },
      );

      it("se sigue viendo, pero sin credencial, licencia ni puntuación", async () => {
        for (const nombre of ["GET sessions", "GET sessions/:id/prep"]) {
          const res = await pedir(nombre);
          expect(res.status).toBe(200);
          const t =
            res.body.upcoming?.[0]?.therapist ?? res.body.session.therapist;
          expect(t.isDemo).toBe(true);
          expect(t.title).toBe("Perfil de demostración");
          expect(t.avgRating).toBeNull();
          expect(t.reviewsCount).toBeNull();
          expect(t.name).toBe("Nombre de la ficha");
          const texto = JSON.stringify(res.body);
          for (const prohibido of ["4.9", "64", "LIC-1", "Psicóloga clínica"]) {
            expect(texto).not.toContain(prohibido);
          }
        }
        // Lo escrito se conserva: no se borra nada por ser de demostración.
        const prep = await pedir("GET sessions/:id/prep");
        expect(prep.body.prep.intentionCiphertext).toBe("cifrado");
      });

      it.each([
        "POST sessions/:id/cancel",
        "POST sessions/:id/feedback",
        "POST sessions/:id/technical-report",
      ])("%s se conserva", async (nombre) => {
        const res = await pedir(nombre);
        expect([200, 201]).toContain(res.status);
      });

      it("el 409 no habla de la sesión de otra persona", async () => {
        h.prisma.therapySession.findUnique.mockResolvedValue(
          sesion(DEMO, { userId: "otra-persona" }),
        );
        for (const nombre of [
          "POST sessions/:id/join",
          "PATCH sessions/:id/prep",
        ]) {
          const res = await pedir(nombre);
          expect(res.status).toBe(403);
        }
      });
    },
  );

  // ── Abierta ─────────────────────────────────────────────────────────────

  describe("abierta + ficha de demostración: no existe para quien busca", () => {
    beforeEach(() => {
      puerta("on");
      // La fila EXISTE, activa y «verificada», como en staging hoy.
      h.prisma.therapist.findUnique.mockResolvedValue(ficha(DEMO));
      h.prisma.therapist.findMany.mockResolvedValue([]);
      h.prisma.therapist.count.mockResolvedValue(0);
      h.prisma.therapistFavorite.findMany.mockResolvedValue([]);
      h.prisma.therapistFavorite.findUnique.mockResolvedValue(null);
      h.prisma.therapistReview.findMany.mockResolvedValue([]);
      h.prisma.therapistReview.count.mockResolvedValue(0);
      h.prisma.therapySession.findFirst.mockResolvedValue(null);
      h.prisma.therapySession.findMany.mockResolvedValue([]);
      h.prisma.therapySession.create.mockResolvedValue(sesion(DEMO));
      h.prisma.therapySession.update.mockResolvedValue(sesion(DEMO));
    });

    it.each(
      CON_FICHA.flatMap((r) =>
        DEMO_THERAPIST_IDS.map((id) => [r, id] as const),
      ),
    )("%s con %s → 404 antes de leer la ficha", async (nombre, id) => {
      const res = await pedir(nombre, { therapistId: id });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("THERAPIST_NOT_FOUND");
      nadaOcurrio();
    });

    it("y responde lo mismo que un id que no existe", async () => {
      const demo = await pedir("GET therapists/:id", { therapistId: DEMO });
      h.prisma.therapist.findUnique.mockResolvedValue(null);
      const nadie = await pedir("GET therapists/:id", {
        therapistId: "no-existe",
      });
      const sinHora = ({ timestamp: _t, ...r }: Record<string, unknown>) => r;
      expect(sinHora(demo.body)).toEqual(sinHora(nadie.body));
      expect(demo.status).toBe(nadie.status);
    });

    it.each(["GET therapists", "GET therapists/filters"])(
      "%s la excluye en la consulta, no después",
      async (nombre) => {
        const res = await pedir(nombre);
        expect(res.status).toBe(200);
        const args = h.prisma.therapist.findMany.mock.calls[0]![0] as {
          where: { id: { notIn: string[] }; isActive: boolean };
        };
        expect(args.where.isActive).toBe(true);
        expect([...args.where.id.notIn].sort()).toEqual(
          [...DEMO_THERAPIST_IDS].sort(),
        );
      },
    );

    it("el total paginado cuenta con el mismo filtro que la lista", async () => {
      await pedir("GET therapists");
      expect(h.prisma.therapist.count.mock.calls[0]![0].where).toEqual(
        h.prisma.therapist.findMany.mock.calls[0]![0].where,
      );
    });

    it.each(SOBRE_SESION)(
      "%s sobre una sesión suya → 409, sin cobrar, sin sala y sin escribir",
      async (nombre) => {
        h.prisma.therapySession.findUnique.mockResolvedValue(sesion(DEMO));
        const res = await pedir(nombre);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("THERAPY_DEMO_SESSION");
        expect(pago).not.toHaveBeenCalled();
        expect(crearSala).not.toHaveBeenCalled();
        // Ni escribe, ni sigue leyendo: en cuanto sabe de quién es y con quién,
        // se detiene.
        expect(llamadasPrisma(h)).toEqual([
          "therapySession.findUnique",
          "user.findUnique",
        ]);
      },
    );

    it("el hub no la presenta como «tu terapeuta»", async () => {
      h.prisma.therapyPrescription.findMany.mockResolvedValue([]);
      h.prisma.therapyNotification.findFirst.mockResolvedValue(null);
      await pedir("GET hub");
      const buscaCompletada = h.prisma.therapySession.findFirst.mock.calls.find(
        (c) =>
          (c[0] as { where: { status?: string } }).where.status === "COMPLETED",
      );
      expect(
        [
          ...(
            buscaCompletada![0] as {
              where: { therapistId: { notIn: string[] } };
            }
          ).where.therapistId.notIn,
        ].sort(),
      ).toEqual([...DEMO_THERAPIST_IDS].sort());
    });
  });

  describe("abierta + profesional real: el recorrido funciona (control contrario)", () => {
    beforeEach(() => {
      puerta("on");
      h.prisma.therapist.findUnique.mockResolvedValue(ficha(PROFESIONAL));
      h.prisma.therapist.findMany.mockResolvedValue([ficha(PROFESIONAL)]);
      h.prisma.therapist.count.mockResolvedValue(1);
      h.prisma.therapistFavorite.findMany.mockResolvedValue([]);
      h.prisma.therapistFavorite.findUnique.mockResolvedValue(null);
      h.prisma.therapistFavorite.create.mockResolvedValue({});
      h.prisma.therapistReview.findMany.mockResolvedValue([]);
      h.prisma.therapistReview.count.mockResolvedValue(0);
      h.prisma.therapySession.findFirst.mockResolvedValue(null);
      h.prisma.therapySession.findMany.mockResolvedValue([]);
      h.prisma.therapySession.findUnique.mockResolvedValue(sesion(PROFESIONAL));
      h.prisma.therapySession.create.mockResolvedValue(sesion(PROFESIONAL));
      h.prisma.therapySession.update.mockResolvedValue(sesion(PROFESIONAL));
      h.prisma.therapyPrescription.findMany.mockResolvedValue([]);
      h.prisma.therapyNotification.findFirst.mockResolvedValue(null);
    });

    it.each(deClase("oferta"))("%s contesta", async (nombre) => {
      const res = await pedir(nombre);
      expect([200, 201]).toContain(res.status);
    });

    it("la lista conserva licencia y puntuación de un profesional real", async () => {
      const res = await pedir("GET therapists");
      expect(res.body.items[0]).toMatchObject({
        id: PROFESIONAL,
        licenseVerified: true,
        licenseNumber: "LIC-1",
        avgRating: 4.9,
        reviewsCount: 64,
        isDemo: false,
      });
    });

    it("reservar crea la sesión y pide el cobro con el id del profesional", async () => {
      const res = await pedir("POST bookings");
      expect(res.status).toBe(201);
      expect(h.prisma.therapySession.create).toHaveBeenCalledTimes(1);
      expect(pago).toHaveBeenCalledTimes(1);
      expect(pago.mock.calls[0]![0]).toMatchObject({
        therapistId: PROFESIONAL,
        sessionId: SESION,
      });
      expect(res.body.checkoutUrl).toBe("https://checkout.invalid/cs_doble");
    });

    it("el hub publica la oferta abierta", async () => {
      const res = await pedir("GET hub");
      expect(res.body.offer).toEqual({ open: true });
    });
  });
});

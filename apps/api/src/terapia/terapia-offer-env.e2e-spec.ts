import type { JwtService as JwtServiceType } from "@nestjs/jwt";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { E2EHarness } from "../test/e2e-app";

/**
 * La variable de entorno de verdad, de extremo a extremo.
 *
 * `terapia-offer.e2e-spec.ts` fija el valor en la configuración ya construida,
 * que es lo que permite recorrer los estados en un solo arranque. Lo que eso no
 * prueba es que el NOMBRE de la variable sea el que lee el servicio: una clave
 * mal escrita en los dos sitios dejaría la puerta cerrada para siempre y todas
 * aquellas pruebas en verde.
 *
 * Aquí se pone en `process.env` ANTES de que nada importe la aplicación —la
 * validación se evalúa al importarla— y se comprueban las dos mitades: que abre,
 * y que aun abierta una ficha de demostración no existe.
 */

const USER_ID = "user-terapia-env";
const EMAIL = "terapia-env@psico.test";

describe("THERAPY_OFFER=on en el entorno", () => {
  let h: E2EHarness;
  let cerrar: (h: E2EHarness) => Promise<void>;
  let token: string;
  const previo = process.env.THERAPY_OFFER;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.THERAPY_OFFER = "on";
    const arnes = await import("../test/e2e-app");
    const { JwtService } = await import("@nestjs/jwt");
    cerrar = arnes.closeE2EApp;
    h = await arnes.createE2EApp();
    token = h.app
      .get<JwtServiceType>(JwtService)
      .sign({ sub: USER_ID, email: EMAIL, ar: 0 });
  }, 30_000);

  afterAll(async () => {
    await cerrar(h);
    if (previo === undefined) delete process.env.THERAPY_OFFER;
    else process.env.THERAPY_OFFER = previo;
    vi.restoreAllMocks();
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
  });

  const get = (ruta: string) =>
    request(h.app.getHttpServer())
      .get(`/api/terapia/${ruta}`)
      .set("Authorization", `Bearer ${token}`);

  it("abre el directorio", async () => {
    h.prisma.therapist.findMany.mockResolvedValue([]);
    h.prisma.therapist.count.mockResolvedValue(0);
    h.prisma.therapistFavorite.findMany.mockResolvedValue([]);
    const res = await get("therapists");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("y una ficha de demostración sigue sin existir", async () => {
    const res = await get("therapists/t_marina");
    expect(res.status).toBe(404);
    expect(h.prisma.therapist.findUnique).not.toHaveBeenCalled();
  });
});

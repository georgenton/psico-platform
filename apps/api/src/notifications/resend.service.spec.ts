import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: enviar };
  },
}));

import { ResendService } from "./resend.service";

/**
 * Lo que se comprueba aquí es una sola cosa, y es la que importa: **con una
 * credencial puesta, ¿sale el correo?** Hasta el 2026-11-17 la respuesta era
 * «siempre», y por eso incorporar una clave en staging habría activado el
 * digest semanal hacia cada cuenta de la base.
 *
 * `resolveEnvironment()` lee `process.env` y no hay marcador de plataforma en
 * una corrida de pruebas, así que basta declarar `PSICO_ENV` — no se simula el
 * resolutor, se usa el real.
 */
function servicio(env: Record<string, string | undefined>): ResendService {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConstructorParameters<typeof ResendService>[0];
  return new ResendService(config);
}

const CLAVE = {
  RESEND_API_KEY: "re_viva",
  EMAIL_FROM: "no-reply@feelverse.app",
};

const correo = {
  to: "qa@dominio.com",
  subject: "Restablece tu contraseña",
  html: "<p>enlace</p>",
  tag: "password-reset",
};

describe("ResendService — la guarda de destinatarios", () => {
  const anterior = process.env.PSICO_ENV;

  beforeEach(() => {
    enviar.mockReset();
    enviar.mockResolvedValue({ data: { id: "eml_1" }, error: null });
  });

  afterEach(() => {
    if (anterior === undefined) delete process.env.PSICO_ENV;
    else process.env.PSICO_ENV = anterior;
  });

  it("sin clave no llama al SDK (comportamiento de siempre, conservado)", async () => {
    process.env.PSICO_ENV = "development";
    await servicio({ EMAIL_FROM: "no-reply@feelverse.app" }).send(correo);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("CON clave y sin lista, en staging, NO sale nada", async () => {
    process.env.PSICO_ENV = "staging";
    await servicio(CLAVE).send(correo);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("y tampoco sale el digest, que es el que nadie dispara a mano", async () => {
    process.env.PSICO_ENV = "staging";
    await servicio(CLAVE).send({
      to: "alguien-de-hace-meses@ejemplo.com",
      subject: "Tu semana en FeelVerse",
      html: "<p>resumen</p>",
      tag: "weekly-digest",
    });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("con la bandeja autorizada en la lista, sale — y sólo a ella", async () => {
    process.env.PSICO_ENV = "staging";
    const s = servicio({ ...CLAVE, EMAIL_ALLOWLIST: "qa@dominio.com" });

    await s.send(correo);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]?.[0]).toMatchObject({
      to: "qa@dominio.com",
      from: "no-reply@feelverse.app",
    });

    await s.send({ ...correo, to: "ajeno@otro.com" });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("en producción sin lista sale, que es lo correcto allí", async () => {
    process.env.PSICO_ENV = "production";
    await servicio(CLAVE).send({ ...correo, to: "persona@real.com" });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("un destinatario retenido no lanza: el digest hace fan-out y una dirección no aborta la tanda", async () => {
    process.env.PSICO_ENV = "staging";
    await expect(servicio(CLAVE).send(correo)).resolves.toBeUndefined();
  });

  it("un fallo del proveedor sí lanza (el llamante decide si lo traga)", async () => {
    process.env.PSICO_ENV = "staging";
    enviar.mockResolvedValue({
      data: null,
      error: { message: "domain not verified" },
    });
    await expect(
      servicio({ ...CLAVE, EMAIL_ALLOWLIST: "@dominio.com" }).send(correo),
    ).rejects.toThrow(/domain not verified/);
  });
});

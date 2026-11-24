import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";
import { crisisNotice } from "./crisis";

/**
 * El aviso de crisis, por HTTP y hasta el último byte.
 *
 * `eco.crisis-first.spec.ts` llama al servicio. Aquí se arranca la aplicación
 * como la arranca `main.ts` y se lee lo que sale por el cable: con la puerta,
 * el límite de frecuencia y el marco SSE de verdad.
 */

const USER_ID = "user-crisis-e2e";
const THREAD_ID = "thread-crisis-e2e";
const CIFRADO = "Y2lmcmFkbw";
const NONCE = "bm9uY2U";

/** El usuario de la puerta, que `JwtStrategy` relee en cada petición. */
const PUERTA = {
  id: USER_ID,
  email: "crisis@psico.test",
  role: "USER",
  plan: "FREE",
  authRevision: 0,
  isActive: true,
};
const perfil = (country: string | null) => ({
  plan: "FREE",
  profile: { timezone: null, country },
});

describe("POST /api/eco/messages cuando alguien pide ayuda", () => {
  let h: E2EHarness;
  let token: string;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h = await createE2EApp();
    token = h.app
      .get(JwtService)
      .sign({ sub: USER_ID, email: PUERTA.email, ar: 0 });
  }, 30_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  beforeEach(async () => {
    await h.resetMocks();
    // La primera lectura es la de la puerta; la segunda, la del aviso.
    h.prisma.user.findUnique
      .mockResolvedValueOnce(PUERTA)
      .mockResolvedValue(perfil("EC"));
    h.prisma.subscription.findUnique.mockResolvedValue(null);
    h.prisma.ecoThread.findFirst.mockResolvedValue({ id: THREAD_ID });
    h.prisma.ecoMessage.create.mockResolvedValue({ id: "msg-1" });
    h.prisma.ecoMessage.count.mockResolvedValue(11);
  });

  async function enviar(textPlaintext: string, threadId = THREAD_ID) {
    const res = await request(h.app.getHttpServer())
      .post("/api/eco/messages")
      .set("Authorization", `Bearer ${token}`)
      .send({
        threadId,
        textPlaintext,
        textCiphertext: CIFRADO,
        textNonce: NONCE,
      });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const eventos = res.text
      .split("\n")
      .filter((l: string) => l.startsWith("data:"))
      .map(
        (l: string) =>
          JSON.parse(l.slice(5)) as {
            event: string;
            data: Record<string, unknown>;
          },
      );
    return { eventos, crudo: res.text };
  }

  it("sin mensajes por hoy: el aviso y el cierre, y ni rastro de la cuota", async () => {
    const { eventos, crudo } = await enviar("quiero suicidarme");
    expect(eventos).toEqual([
      { event: "crisis", data: crisisNotice("EC") },
      { event: "done", data: { messageId: "msg-1", quotaRemaining: 0 } },
    ]);
    expect(crudo).not.toContain("ECO_QUOTA_EXCEEDED");
    // Y lo guardado: el mensaje sólo cifrado, el aviso en claro.
    expect(
      h.prisma.ecoMessage.create.mock.calls.map(
        (c) => (c[0] as { data: unknown }).data,
      ),
    ).toEqual([
      {
        threadId: THREAD_ID,
        kind: "USER",
        textCiphertext: CIFRADO,
        textNonce: NONCE,
      },
      {
        threadId: THREAD_ID,
        kind: "CRISIS",
        assistantText: crisisNotice("EC").text,
      },
    ]);
  });

  it("un mensaje corriente, en cambio, se niega", async () => {
    h.prisma.ecoMessage.count.mockResolvedValue(10);
    const { eventos } = await enviar("hola");
    expect(eventos.map((e) => e.event)).toEqual(["error"]);
    expect(eventos[0]!.data.code).toBe("ECO_QUOTA_EXCEEDED");
    expect(h.prisma.ecoMessage.create).not.toHaveBeenCalled();
  });

  it("con la base caída tras la puerta, llega igual", async () => {
    const caida = () => Promise.reject(new Error("db"));
    h.prisma.user.findUnique
      .mockReset()
      .mockResolvedValueOnce(PUERTA)
      .mockImplementation(caida);
    h.prisma.subscription.findUnique.mockImplementation(caida);
    h.prisma.ecoThread.findFirst.mockImplementation(caida);
    h.prisma.ecoMessage.create.mockImplementation(caida);
    h.prisma.ecoMessage.count.mockImplementation(caida);

    const { eventos } = await enviar("quiero suicidarme");
    expect(eventos).toEqual([{ event: "crisis", data: crisisNotice(null) }]);
  });

  it("un hilo que no es suyo no cambia lo que recibe ni escribe nada", async () => {
    h.prisma.ecoThread.findFirst.mockResolvedValue(null);
    const { eventos, crudo } = await enviar("quiero suicidarme", "de-otra");
    expect(eventos).toEqual([{ event: "crisis", data: crisisNotice("EC") }]);
    expect(crudo).not.toContain("THREAD_NOT_FOUND");
    expect(h.prisma.ecoMessage.create).not.toHaveBeenCalled();
  });
});

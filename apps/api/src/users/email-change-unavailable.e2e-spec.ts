import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { Queue } from "bullmq";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";
import { JobsService } from "../jobs";
import { ResendService } from "../notifications";

/**
 * `POST /api/user/email-change-request`, sobre el stack real.
 *
 * Lo que había: la ruta creaba un `EmailChangeRequest` y encolaba un correo con
 * un enlace a `/verify-email-change`, una página que no existe. El recorrido no
 * podía terminar, y además contestaba 409 si la dirección ya tenía cuenta.
 *
 * Lo que se comprueba aquí es que la petición se rechaza ANTES de todo eso, por
 * la ruta de verdad: una prueba de servicio aprobaría igual si el controlador
 * hiciera algo por su cuenta. Y que el rechazo dice lo mismo para una dirección
 * libre que para una ocupada, que es el bit que la retirada tiene que cerrar.
 */

const USER_ID = "persona-cambio-de-correo";
const EMAIL = "persona@psico.test";
const OCUPADA = "ocupada@psico.test";
const LIBRE = "libre@psico.test";
const RUTA = "/api/user/email-change-request";

/**
 * Todo lo que se llamó en Prisma, como `modelo.método`. Se enumera el doble en
 * vez de los modelos que se nos ocurran: una escritura nueva en cualquier tabla
 * rompería la prueba sin que nadie tenga que preverla. Incluye `$transaction` y
 * `$executeRaw`, que en el doble son funciones sueltas.
 */
function llamadasPrisma(h: E2EHarness): string[] {
  const out: string[] = [];
  for (const [modelo, api] of Object.entries(
    h.prisma as unknown as Record<string, unknown>,
  )) {
    if (typeof api === "function") {
      const mock = (api as { mock?: { calls: unknown[] } }).mock;
      if (mock && mock.calls.length > 0) out.push(modelo);
      continue;
    }
    for (const [metodo, fn] of Object.entries(api as Record<string, unknown>)) {
      const mock = (fn as { mock?: { calls: unknown[] } }).mock;
      if (mock && mock.calls.length > 0) out.push(`${modelo}.${metodo}`);
    }
  }
  return out.sort();
}

describe("pedir el cambio de correo", () => {
  let h: E2EHarness;
  let token: string;
  // En la cola y no en `JobsService`: así cuenta cualquier camino que encole,
  // no sólo el método que usaba la versión anterior.
  let encolar: MockInstance;
  let enviar: MockInstance;
  let prisma: E2EHarness["prisma"] & {
    emailChangeRequest: { create: ReturnType<typeof vi.fn> };
  };

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h = await createE2EApp();
    // El arnés no declara este modelo. Se añade para que una escritura pueda
    // VERSE: sin él, el código anterior moriría con un 500 por el doble y la
    // ausencia de filas no probaría nada.
    prisma = h.prisma as typeof prisma;
    prisma.emailChangeRequest = { create: vi.fn() };
    token = h.app.get(JwtService).sign({ sub: USER_ID, email: EMAIL, ar: 0 });
  }, 30_000);

  afterAll(async () => {
    await closeE2EApp(h);
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await h.resetMocks();
    prisma.emailChangeRequest.create.mockResolvedValue({});
    h.prisma.user.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; email?: string } }) => {
        // JwtStrategy re-lee al usuario en cada petición (ADR 0015).
        if (where.id === USER_ID) {
          return {
            id: USER_ID,
            email: EMAIL,
            role: "USER",
            plan: "FREE",
            authRevision: 0,
            isActive: true,
          };
        }
        return where.email === OCUPADA ? { id: "otra-persona" } : null;
      },
    );
    encolar = vi
      .spyOn(Queue.prototype, "add")
      .mockResolvedValue(undefined as never);
    enviar = vi
      .spyOn(h.app.get(ResendService), "send")
      .mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    encolar.mockRestore();
    enviar.mockRestore();
  });

  const pedir = (newEmail: unknown) =>
    request(h.app.getHttpServer())
      .post(RUTA)
      .set("Authorization", `Bearer ${token}`)
      .send({ newEmail });

  const CUERPOS: Array<[string, string]> = [
    ["una dirección libre", LIBRE],
    ["una dirección que ya tiene cuenta", OCUPADA],
    ["la dirección que ya tiene esta cuenta", EMAIL],
    ["una dirección con mayúsculas", "Persona.Nueva@Psico.Test"],
  ];

  it.each(CUERPOS)("se rechaza con 503 para %s", async (_caso, newEmail) => {
    const res = await pedir(newEmail);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("EMAIL_CHANGE_UNAVAILABLE");
    // Hay clientes instalados que pintan `message` tal cual: castellano, y la
    // misma frase que enseña la pantalla.
    expect(res.body.message).toBe(
      "Por ahora no se puede cambiar el correo desde la app.",
    );
  });

  it.each(CUERPOS)("no toca la base para %s", async (_caso, newEmail) => {
    await pedir(newEmail);

    // Sólo la relectura del usuario que hace la autenticación, una vez y por
    // `id`. Una segunda lectura —la que buscaba la dirección— tendría el mismo
    // nombre, así que se cuenta y se mira qué preguntó.
    expect(llamadasPrisma(h)).toEqual(["user.findUnique"]);
    expect(h.prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(h.prisma.user.findUnique.mock.calls[0]![0].where).toEqual({
      id: USER_ID,
    });
  });

  it.each(CUERPOS)(
    "no encola ni envía nada para %s",
    async (_caso, newEmail) => {
      await pedir(newEmail);

      expect(encolar).not.toHaveBeenCalled();
      expect(enviar).not.toHaveBeenCalled();
    },
  );

  it("responde lo mismo a una dirección libre y a una ocupada", async () => {
    const sinHora = ({ timestamp: _t, ...resto }: Record<string, unknown>) =>
      resto;
    const libre = await pedir(LIBRE);
    const ocupada = await pedir(OCUPADA);

    expect(ocupada.status).toBe(libre.status);
    expect(sinHora(ocupada.body)).toEqual(sinHora(libre.body));
    // Y la respuesta no devuelve la dirección que se le mandó.
    expect(JSON.stringify(libre.body)).not.toContain(LIBRE);
    expect(JSON.stringify(ocupada.body)).not.toContain(OCUPADA);
  });

  it("sigue exigiendo sesión y un cuerpo válido", async () => {
    const sinSesion = await request(h.app.getHttpServer())
      .post(RUTA)
      .send({ newEmail: LIBRE });
    expect(sinSesion.status).toBe(401);

    const invalido = await pedir("esto no es un correo");
    expect(invalido.status).toBe(400);
    expect(invalido.body.code).toBe("VALIDATION_ERROR");
  });

  it("control: si hubiera una fila, un encolado o un envío, se verían", async () => {
    await prisma.emailChangeRequest.create({});
    expect(llamadasPrisma(h)).toContain("emailChangeRequest.create");

    await h.app.get(JobsService).enqueueEmail({
      to: LIBRE,
      subject: "control",
      html: "control",
      text: "control",
    });
    expect(encolar).toHaveBeenCalledTimes(1);

    await h.app.get(ResendService).send({
      to: LIBRE,
      subject: "control",
      html: "control",
      text: "control",
    });
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

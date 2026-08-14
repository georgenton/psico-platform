import { describe, expect, it, vi, beforeEach } from "vitest";
import type * as ApiModule from "@/lib/api";

// Mock next/headers cookies — Server Actions call this.
const setMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({
    set: setMock,
    delete: deleteMock,
  }),
}));

// Mock next/navigation redirect — Server Actions throw a special token to
// signal a redirect. We capture its argument and rethrow so Next can pick
// it up; here we just observe it.
const redirectError = new Error("NEXT_REDIRECT");
const redirectMock = vi.fn((_path: string) => {
  throw redirectError;
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

// Mock the API client + ApiError. Keep `ApiError` the real class so
// `instanceof ApiError` works inside the action — only `authApi` becomes a
// stub.
const loginMock = vi.fn();
const registerMock = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ApiModule;
  return {
    ...actual,
    authApi: {
      login: (payload: unknown) => loginMock(payload),
      register: (payload: unknown) => registerMock(payload),
    },
  };
});

import { ApiError } from "@/lib/api";
import { loginAction, registerAction } from "./auth";

beforeEach(() => {
  setMock.mockReset();
  deleteMock.mockReset();
  redirectMock.mockReset().mockImplementation(() => {
    throw redirectError;
  });
  loginMock.mockReset();
  registerMock.mockReset();
});

describe("loginAction — error mapping", () => {
  it("returns 'Email o contraseña incorrectos.' on 401 INVALID_CREDENTIALS", async () => {
    loginMock.mockRejectedValue(
      new ApiError(401, "Invalid credentials", "UNAUTHORIZED"),
    );
    const result = await loginAction({ email: "a@b.c", password: "x" });
    expect(result).toEqual({ error: "Email o contraseña incorrectos." });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns the rate-limit message on 429 RATE_LIMIT_EXCEEDED", async () => {
    loginMock.mockRejectedValue(
      new ApiError(429, "Too many", "RATE_LIMIT_EXCEEDED"),
    );
    const result = await loginAction({ email: "a@b.c", password: "x" });
    expect(result).toEqual({
      error:
        "Demasiados intentos desde tu red. Intenta de nuevo en 15 minutos.",
    });
  });

  it("returns the 500-class message on server error", async () => {
    loginMock.mockRejectedValue(new ApiError(500, "boom"));
    const result = await loginAction({ email: "a@b.c", password: "x" });
    expect(result).toEqual({
      error: "Estamos teniendo un problema. Intenta de nuevo en un momento.",
    });
  });

  it("returns the validation-error message with field details on 400 VALIDATION_ERROR", async () => {
    loginMock.mockRejectedValue(
      new ApiError(400, "Validation failed", "VALIDATION_ERROR", {
        email: ["email must be an email"],
      }),
    );
    const result = await loginAction({ email: "not-an-email", password: "x" });
    expect(result?.error).toContain("email: email must be an email");
  });

  it("returns the connection error on non-ApiError (fetch failed)", async () => {
    loginMock.mockRejectedValue(new TypeError("fetch failed"));
    const result = await loginAction({ email: "a@b.c", password: "x" });
    expect(result).toEqual({
      error:
        "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
    });
  });

  it("sets cookies and redirects on success", async () => {
    loginMock.mockResolvedValue({
      accessToken: "access-jwt",
      refreshToken: "refresh-token",
    });
    await expect(
      loginAction({ email: "a@b.c", password: "x", from: "/dashboard/eco" }),
    ).rejects.toBe(redirectError);
    expect(setMock).toHaveBeenCalledTimes(2);
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/eco");
  });

  it("redirects to /dashboard when no `from` is supplied", async () => {
    loginMock.mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
    });
    await expect(loginAction({ email: "a@b.c", password: "x" })).rejects.toBe(
      redirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});

/**
 * El 500 de `/login?from=…`.
 *
 * Dos defectos encadenados, ambos preexistentes a B.B3. `loginAction` recibe
 * `from` para saber a dónde volver, pero lo enviaba tal cual dentro del cuerpo
 * de `/auth/login`. La API valida con `whitelist` + `forbidNonWhitelisted`, así
 * que rechazaba la petición por una propiedad que nunca fue una credencial.
 *
 * El segundo defecto convertía ese 400 en un 500: class-validator devuelve
 * `details` como `string[]`, y el lector asumía `Record<string, string[]>`, de
 * modo que `Object.entries` entregaba un string donde esperaba un array y
 * `.map` lanzaba `TypeError: t.map is not a function` — dentro del manejador de
 * errores, que es el peor sitio para lanzar otra excepción.
 */
describe("loginAction — `from` es navegación, no una credencial", () => {
  it("envía a la API exclusivamente email y password", async () => {
    loginMock.mockResolvedValue({ accessToken: "a", refreshToken: "r" });

    await expect(
      loginAction({
        email: "a@b.c",
        password: "x",
        from: "/dashboard/admin/contenido",
      }),
    ).rejects.toBe(redirectError);

    // La aserción que faltaba: no basta con que el login funcione, tiene que
    // enviarse el cuerpo que el contrato de autenticación admite.
    expect(loginMock).toHaveBeenCalledTimes(1);
    const body = loginMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["email", "password"]);
    expect(body).not.toHaveProperty("from");
    // Y el destino sigue llegando a la navegación.
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/admin/contenido");
  });

  it("sin `from`, el cuerpo sigue siendo el mismo", async () => {
    loginMock.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    await expect(loginAction({ email: "a@b.c", password: "x" })).rejects.toBe(
      redirectError,
    );
    expect(loginMock.mock.calls[0]![0]).toEqual({
      email: "a@b.c",
      password: "x",
    });
  });

  it("un `from` externo no se convierte en redirect válido", async () => {
    loginMock.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    // Cada entrada es una forma DISTINTA de nombrar otro origen. La barra
    // invertida es la que se escapaba: empieza por "/" y no por "//", así que
    // una comprobación textual la deja pasar — y el parser WHATWG la normaliza
    // a "//evil.example/phish", que el navegador resuelve fuera del sitio.
    for (const hostil of [
      "https://evil.example/phish",
      "http://evil.example",
      "//evil.example/phish",
      "/\\evil.example/phish",
      "/\\\\evil.example",
      "/\\/evil.example",
      "javascript:alert(1)",
      "data:text/html,x",
      // La normalización de rutas también puede FABRICAR un destino
      // protocol-relative a partir de una entrada que empieza por "/".
      "/..//evil.example",
      "/../..//evil.example/x",
      "\\evil.example",
    ]) {
      redirectMock.mockClear();
      await expect(
        loginAction({ email: "a@b.c", password: "x", from: hostil }),
      ).rejects.toBe(redirectError);
      expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    }
  });

  it("ningún destino admitido escapa del origen al resolverlo", async () => {
    // La afirmación que de verdad importa, comprobada con el mismo parser que
    // usa el navegador en lugar de con una lista de prefijos prohibidos.
    loginMock.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    const ORIGEN = "https://psico-platform-web.vercel.app";
    for (const entrada of [
      "/\\evil.example/phish",
      "//evil.example",
      "/..//evil.example",
      "https://evil.example",
      "/dashboard/admin/contenido",
      "/a?q=1#h",
    ]) {
      redirectMock.mockClear();
      await expect(
        loginAction({ email: "a@b.c", password: "x", from: entrada }),
      ).rejects.toBe(redirectError);
      const destino = redirectMock.mock.calls[0]![0] as string;
      expect(new URL(destino, ORIGEN).origin).toBe(ORIGEN);
    }
  });

  it("conserva ruta, query y hash de un destino interno", async () => {
    loginMock.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    await expect(
      loginAction({
        email: "a@b.c",
        password: "x",
        from: "/dashboard/biblioteca?tab=libros#cap-3",
      }),
    ).rejects.toBe(redirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      "/dashboard/biblioteca?tab=libros#cap-3",
    );
  });

  it("una propiedad extra en tiempo de ejecución tampoco llega a la API", async () => {
    // El rest-spread quita `from`, pero no promete "sólo email y password":
    // cualquier propiedad que llegue en runtime — un campo oculto, un payload
    // de analítica, un contrato que crezca — viajaría igual, y la API la
    // rechazaría por `forbidNonWhitelisted` con el mismo 400 de antes.
    loginMock.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    const conExtras = {
      email: "a@b.c",
      password: "x",
      from: "/dashboard",
      tracking: "utm_source=news",
      unexpected: { anidado: true },
    } as unknown as Parameters<typeof loginAction>[0];

    await expect(loginAction(conExtras)).rejects.toBe(redirectError);
    expect(loginMock.mock.calls[0]![0]).toEqual({
      email: "a@b.c",
      password: "x",
    });
  });
});

describe("loginAction — formas reales de ApiError.details", () => {
  it("acepta el string[] que devuelve class-validator sin lanzar", async () => {
    // La forma que produce de verdad `forbidNonWhitelisted`, y la que hacía
    // estallar el manejador.
    loginMock.mockRejectedValue(
      new ApiError(400, "Validation failed", "VALIDATION_ERROR", [
        "property from should not exist",
        "email must be an email",
      ]),
    );

    const result = await loginAction({ email: "no", password: "x" });

    expect(result?.error).toContain("property from should not exist");
    expect(result?.error).toContain("email must be an email");
    // Legible, sin índices numéricos filtrados del array.
    expect(result?.error).not.toMatch(/\b0:/);
  });

  it("una forma no reconocida cae al mensaje genérico, no a una excepción", async () => {
    for (const raro of [42, "texto suelto", { email: 7 }, [], null]) {
      loginMock.mockRejectedValue(
        new ApiError(400, "Validation failed", "VALIDATION_ERROR", raro),
      );
      const result = await loginAction({ email: "a@b.c", password: "x" });
      expect(result?.error).toBe("Revisa los datos del formulario.");
    }
  });
});

describe("registerAction — error mapping", () => {
  it("returns the email-already-registered message on 409", async () => {
    registerMock.mockRejectedValue(
      new ApiError(409, "Email taken", "EMAIL_ALREADY_REGISTERED"),
    );
    const result = await registerAction({
      email: "a@b.c",
      password: "x".repeat(10),
      name: "Jorge",
    });
    expect(result).toEqual({ error: "Ya existe una cuenta con este email." });
  });

  it("returns the rate-limit message on 429", async () => {
    registerMock.mockRejectedValue(
      new ApiError(429, "Too many", "RATE_LIMIT_EXCEEDED"),
    );
    const result = await registerAction({
      email: "a@b.c",
      password: "x".repeat(10),
      name: "Jorge",
    });
    expect(result?.error).toMatch(/Demasiados intentos/);
  });

  it("surfaces unknown error codes verbatim so the user can report them", async () => {
    registerMock.mockRejectedValue(
      new ApiError(418, "I'm a teapot", "TEAPOT_MODE"),
    );
    const result = await registerAction({
      email: "a@b.c",
      password: "x".repeat(10),
      name: "Jorge",
    });
    expect(result?.error).toContain("código: TEAPOT_MODE");
  });

  it("redirects to /dashboard on success", async () => {
    registerMock.mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
    });
    await expect(
      registerAction({
        email: "a@b.c",
        password: "x".repeat(10),
        name: "Jorge",
      }),
    ).rejects.toBe(redirectError);
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});

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

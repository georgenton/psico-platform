import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El separador «o» sólo existe si hay otra forma de entrar.
 *
 * Acceso y registro lo pintaban siempre, y el botón de Google se esconde sin
 * `NEXT_PUBLIC_GOOGLE_CLIENT_ID` —que es como está servido hoy—, así que debajo
 * del formulario quedaba una «o» separando de nada. Ahora el separador vive
 * dentro del botón, bajo su misma condición.
 *
 * Se monta cada pantalla en los DOS estados. Sin el caso «con clave», una
 * prueba que sólo mirara la ausencia aprobaría haber borrado el separador.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/actions/auth", () => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
  loginWithGoogleAction: vi.fn(),
}));

const LoginForm = (await import("./login/_LoginForm")).default;
const RegisterPage = (await import("./register/page")).default;

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class {
      observe() {}
      disconnect() {}
    };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  ["acceso", () => <LoginForm />],
  ["registro", () => <RegisterPage />],
] as const)("%s", (_nombre, pantalla) => {
  it("sin clave de Google no hay botón ni separador", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    render(pantalla());
    expect(screen.queryByTestId("google-signin-container")).toBeNull();
    expect(screen.queryByText("o")).toBeNull();
  });

  it("con clave de Google aparecen los dos, y el separador va antes", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "prueba.apps.example");
    render(pantalla());
    const separador = screen.getByText("o");
    const boton = screen.getByTestId("google-signin-container");
    expect(
      separador.compareDocumentPosition(boton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

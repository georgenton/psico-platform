import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOKEN_NAMES } from "@/lib/cookies";

let galletas: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: () => ({
    has: (n: string) => n in galletas,
    get: (n: string) =>
      n in galletas ? { name: n, value: galletas[n] } : undefined,
  }),
}));

const { default: AyudaPage, generateMetadata } = await import("./page");

const abrir = (
  searchParams: Record<string, string | string[] | undefined> = {},
) => render(AyudaPage({ searchParams }));

const vuelta = () => screen.getByRole("link", { name: /^←?\s*Volver/ });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  galletas = {};
  fetchMock = vi.fn(() => Promise.reject(new Error("API inalcanzable")));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sin sesión", () => {
  it("se abre, con las líneas de Ecuador, y vuelve a la portada", () => {
    abrir();
    expect(
      screen.getByRole("heading", { name: "Líneas en Ecuador" }),
    ).toBeInTheDocument();
    expect(vuelta()).toHaveAttribute("href", "/");
  });

  it("aunque diga venir de Eco: Eco está detrás de la puerta", () => {
    abrir({ desde: "eco" });
    expect(vuelta()).toHaveAttribute("href", "/");
  });
});

describe("con sesión — basta la presencia de una cookie", () => {
  it.each([TOKEN_NAMES.access, TOKEN_NAMES.refresh])(
    "%s lleva de vuelta al panel",
    (nombre) => {
      // Un valor que no es un token: no se valida ni se decodifica.
      galletas = { [nombre]: "lo-que-sea" };
      abrir();
      expect(vuelta()).toHaveAttribute("href", "/dashboard");
    },
  );

  it.each([
    ["eco", "/dashboard/eco"],
    ["terapia", "/dashboard/terapia"],
  ])("desde=%s vuelve a %s", (desde, href) => {
    galletas = { [TOKEN_NAMES.refresh]: "x" };
    abrir({ desde });
    expect(vuelta()).toHaveAttribute("href", href);
  });

  it.each([
    "https://malo.example",
    "//malo.example",
    "javascript:alert(1)",
    "__proto__",
  ])("desde=%s no saca a nadie de la aplicación", (desde) => {
    galletas = { [TOKEN_NAMES.refresh]: "x" };
    const { container } = abrir({ desde });
    expect(vuelta()).toHaveAttribute("href", "/dashboard");
    expect(container.innerHTML).not.toContain("malo.example");
    expect(container.innerHTML).not.toContain("javascript:");
  });
});

describe("el país", () => {
  it.each([
    ["CO", "Colombia"],
    ["mx", "México"],
    ["ZZ", "Ecuador"],
    ["INTL", "Ecuador"],
  ])("?pais=%s enseña %s, también en el título", (pais, nombre) => {
    abrir({ pais });
    expect(
      screen.getByRole("heading", { name: `Líneas en ${nombre}` }),
    ).toBeInTheDocument();
    expect(generateMetadata({ searchParams: { pais } }).title).toBe(
      `Ayuda inmediata en ${nombre}`,
    );
  });

  it("repetido no rompe", () => {
    abrir({ pais: ["CO", "MX"], desde: ["eco", "terapia"] });
    expect(
      screen.getByRole("heading", { name: "Líneas en Colombia" }),
    ).toBeInTheDocument();
  });
});

it("la descripción no promete lo que la página no da", () => {
  const descripcion = String(
    generateMetadata({ searchParams: {} }).description,
  );
  expect(descripcion).toContain("con la fuente de cada uno");
  expect(descripcion).not.toMatch(/horario/);
});

it("no le pide nada a nadie: ni las líneas ni un registro de que se abrió", () => {
  galletas = { [TOKEN_NAMES.access]: "x", [TOKEN_NAMES.refresh]: "x" };
  abrir({ pais: "MX", desde: "eco" });
  expect(fetchMock).not.toHaveBeenCalled();
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// `reader-page` es un módulo de servidor y arrastra `server-only`, que se niega
// a cargarse fuera de un Server Component. Es el mismo apaño que usan los tests
// de Círculos; lo que se prueba aquí no tiene nada de servidor.
vi.mock("server-only", () => ({}));

import { ApiError } from "@/lib/api";
import { LectorBloqueado, esProRequerido } from "./reader-page";

/**
 * «Necesitas Pro» es un estado del producto, no un fallo del servidor.
 *
 * EL FALLO QUE ESTO IMPIDE. Un enlace directo a un capítulo de pago acababa en
 * un **500 en blanco**: el `403 PRO_REQUIRED` de la API subía como excepción no
 * capturada. Quien seguía un enlace compartido, o un marcador guardado de
 * cuando sí tenía Pro, veía una página rota en vez de una explicación. #736.
 *
 * Lo que NO se prueba aquí: que el servidor niegue el contenido. Eso ya está
 * demostrado en `content-access.spec.ts` del API, y con su propio control
 * negativo. Aquí se prueba lo que ocurre DESPUÉS de esa negativa.
 */

describe("reconocer la negativa por su código, no por su texto", () => {
  it("un 403 con code PRO_REQUIRED sí lo es", () => {
    expect(
      esProRequerido(new ApiError(403, "lo que sea", "PRO_REQUIRED")),
    ).toBe(true);
  });

  it("durante la transición, también si el token viene en el mensaje", () => {
    // La Web y la API se despliegan por separado. Si la Web llegara primero, el
    // `code` todavía sería el genérico `FORBIDDEN` y volveríamos al 500 que
    // esto viene a quitar. Esta rama se retira cuando la API nueva esté en
    // todas partes.
    expect(esProRequerido(new ApiError(403, "PRO_REQUIRED", "FORBIDDEN"))).toBe(
      true,
    );
  });

  it("un 403 cualquiera NO lo es: no todo lo prohibido se arregla pagando", () => {
    expect(esProRequerido(new ApiError(403, "No es tuyo", "FORBIDDEN"))).toBe(
      false,
    );
  });

  it("tampoco un 404 ni un 500, aunque alguien escriba ese texto", () => {
    expect(esProRequerido(new ApiError(404, "PRO_REQUIRED", "NOT_FOUND"))).toBe(
      false,
    );
    expect(
      esProRequerido(new ApiError(500, "PRO_REQUIRED", "INTERNAL_ERROR")),
    ).toBe(false);
  });

  it("y nada que no sea un error de la API", () => {
    expect(esProRequerido(new Error("PRO_REQUIRED"))).toBe(false);
    expect(esProRequerido(null)).toBe(false);
  });
});

describe("lo que ve quien no tiene Pro", () => {
  it("explica la razón y ofrece dos salidas", () => {
    render(<LectorBloqueado />);
    expect(
      screen.getByRole("heading", {
        name: /Este capítulo está disponible con Pro/i,
      }),
    ).toBeVisible();
    // Que el primer capítulo sea gratis es la información que convierte el muro
    // en algo accionable: dice qué SÍ puede leer ahora mismo.
    expect(
      screen.getByText(/primer capítulo de cada libro es gratuito/i),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Hazte Pro/i })).toHaveAttribute(
      "href",
      "/dashboard/plan",
    );
    expect(
      screen.getByRole("link", { name: /Volver a la biblioteca/i }),
    ).toHaveAttribute("href", "/dashboard/biblioteca");
  });

  it("no filtra ni un bloque del capítulo", () => {
    const { container } = render(<LectorBloqueado />);
    expect(container.querySelectorAll("[data-block-id]")).toHaveLength(0);
  });
});

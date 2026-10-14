import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La pantalla de creación ofrece exactamente lo que el servidor permite.
 *
 * ── El fallo que esto impide ────────────────────────────────────────────────
 *
 * La página decidía con el catálogo y nada más: si la plantilla estaba
 * PUBLISHED, renderizaba el formulario con su botón. Para quien el rollout no
 * admite, eso era ofrecer una creación que la API contesta con 503 — el
 * rechazo llegaba después de pulsar. Medido en staging el 14-10: la pantalla
 * se renderizaba entera para una cuenta a la que `/circles/access` respondía
 * 503.
 *
 * Y una segunda trampa, más silenciosa: los grupos tienen su propio
 * interruptor, que sólo puede estrechar. Preguntar «¿está Círculos abierto?» y
 * deducir «entonces puedo crear un grupo» vuelve a producir el mismo botón
 * muerto, esta vez sólo para la plantilla de grupo.
 *
 * Lo que NO cambia y se comprueba aquí igual: una clave desconocida sigue
 * siendo `notFound()`, y la falta de sesión sigue propagándose como redirección
 * en vez de convertirse en «no disponible» — confundir esas dos cosas dejaría a
 * quien cerró sesión mirando una pantalla que no le corresponde.
 */

// `server-only` existe para romper si un bundle de cliente lo toca, y en un
// entorno jsdom eso es siempre. Mismo idioma que `guide-recovery-scope.server.spec`.
vi.mock("server-only", () => ({}));

const serverFetch = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/api.server", () => ({
  serverFetch: (...args: unknown[]) => serverFetch(...args),
  // La implementación real: reconoce los throws de Next por su `digest`.
  isNextThrow: (err: unknown) =>
    typeof (err as { digest?: unknown })?.digest === "string",
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

// El formulario es un Client Component con su propio estado; aquí sólo importa
// SI se ofrece, no cómo se comporta por dentro.
vi.mock("@/components/circulos/CrearCirculo", () => ({
  CrearCirculo: () => <div data-testid="formulario-creacion" />,
}));

const { default: NuevoDuoPage } = await import("./page");

const DUO = "duo-lo-que-me-ayuda";
const GRUPO = "grupo-lo-que-nos-ayuda";

const pintar = async (templateKey: string) =>
  render(await NuevoDuoPage({ params: { templateKey } }));

const seOfreceLaCreacion = () =>
  screen.queryByTestId("formulario-creacion") !== null;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("la pantalla de creación sigue la autoridad del servidor", () => {
  it("sin sesión usable, la redirección se propaga — no se pinta «no disponible»", async () => {
    const redireccion = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    serverFetch.mockRejectedValue(redireccion);

    await expect(pintar(DUO)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("autenticado pero no habilitado: lo dice, y no ofrece crear nada", async () => {
    serverFetch.mockRejectedValue(
      Object.assign(new Error("CIRCLES_UNAVAILABLE"), { statusCode: 503 }),
    );

    await pintar(DUO);

    expect(screen.getByRole("heading")).toHaveTextContent(
      /todavía no está abierto/i,
    );
    expect(seOfreceLaCreacion()).toBe(false);
  });

  it("habilitado para Dúo: el recorrido actual se conserva", async () => {
    serverFetch.mockResolvedValue({ available: true, canCreateGroups: false });

    await pintar(DUO);

    expect(seOfreceLaCreacion()).toBe(true);
  });

  it("grupos deshabilitados: la plantilla de GRUPO no se ofrece, aunque Círculos esté abierto", async () => {
    // El caso que la deducción «disponible ⇒ grupos» rompía.
    serverFetch.mockResolvedValue({ available: true, canCreateGroups: false });

    await pintar(GRUPO);

    expect(screen.getByRole("heading")).toHaveTextContent(
      /todavía no puedes crear un grupo/i,
    );
    expect(seOfreceLaCreacion()).toBe(false);
  });

  it("grupos habilitados: la plantilla de GRUPO sí se ofrece", async () => {
    serverFetch.mockResolvedValue({ available: true, canCreateGroups: true });

    await pintar(GRUPO);

    expect(seOfreceLaCreacion()).toBe(true);
  });

  it("si la consulta de disponibilidad falla, falla cerrada", async () => {
    serverFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    await pintar(DUO);

    expect(seOfreceLaCreacion()).toBe(false);
  });

  it("una API antigua, sin el segundo campo, no concede grupos por omisión", async () => {
    // Compatibilidad hacia atrás: si Web se promueve antes que API, el campo
    // no viene. Leerlo como ausente ⇒ cerrado es lo único honesto.
    serverFetch.mockResolvedValue({ available: true });

    await pintar(GRUPO);

    expect(seOfreceLaCreacion()).toBe(false);
  });

  it("una clave desconocida sigue siendo notFound, sin consultar nada", async () => {
    await expect(pintar("no-existe")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(serverFetch).not.toHaveBeenCalled();
  });
});

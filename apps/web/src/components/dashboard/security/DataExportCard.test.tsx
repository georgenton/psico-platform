import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataExportCard } from "./DataExportCard";

const API = "https://api.test/api";
const props = { apiBase: API, token: "tok", solicitadaEl: null };

describe("DataExportCard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("dice el alcance ANTES de ofrecer el botón", () => {
    render(<DataExportCard {...props} />);
    // Lo que no viaja tiene que estar a la vista sin pulsar nada: un archivo
    // llamado «tus datos» que llega sin el diario defrauda a quien lo abre.
    expect(screen.getByText(/Qué NO incluye/i)).toBeInTheDocument();
    expect(screen.getAllByText(/tu diario/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ni\s+siquiera nosotros podemos leerlos/i)).toBeInTheDocument();
  });

  it("pedirla deja la tarjeta en «preparando»", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 202 }),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /Pedir mi exportación/i }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/preparando/i),
    );
  });

  it("el enfriamiento muestra la fecha concreta que da el servidor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ message: "Data export already requested. Try again after 2026-11-23T00:00:00.000Z" }),
        { status: 429 },
      ),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /Pedir mi exportación/i }));
    // «vuelve más tarde» no le sirve a nadie: tiene que decir cuándo.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/noviembre/i),
    );
  });

  it("cuando está lista ofrece la URL FIRMADA, no una llamada con el token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://r2.test/firmada?sig=abc", expiresInSec: 120 }), {
        status: 200,
      }),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /Consultar estado/i }));
    const enlace = await screen.findByRole("link", { name: /Descargar el archivo/i });
    expect(enlace).toHaveAttribute("href", "https://r2.test/firmada?sig=abc");
    expect(enlace).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("distingue caducada de «todavía no hay ninguna»", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    f.mockResolvedValueOnce(new Response(null, { status: 410 }));
    const { unmount } = render(<DataExportCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /Consultar estado/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/ya se borró/i));
    unmount();

    f.mockResolvedValueOnce(new Response(null, { status: 404 }));
    render(<DataExportCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /Consultar estado/i }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/no has pedido ninguna/i),
    );
  });
});

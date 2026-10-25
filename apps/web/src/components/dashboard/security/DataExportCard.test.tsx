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

    // El motivo por el que el Diario y Eco no viajan es el ALCANCE, no la
    // criptografía. El texto anterior decía «ni siquiera nosotros podemos
    // leerlos, así que no podemos ponerlos»: eso mezcla el mensaje que va en
    // claro al modelo con su copia cifrada, y convierte una decisión nuestra
    // en una imposibilidad técnica.
    expect(
      screen.getByText(/limitación de su alcance actual/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/ni\s+siquiera nosotros podemos leerlos/i),
    ).not.toBeInTheDocument();
  });

  it("pedirla deja la tarjeta en «preparando»", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 202 }),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Pedir mi exportación/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/preparando/i),
    );
  });

  it("el enfriamiento muestra la fecha concreta que da el servidor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message:
            "Data export already requested. Try again after 2026-11-23T00:00:00.000Z",
        }),
        { status: 429 },
      ),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Pedir mi exportación/i }),
    );
    // «vuelve más tarde» no le sirve a nadie: tiene que decir cuándo.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/noviembre/i),
    );
  });

  it("cuando está lista ofrece la URL FIRMADA, no una llamada con el token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://r2.test/firmada?sig=abc",
          expiresInSec: 120,
        }),
        {
          status: 200,
        },
      ),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Consultar estado/i }),
    );
    const enlace = await screen.findByRole("link", {
      name: /Descargar el archivo/i,
    });
    expect(enlace).toHaveAttribute("href", "https://r2.test/firmada?sig=abc");
    expect(enlace).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("distingue caducada de «todavía no hay ninguna»", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    f.mockResolvedValueOnce(new Response(null, { status: 410 }));
    const { unmount } = render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Consultar estado/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/ya se borró/i),
    );
    unmount();

    f.mockResolvedValueOnce(new Response(null, { status: 404 }));
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Consultar estado/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /no has pedido ninguna/i,
      ),
    );
  });

  // ── Los dos 409, que significan cosas opuestas ──────────────────────────
  //
  // La tarjeta trataba TODO 409 como «preparando». Uno de los dos códigos dice
  // que la exportación no podrá descargarse nunca, así que esa lectura invita
  // a esperar algo que no va a llegar.

  function conflicto(code?: string, status?: string): Response {
    const cuerpo = code
      ? JSON.stringify({ code, details: status ? { status } : undefined })
      : null;
    return new Response(cuerpo, {
      status: 409,
      headers: code ? { "content-type": "application/json" } : undefined,
    });
  }

  it("un 409 NOT_READY sí dice que se está preparando", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      conflicto("DATA_EXPORT_NOT_READY"),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Consultar estado/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/preparando/i),
    );
  });

  it("un 409 UNAVAILABLE no invita a esperar: explica y deja pedir otra", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      conflicto("DATA_EXPORT_UNAVAILABLE"),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Consultar estado/i }),
    );

    const estado = await screen.findByRole("status");
    expect(estado).toHaveTextContent(/no se puede descargar/i);
    expect(estado).toHaveTextContent(/no hace falta esperar/i);
    // Lo que NO puede decir: que se esté preparando.
    expect(estado).not.toHaveTextContent(/preparando/i);
    // Y la salida sigue ahí, con el mismo botón de siempre: pedir otra pasa
    // por el endpoint que ya impone su enfriamiento.
    expect(
      screen.getByRole("button", { name: /Pedir mi exportación/i }),
    ).toBeEnabled();
  });

  it("NOT_READY con status FAILED no dice «preparando»: eso ya terminó mal", async () => {
    // El servidor devuelve NOT_READY para TODO estado que no sea READY, y
    // FAILED es terminal. Mandar a esperar ahí es la misma promesa rota que
    // este arreglo quita, entrando por otra puerta. `details.status` lo
    // distingue.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      conflicto("DATA_EXPORT_NOT_READY", "FAILED"),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Consultar estado/i }),
    );

    const estado = await screen.findByRole("status");
    expect(estado).toHaveTextContent(/no llegó a completarse/i);
    expect(estado).not.toHaveTextContent(/preparando/i);
    expect(
      screen.getByRole("button", { name: /Pedir mi exportación/i }),
    ).toBeEnabled();
  });

  it("NOT_READY con un estado que SÍ está en curso sigue diciendo «preparando»", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      conflicto("DATA_EXPORT_NOT_READY", "PROCESSING"),
    );
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Consultar estado/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/preparando/i),
    );
  });

  it("un 409 sin código no se convierte en una promesa de preparación", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(conflicto());
    render(<DataExportCard {...props} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Consultar estado/i }),
    );

    const estado = await screen.findByRole("status");
    expect(estado).not.toHaveTextContent(/preparando/i);
    expect(estado).toHaveTextContent(/no pudimos consultar/i);
  });
});

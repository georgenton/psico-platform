import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiHelperModal } from "../AiHelperModal";

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});
afterEach(() => {
  fetchSpy.mockReset();
});

function setup(extra: Partial<Parameters<typeof AiHelperModal>[0]> = {}) {
  const onClose = vi.fn();
  const onAccept = vi.fn();
  render(
    <AiHelperModal
      bookId="b1"
      blockId="local-0"
      initialText="Texto original del autor."
      contextText="Resumen del libro"
      onClose={onClose}
      onAccept={onAccept}
      apiBase="https://api.test/api"
      accessToken="token-123"
      {...extra}
    />,
  );
  return { onClose, onAccept };
}

describe("AiHelperModal", () => {
  it("renders the 4 intent cards", () => {
    setup();
    expect(screen.getByText(/Revisar tono/i)).toBeInTheDocument();
    expect(screen.getByText(/Sugerir ejemplo/i)).toBeInTheDocument();
    expect(screen.getByText(/Cambiar tono/i)).toBeInTheDocument();
    expect(screen.getByText(/Simplificar/i)).toBeInTheDocument();
  });

  it("shows the selected text preview", () => {
    setup();
    expect(
      screen.getByText(/Texto original del autor/i),
    ).toBeInTheDocument();
  });

  it("calls fetch with the right shape on Generar sugerencia", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          intent: "revisar",
          suggestion: "Texto revisado",
          source: "model",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: /Generar sugerencia/i }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.test/api/autor/libros/b1/ai-help");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body.intent).toBe("revisar"); // default selection
    expect(body.text).toContain("Texto original");
    expect(body.blockId).toBe("local-0");
  });

  it("renders the suggestion after success", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          intent: "revisar",
          suggestion: "Una sugerencia revisada y limpia.",
          source: "model",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: /Generar sugerencia/i }),
    );
    expect(
      await screen.findByText(/Una sugerencia revisada/i),
    ).toBeInTheDocument();
  });

  it("shows fallback label when source=fallback", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          intent: "revisar",
          suggestion: "Sugerencia local",
          source: "fallback",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: /Generar sugerencia/i }),
    );
    expect(await screen.findByText(/modo local/i)).toBeInTheDocument();
  });

  it("calls onAccept and onClose when 'Reemplazar bloque' is clicked", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          intent: "revisar",
          suggestion: "Reemplazo nuevo",
          source: "model",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    const { onAccept, onClose } = setup();
    await user.click(
      screen.getByRole("button", { name: /Generar sugerencia/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Reemplazar bloque/i }),
    );
    expect(onAccept).toHaveBeenCalledWith("Reemplazo nuevo");
    expect(onClose).toHaveBeenCalled();
  });

  it("surfaces error message when fetch fails", async () => {
    fetchSpy.mockResolvedValue(new Response("Boom", { status: 500 }));
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: /Generar sugerencia/i }),
    );
    expect(await screen.findByText(/Boom/)).toBeInTheDocument();
  });

  it("closes when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    // The outermost div is the backdrop; clicking it triggers onClose.
    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });
});

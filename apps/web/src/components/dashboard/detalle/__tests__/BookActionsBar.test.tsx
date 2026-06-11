import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookActionsBar } from "../BookActionsBar";

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});
afterEach(() => {
  fetchSpy.mockReset();
});

function setup(overrides: Partial<Parameters<typeof BookActionsBar>[0]> = {}) {
  render(
    <BookActionsBar
      idOrSlug="emociones-en-construccion"
      initialFavorite={false}
      initialBookmarked={false}
      apiBase="https://api.test/api"
      token="tok-1"
      {...overrides}
    />,
  );
}

describe("BookActionsBar", () => {
  it("renders nothing when token is null", () => {
    setup({ token: null });
    expect(screen.queryByTestId("book-actions")).not.toBeInTheDocument();
  });

  it("renders favorite + bookmark chips in initial state", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /Marcar como favorito/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Guardar para después/i }),
    ).toBeInTheDocument();
  });

  it("reflects initialFavorite=true in label and aria-pressed", () => {
    setup({ initialFavorite: true });
    const btn = screen.getByRole("button", { name: /Quitar de favoritos/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("calls /books/:slug/favorite on click and reflects server state", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ active: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: /Marcar como favorito/i }),
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://api.test/api/books/emociones-en-construccion/favorite",
    );
    expect((init as RequestInit).method).toBe("POST");
    expect(
      (init as RequestInit).headers as Record<string, string>,
    ).toMatchObject({
      Authorization: "Bearer tok-1",
    });
    // After server confirms active=true, label reflects "Quitar de favoritos"
    expect(
      await screen.findByRole("button", { name: /Quitar de favoritos/i }),
    ).toBeInTheDocument();
  });

  it("calls /books/:slug/bookmark on click", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ active: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: /Guardar para después/i }),
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.test/api/books/emociones-en-construccion/bookmark",
    );
  });

  it("rolls back optimistic state on fetch failure", async () => {
    fetchSpy.mockResolvedValue(new Response("Boom", { status: 500 }));
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: /Marcar como favorito/i }),
    );
    // After failure, label returns to the inactive state
    expect(
      await screen.findByRole("button", { name: /Marcar como favorito/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/No pudimos actualizar tu favorito/i),
    ).toBeInTheDocument();
  });

  it("uses the server's authoritative active=false reply over the optimistic flip", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ active: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    setup({ initialBookmarked: true });
    await user.click(
      screen.getByRole("button", { name: /Quitar de guardados/i }),
    );
    // Server confirmed active=false → label is "Guardar para después"
    expect(
      await screen.findByRole("button", { name: /Guardar para después/i }),
    ).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JourneyListResponse } from "@psico/types";

/**
 * CC-7.5 — Exploraciones hosts two products side by side.
 *
 * The point of these tests is separation: the guide is always reachable, even
 * when `/journeys` is empty or failing, and it never travels through the
 * Journey list or the Journey components.
 */

const { serverFetch, getSessionUser, deriveGuideRecoveryActorScope } =
  vi.hoisted(() => ({
    serverFetch: vi.fn(),
    getSessionUser: vi.fn(),
    deriveGuideRecoveryActorScope: vi.fn(),
  }));

// Both modules are `server-only`, which throws when a test environment pulls
// it in. Mocking them is also what lets us assert the wiring: the page must
// derive the scope from the SESSION user, never from anything client-side.
vi.mock("@/lib/api.server", () => ({ serverFetch, getSessionUser }));
vi.mock("@/lib/guide-recovery-scope.server", () => ({
  deriveGuideRecoveryActorScope,
}));

import ExploracionesPage from "./page";

const journey = {
  id: "j1",
  slug: "recorrido-uno",
  title: "Recorrido de prueba",
  subtitle: "Sub",
  description: "Una descripción",
  durationMinutes: 120,
  books: [{ id: "b1", slug: "libro-uno", title: "Libro uno" }],
} as unknown as JourneyListResponse["journeys"][number];

async function renderPage() {
  render(await ExploracionesPage());
}

const SCOPE_A = "A".repeat(43);

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  getSessionUser.mockReturnValue({
    userId: "u_1",
    email: "a@example.test",
    role: "USER",
    plan: "FREE",
  });
  deriveGuideRecoveryActorScope.mockReturnValue(SCOPE_A);
});

describe("ExploracionesPage", () => {
  it("shows the guide card even when there are no journeys", async () => {
    serverFetch.mockResolvedValue({ journeys: [] });
    await renderPage();

    expect(screen.getByText("Guía breve")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "El cuerpo sabe antes que la mente",
      }),
    ).toBeInTheDocument();
  });

  it("shows the guide card even when /journeys fails", async () => {
    serverFetch.mockRejectedValue(new Error("down"));
    await renderPage();

    expect(screen.getByText("Guía breve")).toBeInTheDocument();
  });

  it("links the guide to its static route", async () => {
    serverFetch.mockResolvedValue({ journeys: [] });
    await renderPage();

    expect(screen.getByRole("link", { name: /guía/i })).toHaveAttribute(
      "href",
      "/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("keeps rendering journeys alongside the guide", async () => {
    serverFetch.mockResolvedValue({ journeys: [journey] });
    await renderPage();

    expect(screen.getByText("Guía breve")).toBeInTheDocument();
    expect(screen.getByText("Recorrido de prueba")).toBeInTheDocument();
    expect(screen.getByText("Recorrido sugerido")).toBeInTheDocument();
  });

  it("never asks the journeys endpoint for the guide", async () => {
    serverFetch.mockResolvedValue({ journeys: [journey] });
    await renderPage();

    expect(serverFetch).toHaveBeenCalledTimes(1);
    expect(serverFetch).toHaveBeenCalledWith("/journeys");
    // The guide is its own product: it never wears the journey tag.
    const guideCard = screen.getByText("Guía breve").closest(".card");
    expect(guideCard?.textContent).not.toContain("Recorrido sugerido");
  });

  it("derives the guide's actor scope from the session user", async () => {
    serverFetch.mockResolvedValue({ journeys: [] });
    await renderPage();

    expect(deriveGuideRecoveryActorScope).toHaveBeenCalledWith("u_1");
    // The raw id stays server-side: it must not appear in the markup.
    expect(document.body.innerHTML).not.toContain("u_1");
    expect(document.body.innerHTML).not.toContain("a@example.test");
  });

  it("does not claim every experience feeds the emotional map", async () => {
    serverFetch.mockResolvedValue({ journeys: [] });
    await renderPage();

    const subtitle = document.querySelector(".screen-sub");
    expect(subtitle?.textContent).not.toMatch(/alimenta tu mapa/i);
  });
});

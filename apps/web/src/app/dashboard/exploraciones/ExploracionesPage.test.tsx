import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JourneyListResponse } from "@psico/types";

/**
 * CC-7.5 — Exploraciones hosts two products side by side.
 *
 * The point of these tests is separation: the guide is always reachable, even
 * when `/journeys` is empty or failing, and it never travels through the
 * Journey list or the Journey components.
 *
 * They also pin WHERE the actor comes from. Decoding the access cookie would
 * lock out a session whose access token expired but whose refresh token is
 * still valid; `/user/me` through `serverFetch` is the only source that
 * survives that window.
 */

const { serverFetch, isNextThrow, deriveGuideRecoveryActorScope } = vi.hoisted(
  () => ({
    serverFetch: vi.fn(),
    isNextThrow: vi.fn(),
    deriveGuideRecoveryActorScope: vi.fn(),
  }),
);

// Both modules are `server-only`, which throws when a test environment pulls
// it in. Mocking them is also what lets us assert the wiring: the page must
// derive the scope from the AUTHENTICATED user, never from anything
// client-side and never from a cookie it decodes itself.
vi.mock("@/lib/api.server", () => ({ serverFetch, isNextThrow }));
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

/** `/user/me` always resolves; `/journeys` is what each test varies. */
function mockFetch(journeys: (() => unknown) | { journeys: unknown[] }) {
  serverFetch.mockImplementation((path: string) => {
    if (path === "/user/me") {
      return Promise.resolve({
        user: { id: "u_1", email: "a@example.test" },
      });
    }
    if (typeof journeys === "function") return Promise.resolve(journeys());
    return Promise.resolve(journeys);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  isNextThrow.mockReturnValue(false);
  deriveGuideRecoveryActorScope.mockReturnValue(SCOPE_A);
  mockFetch({ journeys: [] });
});

describe("ExploracionesPage", () => {
  it("shows the guide card even when there are no journeys", async () => {
    await renderPage();

    expect(screen.getByText("Guía breve")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "El cuerpo sabe antes que la mente",
      }),
    ).toBeInTheDocument();
  });

  it("shows the guide card even when /journeys fails", async () => {
    serverFetch.mockImplementation((path: string) =>
      path === "/user/me"
        ? Promise.resolve({ user: { id: "u_1", email: "a@example.test" } })
        : Promise.reject(new Error("down")),
    );
    await renderPage();

    expect(screen.getByText("Guía breve")).toBeInTheDocument();
  });

  it("lets a Next redirect out of the journeys catch", async () => {
    const redirectThrow = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/logout;307;",
    });
    isNextThrow.mockImplementation((err: unknown) => err === redirectThrow);
    serverFetch.mockImplementation((path: string) =>
      path === "/user/me"
        ? Promise.resolve({ user: { id: "u_1", email: "a@example.test" } })
        : Promise.reject(redirectThrow),
    );

    // Degrading to `journeys: []` here would render a full page for a session
    // the fetcher already decided must log in again.
    await expect(renderPage()).rejects.toBe(redirectThrow);
  });

  it("links the guide to its static route", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: /guía/i })).toHaveAttribute(
      "href",
      "/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("keeps rendering journeys alongside the guide", async () => {
    mockFetch({ journeys: [journey] });
    await renderPage();

    expect(screen.getByText("Guía breve")).toBeInTheDocument();
    expect(screen.getByText("Recorrido de prueba")).toBeInTheDocument();
    expect(screen.getByText("Recorrido sugerido")).toBeInTheDocument();
  });

  it("never asks the journeys endpoint for the guide", async () => {
    mockFetch({ journeys: [journey] });
    await renderPage();

    expect(serverFetch.mock.calls.map((c) => c[0])).toEqual([
      "/user/me",
      "/journeys",
    ]);
    // The guide is its own product: it never wears the journey tag.
    const guideCard = screen.getByText("Guía breve").closest(".card");
    expect(guideCard?.textContent).not.toContain("Recorrido sugerido");
  });

  it("derives the guide's actor scope from the authenticated user", async () => {
    await renderPage();

    expect(serverFetch).toHaveBeenCalledWith("/user/me");
    expect(deriveGuideRecoveryActorScope).toHaveBeenCalledWith("u_1");
    // The raw identity stays server-side: it must not appear in the markup.
    expect(document.body.innerHTML).not.toContain("u_1");
    expect(document.body.innerHTML).not.toContain("a@example.test");
  });

  it("does not claim every experience feeds the emotional map", async () => {
    await renderPage();

    const subtitle = document.querySelector(".screen-sub");
    expect(subtitle?.textContent).not.toMatch(/alimenta tu mapa/i);
  });
});

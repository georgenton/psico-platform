import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JourneyListResponse } from "@psico/types";

/**
 * CC-7.5 / PR #596 — Exploraciones hosts two products side by side, and after
 * the refresh-handoff round it fetches NO identity of its own.
 *
 * The actor scope is resolved once by the dashboard layout and published
 * through `GuideActorScopeProvider`; the page just renders `GuideEntryCardMount`
 * (which reads the context). So the ONLY server fetch here is `/journeys`.
 */

const { serverFetch, isNextThrow } = vi.hoisted(() => ({
  serverFetch: vi.fn(),
  isNextThrow: vi.fn(),
}));

// `api.server` is `server-only`; mocking it also lets us assert the page never
// fetches identity and never touches `getSessionUser`.
vi.mock("@/lib/api.server", () => ({ serverFetch, isNextThrow }));

// The mount is a client component; here we only care that the page renders it,
// so we stub it to a marker.
vi.mock("@/components/dashboard/guide/GuideEntryCardMount", () => ({
  GuideEntryCardMount: () => <div data-testid="guide-entry-mount" />,
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

beforeEach(() => {
  vi.clearAllMocks();
  isNextThrow.mockReturnValue(false);
  serverFetch.mockResolvedValue({ journeys: [] });
});

describe("ExploracionesPage", () => {
  it("renders the guide entry mount and fetches only /journeys", async () => {
    await renderPage();

    expect(screen.getByTestId("guide-entry-mount")).toBeInTheDocument();
    // The page issues exactly one server fetch, and it is NOT identity.
    expect(serverFetch.mock.calls.map((c) => c[0])).toEqual(["/journeys"]);
    expect(serverFetch).not.toHaveBeenCalledWith("/user/me");
  });

  it("shows the guide mount even when /journeys fails", async () => {
    serverFetch.mockRejectedValue(new Error("down"));
    await renderPage();
    expect(screen.getByTestId("guide-entry-mount")).toBeInTheDocument();
  });

  it("lets a Next redirect out of the journeys catch", async () => {
    const redirectThrow = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/logout;307;",
    });
    isNextThrow.mockImplementation((err: unknown) => err === redirectThrow);
    serverFetch.mockRejectedValue(redirectThrow);

    // Degrading to `journeys: []` would render a page for a session the fetcher
    // already decided must log in again.
    await expect(renderPage()).rejects.toBe(redirectThrow);
  });

  it("keeps rendering journeys alongside the guide", async () => {
    serverFetch.mockResolvedValue({ journeys: [journey] });
    await renderPage();

    expect(screen.getByTestId("guide-entry-mount")).toBeInTheDocument();
    expect(screen.getByText("Recorrido de prueba")).toBeInTheDocument();
    expect(screen.getByText("Recorrido sugerido")).toBeInTheDocument();
  });

  it("does not claim every experience feeds the emotional map", async () => {
    await renderPage();
    const subtitle = document.querySelector(".screen-sub");
    expect(subtitle?.textContent).not.toMatch(/alimenta tu mapa/i);
  });
});

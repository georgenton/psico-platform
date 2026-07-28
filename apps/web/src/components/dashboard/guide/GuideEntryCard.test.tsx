import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuideEntryCard } from "./GuideEntryCard";
import { GUIDE_STORAGE_KEY } from "./guide-recovery";

const SCOPE_A = "A".repeat(43);
const SCOPE_B = "B".repeat(43);

/**
 * CC-7.5 — the entry card is the seam between two products. These pin that a
 * Guide never borrows a Journey's shape, and that the CTA only promises to
 * resume when this browser actually can.
 */

beforeEach(() => {
  window.localStorage.clear();
});

describe("GuideEntryCard", () => {
  it("identifies itself as a short guide, not a journey", () => {
    render(<GuideEntryCard actorScope={SCOPE_A} />);
    expect(screen.getByText("Guía breve")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "El cuerpo sabe antes que la mente",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/recorrido sugerido/i)).not.toBeInTheDocument();
  });

  it("links to the static guide route", () => {
    render(<GuideEntryCard actorScope={SCOPE_A} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("says 'Empezar guía' when there is nothing to resume", () => {
    render(<GuideEntryCard actorScope={SCOPE_A} />);
    expect(screen.getByRole("link")).toHaveTextContent("Empezar guía");
  });

  it("switches to 'Continuar guía' once a valid record is found", async () => {
    window.localStorage.setItem(
      GUIDE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        actorScope: SCOPE_A,
        guideKey: "eec-c1-cuerpo-antes-que-mente",
        guideVersion: 1,
        startIdempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
    render(<GuideEntryCard actorScope={SCOPE_A} />);
    expect(await screen.findByText("Continuar guía")).toBeInTheDocument();
  });

  it("keeps 'Empezar guía' for a record written by another account", async () => {
    window.localStorage.setItem(
      GUIDE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        actorScope: SCOPE_A,
        guideKey: "eec-c1-cuerpo-antes-que-mente",
        guideVersion: 1,
        startIdempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
    render(<GuideEntryCard actorScope={SCOPE_B} />);

    // Promising to "continue" someone else's run would be a lie…
    expect(await screen.findByText("Empezar guía")).toBeInTheDocument();
    // …and the foreign record is dropped on the way past.
    expect(window.localStorage.getItem(GUIDE_STORAGE_KEY)).toBeNull();
  });

  it("keeps 'Empezar guía' when the stored record is corrupt", () => {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, "{not json");
    render(<GuideEntryCard actorScope={SCOPE_A} />);
    expect(screen.getByRole("link")).toHaveTextContent("Empezar guía");
  });

  it("shows no invented progress", () => {
    render(<GuideEntryCard actorScope={SCOPE_A} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });
});

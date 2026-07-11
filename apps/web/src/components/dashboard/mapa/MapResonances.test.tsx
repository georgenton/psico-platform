import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ResonanceSummary } from "@psico/types";
import { MapResonances } from "./MapResonances";

const deleteResonanceAction = vi.fn(async (_id: string) => ({
  ok: true as const,
}));
vi.mock("@/app/dashboard/mapa/actions", () => ({
  deleteResonanceAction: (id: string) => deleteResonanceAction(id),
}));

function resonance(over: Partial<ResonanceSummary> = {}): ResonanceSummary {
  return {
    id: "res-1",
    conceptKey: "eec-cuerpo-antes-que-mente",
    conceptLabel: "El cuerpo sabe antes que la mente",
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    source: "highlight",
    confirmedAt: "2026-07-10T12:00:00.000Z",
    ...over,
  };
}

describe("MapResonances — Fase E (ARC)", () => {
  it("renders the empty state when nothing was confirmed", () => {
    render(<MapResonances initial={[]} />);
    expect(screen.getByText("Mis resonancias")).toBeInTheDocument();
    expect(screen.getByText(/Aún no confirmaste ninguna/i)).toBeInTheDocument();
  });

  it("lists confirmed resonances with provenance (chapter + date)", () => {
    render(<MapResonances initial={[resonance()]} />);
    expect(
      screen.getByText(/El cuerpo sabe antes que la mente/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Confirmado por ti · Cap\. 1/)).toBeInTheDocument();
  });

  it("removes an entry optimistically via the server action", async () => {
    const user = userEvent.setup();
    render(<MapResonances initial={[resonance()]} />);
    await user.click(
      screen.getByRole("button", { name: /Quitar resonancia/i }),
    );
    expect(
      screen.queryByText(/El cuerpo sabe antes que la mente/),
    ).not.toBeInTheDocument();
    expect(deleteResonanceAction).toHaveBeenCalledWith("res-1");
  });
});

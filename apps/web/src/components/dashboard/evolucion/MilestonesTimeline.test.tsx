import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvolucionMilestone } from "@psico/types";
import { MilestonesTimeline } from "./MilestonesTimeline";

function milestone(
  overrides: Partial<EvolucionMilestone> = {},
): EvolucionMilestone {
  return {
    id: "m1",
    label: "Primera reflexión",
    description: "Escribiste tu primera entrada en el diario.",
    icon: "book-open",
    progressTarget: 1,
    progressCurrent: 1,
    unlockedAt: "2026-04-01T12:00:00Z",
    category: "primer paso",
    ...overrides,
  };
}

describe("MilestonesTimeline", () => {
  it("renders the empty-state copy when there are no milestones", () => {
    render(<MilestonesTimeline milestones={[]} />);
    expect(
      screen.getByText(/verás cada hito que vas desbloqueando/i),
    ).toBeInTheDocument();
  });

  it("calls the section a recorrido, not a transformation", () => {
    // The screen counts what happened; it makes no claim about who the person
    // became. Both states carry the heading, so both are checked.
    const empty = render(<MilestonesTimeline milestones={[]} />);
    expect(screen.getByText("Hitos de tu recorrido")).toBeInTheDocument();
    expect(empty.container.textContent).not.toMatch(/transformaci/i);
    empty.unmount();

    const filled = render(<MilestonesTimeline milestones={[milestone()]} />);
    expect(screen.getByText("Hitos de tu recorrido")).toBeInTheDocument();
    expect(filled.container.textContent).not.toMatch(/transformaci/i);
  });

  it("renders unlocked milestones with month + label + tag", () => {
    render(<MilestonesTimeline milestones={[milestone()]} />);
    expect(screen.getByText("Primera reflexión")).toBeInTheDocument();
    expect(screen.getByText(/Abril/i)).toBeInTheDocument();
    expect(screen.getByText(/\+ primer paso/i)).toBeInTheDocument();
  });

  it("sorts unlocked by date ascending", () => {
    const ms = [
      milestone({
        id: "feb",
        label: "Hito de febrero",
        unlockedAt: "2026-02-01T00:00:00Z",
      }),
      milestone({
        id: "jul",
        label: "Hito de julio",
        unlockedAt: "2026-07-01T00:00:00Z",
      }),
      milestone({
        id: "apr",
        label: "Hito de abril",
        unlockedAt: "2026-04-01T00:00:00Z",
      }),
    ];
    const { container } = render(<MilestonesTimeline milestones={ms} />);
    const headings = Array.from(container.querySelectorAll("h4")).map(
      (h) => h.textContent ?? "",
    );
    expect(headings).toEqual([
      "Hito de febrero",
      "Hito de abril",
      "Hito de julio",
    ]);
  });

  it("renders in-progress milestones at the end with `next` variant + Próximo paso label", () => {
    const inProgress = milestone({
      id: "pending",
      label: "Recorrido pendiente",
      unlockedAt: null,
      progressCurrent: 3,
      progressTarget: 7,
    });
    const { container } = render(
      <MilestonesTimeline milestones={[milestone(), inProgress]} />,
    );
    expect(screen.getByText(/Próximo paso/i)).toBeInTheDocument();
    expect(screen.getByText(/Falta: 4/i)).toBeInTheDocument();
    // The in-progress item gets the `next` modifier class.
    expect(container.querySelector(".tl-item.next")).not.toBeNull();
  });

  it("caps in-progress milestones to a maximum of 2 in the timeline", () => {
    const inProgress = [1, 2, 3, 4].map((i) =>
      milestone({
        id: `p${i}`,
        label: `Pendiente ${i}`,
        unlockedAt: null,
        progressCurrent: 0,
        progressTarget: 5,
      }),
    );
    render(<MilestonesTimeline milestones={inProgress} />);
    expect(screen.getByText("Pendiente 1")).toBeInTheDocument();
    expect(screen.getByText("Pendiente 2")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente 3")).not.toBeInTheDocument();
    expect(screen.queryByText("Pendiente 4")).not.toBeInTheDocument();
  });

  it("lo pendiente se distingue con palabras, no sólo con el borde punteado", () => {
    // La frase llega ya escrita para su estado desde la API; lo que añade la
    // tarjeta es decir que es un paso por dar y cuánto falta.
    const { container } = render(
      <MilestonesTimeline
        milestones={[
          milestone({ id: "hecho" }),
          milestone({
            id: "falta",
            label: "Primer capítulo",
            description: "Termina tu primer capítulo.",
            unlockedAt: null,
            progressCurrent: 0,
          }),
        ]}
      />,
    );
    const [hecho, falta] = [
      ...container.querySelectorAll<HTMLElement>(".tl-item"),
    ];
    expect(hecho?.textContent).not.toMatch(/Próximo paso|Falta/);
    expect(falta?.textContent).toMatch(/Próximo paso/);
    expect(falta?.textContent).toMatch(/Termina tu primer capítulo\./);
    expect(falta?.textContent).toMatch(/Falta: 1/);
  });

  it("reconoce los iconos que el catálogo manda de verdad", () => {
    const dibujo = (icon: string) => {
      const { container, unmount } = render(
        <MilestonesTimeline milestones={[milestone({ icon })]} />,
      );
      const svg = container.querySelector(".tl-dot svg")?.innerHTML;
      unmount();
      return svg;
    };
    const respaldo = dibujo("token-desconocido");
    for (const token of ["pencil", "book", "flame"]) {
      expect(dibujo(token), token).not.toBe(respaldo);
    }
    expect(new Set(["pencil", "book", "flame"].map(dibujo)).size).toBe(3);
  });
});

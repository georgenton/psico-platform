import { render, screen } from "@testing-library/react";

import { MapMomento } from "./MapMomento";

/** Fase F — "Mi momento": the latest self-reported mood, verbatim. */
describe("MapMomento — Fase F", () => {
  it("renders the mood label + emoji from the DIARY_MOODS catalog", () => {
    render(
      <MapMomento momento={{ mood: "good", at: "2026-07-10T14:02:00.000Z" }} />,
    );
    expect(screen.getByText("Bien")).toBeInTheDocument();
    expect(screen.getByText("🙂")).toBeInTheDocument();
    expect(screen.getByText(/Tu último registro/)).toBeInTheDocument();
  });

  it("falls back to the raw token for unknown moods (legacy rows)", () => {
    render(
      <MapMomento
        momento={{ mood: "calma", at: "2026-07-10T14:02:00.000Z" }}
      />,
    );
    expect(screen.getByText("calma")).toBeInTheDocument();
  });

  it("invites the first mood log when there is none", () => {
    render(<MapMomento momento={null} />);
    expect(screen.getByText(/Marca tu ánimo/)).toBeInTheDocument();
    expect(screen.queryByText(/Tu último registro/)).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";

import { MapLenguaje } from "./MapLenguaje";
import { MapNarrative } from "./MapNarrative";

/**
 * Fase F — descriptive-only sections: "Patrones de lenguaje" (TXT-L1 no
 * longer scores axes) + the optional NAR-L1 narrative (copy over facts).
 */
describe("MapLenguaje — Fase F (descriptive TXT-L1)", () => {
  it("renders nothing without consented analyzed data", () => {
    const { container } = render(<MapLenguaje lenguaje={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the analyzed count and states it does NOT score the map", () => {
    render(<MapLenguaje lenguaje={{ n: 7 }} />);
    expect(screen.getByText("Patrones de lenguaje")).toBeInTheDocument();
    expect(screen.getByText(/7 reflexiones/)).toBeInTheDocument();
    expect(
      screen.getByText(/no puntúa ninguna dimensión de tu mapa/),
    ).toBeInTheDocument();
    expect(screen.getByText("Analizado en tu dispositivo")).toBeInTheDocument();
  });
});

describe("MapNarrative — Fase F (L3, copy only)", () => {
  it("renders nothing when the narrator is off (null narrative)", () => {
    const { container } = render(<MapNarrative narrative={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the headline + body with the Experimental tag and the no-data-change note", () => {
    render(
      <MapNarrative
        narrative={{
          headline: "Tus registros de esta semana",
          body: "Registraste tu ánimo dos veces y confirmaste un tema.",
          modelId: "NAR-L1",
        }}
      />,
    );
    expect(
      screen.getByText("Tus registros de esta semana"),
    ).toBeInTheDocument();
    expect(screen.getByText("Experimental")).toBeInTheDocument();
    expect(screen.getByText(/apagarla no cambia tu mapa/)).toBeInTheDocument();
  });
});

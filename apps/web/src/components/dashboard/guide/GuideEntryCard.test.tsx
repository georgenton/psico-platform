import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChapterExperiencePublicView } from "@psico/types";

/**
 * B3 — la tarjeta ya no decide su rótulo sólo con `localStorage`: pregunta al
 * servidor si todavía se puede empezar. Estas pruebas controlan esa respuesta
 * en vez de dejar que la red decida qué dicen.
 *
 * Por defecto, una experiencia arrancable — que es el mundo que las pruebas
 * de CC-7.5 describían cuando se escribieron.
 */
const { experiencia } = vi.hoisted(() => ({
  experiencia: {
    current: {
      status: "ready",
      definition: null as ChapterExperiencePublicView | null,
      items: [],
    },
  },
}));

vi.mock("../experience/use-chapter-experience", () => ({
  useChapterExperience: () => experiencia.current,
}));

import { GuideEntryCard } from "./GuideEntryCard";
import { guideStorageKey } from "./guide-recovery";
import { EEC_EXPERIENCE, EEC_PIN } from "./guide-test-fixtures";

/** Lo que el servidor contesta sobre el pin de esta tarjeta. */
function resuelve(startable: boolean | null) {
  experiencia.current = {
    status: "ready",
    definition:
      startable === null
        ? null
        : ({ ...EEC_EXPERIENCE, startable } as ChapterExperiencePublicView),
    items: [],
  };
}

const GUIDE_STORAGE_KEY = guideStorageKey(EEC_PIN) as string;

const SCOPE_A = "A".repeat(43);
const SCOPE_B = "B".repeat(43);

/**
 * CC-7.5 — the entry card is the seam between two products. These pin that a
 * Guide never borrows a Journey's shape, and that the CTA only promises to
 * resume when this browser actually can.
 */

beforeEach(() => {
  window.localStorage.clear();
  resuelve(true);
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

/**
 * B3 — la tarjeta deja de ofrecer un inicio imposible.
 *
 * El pin del piloto está retirado para inicios nuevos: `POST /guide/sessions`
 * responde 410. La tarjeta seguía diciendo «Empezar guía» porque su rótulo
 * salía de `localStorage`, que no sabe nada de eso.
 */
describe("GuideEntryCard — cuando ya no se puede empezar", () => {
  it("no dice «Empezar» en un recorrido que no admite inicios nuevos", () => {
    resuelve(false);
    render(<GuideEntryCard actorScope={SCOPE_A} />);

    const enlace = screen.getByRole("link");
    expect(enlace).not.toHaveTextContent("Empezar guía");
    expect(enlace).toHaveTextContent("Abrir guía");
  });

  it("tampoco promete continuar sólo porque el navegador tenga un registro", () => {
    // Un registro local es una pista, no una sesión. Prometer «Continuar»
    // sobre un pin retirado sería creerle al navegador antes que al servidor.
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
    resuelve(false);
    render(<GuideEntryCard actorScope={SCOPE_A} />);

    expect(screen.getByRole("link")).toHaveTextContent("Abrir guía");
  });

  it("desaparece cuando no hay nada que abrir", () => {
    // Ni el capítulo la ofrece ni esta persona tiene un recorrido propio en
    // ella. Anunciarla sería ofrecer una puerta a ninguna parte.
    resuelve(null);
    const { container } = render(<GuideEntryCard actorScope={SCOPE_A} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("control negativo — con el inicio autorizado sigue diciendo «Empezar»", () => {
    resuelve(true);
    render(<GuideEntryCard actorScope={SCOPE_A} />);

    expect(screen.getByRole("link")).toHaveTextContent("Empezar guía");
  });
});

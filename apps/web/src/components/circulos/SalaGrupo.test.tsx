import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CircleActivityView } from "@psico/types";

vi.mock("server-only", () => ({}));

import { Reveal } from "./Reveal";
import { Artefacto } from "./Artefacto";
import { PreviewCompartir } from "./PreviewCompartir";
import { REVELADA } from "./__fixtures__/actividad";

/**
 * What a room of more than two says, and what it refuses to say.
 *
 * None of this is implied by the Dúo's tests passing: every assertion is about
 * a case that could not arise while an activity had exactly two seats — several
 * answers to keep apart, several people to wait for, and several people who
 * will read what you write.
 */

const share = (value: string) =>
  ({
    mode: "SELECTED_FIELDS" as const,
    fields: [{ fieldKey: "campo-a", value }],
  }) satisfies CircleActivityView["you"]["confirmed"];

/** The fixture, resized into a room of four. */
function room(over: Partial<CircleActivityView> = {}): CircleActivityView {
  return {
    ...REVELADA,
    requiredParticipants: 4,
    readyCount: 4,
    revealed: {
      participants: [
        { label: "Participante 1", share: share("lo de quien invitó") },
        { label: "Participante 3", share: share("lo de la tercera") },
        {
          label: "Participante 4",
          share: { mode: "KEEP_PRIVATE", sharedNothing: true },
        },
      ],
    },
    ...over,
  };
}

describe("the reveal keeps three answers apart", () => {
  it("renders one labelled block per person, in roster order", () => {
    render(<Reveal view={room()} />);
    expect(screen.getByText("Lo que compartió cada quien")).toBeVisible();
    const labels = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(labels).toEqual([
      "Participante 1",
      "Participante 3",
      "Participante 4",
    ]);
    expect(screen.getByText("lo de quien invitó")).toBeVisible();
    expect(screen.getByText("lo de la tercera")).toBeVisible();
  });

  it("reports KEEP_PRIVATE as a fact, with no reason and no blame", () => {
    render(<Reveal view={room()} />);
    expect(
      screen.getByText(/eligió no compartir contenido esta vez/),
    ).toBeVisible();
  });

  it("does not name one of the three the counterpart", () => {
    render(<Reveal view={room()} />);
    expect(screen.queryByText(/la otra persona/i)).toBeNull();
  });

  it("keeps the Dúo's wording when there is exactly one other person", () => {
    // The production activity, untouched: one other answer, no labels, and the
    // sentence people are reading today.
    render(<Reveal view={REVELADA} />);
    expect(screen.getByText("Lo que compartió la otra persona")).toBeVisible();
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("renders only what it was handed, never a placeholder for a missing seat", () => {
    // A room of four whose projection carried two answers renders two. An
    // empty third block would say "somebody shared something you cannot see".
    const partial = room({
      revealed: {
        participants: [
          { label: "Participante 1", share: share("una") },
          { label: "Participante 4", share: share("otra") },
        ],
      },
    });
    render(<Reveal view={partial} />);
    expect(screen.queryByText("Participante 3")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });
});

describe("the agreement belongs to everybody in the room", () => {
  const withArtifact = (confirmations: number, participants: number) =>
    ({
      ...room(),
      requiredParticipants: participants,
      artifact: {
        artifactId: "art-1",
        version: 1,
        status: "PROPOSED" as const,
        kind: "AGREEMENT" as const,
        body: "lo que vamos a intentar",
        confirmedByYou: true,
        confirmationCount: confirmations,
      },
    }) satisfies CircleActivityView;

  it("counts confirmations against the whole roster", () => {
    render(
      <Artefacto
        view={withArtifact(2, 4)}
        busy={false}
        onPropose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("2 de 4 lo confirmaron.")).toBeVisible();
    expect(screen.getByText(/Faltan las demás personas/)).toBeVisible();
  });

  it("says a Dúo's agreement in the Dúo's own words", () => {
    render(
      <Artefacto
        view={withArtifact(1, 2)}
        busy={false}
        onPropose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText(/Falta la otra persona/)).toBeVisible();
  });
});

describe("the preview tells you who will read it", () => {
  it("says «las demás personas» in a room", () => {
    render(
      <PreviewCompartir
        confirmation={{ mode: "EDITED_SUMMARY", summary: "lo mío" }}
        fields={[]}
        busy={false}
        onBack={() => {}}
        onConfirm={() => {}}
        participantes={5}
      />,
    );
    expect(
      screen.getByText("Esto es lo que verán las demás personas"),
    ).toBeVisible();
    expect(
      screen.getByText(/todas las personas hayan confirmado/),
    ).toBeVisible();
  });

  it("says «la otra persona» in a Dúo, exactly as before", () => {
    render(
      <PreviewCompartir
        confirmation={{ mode: "EDITED_SUMMARY", summary: "lo mío" }}
        fields={[]}
        busy={false}
        onBack={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(
      screen.getByText("Esto es lo que verá la otra persona"),
    ).toBeVisible();
    expect(screen.getByText(/las dos personas hayan confirmado/)).toBeVisible();
  });
});

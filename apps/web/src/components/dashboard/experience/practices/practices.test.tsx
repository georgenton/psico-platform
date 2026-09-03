import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type {
  BeliefLensPractice,
  ContextPlausibilityPractice,
  FourPartDistinctionPractice,
  PracticePublicView,
  SequenceOrderingPractice,
  SignalContextComparePractice,
} from "@psico/types";
import { SequenceOrdering } from "./SequenceOrdering";
import {
  BeliefLens,
  ContextPlausibility,
  FourPartDistinction,
  SignalContextCompare,
} from "./ChoicePractices";
import { PracticeInteractionView } from "./PracticeInteractionView";

/**
 * The five interactions, exercised the way a person would reach them.
 *
 * The ordering one is tested hardest because it is the one that would quietly
 * exclude people: if the only way to move a card is to drag it, a keyboard
 * user has no way through, and a screen-reader user cannot tell that anything
 * moved. Both are asserted here rather than described in a comment.
 */

const SEQUENCE: SequenceOrderingPractice = {
  kind: "sequence_ordering",
  scenario: "Lees y una puerta se cierra de golpe.",
  cards: [
    { key: "senal", label: "Aparece una señal repentina." },
    {
      key: "respuesta",
      label: "El organismo inicia una respuesta protectora.",
    },
    { key: "contexto", label: "Compruebas el contexto." },
    { key: "interpretacion", label: "Interpretas y puedes nombrarla." },
  ],
  solved: ["senal", "respuesta", "contexto", "interpretacion"],
  solvedLabel: "Prefiero ver el ejemplo resuelto",
  feedback: "La señal y la respuesta rápida pueden preceder la comprensión.",
};

function positions() {
  return screen.getByTestId("sequence-list").querySelectorAll("li");
}

describe("sequence_ordering", () => {
  it("does not open on the solved order", () => {
    render(<SequenceOrdering interaction={SEQUENCE} />);
    const first = positions()[0].textContent ?? "";
    expect(first).not.toContain("Aparece una señal repentina.");
  });

  it("moves a card with buttons alone — no dragging required", async () => {
    const user = userEvent.setup();
    render(<SequenceOrdering interaction={SEQUENCE} />);
    const label = "Aparece una señal repentina.";
    const before = [...positions()].findIndex((li) =>
      li.textContent?.includes(label),
    );
    await user.click(screen.getByRole("button", { name: `Subir: ${label}` }));
    const after = [...positions()].findIndex((li) =>
      li.textContent?.includes(label),
    );
    expect(after).toBe(before - 1);
  });

  it("reaches the buttons by keyboard and moves with Enter", async () => {
    const user = userEvent.setup();
    render(<SequenceOrdering interaction={SEQUENCE} />);
    const label = "Compruebas el contexto.";
    const button = screen.getByRole("button", { name: `Subir: ${label}` });
    button.focus();
    expect(button).toHaveFocus();
    const before = [...positions()].findIndex((li) =>
      li.textContent?.includes(label),
    );
    await user.keyboard("{Enter}");
    const after = [...positions()].findIndex((li) =>
      li.textContent?.includes(label),
    );
    expect(after).toBe(before - 1);
  });

  it("announces the new position through a live region", async () => {
    const user = userEvent.setup();
    render(<SequenceOrdering interaction={SEQUENCE} />);
    expect(screen.getByTestId("sequence-live")).toHaveTextContent("");
    await user.click(
      screen.getByRole("button", {
        name: "Subir: Compruebas el contexto.",
      }),
    );
    expect(screen.getByTestId("sequence-live")).toHaveTextContent(
      /Compruebas el contexto\..*Posición \d+ de 4/,
    );
  });

  it("disables Subir on the first card and Bajar on the last", () => {
    render(<SequenceOrdering interaction={SEQUENCE} />);
    const items = [...positions()];
    const firstLabel = items[0].textContent ?? "";
    const lastLabel = items[items.length - 1].textContent ?? "";
    const up = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("aria-label")?.startsWith("Subir:") &&
          firstLabel.includes(b.getAttribute("aria-label")!.slice(7)),
      );
    const down = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("aria-label")?.startsWith("Bajar:") &&
          lastLabel.includes(b.getAttribute("aria-label")!.slice(7)),
      );
    expect(up).toBeDisabled();
    expect(down).toBeDisabled();
  });

  it("shows the solved example and the feedback, without scoring anything", async () => {
    const user = userEvent.setup();
    render(<SequenceOrdering interaction={SEQUENCE} />);
    await user.click(
      screen.getByRole("button", { name: SEQUENCE.solvedLabel }),
    );
    expect(screen.getByTestId("sequence-feedback")).toHaveTextContent(
      SEQUENCE.feedback,
    );
    // No verdict about what the reader had arranged.
    expect(screen.queryByText(/correct/i)).toBeNull();
    expect(screen.queryByText(/incorrect/i)).toBeNull();
    const shown = [...positions()].map((li) => li.textContent ?? "");
    expect(shown[0]).toContain("Aparece una señal repentina.");
  });
});

const BELIEF: BeliefLensPractice = {
  kind: "belief_lens",
  belief: "«Si alguien se enoja, es porque no le importas.»",
  zones: [
    {
      key: "observo",
      label: "Qué observo",
      hint: "Solo lo que se vería en una grabación.",
      options: [
        { key: "tono", label: "Levantó la voz." },
        { key: "gesto", label: "Frunció el ceño." },
      ],
    },
    {
      key: "supongo",
      label: "Qué estoy suponiendo",
      hint: "El salto.",
      options: [
        { key: "no-importa", label: "Que no le importo." },
        { key: "contra-mi", label: "Que es contra mí." },
      ],
    },
    {
      key: "falta",
      label: "Qué contexto falta",
      hint: "Lo que habría que saber.",
      options: [
        { key: "antes", label: "Qué pasó antes." },
        { key: "dicho", label: "Qué diría si preguntara." },
      ],
    },
  ],
  allowsFreeText: true,
};

describe("belief_lens", () => {
  it("asks the three questions and marks a choice in more than colour", async () => {
    const user = userEvent.setup();
    render(<BeliefLens interaction={BELIEF} />);
    expect(screen.getByText("Qué observo")).toBeInTheDocument();
    expect(screen.getByText("Qué estoy suponiendo")).toBeInTheDocument();
    expect(screen.getByText("Qué contexto falta")).toBeInTheDocument();

    const chip = screen.getByRole("button", { name: "Levantó la voz." });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps what the reader types inside the component", async () => {
    const user = userEvent.setup();
    render(<BeliefLens interaction={BELIEF} />);
    const box = screen.getAllByRole("textbox")[0];
    await user.type(box, "algo mío");
    expect(box).toHaveValue("algo mío");
    // There is no callback to lift it with: the props are the interaction only.
    expect(Object.keys(BELIEF)).not.toContain("onChange");
  });
});

const CONTEXT: ContextPlausibilityPractice = {
  kind: "context_plausibility",
  situation: "Alguien sonríe al terminar una reunión.",
  observation: "Comisuras elevadas.",
  availableContext: ["La reunión se alargó."],
  readings: [
    { key: "alivio", label: "Alivio." },
    { key: "cortesia", label: "Cortesía." },
  ],
  buckets: [
    { key: "mas-plausible", label: "Más plausible" },
    { key: "posible", label: "Posible" },
    { key: "falta-info", label: "Falta información" },
  ],
  missingInformationPrompt: "¿Qué necesitarías saber?",
};

describe("context_plausibility", () => {
  it("classifies without dragging and keeps one bucket per reading", async () => {
    const user = userEvent.setup();
    render(<ContextPlausibility interaction={CONTEXT} />);
    const groups = screen.getAllByRole("group");
    const first = groups[0];
    const masPlausible = [...first.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Más plausible"),
    )!;
    const posible = [...first.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Posible"),
    )!;
    await user.click(masPlausible);
    expect(masPlausible).toHaveAttribute("aria-pressed", "true");
    await user.click(posible);
    expect(masPlausible).toHaveAttribute("aria-pressed", "false");
    expect(posible).toHaveAttribute("aria-pressed", "true");
  });

  it("asks what is missing rather than settling for a ranking", () => {
    render(<ContextPlausibility interaction={CONTEXT} />);
    expect(screen.getByText(CONTEXT.missingInformationPrompt)).toBeVisible();
    expect(screen.getAllByText("Falta información").length).toBeGreaterThan(0);
  });
});

const FOUR: FourPartDistinctionPractice = {
  kind: "four_part_distinction",
  scenario: "Escribes y no responden.",
  fields: [
    {
      key: "siento",
      label: "Siento",
      options: [
        { key: "inquietud", label: "Inquietud." },
        { key: "nada", label: "Casi nada." },
      ],
    },
    {
      key: "interpreto",
      label: "Interpreto",
      options: [
        { key: "ocupado", label: "Está ocupado." },
        { key: "molesto", label: "Está molesto." },
      ],
    },
    {
      key: "impulso",
      label: "Tengo ganas de",
      options: [
        { key: "reescribir", label: "Escribir otra vez." },
        { key: "dejarlo", label: "Dejarlo pasar." },
      ],
    },
    {
      key: "elijo",
      label: "Elijo hacer",
      options: [
        { key: "esperar", label: "Esperar." },
        { key: "preguntar", label: "Preguntar." },
      ],
    },
  ],
  allowsFreeText: false,
  disclaimer: "Lo que elijas aquí no es un diagnóstico ni una recomendación.",
};

describe("four_part_distinction", () => {
  it("shows the four fields and says it is not advice", () => {
    render(<FourPartDistinction interaction={FOUR} />);
    for (const label of [
      "Siento",
      "Interpreto",
      "Tengo ganas de",
      "Elijo hacer",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(FOUR.disclaimer)).toBeVisible();
  });
});

const SIGNALS: SignalContextComparePractice = {
  kind: "signal_context_compare",
  signals: ["Corazón acelerado."],
  contexts: [
    {
      key: "entrevista",
      label: "Antes de una entrevista",
      description: "Esperas.",
    },
    {
      key: "cita",
      label: "Antes de una primera cita",
      description: "Esperas.",
    },
  ],
  factors: [
    { key: "situacion", label: "La situación." },
    { key: "recuerdos", label: "Los recuerdos." },
  ],
  prompt: "¿Qué hace que signifiquen cosas distintas?",
};

describe("signal_context_compare", () => {
  it("puts the same signals against two situations", () => {
    render(<SignalContextCompare interaction={SIGNALS} />);
    expect(screen.getByText("Antes de una entrevista")).toBeInTheDocument();
    expect(screen.getByText("Antes de una primera cita")).toBeInTheDocument();
    expect(screen.getByText(SIGNALS.prompt)).toBeVisible();
  });
});

describe("the loader", () => {
  const view: PracticePublicView = {
    exerciseKey: "eec-c1-practice-ordenar-alarma-y-relato",
    title: "Ordena la alarma y el relato",
    skipLabel: "Prefiero saltarla",
    confirmLabel: "Ya hice la práctica",
    interaction: SEQUENCE,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when the scene declares no practice", () => {
    const { container } = render(
      <PracticeInteractionView
        exerciseKey={undefined}
        fetchContext={{ apiBase: "/api", token: "t" }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("loads and renders the interaction the server sends", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => view,
    } as Response);
    render(
      <PracticeInteractionView
        exerciseKey={view.exerciseKey}
        fetchContext={{ apiBase: "/api", token: "t" }}
      />,
    );
    expect(screen.getByTestId("practice-loading")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("practice-sequence")).toBeInTheDocument(),
    );
  });

  it("offers a retry when the request fails, instead of a dead end", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => view } as Response);
    render(
      <PracticeInteractionView
        exerciseKey={view.exerciseKey}
        fetchContext={{ apiBase: "/api", token: "t" }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("practice-error")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() =>
      expect(screen.getByTestId("practice-sequence")).toBeInTheDocument(),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

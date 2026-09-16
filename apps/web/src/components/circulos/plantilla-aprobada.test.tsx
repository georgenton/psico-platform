import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CircleActivityView } from "@psico/types";
import { PRODUCTION_CIRCLE_TEMPLATES } from "@psico/types";

import { irACompartir } from "./__fixtures__/actividad";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import { SalaDuo } from "./SalaDuo";

/**
 * The approved template and the screen it produces, checked against each other.
 *
 * A catalog entry is a promise about what a person will see: two questions with
 * these exact words, three ways to answer including "nothing", two conversation
 * turns, a follow-up. Every one of those is copy that travels from the
 * definition to a component, and a promise nobody renders is a promise broken
 * silently — the template would still validate, the tests would still pass, and
 * the screen would simply be missing a field.
 *
 * So this mounts the ROOM with the real published definition — not a fixture —
 * and looks for what the definition said would be there.
 */

const APROBADA = PRODUCTION_CIRCLE_TEMPLATES.find(
  (t) => t.templateKey === "duo-lo-que-me-ayuda",
)!;

/**
 * A view of THIS activity, built from the approved definition.
 *
 * The API projects a view from the pinned template, so every field here that
 * has a counterpart in the definition is read from it rather than retyped: a
 * test that hard-codes «Lo que me ayuda…» would keep passing after somebody
 * edited the catalog, which is the one thing it exists to catch.
 */
const VISTA: CircleActivityView = {
  activityId: "act-aprobada",
  status: "PREPARING",
  templateKey: APROBADA.templateKey,
  templateVersion: APROBADA.templateVersion,
  title: APROBADA.title,
  summary: APROBADA.summary,
  conversationTurns: APROBADA.conversation.turns,
  outcomeKind: APROBADA.outcome.kind,
  requiredParticipants: APROBADA.participants.required,
  readyCount: 0,
  revealedAt: null,
  followUpDueAt: null,
  you: {
    status: "ACCEPTED",
    sharingMode: null,
    confirmed: null,
    followUpDecision: null,
  },
  counterpart: { status: "ACCEPTED" },
  revealed: null,
  artifact: null,
};

const props = {
  activityId: "act-aprobada",
  initialView: VISTA,
  initialError: null,
  fields: APROBADA.privatePreparation,
  allowedModes: APROBADA.sharing.allowedModes,
  noConviene: APROBADA.safety.doNotSuggestWhen,
  minutosEstimados: APROBADA.estimatedMinutes,
  intro: APROBADA.intro ?? null,
  isGuest: false,
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

/** Walk past the consent screen the way a person does. */
async function entrar() {
  render(<SalaDuo {...props} />);
  await userEvent.click(
    screen.getByRole("button", { name: /entiendo, empezar/i }),
  );
}

describe("what the approved template promises, the screen actually shows", () => {
  it("renders the title and summary as written", () => {
    render(<SalaDuo {...props} />);
    expect(
      screen.getByRole("heading", { name: APROBADA.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(APROBADA.summary)).toBeInTheDocument();
  });

  it("asks each question in turn, with its exact label and limit", async () => {
    // One question per screen: the loop walks rather than reading them all at
    // once, which is the behaviour being asserted as much as the labels are.
    const user = userEvent.setup();
    await entrar();
    for (const field of APROBADA.privatePreparation) {
      const input = screen.getByLabelText(field.label);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("maxlength", String(field.maxLength));
      // And exactly one question is on screen at a time.
      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: /^Continuar$/ }));
    }
    expect(APROBADA.privatePreparation).toHaveLength(2);
  });

  it("offers every allowed way to answer, and no more", async () => {
    const user = userEvent.setup();
    await entrar();
    await irACompartir(user, screen, [], APROBADA.privatePreparation.length);
    const options = screen
      .getAllByRole("radio")
      .map((r) => (r as HTMLInputElement).value);
    expect(new Set(options)).toEqual(new Set(APROBADA.sharing.allowedModes));
  });

  it("keeps «nothing» as one of them", async () => {
    const user = userEvent.setup();
    await entrar();
    await irACompartir(user, screen, [], APROBADA.privatePreparation.length);
    expect(APROBADA.sharing.allowedModes).toContain("KEEP_PRIVATE");
    expect(
      screen.getByRole("radio", { name: /no compartir nada/i }),
    ).toBeInTheDocument();
  });

  it("states the number of minutes the template estimates", () => {
    render(<SalaDuo {...props} />);
    expect(document.body.textContent).toContain(
      `${APROBADA.estimatedMinutes} minutos`,
    );
  });

  it("is a Dúo of exactly two, and says so in the count it shows", () => {
    // `requiredParticipants` drives "N de 2 lo confirmaron" downstream. The
    // template is the source of that 2 and nothing rewrites it.
    expect(APROBADA.participants).toEqual({ min: 2, max: 2, required: 2 });
    expect(VISTA.requiredParticipants).toBe(2);
  });

  it("carries two conversation turns the room can render verbatim", () => {
    // The turns are copy with no interpolation and no ids — safe to render as
    // written, which is what `Reveal` does.
    expect(APROBADA.conversation.turns).toHaveLength(2);
    for (const turn of APROBADA.conversation.turns) {
      expect(turn).not.toMatch(/\{|\}|\$\{/);
    }
  });

  it("promises a follow-up the engine has a unit for", () => {
    expect(APROBADA.followUp?.afterHours).toBe(168);
  });
});

/**
 * The candidate @2, and what it is supposed to add.
 *
 * The published @1 is asserted above. This describes the version whose copy is
 * waiting for an audit — the one the test environment serves — so that "we
 * changed the experience" is a set of checkable statements rather than a claim
 * in a PR body.
 */
describe("the candidate walks, explains itself, and offers help without a model", () => {
  const CANDIDATO = PRODUCTION_CIRCLE_TEMPLATES.find(
    (t) => t.templateKey === "duo-lo-que-me-ayuda" && t.templateVersion === 2,
  )!;

  const vistaV2: CircleActivityView = {
    ...VISTA,
    templateKey: CANDIDATO.templateKey,
    templateVersion: CANDIDATO.templateVersion,
    title: CANDIDATO.title,
    summary: CANDIDATO.summary,
    conversationTurns: CANDIDATO.conversation.turns,
  };

  const propsV2 = {
    ...props,
    initialView: vistaV2,
    fields: CANDIDATO.privatePreparation,
    noConviene: CANDIDATO.safety.doNotSuggestWhen,
    minutosEstimados: CANDIDATO.estimatedMinutes,
    intro: CANDIDATO.intro ?? null,
  };

  it("frames the activity and hides the reasoning behind a disclosure", () => {
    render(<SalaDuo {...propsV2} />);
    expect(
      screen.getByText(/A veces intentamos ayudar de la manera/),
    ).toBeInTheDocument();

    // Closed by default: interesting, and not something anybody has to read.
    const detalle = screen.getByText("¿Por qué hacemos esta actividad?");
    expect(detalle.closest("details")).not.toHaveAttribute("open");
    // …and it says what it is: a perspective, not a clinical explanation.
    expect(document.body.textContent).toMatch(
      /una manera de mirarlo entre varias, no una explicación clínica/i,
    );
  });

  it("asks one question per screen, in order", async () => {
    const user = userEvent.setup();
    render(<SalaDuo {...propsV2} />);
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );

    for (const [i, field] of CANDIDATO.privatePreparation.entries()) {
      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      expect(screen.getByLabelText(field.label)).toBeInTheDocument();
      expect(document.body.textContent).toContain(
        `Paso ${i + 1} de ${CANDIDATO.privatePreparation.length + 1}`,
      );
      await user.click(screen.getByRole("button", { name: /^Continuar$/ }));
    }
  });

  it("lets the first question be skipped without calling it unfinished", async () => {
    const user = userEvent.setup();
    render(<SalaDuo {...propsV2} />);
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );
    expect(CANDIDATO.privatePreparation[0].optional).toBe(true);
    expect(document.body.textContent).toMatch(/puedes dejarlo en blanco/i);
    // Continuing with nothing typed is not blocked.
    expect(screen.getByRole("button", { name: /^Continuar$/ })).toBeEnabled();
  });

  it("never shares the context by having been typed", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(<SalaDuo {...propsV2} />);
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );

    // Something in the optional first question, something in the second.
    await user.type(screen.getByRole("textbox"), "un momento cualquiera");
    await user.click(screen.getByRole("button", { name: /^Continuar$/ }));
    await user.type(screen.getByRole("textbox"), "que me preguntes primero");
    await user.click(screen.getByRole("button", { name: /^Continuar$/ }));
    await user.click(screen.getByRole("button", { name: /^Continuar$/ }));

    // On the sharing step: the optional one starts UNCHECKED.
    const contexto = screen.getByLabelText(
      CANDIDATO.privatePreparation[0].label,
    );
    const ayuda = screen.getByLabelText(CANDIDATO.privatePreparation[1].label);
    expect(contexto).not.toBeChecked();
    expect(ayuda).toBeChecked();

    void onPreview;
  });

  it("carries prepared help on every question, and asks nothing of the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(<SalaDuo {...propsV2} />);
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );
    fetchSpy.mockClear();

    for (const field of CANDIDATO.privatePreparation) {
      expect(field.help).toBeDefined();
      await user.click(
        screen.getByRole("button", { name: /una ayuda de echo/i }),
      );
      // Two pieces, reachable from each other, and neither is a request.
      expect(screen.getByText(field.help!.explanation)).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: /muéstrame un ejemplo/i }),
      );
      expect(screen.getByText(field.help!.example)).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: /volver a mi respuesta/i }),
      );
      await user.click(screen.getByRole("button", { name: /^Continuar$/ }));
    }

    // ECHO_MODEL_CALLS=0, and not by inspection: nothing was requested at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("says what the help is, and does not pretend to be present", async () => {
    const user = userEvent.setup();
    render(<SalaDuo {...propsV2} />);
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /una ayuda de echo/i }),
    );
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/orientación preparada para esta actividad/i);
    expect(text).not.toMatch(/estoy pensando|escribiendo…|analizando/i);
    // No box inviting a question nothing here can answer.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("gives people the first sentence of the conversation", () => {
    expect(CANDIDATO.conversation.turns).toEqual([
      "Lo que entiendo que te ayuda es… ¿te entendí bien?",
      "Esto podría intentarlo. Esto otro me cuesta…",
      "La próxima vez podemos probar…",
    ]);
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CircleActivityView } from "@psico/types";
import { PRODUCTION_CIRCLE_TEMPLATES } from "@psico/types";

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

  it("asks both questions, with their exact labels", async () => {
    await entrar();
    for (const field of APROBADA.privatePreparation) {
      expect(screen.getByLabelText(field.label)).toBeInTheDocument();
    }
    expect(APROBADA.privatePreparation).toHaveLength(2);
  });

  it("honours each field's own length limit", async () => {
    await entrar();
    for (const field of APROBADA.privatePreparation) {
      const input = screen.getByLabelText(field.label);
      expect(input).toHaveAttribute("maxlength", String(field.maxLength));
    }
  });

  it("offers every allowed way to answer, and no more", async () => {
    await entrar();
    const options = screen
      .getAllByRole("radio")
      .map((r) => (r as HTMLInputElement).value);
    expect(new Set(options)).toEqual(new Set(APROBADA.sharing.allowedModes));
  });

  it("keeps «nothing» as one of them", async () => {
    await entrar();
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

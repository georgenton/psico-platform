import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { CIRCLE_VIEW_FORBIDDEN_KEYS } from "@psico/types";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { SalaDuo } from "./SalaDuo";
import { POLLING_INTERVAL_MS } from "./usePollingActividad";
import {
  ESPERANDO,
  PLANTILLA,
  PREPARANDO,
  REVELADA,
} from "./__fixtures__/actividad";

const base = {
  activityId: "act-1",
  initialError: null,
  fields: PLANTILLA.privatePreparation,
  allowedModes: PLANTILLA.sharing.allowedModes,
  noConviene: PLANTILLA.safety.doNotSuggestWhen,
  minutosEstimados: PLANTILLA.estimatedMinutes,
  isGuest: true,
};

beforeEach(() => {
  replace.mockReset();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
});

afterEach(() => vi.restoreAllMocks());

describe("nothing of the other person exists before the reveal", () => {
  it("keeps counterpart content out of the serialized view while preparing", () => {
    // The payload itself, not the rendering of it: the API's projection is what
    // withholds the other person's words, and this asserts the room is handed a
    // view that genuinely does not contain them.
    const serialized = JSON.stringify(PREPARANDO);
    expect(PREPARANDO.revealed).toBeNull();
    expect(serialized).not.toContain("lo de la otra persona");
    for (const forbidden of CIRCLE_VIEW_FORBIDDEN_KEYS) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it("renders nothing of the counterpart while waiting", () => {
    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    expect(document.body.innerHTML).not.toContain("lo de la otra persona");
    // One bit only: have they finished. Never what, how much, or when.
    expect(JSON.stringify(ESPERANDO.counterpart)).toBe('{"status":"ACCEPTED"}');
  });

  it("carries no readyAt, participantId or ciphertext at any stage", () => {
    for (const view of [PREPARANDO, ESPERANDO, REVELADA]) {
      const s = JSON.stringify(view);
      for (const forbidden of CIRCLE_VIEW_FORBIDDEN_KEYS) {
        expect(s).not.toContain(`"${forbidden}"`);
      }
    }
  });
});

describe("the first confirmation waits; the second reveals", () => {
  it("shows the waiting stage once this person is READY", () => {
    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    expect(
      screen.getByRole("heading", { name: /falta la otra persona/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/se abren los dos a la vez/i)).toBeInTheDocument();
  });

  it("announces the wait to assistive technology", () => {
    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    const live = document.querySelector("[aria-live='polite']");
    expect(live?.textContent).toMatch(/esperando a la otra persona/i);
  });

  it("reveals only because the SERVER view says REVEALED", () => {
    render(<SalaDuo {...base} initialView={REVELADA} />);
    expect(screen.getByText("lo de la otra persona")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /lo que compartió la otra persona/i,
      }),
    ).toBeInTheDocument();
  });

  it("moves from waiting to revealed when POLLING returns the new view", async () => {
    // The reveal arrives the way it really does: the next poll comes back with
    // an activity the server has moved to REVEALED. Re-rendering with a new
    // prop would not test this — after mount the room's state comes from the
    // poll, not from its initial prop.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(REVELADA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    expect(screen.queryByText("lo de la otra persona")).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS + 100);

    await waitFor(() =>
      expect(screen.getByText("lo de la otra persona")).toBeInTheDocument(),
    );
    vi.useRealTimers();
  });
});

describe("consent comes before preparation", () => {
  it("asks first and offers a way out in the same breath", () => {
    render(<SalaDuo {...base} initialView={PREPARANDO} />);
    expect(
      screen.getByRole("heading", { name: /antes de empezar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /no quiero hacerla/i }),
    ).toBeInTheDocument();
  });

  it("only shows the private form after the person agrees", async () => {
    const user = userEvent.setup();
    render(<SalaDuo {...base} initialView={PREPARANDO} />);

    expect(screen.queryByLabelText("Algo que quieres decir")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );
    expect(screen.getByLabelText("Algo que quieres decir")).toBeInTheDocument();
  });
});

describe("leaving means withdrawing, not just losing the cookie", () => {
  it("withdraws BEFORE it clears the cookie, and says so honestly", async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/comando")) {
          order.push("withdraw");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (
          url === "/api/circulos/sesion" &&
          (init as RequestInit | undefined)?.method === "DELETE"
        ) {
          order.push("delete-cookie");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify(ESPERANDO), { status: 200 });
      });

    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    await user.click(
      screen.getByRole("button", { name: /retirarme de la actividad/i }),
    );

    await waitFor(() => expect(order).toContain("delete-cookie"));
    // Deleting the cookie alone used to BE the exit, and it was a lie the
    // screen told: the seat stayed ACCEPTED, the guest session stayed valid in
    // PostgreSQL, and the other person waited forever while this screen said
    // somebody had left. The withdrawal is what changes the aggregate, so it
    // goes first — and the cookie is cleared only because it succeeded.
    expect(order).toEqual(["withdraw", "delete-cookie"]);

    const withdrawCall = fetchSpy.mock.calls.find(([u]) =>
      String(u).includes("/comando"),
    );
    expect(
      JSON.parse(String((withdrawCall![1] as RequestInit).body)).kind,
    ).toBe("withdraw");

    expect(
      await screen.findByRole("heading", {
        name: /te retiraste de esta actividad/i,
      }),
    ).toBeInTheDocument();
  });

  it("keeps cookie, screen and access when the withdrawal fails", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/comando")) {
        calls.push("withdraw");
        return new Response(
          JSON.stringify({ ok: false, code: "CIRCLE_UNAVAILABLE" }),
          { status: 503 },
        );
      }
      if ((init as RequestInit | undefined)?.method === "DELETE") {
        calls.push("delete-cookie");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(ESPERANDO), { status: 200 });
    });

    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    await user.click(
      screen.getByRole("button", { name: /retirarme de la actividad/i }),
    );

    await screen.findByRole("alert");
    // Nothing was cleared. The person still has access to the room they failed
    // to leave, and can try again under the same idempotency key.
    expect(calls).toEqual(["withdraw"]);
    expect(screen.queryByRole("heading", { name: /te retiraste/i })).toBeNull();
    expect(
      screen.getByRole("heading", { name: /falta la otra persona/i }),
    ).toBeInTheDocument();
  });

  it("keeps an exit visible at every non-terminal stage", () => {
    render(<SalaDuo {...base} initialView={REVELADA} />);
    expect(
      screen.getByRole("button", { name: /retirarme de la actividad/i }),
    ).toBeInTheDocument();
  });

  it("tells the truth about coming back", () => {
    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    // The invitation is single-use; it was spent on the way in. Telling
    // somebody to "volver con el mismo enlace" sends them to a link that can
    // only fail.
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/dirección de esta sala/i);
    expect(text).toMatch(/una sola vez/i);
    expect(text).not.toMatch(/volver con el mismo enlace/i);
  });
});

describe("errors stay opaque", () => {
  it("does not invent a cause the server did not give", () => {
    render(
      <SalaDuo
        {...base}
        initialView={null}
        initialError="CIRCLE_INVITATION_UNUSABLE"
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/ya no sirve/i);
    expect(alert.textContent ?? "").not.toMatch(/caduc|revocad|usad[oa] ya/i);
  });
});

describe("the door of the room does not accept a press it cannot act on", () => {
  // Observed on the hosted Web: the consent markup arrives from the server and
  // is visible well before the JavaScript that gives its buttons meaning. A
  // press in that window used to be swallowed in silence — the person saw a
  // ready button, pressed it, and stayed exactly where they were.
  it("renders the consent controls disabled in the SERVER's markup", () => {
    const html = renderToString(<SalaDuo {...base} initialView={PREPARANDO} />);
    expect(html).toContain("Entiendo, empezar");
    // Both controls in the stage: one changes the screen, the other sends a
    // withdrawal. Neither can do its job before hydration.
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) expect(button).toContain("disabled");
  });

  it("enables them once hydrated, and then the press advances the stage", async () => {
    const user = userEvent.setup();
    render(<SalaDuo {...base} initialView={PREPARANDO} />);
    const start = screen.getByRole("button", { name: /entiendo, empezar/i });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    expect(
      screen.getByRole("heading", { name: /tu preparación/i }),
    ).toBeInTheDocument();
  });
});

describe("every way out says what happened and what to do", () => {
  // §D of the closing round: an exit that names no action is a dead end, and
  // one that guesses at a cause the server kept uniform is a leak.
  // Each call renders on its own: two rooms in one test would leave two alerts
  // on screen and the query would match neither.
  const shownFor = (code: string): string => {
    cleanup();
    render(<SalaDuo {...base} initialView={null} initialError={code} />);
    return screen.getByRole("alert").textContent ?? "";
  };

  it("does not blame the device for a refusal", () => {
    // It used to. A signed-in member whose access token had expired was told
    // their device was the problem, and went looking for a browser fault.
    const text = shownFor("CIRCLE_FORBIDDEN");
    expect(text).not.toMatch(/dispositivo/i);
    expect(text).toMatch(/enlace nuevo/i);
  });

  it("gives the same answer for a dead guest session as for a refusal", () => {
    // Uniform on purpose: which one it was is not a reader's business.
    expect(shownFor("CIRCLE_GUEST_SESSION_INVALID")).toBe(
      shownFor("CIRCLE_FORBIDDEN"),
    );
  });

  it("says a conflict already landed, and how to see it", () => {
    const text = shownFor("CIRCLE_IDEMPOTENCY_CONFLICT");
    expect(text).toMatch(/ya se registró/i);
    expect(text).toMatch(/recarga/i);
  });

  it("says a lost response may or may not have landed, and that retrying is safe", () => {
    // The room keeps the idempotency key for exactly this case, so the honest
    // sentence is "we do not know, and trying again cannot duplicate it".
    const text = shownFor("CIRCLE_UNAVAILABLE");
    expect(text).toMatch(/no pudimos confirmar/i);
    expect(text).toMatch(/no se duplica/i);
  });

  it("tells somebody a finished activity is finished, not that they failed", () => {
    const text = shownFor("CIRCLE_ACTIVITY_UNAVAILABLE");
    expect(text).toMatch(/ya no admite cambios/i);
    expect(text).toMatch(/recarga/i);
  });

  it("never explains why the other person is gone", () => {
    for (const code of [
      "CIRCLE_FORBIDDEN",
      "CIRCLE_GUEST_SESSION_INVALID",
      "CIRCLE_ACTIVITY_UNAVAILABLE",
      "CIRCLE_INVITATION_UNUSABLE",
    ]) {
      expect(shownFor(code)).not.toMatch(/retir|abandon|rechaz|caduc/i);
    }
  });
});

describe("what the room says about a proposal, an agreement and leaving", () => {
  const CON_PROPUESTA = {
    ...REVELADA,
    artifact: {
      artifactId: "art-1",
      version: 2,
      status: "PROPOSED" as const,
      kind: "AGREEMENT" as const,
      body: "probamos una semana",
      confirmedByYou: false,
      confirmationCount: 1,
    },
  };
  const ACORDADA = {
    ...CON_PROPUESTA,
    artifact: {
      ...CON_PROPUESTA.artifact,
      status: "AGREED" as const,
      confirmedByYou: true,
      confirmationCount: 2,
    },
  };

  it("says a proposal missing a confirmation is not an agreement yet", () => {
    // The distinction has consequences the person cannot see from here — an
    // agreement is kept, a draft nobody accepted need not be — so it is said
    // at the moment of confirming rather than buried in a policy page.
    render(<SalaDuo {...base} initialView={CON_PROPUESTA} />);
    const nota = screen.getByText(/no un acuerdo/i);
    expect(nota).toBeInTheDocument();
    expect(nota.textContent).toMatch(/puede reemplazarse o dejar de estar/i);
  });

  it("says an agreement both confirmed is kept", () => {
    render(<SalaDuo {...base} initialView={ACORDADA} />);
    expect(
      screen.getByText(/un acuerdo confirmado por los dos se conserva/i),
    ).toBeInTheDocument();
  });

  it("never blames a person for a draft that may stop being there", () => {
    // A proposal can disappear because its author deleted their account. Saying
    // so would tell one person something private about the other, so the
    // sentence states the effect and stops.
    render(<SalaDuo {...base} initialView={CON_PROPUESTA} />);
    const nota = screen.getByText(/no un acuerdo/i);
    expect(nota.textContent).not.toMatch(
      /cuenta|elimin|borr[óo]|se fue|retir|abandon/i,
    );
  });

  it("separates leaving the activity from closing an account, for a member", () => {
    render(<SalaDuo {...base} isGuest={false} initialView={REVELADA} />);
    const nota = screen.getByText(/retirarte termina esta actividad/i);
    expect(nota.textContent).toMatch(/no elimina tu cuenta/i);
    expect(nota.textContent).toMatch(/se descarta/i);
    expect(nota.textContent).toMatch(/ya ley[óo] se queda/i);
  });

  it("does not offer a guest an account they never had", () => {
    render(<SalaDuo {...base} isGuest initialView={REVELADA} />);
    const nota = screen.getByText(/retirarte termina esta actividad/i);
    expect(nota.textContent).toMatch(/entraste con un enlace/i);
    expect(nota.textContent).not.toMatch(/tu perfil/i);
  });

  it("keeps the way out on screen next to what it costs", () => {
    render(<SalaDuo {...base} initialView={REVELADA} />);
    expect(
      screen.getByRole("button", { name: /retirarme de la actividad/i }),
    ).toBeInTheDocument();
  });
});

describe("the private gate shows the conditions, and claims nothing about them", () => {
  const SEIS = [
    "Hay violencia, amenazas o miedo a la reacción de la otra persona.",
    "Una de las dos depende económica, migratoria o legalmente de la otra.",
    "Hay una relación de autoridad entre ambas: jefatura, docencia, terapia o cuidado.",
    "La invitación la pide un tercero, o una de las dos no eligió participar.",
    "Alguna de las dos está en crisis ahora mismo.",
    "Una de las dos es menor de edad.",
  ];
  const conGate = { ...base, noConviene: SEIS };

  it("shows every condition BEFORE anything can be written", () => {
    render(<SalaDuo {...conGate} initialView={PREPARANDO} />);
    for (const caso of SEIS) {
      expect(screen.getByText(caso)).toBeInTheDocument();
    }
    // The preparation form is not on screen yet: this is read first.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("asks nothing — no question, no answer, no score", () => {
    render(<SalaDuo {...conGate} initialView={PREPARANDO} />);
    // A gate that collected an answer would need an input for it. There is
    // none, and there is nowhere for a verdict about a relationship to be put.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("never announces that the situation was checked or found safe", () => {
    render(<SalaDuo {...conGate} initialView={PREPARANDO} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/segur[ao]s?\s+verificad|situación segura/i);
    expect(text).not.toMatch(/riesgo (bajo|alto|medio)|puntuaci[óo]n/i);
    // It says the opposite, in so many words.
    expect(text).toMatch(/no podemos comprobar nada/i);
  });

  it("offers a way out that needs no reason", () => {
    render(<SalaDuo {...conGate} initialView={PREPARANDO} />);
    expect(
      screen.getByRole("button", { name: /no quiero hacerla/i }),
    ).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/sin dar explicaciones/i);
  });

  it("sends NOTHING while the gate is on screen", async () => {
    const calls = vi.spyOn(globalThis, "fetch");
    calls.mockClear();
    render(<SalaDuo {...conGate} initialView={PREPARANDO} />);
    await userEvent.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );
    // Reading the conditions and deciding to continue is local. The server
    // learns nothing about it — not that it was shown, not that it was passed.
    const bodies = calls.mock.calls.map(([, init]) => init?.body ?? "");
    for (const body of bodies) {
      expect(String(body)).not.toMatch(/noConviene|violencia|autoridad/i);
    }
  });

  it("says nothing at all when the template carries no conditions", () => {
    // `doNotSuggestWhen` is optional copy. An empty list renders no box rather
    // than an empty one with a heading nobody can act on.
    render(<SalaDuo {...base} noConviene={[]} initialView={PREPARANDO} />);
    expect(document.body.textContent).not.toMatch(
      /no ayuda, y puede complicar/i,
    );
  });
});

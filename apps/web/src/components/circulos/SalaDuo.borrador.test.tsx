import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { SalaDuo } from "./SalaDuo";
import { PLANTILLA, PREPARANDO, REVELADA } from "./__fixtures__/actividad";

const base = {
  activityId: "act-1",
  initialError: null,
  fields: PLANTILLA.privatePreparation,
  allowedModes: PLANTILLA.sharing.allowedModes,
  isGuest: true,
};

/** Mock every call the room can make; `comando` answers what the test says. */
function wire(comando: () => Response, view: unknown = PREPARANDO) {
  const bodies: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/comando")) {
      bodies.push(String((init as RequestInit)?.body ?? ""));
      return comando();
    }
    // The polling read. It must keep returning the stage the test is in —
    // a successful command triggers a refresh, and answering with a different
    // stage would navigate the room away mid-assertion.
    return new Response(JSON.stringify(view), { status: 200 });
  });
  return bodies;
}

const okResponse = () =>
  new Response(JSON.stringify({ ok: true }), { status: 200 });
const failResponse = () =>
  new Response(JSON.stringify({ ok: false, code: "CIRCLE_UNAVAILABLE" }), {
    status: 503,
  });

async function startPreparing(user: ReturnType<typeof userEvent.setup>) {
  render(<SalaDuo {...base} initialView={PREPARANDO} />);
  await user.click(screen.getByRole("button", { name: /entiendo, empezar/i }));
}

beforeEach(() => replace.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("the draft survives the preview", () => {
  it("keeps mode and text when the person goes back to edit", async () => {
    const user = userEvent.setup();
    wire(okResponse);
    await startPreparing(user);

    const box = screen.getByLabelText("Algo que quieres decir");
    await user.type(box, "algo que me costó escribir");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );

    // On the preview now.
    expect(
      screen.getByRole("heading", { name: /esto es lo que verá/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /volver a editar/i }));

    // The one moment where losing it is least forgivable: they have just
    // re-read what they wrote and changed their mind.
    expect(screen.getByLabelText("Algo que quieres decir")).toHaveValue(
      "algo que me costó escribir",
    );
  });

  it("keeps the chosen mode across the round trip", async () => {
    const user = userEvent.setup();
    wire(okResponse);
    await startPreparing(user);

    await user.click(screen.getByLabelText(/un resumen escrito por mí/i));
    await user.type(screen.getByLabelText(/en tus palabras/i), "mi resumen");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await user.click(screen.getByRole("button", { name: /volver a editar/i }));

    expect(screen.getByLabelText(/un resumen escrito por mí/i)).toBeChecked();
    expect(screen.getByLabelText(/en tus palabras/i)).toHaveValue("mi resumen");
  });

  it("sends nothing at all across the whole round trip", async () => {
    const user = userEvent.setup();
    const bodies = wire(okResponse);
    await startPreparing(user);

    await user.type(screen.getByLabelText("Algo que quieres decir"), "privado");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await user.click(screen.getByRole("button", { name: /volver a editar/i }));

    expect(bodies).toHaveLength(0);
  });
});

describe("a failed share keeps the draft", () => {
  it("stays on the preview and preserves the text", async () => {
    const user = userEvent.setup();
    wire(failResponse);
    await startPreparing(user);

    await user.type(
      screen.getByLabelText("Algo que quieres decir"),
      "mi texto",
    );
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );

    await screen.findByRole("alert");
    // Still on the preview, with the confirmation intact — not thrown back to
    // an empty form having lost what they wrote.
    expect(
      screen.getByRole("heading", { name: /esto es lo que verá/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /volver a editar/i }));
    expect(screen.getByLabelText("Algo que quieres decir")).toHaveValue(
      "mi texto",
    );
  });

  it("reuses the SAME idempotency key when the identical share is retried", async () => {
    const user = userEvent.setup();
    const bodies = wire(failResponse);
    await startPreparing(user);

    await user.type(
      screen.getByLabelText("Algo que quieres decir"),
      "mi texto",
    );
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );
    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );

    await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(2));
    const keys = bodies.map(
      (b) => (JSON.parse(b) as { idempotencyKey: string }).idempotencyKey,
    );
    // The whole point: a retry is the SAME intention. A fresh key would make
    // the API answer CIRCLE_IDEMPOTENCY_CONFLICT to somebody who merely
    // pressed the button twice on a bad connection.
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("mints a NEW key when the text actually changed", async () => {
    const user = userEvent.setup();
    const bodies = wire(failResponse);
    await startPreparing(user);

    await user.type(screen.getByLabelText("Algo que quieres decir"), "uno");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: /volver a editar/i }));
    await user.type(screen.getByLabelText("Algo que quieres decir"), " y dos");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );

    await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(2));
    const keys = bodies.map(
      (b) => (JSON.parse(b) as { idempotencyKey: string }).idempotencyKey,
    );
    // Different words are a different intention, not a retry.
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe("a failed artifact proposal keeps the text", () => {
  it("does not empty the box when the server refused", async () => {
    const user = userEvent.setup();
    wire(failResponse);
    render(<SalaDuo {...base} initialView={REVELADA} />);

    const box = screen.getByLabelText(/propuesta/i);
    await user.type(box, "nuestro acuerdo");
    await user.click(screen.getByRole("button", { name: /^proponer$/i }));

    await screen.findByRole("alert");
    // The failure most likely to happen here is a dropped connection, where
    // the text never reached anybody. Clearing it destroys the only copy.
    expect(screen.getByLabelText(/propuesta/i)).toHaveValue("nuestro acuerdo");
  });

  it("clears the box only once the server accepted", async () => {
    const user = userEvent.setup();
    wire(okResponse, REVELADA);
    render(<SalaDuo {...base} initialView={REVELADA} />);

    await user.type(screen.getByLabelText(/propuesta/i), "nuestro acuerdo");
    await user.click(screen.getByRole("button", { name: /^proponer$/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/propuesta/i)).toHaveValue(""),
    );
  });

  it("reuses the key when the same proposal is retried", async () => {
    const user = userEvent.setup();
    const bodies = wire(failResponse);
    render(<SalaDuo {...base} initialView={REVELADA} />);

    await user.type(screen.getByLabelText(/propuesta/i), "nuestro acuerdo");
    await user.click(screen.getByRole("button", { name: /^proponer$/i }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: /^proponer$/i }));

    await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(2));
    const keys = bodies.map(
      (b) => (JSON.parse(b) as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
  });
});

describe("every command carries a client-minted v4 key", () => {
  it("sends one on follow-up and on withdraw", async () => {
    const user = userEvent.setup();
    const bodies = wire(okResponse);
    await startPreparing(user);

    await user.click(
      screen.getByRole("button", { name: /salir de esta actividad/i }),
    );

    await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(1));
    const parsed = JSON.parse(bodies[0]!) as {
      kind: string;
      idempotencyKey: string;
    };
    expect(parsed.kind).toBe("withdraw");
    expect(parsed.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("keeps the key nowhere but memory", async () => {
    const user = userEvent.setup();
    wire(failResponse);
    await startPreparing(user);

    await user.type(screen.getByLabelText("Algo que quieres decir"), "x");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );
    await screen.findByRole("alert");

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });
});

describe("the unload warning follows the draft, not the screen", () => {
  function listenerCount(spy: ReturnType<typeof vi.spyOn>) {
    return (spy.mock.calls as unknown as [string][]).filter(
      ([e]) => e === "beforeunload",
    ).length;
  }

  it("is absent while there is nothing to lose", async () => {
    const user = userEvent.setup();
    wire(okResponse);
    const addSpy = vi.spyOn(window, "addEventListener");
    await startPreparing(user);

    expect(listenerCount(addSpy)).toBe(0);
  });

  it("is installed once the person types", async () => {
    const user = userEvent.setup();
    wire(okResponse);
    const addSpy = vi.spyOn(window, "addEventListener");
    await startPreparing(user);

    await user.type(screen.getByLabelText("Algo que quieres decir"), "algo");
    expect(listenerCount(addSpy)).toBeGreaterThan(0);
  });

  it("SURVIVES the move into the preview", async () => {
    // The regression this exists for: the listener lived in the form, and
    // "Ver qué se compartirá" unmounts the form. The warning disappeared at the
    // exact stage where somebody is most likely to think they are done and
    // close the tab — with the draft still unsent.
    const user = userEvent.setup();
    wire(okResponse);
    await startPreparing(user);
    await user.type(screen.getByLabelText("Algo que quieres decir"), "algo");

    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    expect(
      screen.getByRole("heading", { name: /esto es lo que verá/i }),
    ).toBeInTheDocument();

    // Net: still armed. Either it was never removed, or it was re-added.
    expect(
      listenerCount(addSpy) - listenerCount(removeSpy),
    ).toBeGreaterThanOrEqual(0);
    expect(listenerCount(removeSpy)).toBe(0);
  });

  it("survives coming back from the preview", async () => {
    const user = userEvent.setup();
    wire(okResponse);
    await startPreparing(user);
    await user.type(screen.getByLabelText("Algo que quieres decir"), "algo");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );

    const removeSpy = vi.spyOn(window, "removeEventListener");
    await user.click(screen.getByRole("button", { name: /volver a editar/i }));

    expect(
      (removeSpy.mock.calls as unknown as [string][]).filter(
        ([e]) => e === "beforeunload",
      ),
    ).toHaveLength(0);
  });

  it("survives a failed command", async () => {
    const user = userEvent.setup();
    wire(failResponse);
    await startPreparing(user);
    await user.type(screen.getByLabelText("Algo que quieres decir"), "algo");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );

    const removeSpy = vi.spyOn(window, "removeEventListener");
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );
    await screen.findByRole("alert");

    // The draft is still there, so the warning must be too.
    expect(
      (removeSpy.mock.calls as unknown as [string][]).filter(
        ([e]) => e === "beforeunload",
      ),
    ).toHaveLength(0);
  });

  it("is removed once a confirmation has cleared the draft", async () => {
    const user = userEvent.setup();
    wire(okResponse);
    await startPreparing(user);
    await user.type(screen.getByLabelText("Algo que quieres decir"), "algo");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );

    const removeSpy = vi.spyOn(window, "removeEventListener");
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );

    // Nothing left to lose: the text is on the server now.
    await waitFor(() =>
      expect(
        (removeSpy.mock.calls as unknown as [string][]).filter(
          ([e]) => e === "beforeunload",
        ).length,
      ).toBeGreaterThan(0),
    );
  });
});

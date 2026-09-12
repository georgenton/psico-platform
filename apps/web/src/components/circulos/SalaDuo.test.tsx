import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

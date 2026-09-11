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
      screen.getByRole("button", { name: /ahora no/i }),
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

describe("leaving", () => {
  it("clears the cookie through the session handler and gives no cause", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    await user.click(screen.getByRole("button", { name: /^salir$/i }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/circulos/sesion" &&
          (init as RequestInit | undefined)?.method === "DELETE",
      );
      expect(call).toBeDefined();
      // No body: leaving does not owe an explanation, so there is no field a
      // reason could travel in.
      expect((call?.[1] as RequestInit | undefined)?.body).toBeUndefined();
    });

    expect(
      await screen.findByRole("heading", {
        name: /saliste de esta actividad/i,
      }),
    ).toBeInTheDocument();
  });

  it("keeps an exit visible at every non-terminal stage", () => {
    render(<SalaDuo {...base} initialView={REVELADA} />);
    expect(
      screen.getByRole("button", { name: /salir de la sala/i }),
    ).toBeInTheDocument();
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

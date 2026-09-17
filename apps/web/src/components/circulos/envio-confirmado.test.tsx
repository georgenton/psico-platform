import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { SalaDuo } from "./SalaDuo";
import {
  PLANTILLA,
  PREPARANDO,
  REVELADA,
  irACompartir,
} from "./__fixtures__/actividad";

/**
 * Sending your part tells YOU it was sent.
 *
 * ── The report ────────────────────────────────────────────────────────────
 *
 * Two people: an organiser signed in, a guest in a private window. The guest
 * pressed send and saw no confirmation. The result appeared only once the
 * organiser opened the room and answered.
 *
 * ── Why the room behaved that way ─────────────────────────────────────────
 *
 * `command()` fired the refetch without awaiting it and returned. `onConfirm`
 * then cleared the draft and set the local stage back to `prepare`, and the
 * waiting screen was reachable only through a LATER read reporting
 * `you.status === "READY"`. So between the acknowledgement and the next read
 * the sender was looking at an empty preparation form — the same form they had
 * just submitted — with nothing on screen saying their part had gone.
 *
 * On a fast connection the refetch lands in a few hundred milliseconds and the
 * screen is correct by accident. That is why this suite holds the read open:
 * the requirement is not "correct once the read returns", it is "correct
 * without it".
 */

const base = {
  activityId: "act-1",
  initialError: null,
  fields: PLANTILLA.privatePreparation,
  allowedModes: PLANTILLA.sharing.allowedModes,
  noConviene: PLANTILLA.safety.doNotSuggestWhen,
  minutosEstimados: PLANTILLA.estimatedMinutes,
  intro: PLANTILLA.intro ?? null,
  isGuest: true,
};

type Wire = {
  /** Bodies the room POSTed to the command route, in order. */
  readonly comandos: string[];
  /** Let a held-open read answer, with whatever the test wants it to say. */
  release(view?: unknown): void;
};

/**
 * Wire the room's two routes.
 *
 * `read` decides what the ACTIVITY read does: answer immediately, never
 * answer, or answer when the test says so. Nothing else is mocked — the
 * component under test is the real one.
 */
function wire(
  comando: (body: string) => Response,
  read: "immediate" | "held" | "fails" = "immediate",
  view: unknown = PREPARANDO,
): Wire {
  const comandos: string[] = [];
  let releaseRead: ((v: unknown) => void) | null = null;
  const held = new Promise<unknown>((r) => {
    releaseRead = r;
  });

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/comando")) {
      const body = String((init as RequestInit)?.body ?? "");
      comandos.push(body);
      return comando(body);
    }
    if (read === "fails") {
      return new Response(JSON.stringify({ code: "CIRCLE_UNAVAILABLE" }), {
        status: 503,
      });
    }
    if (read === "held") {
      const answered = await held;
      return new Response(JSON.stringify(answered ?? view), { status: 200 });
    }
    return new Response(JSON.stringify(view), { status: 200 });
  });

  return {
    comandos,
    release: (v?: unknown) => releaseRead?.(v),
  };
}

const ok = (status = 201) =>
  new Response(JSON.stringify({ ok: true }), { status });

/** From the consent card to the preview, with something written. */
async function prepararYRevisar(user: ReturnType<typeof userEvent.setup>) {
  render(<SalaDuo {...base} initialView={PREPARANDO} />);
  await user.click(screen.getByRole("button", { name: /entiendo, empezar/i }));
  await irACompartir(user, screen, ["lo que preparé"]);
  await user.click(
    screen.getByRole("button", { name: /ver qué se compartirá/i }),
  );
}

async function enviar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /confirmar y enviar/i }));
}

/** The one sentence the sender must see. */
const enviado = () =>
  screen.findByRole("heading", { name: /tu parte ya quedó enviada/i });

beforeEach(() => replace.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("the acknowledgement does not wait for the next read", () => {
  it("confirms the send while the later read is still in flight", async () => {
    const user = userEvent.setup();
    wire(() => ok(), "held");

    await prepararYRevisar(user);
    await enviar(user);

    // The read has not answered and never will during this assertion. If the
    // confirmation depends on it, there is nothing here to find.
    expect(await enviado()).toBeInTheDocument();
    // And the form they just submitted is gone rather than blank and waiting.
    expect(
      screen.queryByRole("button", { name: /confirmar y enviar/i }),
    ).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("explains the wait and that the page need not stay open", async () => {
    const user = userEvent.setup();
    wire(() => ok(), "held");

    await prepararYRevisar(user);
    await enviar(user);
    await enviado();

    expect(
      screen.getByText(/no necesitas volver a enviarla/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/se abrirá cuando|cuando .* hayan enviado/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no hace falta que dejes esta página abierta/i),
    ).toBeInTheDocument();
  });

  it("keeps the confirmation when the later read FAILS", async () => {
    const user = userEvent.setup();
    wire(() => ok(), "fails");

    await prepararYRevisar(user);
    await enviar(user);

    // The send succeeded; only the refresh did not. Saying otherwise would
    // report a committed act as lost.
    expect(await enviado()).toBeInTheDocument();
    expect(
      screen.getByText(/no pudimos actualizar la sala/i),
    ).toBeInTheDocument();
  });

  it("a stale read does not put the sender back in the form", async () => {
    const user = userEvent.setup();
    const w = wire(() => ok(), "held");

    await prepararYRevisar(user);
    await enviar(user);
    await enviado();

    // A read that was already in flight when the send landed: it describes the
    // room BEFORE the send, and arriving late does not make it true again.
    w.release(PREPARANDO);
    await new Promise((r) => setTimeout(r, 20));

    expect(await enviado()).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirmar y enviar/i }),
    ).toBeNull();
  });

  it("still opens the room when the reveal actually arrives", async () => {
    const user = userEvent.setup();
    const w = wire(() => ok(), "held");

    await prepararYRevisar(user);
    await enviar(user);
    await enviado();

    // The other person answers. The reveal is the SERVER's, and the room
    // follows it — the local acknowledgement never outranks a real state.
    w.release(REVELADA);
    expect(
      await screen.findByRole("heading", {
        name: /lo que compartió la otra persona/i,
      }),
    ).toBeInTheDocument();
    // And the receipt is gone, because the room really did move on.
    expect(screen.queryByText(/tu parte ya quedó enviada/i)).toBeNull();
  });
});

describe("a send that did not succeed is never shown as received", () => {
  it("keeps the draft and shows the error when the POST is refused", async () => {
    const user = userEvent.setup();
    wire(
      () =>
        new Response(
          JSON.stringify({ ok: false, code: "CIRCLE_UNAVAILABLE" }),
          { status: 503 },
        ),
      "held",
    );

    await prepararYRevisar(user);
    await enviar(user);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Still on the preview, with the same thing ready to send again.
    expect(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tu parte ya quedó enviada/i)).toBeNull();
  });

  it("retries a lost response under the SAME key, without duplicating", async () => {
    const user = userEvent.setup();
    let first = true;
    const w = wire(() => {
      if (first) {
        first = false;
        // Committed on the server; the answer never arrived.
        throw new TypeError("network");
      }
      return ok();
    }, "held");

    await prepararYRevisar(user);
    await enviar(user);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await enviar(user);
    expect(await enviado()).toBeInTheDocument();

    expect(w.comandos).toHaveLength(2);
    const keys = w.comandos.map((b) => JSON.parse(b).idempotencyKey);
    // The same INTENTION, so the same key: the server recognises the retry as
    // the act it already performed rather than a second one.
    expect(keys[0]).toBe(keys[1]);
    expect(JSON.parse(w.comandos[0]!).kind).toBe("share");
  });
});

describe("while it is in flight, and for either person", () => {
  it("says «Enviando…» until the server answers", async () => {
    const user = userEvent.setup();
    let answer: ((r: Response) => void) | null = null;
    const slowPost = new Promise<Response>((r) => {
      answer = r;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/comando")) return slowPost;
      return new Response(JSON.stringify(PREPARANDO), { status: 200 });
    });

    await prepararYRevisar(user);
    await user.click(
      screen.getByRole("button", { name: /confirmar y enviar/i }),
    );

    // In flight: the press is visibly doing something. A disabled button with
    // unchanged copy is indistinguishable from one that ignored the press.
    const enviando = await screen.findByRole("button", { name: /enviando…/i });
    expect(enviando).toBeDisabled();

    answer!(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    expect(await enviado()).toBeInTheDocument();
  });

  it("behaves the same for the organiser as for the guest", async () => {
    const user = userEvent.setup();
    wire(() => ok(), "held");

    // The reported case was the guest sending first; the rule is not about
    // who you are. Same assertions, `isGuest: false`.
    render(<SalaDuo {...base} isGuest={false} initialView={PREPARANDO} />);
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );
    await irACompartir(user, screen, ["lo mío"]);
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await enviar(user);

    expect(await enviado()).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirmar y enviar/i }),
    ).toBeNull();
  });
});

describe("an action that ENDED the activity is never «esperando»", () => {
  /** The room as a group that continued with two. */
  const grupoReducido = {
    ...PREPARANDO,
    kind: "GROUP_ADULT" as const,
    requiredParticipants: 6,
    onboarding: {
      policy: "FLEXIBLE" as const,
      capacity: 6,
      accepted: 2,
      group: 2,
      open: false,
      canClose: false,
      roster: [],
    },
  };

  it("a reduced GROUP keeping it private is shown the ending, not a wait", async () => {
    const user = userEvent.setup();
    // The server's own answer: this share ended the activity.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/comando")) {
        return new Response(
          JSON.stringify({ ok: true, result: { cancelled: true } }),
          { status: 201 },
        );
      }
      // Held: the ending must not depend on the read either.
      return new Promise<Response>(() => {});
    });

    render(<SalaDuo {...base} initialView={grupoReducido} />);
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );
    await irACompartir(user, screen, ["algo privado"]);
    await user.click(screen.getByRole("radio", { name: /no compartir/i }));
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await enviar(user);

    // Telling this person to wait for the others would describe a room that
    // no longer exists.
    expect(
      await screen.findByRole("heading", { name: /esta actividad terminó/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tu parte ya quedó enviada/i)).toBeNull();
  });

  it("a DUO keeping it private is an ordinary send, and waits", async () => {
    const user = userEvent.setup();
    // A Dúo's KEEP_PRIVATE shares nothing and ends nothing, so the server
    // does not report a cancellation and the room waits, as it always did.
    wire(() => ok(), "held");

    await prepararYRevisar(user);
    await user.click(screen.getByRole("button", { name: /volver a editar/i }));
    await user.click(screen.getByRole("radio", { name: /no compartir/i }));
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );
    await enviar(user);

    expect(await enviado()).toBeInTheDocument();
    expect(screen.queryByText(/esta actividad terminó/i)).toBeNull();
  });
});

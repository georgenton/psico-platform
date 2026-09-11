import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { EntradaInvitacion } from "./EntradaInvitacion";

const SECRET = "s3cr3t-invitation-token-abcdef0123456789";

function land(hash: string) {
  window.history.replaceState(null, "", `/i${hash}`);
}

/** Routes the three endpoints the page can reach, recording what was called. */
function route(
  overrides: {
    inspect?: () => Response;
    sesion?: () => Response;
    scope?: () => Response;
  } = {},
) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/circulos/inspeccion")) {
      return (
        overrides.inspect?.() ??
        new Response(JSON.stringify({ usable: true }), { status: 200 })
      );
    }
    if (url.includes("/api/circulos/sesion/scope")) {
      return (
        overrides.scope?.() ??
        new Response(JSON.stringify({ activityId: "act-1" }), { status: 200 })
      );
    }
    return (
      overrides.sesion?.() ??
      new Response(JSON.stringify({ ok: true }), { status: 201 })
    );
  });
  return calls;
}

beforeEach(() => {
  replace.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  land("");
});

afterEach(() => vi.restoreAllMocks());

describe("opening a link is not accepting an invitation", () => {
  it("inspects on mount and never calls the exchange by itself", async () => {
    const calls = route();
    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    await screen.findByRole("button", { name: /aceptar invitación/i });

    // The decisive assertion: one call, and it is the one that does NOT spend
    // the invitation. A preview crawler, a link scanner or a second tap must
    // leave it exactly as they found it.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/circulos/inspeccion");
    expect(calls.some((c) => c.endsWith("/api/circulos/sesion"))).toBe(false);
  });

  it("asks for an explicit decision before anything is consumed", async () => {
    route();
    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    expect(
      await screen.findByRole("button", { name: /aceptar invitación/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ahora no/i }),
    ).toBeInTheDocument();
  });

  it("only the accept button reaches the exchange", async () => {
    const user = userEvent.setup();
    const calls = route();
    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    await user.click(
      await screen.findByRole("button", { name: /aceptar invitación/i }),
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/compartir/act-1"),
    );
    expect(
      calls.filter((c) => c.endsWith("/api/circulos/sesion")),
    ).toHaveLength(1);
  });

  it("'Ahora no' leaves without accepting or writing anything", async () => {
    const user = userEvent.setup();
    const calls = route();
    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    await user.click(await screen.findByRole("button", { name: /ahora no/i }));

    expect(replace).toHaveBeenCalledWith("/");
    // Still only the inspection. Zero accepts, zero writes.
    expect(calls).toHaveLength(1);
    expect(calls.some((c) => c.endsWith("/api/circulos/sesion"))).toBe(false);
  });

  it("inspects a typed code too, rather than spending it", async () => {
    const user = userEvent.setup();
    const calls = route();
    render(<EntradaInvitacion />);

    await user.type(
      await screen.findByLabelText(/código de invitación/i),
      "CODE-123",
    );
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await screen.findByRole("button", { name: /aceptar invitación/i });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/circulos/inspeccion");
  });
});

describe("the fragment is gone before anything is sent", () => {
  it("erases the hash from the address bar before the inspection request", async () => {
    let hashAtRequestTime: string | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/inspeccion")) {
        // Sampled at the moment the request is issued — not afterwards, when a
        // cleanup would also look like a pass.
        hashAtRequestTime = window.location.hash;
      }
      return new Response(JSON.stringify({ usable: true }), { status: 200 });
    });

    land(`#${SECRET}`);
    render(<EntradaInvitacion />);
    await screen.findByRole("button", { name: /aceptar invitación/i });

    expect(hashAtRequestTime).toBe("");
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(SECRET);
  });

  it("sends the secret in a POST body, never in the URL", async () => {
    const user = userEvent.setup();
    const seen: { url: string; init?: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      seen.push({ url: String(input), init: init as RequestInit });
      if (String(input).includes("/inspeccion")) {
        return new Response(JSON.stringify({ usable: true }), { status: 200 });
      }
      if (String(input).includes("/scope")) {
        return new Response(JSON.stringify({ activityId: "act-1" }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    });

    land(`#${SECRET}`);
    render(<EntradaInvitacion />);
    await user.click(
      await screen.findByRole("button", { name: /aceptar invitación/i }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalled());

    // A query string is written to access logs, kept in `Referer`, and stored
    // in history. The body is none of those.
    for (const { url } of seen) expect(url).not.toContain(SECRET);

    const bodies = seen.map((c) => String(c.init?.body ?? "")).join("|");
    expect(bodies).toContain(SECRET);
  });

  it("redirects to the room the SERVER named, not to anything the link said", async () => {
    const user = userEvent.setup();
    route({
      scope: () =>
        new Response(JSON.stringify({ activityId: "act-from-server" }), {
          status: 200,
        }),
    });
    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    await user.click(
      await screen.findByRole("button", { name: /aceptar invitación/i }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/compartir/act-from-server"),
    );
  });
});

describe("the token is nowhere durable", () => {
  it("never reaches the DOM, the serialized HTML, or browser storage", async () => {
    const user = userEvent.setup();
    route();
    land(`#${SECRET}`);
    const { container } = render(<EntradaInvitacion />);

    await user.click(
      await screen.findByRole("button", { name: /aceptar invitación/i }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(container.innerHTML).not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(JSON.stringify(window.localStorage)).not.toContain(SECRET);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(SECRET);
    expect(document.cookie).not.toContain(SECRET);
  });

  it("does not put the token in a log line when the exchange fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));

    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    await screen.findByRole("alert");
    for (const spy of [errorSpy, logSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET);
      }
    }
  });
});

describe("a link that no longer works says so, and nothing more", () => {
  it("shows one opaque refusal when the inspection refuses", async () => {
    route({
      inspect: () =>
        new Response(JSON.stringify({ code: "CIRCLE_INVITATION_UNUSABLE" }), {
          status: 404,
        }),
    });
    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    expect(
      await screen.findByRole("heading", { name: /ya no sirve/i }),
    ).toBeInTheDocument();
    // Nothing was consumed on the way to saying so.
    expect(
      screen.queryByRole("button", { name: /aceptar invitación/i }),
    ).toBeNull();
  });

  it("says exactly the same thing whatever the real cause was", async () => {
    // This is the property that matters, and the one a wording check would
    // miss: the copy may LIST the possibilities ("may have expired, may have
    // been used") because listing all of them discloses none. What it must
    // never do is differ between them — a screen that said "expired" for one
    // status and "already used" for another would hand a stranger an oracle
    // the API deliberately refuses to be.
    const texts: string[] = [];
    for (const status of [404, 410, 429, 503]) {
      route({
        inspect: () =>
          new Response(JSON.stringify({ code: "WHATEVER" }), { status }),
      });
      land(`#${SECRET}`);
      const { unmount } = render(<EntradaInvitacion />);
      await screen.findByRole("alert");
      texts.push(document.body.innerText || (document.body.textContent ?? ""));
      unmount();
      vi.restoreAllMocks();
    }
    expect(new Set(texts).size).toBe(1);
  });

  it("offers the manual code form when there is no fragment", async () => {
    render(<EntradaInvitacion />);
    expect(
      await screen.findByLabelText(/código de invitación/i),
    ).toBeInTheDocument();
  });
});

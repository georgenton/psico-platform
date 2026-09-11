import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { EntradaInvitacion } from "./EntradaInvitacion";

const SECRET = "s3cr3t-invitation-token-abcdef0123456789";

function land(hash: string) {
  window.history.replaceState(null, "", `/i${hash}`);
}

beforeEach(() => {
  replace.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  land("");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the fragment is gone before anything is sent", () => {
  it("erases the hash from the address bar before the exchange request", async () => {
    let hashAtRequestTime: string | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/circulos/sesion/scope")) {
        return new Response(JSON.stringify({ activityId: "act-1" }), {
          status: 200,
        });
      }
      // Sampled at the moment the POST is issued — not afterwards, when a
      // cleanup would also look like a pass.
      hashAtRequestTime = window.location.hash;
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    });

    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(hashAtRequestTime).toBe("");
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(SECRET);
  });

  it("sends the secret in a POST body, never in the URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        if (String(input).includes("/scope")) {
          return new Response(JSON.stringify({ activityId: "act-1" }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      });

    land(`#${SECRET}`);
    render(<EntradaInvitacion />);
    await waitFor(() => expect(replace).toHaveBeenCalled());

    const [url, init] = fetchSpy.mock.calls[0]!;
    // A query string is written to access logs, kept in `Referer`, and stored
    // in history. The body is none of those.
    expect(String(url)).toBe("/api/circulos/sesion");
    expect(String(url)).not.toContain(SECRET);
    expect((init as RequestInit).method).toBe("POST");
    expect(String((init as RequestInit).body)).toContain(SECRET);
  });

  it("redirects to the room the SERVER named, not to anything the link said", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/scope")) {
        return new Response(JSON.stringify({ activityId: "act-from-server" }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    });

    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/compartir/act-from-server"),
    );
  });
});

describe("the token is nowhere durable", () => {
  it("never reaches the DOM, the serialized HTML, or browser storage", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/scope")) {
        return new Response(JSON.stringify({ activityId: "act-1" }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    });

    land(`#${SECRET}`);
    const { container } = render(<EntradaInvitacion />);
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
  it("shows one opaque refusal for any failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "CIRCLE_INVITATION_UNUSABLE" }), {
        status: 404,
      }),
    );

    land(`#${SECRET}`);
    render(<EntradaInvitacion />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/ya no sirve/i);
    // No cause is offered: expired, used, revoked and never-existed are one
    // answer upstream and must stay one answer here.
    expect(alert.textContent ?? "").not.toMatch(
      /caduc[oó]|revocad|ya se us[oó] por/i,
    );
  });

  it("offers the manual code form when there is no fragment", async () => {
    render(<EntradaInvitacion />);
    expect(
      await screen.findByLabelText(/código de invitación/i),
    ).toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CrearDuo } from "./CrearDuo";
import { invitationLink, mintInvitationToken } from "@/lib/circulos/invitacion";

/**
 * The organiser's creation, exercised through the real component.
 *
 * `fetch` is the seam. Everything above it — the minting, the single-flight
 * guard, the intention's lifetime — is the code that ships.
 */

const ENDPOINT = "/api/circulos/duo";

interface Call {
  url: string;
  body: {
    payload: {
      templateKey: string;
      templateVersion: number;
      invitationToken: string;
    };
    idempotencyKey: string;
  };
}

let calls: Call[] = [];
let respond: () => Promise<Response>;

function ok(activityId = "act-1"): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ circleId: "cir-1", activityId }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function fail(status: number): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ ok: false, code: "NOPE" }), { status }),
  );
}

beforeEach(() => {
  calls = [];
  respond = ok;
  vi.spyOn(globalThis, "fetch").mockImplementation((async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return respond();
  }) as typeof fetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mount() {
  return render(<CrearDuo templateKey="fixture-duo" templateVersion={1} />);
}

const crear = () => screen.getByRole("button", { name: /Crear Dúo/ });

describe("nothing is created without an explicit act", () => {
  it("1 · mounting the screen creates zero Dúos", async () => {
    mount();
    // Give any stray effect a chance to fire before asserting absence.
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(0);
    expect(crear()).toBeInTheDocument();
  });

  it("2 · one click creates exactly one", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(crear());
    await screen.findByText(/Comparte este enlace/);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ENDPOINT);
  });

  it("3 · a double click still creates exactly one", async () => {
    const user = userEvent.setup();
    // Hold the response open so both clicks land while the first is in flight
    // — the race a state flag would lose.
    let release!: () => void;
    respond = () =>
      new Promise<Response>((resolve) => {
        release = () =>
          resolve(
            new Response(
              JSON.stringify({ circleId: "c", activityId: "act-1" }),
              { status: 201, headers: { "Content-Type": "application/json" } },
            ),
          );
      });
    mount();
    const button = crear();
    await user.click(button);
    await user.click(button);
    release();
    await screen.findByText(/Comparte este enlace/);
    expect(calls).toHaveLength(1);
  });
});

describe("one intention survives its retries", () => {
  it("4 · a retry reuses the same token AND the same idempotency key", async () => {
    const user = userEvent.setup();
    respond = () => fail(500);
    mount();
    await user.click(crear());
    await screen.findByRole("alert");

    respond = ok;
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));
    await screen.findByText(/Comparte este enlace/);

    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.payload.invitationToken).toBe(
      calls[0]!.body.payload.invitationToken,
    );
    expect(calls[1]!.body.idempotencyKey).toBe(calls[0]!.body.idempotencyKey);
  });

  it("11 · a temporary failure keeps the intention and offers a retry", async () => {
    const user = userEvent.setup();
    respond = () => Promise.reject(new Error("network down"));
    mount();
    await user.click(crear());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(
      /vuelve a intentarlo con el mismo enlace/,
    );
    expect(
      screen.getByRole("button", { name: /Reintentar/ }),
    ).toBeInTheDocument();
  });

  it("a definite pre-creation failure starts a NEW intention next time", async () => {
    const user = userEvent.setup();
    respond = () => fail(422);
    mount();
    await user.click(crear());
    await screen.findByRole("alert");

    respond = ok;
    await user.click(crear());
    await screen.findByText(/Comparte este enlace/);

    // 422 means the template was refused before anything was created, so
    // reusing that key would be claiming an intention the server never saw.
    expect(calls[1]!.body.idempotencyKey).not.toBe(
      calls[0]!.body.idempotencyKey,
    );
    expect(calls[1]!.body.payload.invitationToken).not.toBe(
      calls[0]!.body.payload.invitationToken,
    );
  });
});

describe("the token is a real secret, carried in the fragment", () => {
  it("5 · is 256 bits of CSPRNG entropy, base64url, 43 characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const token = mintInvitationToken();
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      seen.add(token);
    }
    expect(seen.size).toBe(200);

    // The bytes come from the CSPRNG, not from anywhere else.
    const spy = vi.fn((array: Uint8Array) => {
      array.fill(7);
      return array;
    });
    const token = mintInvitationToken({
      getRandomValues: spy,
    } as unknown as Crypto);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toHaveLength(32);
    expect(token).toHaveLength(43);
  });

  it("6 · the link puts the token after the # and nowhere else", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(crear());
    await screen.findByText(/Comparte este enlace/);

    const token = calls[0]!.body.payload.invitationToken;
    const link = screen.getByText(new RegExp(`/i#${token}$`));
    const url = new URL(link.textContent!);
    expect(url.hash).toBe(`#${token}`);
    expect(url.pathname).toBe("/i");
    expect(url.search).toBe("");
  });

  it("7 · the token never reaches a path, a query, storage or a log", async () => {
    const logs: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
    }
    const user = userEvent.setup();
    mount();
    await user.click(crear());
    await screen.findByText(/Comparte este enlace/);
    const token = calls[0]!.body.payload.invitationToken;

    // Not in the request line — only in the JSON body over TLS.
    expect(calls[0]!.url).not.toContain(token);
    // Not in any log this flow produced.
    for (const line of logs) expect(line).not.toContain(token);
    // Not in browser storage, by any route.
    expect(window.localStorage.getItem("token")).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain(token);
    // Not in this page's own address.
    expect(window.location.href).not.toContain(token);
  });

  it("builds the link from the origin, stripping a trailing slash", () => {
    expect(invitationLink("https://x.test/", "abc")).toBe(
      "https://x.test/i#abc",
    );
    expect(invitationLink("https://x.test", "abc")).toBe(
      "https://x.test/i#abc",
    );
  });
});

describe("the payload is exactly what the handler accepts", () => {
  it("8 · carries the four permitted values and no others", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(crear());
    await screen.findByText(/Comparte este enlace/);

    const body = calls[0]!.body;
    expect(Object.keys(body).sort()).toEqual(["idempotencyKey", "payload"]);
    expect(Object.keys(body.payload).sort()).toEqual([
      "invitationToken",
      "templateKey",
      "templateVersion",
    ]);
    expect(body.payload.templateKey).toBe("fixture-duo");
    expect(body.payload.templateVersion).toBe(1);
    expect(body.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("never sends an identity the browser asserted", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(crear());
    await screen.findByText(/Comparte este enlace/);

    const serialised = JSON.stringify(calls[0]!.body);
    for (const claimed of [
      "userId",
      "participantId",
      "circleId",
      "memberId",
      "role",
      "contentUnitId",
    ]) {
      expect(serialised, claimed).not.toContain(claimed);
    }
  });
});

describe("what success and failure show", () => {
  it("10 · success offers copying the link and entering the room", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(crear());
    await screen.findByText(/Comparte este enlace/);

    expect(
      screen.getByRole("button", { name: /Copiar enlace/ }),
    ).toBeInTheDocument();
    const enter = screen.getByRole("link", { name: /Entrar a la sala/ });
    expect(enter).toHaveAttribute("href", "/compartir/act-1");
    // The one-use nature and the un-recoverable warning are both stated.
    expect(screen.getByText(/una sola vez/)).toBeInTheDocument();
    expect(
      screen.getByText(/no podemos volver a mostrártelo/),
    ).toBeInTheDocument();
  });

  it("confirms a copy where a screen reader will hear it", async () => {
    const user = userEvent.setup();
    // AFTER `setup()`: user-event installs its own clipboard stub, so a spy
    // planted first would be the one it replaced.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    mount();
    await user.click(crear());
    await screen.findByText(/Comparte este enlace/);
    await user.click(screen.getByRole("button", { name: /Copiar enlace/ }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/copiado/i),
    );
    // What reaches the clipboard is the whole link, token included.
    expect(writeText).toHaveBeenCalledOnce();
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toContain(`/i#${calls[0]!.body.payload.invitationToken}`);
  });

  it("names each actionable failure without leaking a cause", async () => {
    const cases: Array<[number, RegExp]> = [
      [401, /sesión ya no está activa/],
      [503, /todavía no está disponible/],
      [422, /ya no está disponible/],
      [409, /Empieza uno nuevo/],
    ];
    for (const [status, copy] of cases) {
      respond = () => fail(status);
      const user = userEvent.setup();
      const view = mount();
      await user.click(crear());
      const alert = await screen.findByRole("alert");
      expect(alert.textContent, String(status)).toMatch(copy);
      // Never the upstream code or status.
      expect(alert.textContent).not.toContain("NOPE");
      expect(alert.textContent).not.toContain(String(status));
      view.unmount();
    }
  });
});

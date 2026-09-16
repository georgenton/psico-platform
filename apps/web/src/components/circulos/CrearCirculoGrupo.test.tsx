import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CrearCirculo } from "./CrearCirculo";

/**
 * Creating a circle of three to six, from the organiser's screen.
 *
 * The suite totals do not prove any of this: every assertion here is about a
 * rule that did not exist while the product had one shape — how many links get
 * minted, what the request says about size, and what the screen refuses to let
 * somebody change once an attempt may already have created something.
 */

interface Capture {
  readonly body: {
    payload: {
      templateKey: string;
      templateVersion: number;
      invitationTokens: string[];
      size?: number;
    };
    idempotencyKey: string;
  };
}

let calls: Capture[] = [];
let respond: () => Response;

beforeEach(() => {
  calls = [];
  respond = () =>
    new Response(JSON.stringify({ activityId: "act-grupo" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    calls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
    return Promise.resolve(respond());
  }) as typeof fetch);
  // jsdom has no clipboard; the copy button is not what these tests are about.
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText: () => Promise.resolve() },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const grupo = (sizes: readonly number[] = [3, 4, 5, 6]) =>
  render(
    <CrearCirculo
      templateKey="fixture-grupo"
      templateVersion={1}
      sizes={sizes}
    />,
  );

const crear = () => screen.getByRole("button", { name: /Crear el círculo/ });

describe("the size the template admits is the size the screen offers", () => {
  it("offers exactly three, four, five and six — no two, no seven", async () => {
    grupo();
    const options = screen.getAllByRole("radio");
    expect(options.map((o) => (o as HTMLInputElement).value)).toEqual([
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("renders no size control at all for a Dúo", () => {
    render(
      <CrearCirculo
        templateKey="fixture-duo"
        templateVersion={1}
        sizes={[2]}
      />,
    );
    // A control with one option is not a choice, it is a decision pretending
    // to be one.
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Crear Dúo/ })).toBeVisible();
  });

  it("defaults to the smallest size the template admits", async () => {
    grupo();
    const user = userEvent.setup();
    await user.click(crear());
    expect(calls[0]!.body.payload.size).toBe(3);
  });
});

describe("one secret per seat that is not the organiser's", () => {
  it.each([
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 5],
  ])("mints N−1 links for a group of %i", async (size, links) => {
    grupo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: `${size} personas` }));
    await user.click(crear());

    const sent = calls[0]!.body.payload;
    expect(sent.size).toBe(size);
    expect(sent.invitationTokens).toHaveLength(links);
    // Distinct, and each one 256 bits of base64url. One secret reused would be
    // one link into two seats.
    expect(new Set(sent.invitationTokens).size).toBe(links);
    for (const token of sent.invitationTokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("shows one labelled link per seat, and labels them stably", async () => {
    grupo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "4 personas" }));
    await user.click(crear());

    await screen.findByText(/Comparte un enlace con cada persona/);
    for (const label of [
      "Participante 2",
      "Participante 3",
      "Participante 4",
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.queryByText("Participante 5")).toBeNull();
    // Three different links, never the same one three times.
    const shown = screen
      .getAllByText(/\/i#/)
      .map((node) => node.textContent ?? "");
    expect(shown).toHaveLength(3);
    expect(new Set(shown).size).toBe(3);
  });

  it("says which link was copied, not merely that one was", async () => {
    // Five buttons all announcing "copied" is how the same link reaches two
    // people.
    grupo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "3 personas" }));
    await user.click(crear());
    await screen.findByText(/Comparte un enlace con cada persona/);

    await user.click(
      screen.getByRole("button", {
        name: /Copiar el enlace de Participante 3/,
      }),
    );
    expect(
      await screen.findByText(/Enlace de Participante 3 copiado/),
    ).toBeVisible();
  });
});

describe("the size is part of the intention, not a live control", () => {
  it("locks the size once an attempt may have created something", async () => {
    respond = () => new Response("", { status: 502 });
    grupo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "5 personas" }));
    await user.click(crear());
    await screen.findByRole("alert");

    // A 502 could have landed. Retrying as a different size under the same key
    // is a conflict at the API, so the screen does not offer it.
    for (const option of screen.getAllByRole("radio")) {
      expect(option).toBeDisabled();
    }
    expect(screen.getByText(/empieza uno nuevo/i)).toBeVisible();
  });

  it("retries the SAME secrets and the same size after a temporary failure", async () => {
    respond = () => new Response("", { status: 502 });
    grupo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "4 personas" }));
    await user.click(crear());
    await screen.findByRole("alert");

    respond = () =>
      new Response(JSON.stringify({ activityId: "act-grupo" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));
    await screen.findByText(/Comparte un enlace con cada persona/);

    expect(calls).toHaveLength(2);
    // Same key, same secrets, same size: one creation attempted twice, never
    // two groups.
    expect(calls[1]!.body.idempotencyKey).toBe(calls[0]!.body.idempotencyKey);
    expect(calls[1]!.body.payload.invitationTokens).toEqual(
      calls[0]!.body.payload.invitationTokens,
    );
    expect(calls[1]!.body.payload.size).toBe(4);
  });

  it("mints a fresh intention only after a failure that created nothing", async () => {
    respond = () => new Response("", { status: 409 });
    grupo();
    const user = userEvent.setup();
    await user.click(crear());
    await screen.findByRole("alert");

    respond = () =>
      new Response(JSON.stringify({ activityId: "act-grupo" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    await user.click(screen.getByRole("button", { name: /Crear el círculo/ }));
    await screen.findByText(/Comparte un enlace con cada persona/);

    expect(calls[1]!.body.idempotencyKey).not.toBe(
      calls[0]!.body.idempotencyKey,
    );
    expect(calls[1]!.body.payload.invitationTokens).not.toEqual(
      calls[0]!.body.payload.invitationTokens,
    );
  });

  it("creates one group however fast the button is clicked", async () => {
    grupo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "6 personas" }));
    const button = crear();
    await Promise.all([user.click(button), user.click(button)]);
    await screen.findByText(/Comparte un enlace con cada persona/);
    expect(calls).toHaveLength(1);
  });
});

describe("the request says nothing the server did not ask for", () => {
  it("carries the four permitted values and no others", async () => {
    grupo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "5 personas" }));
    await user.click(crear());

    const body = calls[0]!.body;
    expect(Object.keys(body).sort()).toEqual(["idempotencyKey", "payload"]);
    expect(Object.keys(body.payload).sort()).toEqual([
      "invitationTokens",
      "size",
      "templateKey",
      "templateVersion",
    ]);
    const serialised = JSON.stringify(body);
    for (const claimed of [
      "userId",
      "circleId",
      "kind",
      "audience",
      "role",
      "groupsEnabled",
    ]) {
      expect(serialised, claimed).not.toContain(claimed);
    }
  });
});

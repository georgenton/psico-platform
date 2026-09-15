import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { EntradaInvitacion } from "./EntradaInvitacion";

/**
 * The screen shown before "Aceptar invitación".
 *
 * Two things have to hold at once: enough for the decision to be informed, and
 * nothing that identifies a person or names an internal object. A preview that
 * showed an `activityId` would hand somebody holding a guessed link a value to
 * probe; one that showed a full name or an email would tell a stranger who
 * their target is.
 */

const PREVIEW = {
  title: "Una conversación sobre lo que nos cuesta decir",
  summary: "Cada quien se prepara por su lado y después deciden qué compartir.",
  estimatedMinutes: 25,
  inviterFirstName: "Marina",
};

function inspectReturns(preview: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("/inspeccion")) {
      return new Response(JSON.stringify({ usable: true, preview }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  });
}

beforeEach(() => {
  replace.mockReset();
  window.history.replaceState(null, "", "/i#a-secret-token");
});

afterEach(() => vi.restoreAllMocks());

describe("the decision is informed", () => {
  it("says who invites, what it is and how long", async () => {
    inspectReturns(PREVIEW);
    render(<EntradaInvitacion />);

    expect(
      await screen.findByRole("heading", {
        name: /marina te invita a compartir un momento/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(PREVIEW.title)).toBeInTheDocument();
    expect(screen.getByText(PREVIEW.summary)).toBeInTheDocument();
    expect(document.body.textContent).toContain("Unos 25 minutos");
    // Said before anybody has to wonder about it.
    expect(document.body.textContent).toContain(
      "No necesitas crear una cuenta.",
    );
  });

  it("explains the four promises before asking for a decision", async () => {
    inspectReturns(PREVIEW);
    render(<EntradaInvitacion />);
    await screen.findByRole("button", { name: /aceptar invitación/i });

    const text = document.body.textContent ?? "";
    // Private preparation, revealed only when both confirm, the option not to
    // share, and the option to withdraw.
    expect(text).toMatch(/por tu cuenta/i);
    expect(text).toMatch(/a la vez/i);
    expect(text).toMatch(/nada/i);
    expect(text).toMatch(/retirarte/i);
  });

  it("still asks for an explicit click", async () => {
    inspectReturns(PREVIEW);
    render(<EntradaInvitacion />);

    expect(
      await screen.findByRole("button", { name: /aceptar invitación/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ahora no/i }),
    ).toBeInTheDocument();
  });
});

describe("the preview carries nothing it should not", () => {
  it("renders no internal id, roster, state or content", async () => {
    // The server is the authority on what it sends; this asserts the SCREEN
    // cannot render one even when a (hypothetically) over-generous body
    // arrives. Rendering is driven by four named fields, never by spreading.
    inspectReturns({
      ...PREVIEW,
      activityId: "act-LEAK",
      circleId: "cir-LEAK",
      participantId: "par-LEAK",
      templateKey: "tpl-LEAK",
      contentUnitId: "cu-LEAK",
      inviterEmail: "marina@example.com",
      roster: ["Marina", "Otra persona"],
      counterpartAnswer: "algo privado",
    });

    render(<EntradaInvitacion />);
    await screen.findByRole("button", { name: /aceptar invitación/i });

    const html = document.body.innerHTML;
    for (const leak of [
      "act-LEAK",
      "cir-LEAK",
      "par-LEAK",
      "tpl-LEAK",
      "cu-LEAK",
      "marina@example.com",
      "Otra persona",
      "algo privado",
    ]) {
      expect(html, leak).not.toContain(leak);
    }
  });

  it("falls back to generic wording when the body is malformed", async () => {
    // `undefined` in the middle of a sentence is worse than a generic heading.
    inspectReturns({ title: 1, summary: null });
    render(<EntradaInvitacion />);

    expect(
      await screen.findByRole("heading", {
        name: /te invitan a compartir un momento/i,
      }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("undefined");
    // A degraded preview is not a dead invitation: the generic wording still
    // says what it is, how long it takes and that no account is needed.
    expect(document.body.textContent).toContain(
      "Descubran qué les ayuda cuando algo les preocupa.",
    );
    expect(document.body.textContent).toContain(
      "No necesitas crear una cuenta.",
    );
    expect(document.body.textContent).not.toMatch(/ya no sirve/i);
  });

  it("works when the server sends no preview at all", async () => {
    inspectReturns(undefined);
    render(<EntradaInvitacion />);

    expect(
      await screen.findByRole("button", { name: /aceptar invitación/i }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("undefined");
  });
});

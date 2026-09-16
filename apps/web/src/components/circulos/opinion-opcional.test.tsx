import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CIRCLE_FEEDBACK_NOTICE_VERSION,
  CIRCLE_FEEDBACK_TOPICS,
} from "@psico/types";

import { OpinionOpcional } from "./OpinionOpcional";

/**
 * The optional question, and the four ways it must not become mandatory.
 *
 * Nothing pre-selected, nothing sent before somebody says yes, nothing about
 * the activity riding along, and skipping costing nothing. Each of those is a
 * sentence in the notice, so each of them is a test.
 */

const helpOpens = [
  { fieldKey: "que-ayuda", piece: "explanation" as const, opens: 2 },
];

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 202 }),
  );
});
afterEach(() => vi.restoreAllMocks());

const bodies = () =>
  fetchSpy.mock.calls.map(([, init]) =>
    JSON.parse(String((init as RequestInit)?.body ?? "{}")),
  );

describe("it is offered, not assumed", () => {
  it("sends nothing until somebody opens it", async () => {
    render(<OpinionOpcional activityId="act-1" helpOpens={helpOpens} />);
    expect(
      screen.getByRole("button", { name: /sí, respondo dos preguntas/i }),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends nothing at all when declined", async () => {
    const user = userEvent.setup();
    render(<OpinionOpcional activityId="act-1" helpOpens={helpOpens} />);
    await user.click(screen.getByRole("button", { name: /no, gracias/i }));

    expect(fetchSpy).not.toHaveBeenCalled();
    // And the help counters go with it: they travel with this consent or not
    // at all.
    expect(screen.getByText(/sin problema/i)).toBeInTheDocument();
  });

  it("pre-selects no topic and no answer", async () => {
    const user = userEvent.setup();
    render(<OpinionOpcional activityId="act-1" helpOpens={[]} />);
    await user.click(
      screen.getByRole("button", { name: /sí, respondo dos preguntas/i }),
    );

    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
    // The only radio that is checked is the one that means "I said nothing".
    const checked = screen
      .getAllByRole("radio")
      .filter((r) => (r as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName(/prefiero no responder/i);
  });
});

describe("what it may carry, and what it may not", () => {
  it("sends closed keys, the notice version and the counters", async () => {
    const user = userEvent.setup();
    render(<OpinionOpcional activityId="act-1" helpOpens={helpOpens} />);
    await user.click(
      screen.getByRole("button", { name: /sí, respondo dos preguntas/i }),
    );
    await user.click(screen.getByRole("checkbox", { name: /comunicación/i }));
    await user.click(screen.getByRole("radio", { name: /^un poco$/i }));
    await user.click(screen.getByRole("button", { name: /^enviar$/i }));

    const [body] = bodies();
    expect(body.topics).toEqual(["comunicacion"]);
    expect(body.usefulness).toBe("SOME");
    expect(body.noticeVersion).toBe(CIRCLE_FEEDBACK_NOTICE_VERSION);
    expect(body.helpOpens).toEqual(helpOpens);
  });

  it("caps the topics at two, and lets somebody change their mind", async () => {
    const user = userEvent.setup();
    render(<OpinionOpcional activityId="act-1" helpOpens={[]} />);
    await user.click(
      screen.getByRole("button", { name: /sí, respondo dos preguntas/i }),
    );

    const three = CIRCLE_FEEDBACK_TOPICS.slice(0, 3);
    for (const t of three) {
      await user.click(screen.getByRole("checkbox", { name: t.label }));
    }
    // The third did not stick — and the first is still untickable, which a
    // `disabled` attribute would have prevented.
    await user.click(screen.getByRole("checkbox", { name: three[0]!.label }));
    await user.click(screen.getByRole("button", { name: /^enviar$/i }));

    const [body] = bodies();
    expect(body.topics).toHaveLength(1);
    expect(body.topics).toEqual([three[1]!.key]);
  });

  it("treats «prefiero no responder» as an omission, not a category", async () => {
    const user = userEvent.setup();
    render(<OpinionOpcional activityId="act-1" helpOpens={[]} />);
    await user.click(
      screen.getByRole("button", { name: /sí, respondo dos preguntas/i }),
    );
    await user.click(screen.getByRole("button", { name: /^enviar$/i }));

    const [body] = bodies();
    expect(body.topics).toEqual([]);
    expect(body).not.toHaveProperty("usefulness");
  });

  it("offers nowhere to type, so an answer cannot end up here", async () => {
    const user = userEvent.setup();
    render(<OpinionOpcional activityId="act-1" helpOpens={[]} />);
    await user.click(
      screen.getByRole("button", { name: /sí, respondo dos preguntas/i }),
    );
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(document.body.textContent).toMatch(
      /no envía nada de lo que escribiste/i,
    );
  });
});

describe("its failure is its own", () => {
  it("still thanks the person when the request fails", async () => {
    fetchSpy.mockRejectedValue(new Error("collector is down"));
    const user = userEvent.setup();
    render(<OpinionOpcional activityId="act-1" helpOpens={[]} />);
    await user.click(
      screen.getByRole("button", { name: /sí, respondo dos preguntas/i }),
    );
    await user.click(screen.getByRole("button", { name: /^enviar$/i }));

    // No error, no retry prompt, nothing asking somebody to care about our
    // telemetry. The activity was already over.
    expect(await screen.findByText(/gracias por ayudarnos/i)).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

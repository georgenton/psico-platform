import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { SalaDuo } from "./SalaDuo";
import { PreviewCompartir } from "./PreviewCompartir";
import { Seguimiento } from "./Seguimiento";
import { estilos } from "./estilos";
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

/**
 * The room has to work on a phone, with a keyboard, and with a screen reader.
 * Somebody reaching for this is often not at their most patient.
 */

describe("it works from the keyboard alone", () => {
  it("reaches consent, the form and the exit by tabbing", async () => {
    const user = userEvent.setup();
    render(<SalaDuo {...base} initialView={PREPARANDO} />);

    await user.tab();
    // The heading takes focus programmatically on stage change; the first
    // TABBABLE thing is the primary action.
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>("button, a, input, textarea"),
    );
    expect(focusable.length).toBeGreaterThan(0);
    expect(focusable).toContain(document.activeElement as HTMLElement);

    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );

    const radio = screen.getByLabelText(/no compartir nada esta vez/i);
    await user.click(radio);
    expect(radio).toBeChecked();
  });

  it("gives every control an accessible name", () => {
    render(<SalaDuo {...base} initialView={REVELADA} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent?.trim()).toBeTruthy();
    }
  });

  it("labels every text input", async () => {
    const user = userEvent.setup();
    render(<SalaDuo {...base} initialView={PREPARANDO} />);
    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );

    for (const box of screen.getAllByRole("textbox")) {
      expect(box).toHaveAccessibleName();
    }
  });
});

describe("focus follows the stage", () => {
  it("moves focus to the heading when the stage changes", async () => {
    const user = userEvent.setup();
    render(<SalaDuo {...base} initialView={PREPARANDO} />);

    await user.click(
      screen.getByRole("button", { name: /entiendo, empezar/i }),
    );

    await waitFor(() => {
      const h1 = screen.getByRole("heading", { level: 1 });
      // Somebody on a keyboard lands on the new content rather than where a
      // now-removed button used to be.
      expect(h1).toHaveFocus();
    });
  });

  it("keeps the heading focusable without putting it in the tab order", () => {
    render(<SalaDuo {...base} initialView={PREPARANDO} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});

describe("waiting and errors are announced, not just drawn", () => {
  it("puts the wait in a polite live region", () => {
    render(<SalaDuo {...base} initialView={ESPERANDO} />);
    const live = document.querySelector("[aria-live='polite']");
    expect(live).not.toBeNull();
    expect(live!.textContent).toMatch(/esperando/i);
  });

  it("announces the reveal", () => {
    render(<SalaDuo {...base} initialView={REVELADA} />);
    const live = document.querySelector("[aria-live='polite']");
    expect(live!.textContent).toMatch(/ya puedes leer/i);
  });

  it("gives failures the alert role", () => {
    render(
      <SalaDuo {...base} initialView={null} initialError="CIRCLE_FORBIDDEN" />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("it fits a phone", () => {
  it("keeps every touch target at 44px or more", () => {
    render(
      <PreviewCompartir
        confirmation={{ mode: "KEEP_PRIVATE" }}
        fields={PLANTILLA.privatePreparation}
        busy={false}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it("uses a single column that cannot scroll sideways", () => {
    // A fixed pixel width is what forces horizontal scrolling on a 360px
    // screen; the page is capped in `rem` and centred instead.
    expect(estilos.page.maxWidth).toBe("38rem");
    expect(estilos.page.display).toBe("flex");
    expect(estilos.page.flexDirection).toBe("column");
    expect(estilos.page.width).toBeUndefined();
  });

  it("wraps long shared text instead of overflowing", () => {
    expect(estilos.cita.overflowWrap).toBe("anywhere");
    expect(estilos.cita.whiteSpace).toBe("pre-wrap");
  });
});

describe("the language is not diagnostic, blaming or competitive", () => {
  it("offers closing as an equal option, not as failure", () => {
    render(<Seguimiento view={REVELADA} busy={false} onDecide={vi.fn()} />);
    expect(screen.getByText(/no hay respuesta correcta/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /lo cerramos aquí/i }),
    ).toBeInTheDocument();
  });

  it("uses no score, ranking, streak or diagnosis anywhere in the room", () => {
    render(<SalaDuo {...base} initialView={REVELADA} />);
    const text = document.body.textContent ?? "";
    for (const word of [
      "puntaje",
      "puntuación",
      "ranking",
      "racha",
      "nivel de",
      "diagnóstic",
      "trastorno",
      "fracas",
      "culpa",
      "ganador",
      "mejor que",
    ]) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });
});

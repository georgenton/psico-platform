import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  PreparacionPrivada,
  borradorInicial,
  borradorTieneTexto,
  confirmacionDe,
} from "./PreparacionPrivada";
import type { BorradorPrivado } from "./PreparacionPrivada";
import { PLANTILLA } from "./__fixtures__/actividad";

const fields = PLANTILLA.privatePreparation;
const allowedModes = PLANTILLA.sharing.allowedModes;

/**
 * The form is controlled: the draft is owned by `SalaDuo` in production, so a
 * test that let the component own it would be testing a component that no
 * longer exists. This harness plays the owner's part.
 */
function Harness({
  onPreview = vi.fn(),
  onWithdraw = vi.fn(),
}: {
  onPreview?: (c: unknown) => void;
  onWithdraw?: () => void;
}) {
  const [draft, setDraft] = useState<BorradorPrivado>(() =>
    borradorInicial(allowedModes),
  );
  return (
    <PreparacionPrivada
      fields={fields}
      allowedModes={allowedModes}
      draft={draft}
      onDraftChange={setDraft}
      busy={false}
      onPreview={onPreview}
      onWithdraw={onWithdraw}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("the draft never crosses the network", () => {
  it("issues no request at all while the person types", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();

    render(<Harness />);

    await user.type(
      screen.getByLabelText("Algo que quieres decir"),
      "algo muy privado",
    );
    await user.type(screen.getByLabelText("Algo que te costó"), "y otra cosa");

    // No autosave, no draft endpoint, no Server Action, no analytics beacon.
    // Until the preview is confirmed, there is nothing to leak because nothing
    // has been sent.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes nothing to browser storage", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(
      screen.getByLabelText("Algo que quieres decir"),
      "algo muy privado",
    );

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(JSON.stringify(window.localStorage)).not.toContain("privado");
    expect(JSON.stringify(window.sessionStorage)).not.toContain("privado");
  });

  it("hands the confirmation to the preview rather than sending it", async () => {
    const onPreview = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();

    render(<Harness onPreview={onPreview} />);

    await user.type(screen.getByLabelText("Algo que quieres decir"), "hola");
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );

    expect(onPreview).toHaveBeenCalledWith({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "algo", value: "hola" }],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the cost of not storing it is stated, not hidden", () => {
  it("says on screen that reloading loses the draft", () => {
    render(<Harness />);
    expect(screen.getByRole("note")).toHaveTextContent(
      /si recargas o cierras esta página, se pierde/i,
    );
  });

  it("asks the browser to confirm before unloading with text", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(window, "addEventListener");

    render(<Harness />);

    // No listener while the form is untouched — nothing to lose yet.
    expect(
      addSpy.mock.calls.filter(([e]) => e === "beforeunload"),
    ).toHaveLength(0);

    await user.type(screen.getByLabelText("Algo que quieres decir"), "x");

    expect(
      addSpy.mock.calls.filter(([e]) => e === "beforeunload").length,
    ).toBeGreaterThan(0);
  });
});

describe("the draft is a value, so it can be carried across stages", () => {
  it("survives being unmounted and re-rendered from the same value", async () => {
    // Exactly what "Volver a editar" does: the form goes away and comes back.
    // The owner keeps the value, so nothing is lost.
    const user = userEvent.setup();
    let captured: BorradorPrivado = borradorInicial(allowedModes);

    const { unmount } = render(
      <PreparacionPrivada
        fields={fields}
        allowedModes={allowedModes}
        draft={captured}
        onDraftChange={(d) => {
          captured = d;
        }}
        busy={false}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Algo que quieres decir"), "p");
    unmount();

    render(
      <PreparacionPrivada
        fields={fields}
        allowedModes={allowedModes}
        draft={captured}
        onDraftChange={vi.fn()}
        busy={false}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Algo que quieres decir")).toHaveValue("p");
  });

  it("computes the confirmation from the draft alone", () => {
    expect(
      confirmacionDe({ mode: "KEEP_PRIVATE", values: {}, summary: "" }, fields),
    ).toEqual({ mode: "KEEP_PRIVATE" });

    expect(
      confirmacionDe(
        { mode: "EDITED_SUMMARY", values: {}, summary: "  " },
        fields,
      ),
    ).toBeNull();

    expect(
      confirmacionDe(
        { mode: "SELECTED_FIELDS", values: { algo: "x" }, summary: "" },
        fields,
      ),
    ).toEqual({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "algo", value: "x" }],
    });
  });

  it("knows when there is text worth warning about", () => {
    expect(borradorTieneTexto(borradorInicial(allowedModes))).toBe(false);
    expect(
      borradorTieneTexto({
        mode: "SELECTED_FIELDS",
        values: { algo: "   " },
        summary: "",
      }),
    ).toBe(false);
    expect(
      borradorTieneTexto({
        mode: "SELECTED_FIELDS",
        values: { algo: "algo" },
        summary: "",
      }),
    ).toBe(true);
  });
});

describe("not sharing is an answer", () => {
  it("offers KEEP_PRIVATE and asks for no reason", async () => {
    const onPreview = vi.fn();
    const user = userEvent.setup();

    render(<Harness onPreview={onPreview} />);

    await user.click(screen.getByLabelText(/no compartir nada esta vez/i));
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );

    // The variant carries nothing — there is nowhere a reason could be typed.
    expect(onPreview).toHaveBeenCalledWith({ mode: "KEEP_PRIVATE" });
  });

  it("keeps a way out on screen at every moment", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: /salir de esta actividad/i }),
    ).toBeInTheDocument();
  });
});

describe("touch targets", () => {
  it("gives every control at least 44px of height", () => {
    render(<Harness />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.style.minHeight).toBe("44px");
    }
  });
});

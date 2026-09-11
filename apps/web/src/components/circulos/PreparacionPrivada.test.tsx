import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PreparacionPrivada } from "./PreparacionPrivada";
import { PLANTILLA } from "./__fixtures__/actividad";

const props = {
  fields: PLANTILLA.privatePreparation,
  allowedModes: PLANTILLA.sharing.allowedModes,
  busy: false,
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("the draft never crosses the network", () => {
  it("issues no request at all while the person types", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();

    render(
      <PreparacionPrivada
        {...props}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );

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
    render(
      <PreparacionPrivada
        {...props}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );

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

    render(
      <PreparacionPrivada
        {...props}
        onPreview={onPreview}
        onWithdraw={vi.fn()}
      />,
    );

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
    render(
      <PreparacionPrivada
        {...props}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(
      /si recargas o cierras esta página, se pierde/i,
    );
  });

  it("asks the browser to confirm before the page is unloaded with a draft", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(window, "addEventListener");

    render(
      <PreparacionPrivada
        {...props}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );

    // No listener while the form is untouched — nothing to lose yet.
    expect(
      addSpy.mock.calls.filter(([e]) => e === "beforeunload"),
    ).toHaveLength(0);

    await user.type(screen.getByLabelText("Algo que quieres decir"), "x");

    expect(
      addSpy.mock.calls.filter(([e]) => e === "beforeunload").length,
    ).toBeGreaterThan(0);
  });

  it("loses the draft on remount, which is what 'not stored' means", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <PreparacionPrivada
        {...props}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Algo que quieres decir"), "efímero");
    unmount();

    render(
      <PreparacionPrivada
        {...props}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Algo que quieres decir")).toHaveValue("");
  });
});

describe("not sharing is an answer", () => {
  it("offers KEEP_PRIVATE and asks for no reason", async () => {
    const onPreview = vi.fn();
    const user = userEvent.setup();

    render(
      <PreparacionPrivada
        {...props}
        onPreview={onPreview}
        onWithdraw={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText(/no compartir nada esta vez/i));
    await user.click(
      screen.getByRole("button", { name: /ver qué se compartirá/i }),
    );

    // The variant carries nothing — there is nowhere a reason could be typed.
    expect(onPreview).toHaveBeenCalledWith({ mode: "KEEP_PRIVATE" });
  });

  it("keeps a way out on screen at every moment", () => {
    render(
      <PreparacionPrivada
        {...props}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /salir de esta actividad/i }),
    ).toBeInTheDocument();
  });
});

describe("touch targets", () => {
  it("gives every control at least 44px of height", () => {
    render(
      <PreparacionPrivada
        {...props}
        onPreview={vi.fn()}
        onWithdraw={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button.style.minHeight).toBe("44px");
    }
  });
});

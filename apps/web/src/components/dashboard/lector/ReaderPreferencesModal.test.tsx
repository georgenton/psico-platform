import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ReaderPreferencesModal,
  type ReaderPrefs,
} from "./ReaderPreferencesModal";

/**
 * The keyboard half of the Aa sheet.
 *
 * The browser harness (`e2e/reader-header-layers.mjs`) measures this against
 * the real reader, but it is not wired into CI, so the behaviour a regression
 * would silently take away is pinned here too: Escape closes, focus comes
 * back, the keystroke does not travel on to `document` — where the reader's
 * companion dock keeps its own Escape listener — and Tab cannot walk out of
 * the sheet into the chapter behind it.
 */

const PREFS: ReaderPrefs = {
  theme: "system",
  font: "serif",
  fontSize: 18,
  lineHeight: 1.6,
};

/**
 * Every control the sheet owns, in DOM order. `first`/`last` in the component
 * are the two ends of this list, so the wrap assertions below name them
 * instead of counting Tab presses.
 */
const PANEL_CONTROLS = [
  "Cerrar preferencias de lectura",
  "Sistema",
  "Claro",
  "Sepia",
  "Oscuro",
  "Serif",
  "Sans",
] as const;

/**
 * The sheet as the reader meets it: opened from the Aa button, with chapter
 * controls on BOTH sides of it in the DOM.
 *
 * The one after the dialog is what makes the forward assertions mean
 * something. `userEvent.tab()` walks the document, not the dialog, so from
 * the sheet's last control its own destination would be `tras-el-dialogo`.
 * Asserting that focus lands on the × button instead is therefore evidence
 * that the trap ran — not a restatement of DOM order. Position is incidental:
 * the overlay is fixed and paints over both, so the trap has to hold either
 * way.
 */
function renderOpen(onClose = vi.fn(), onChange = vi.fn()) {
  const view = render(
    <>
      <button type="button" aria-label="Preferencias de lectura">
        Aa
      </button>
      <ReaderPreferencesModal
        isOpen
        initial={PREFS}
        onClose={onClose}
        onChange={onChange}
      />
      <button type="button">tras-el-dialogo</button>
    </>,
  );
  return { ...view, onClose, onChange };
}

const dialog = () =>
  screen.getByRole("dialog", { name: "Preferencias de lectura" });

/** The × button: first in DOM order inside the panel, so `first` in the trap. */
const firstControl = () =>
  screen.getByRole("button", { name: "Cerrar preferencias de lectura" });

/** The interlineado slider: last in DOM order, so `last` in the trap. */
const lastControl = () => {
  const sliders = screen.getAllByRole("slider");
  return sliders[sliders.length - 1]!;
};

/** Everything outside the sheet that the keyboard must never reach. */
function backgroundControls(): Element[] {
  return [
    screen.getByRole("button", { name: "Preferencias de lectura" }),
    screen.getByRole("button", { name: "tras-el-dialogo" }),
    document.body,
  ];
}

describe("ReaderPreferencesModal · teclado y foco", () => {
  it("se lleva el foco al abrirse", () => {
    renderOpen();
    const dialog = screen.getByRole("dialog", {
      name: "Preferencias de lectura",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // A dialog that claims modality and leaves the keyboard on the chapter
    // behind it is worse than no dialog.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("Escape lo cierra", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOpen();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape no llega a document, así que no cierra otra capa a la vez", async () => {
    const user = userEvent.setup();
    const onDocumentEscape = vi.fn();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDocumentEscape();
    };
    document.addEventListener("keydown", listener);
    try {
      const { onClose } = renderOpen();
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
      // This is the listener the companion dock installs. One key, one layer.
      expect(onDocumentEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", listener);
    }
  });

  it("devuelve el foco a Aa al cerrarse", () => {
    const trigger = document.createElement("button");
    trigger.setAttribute("aria-label", "Preferencias de lectura");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <ReaderPreferencesModal
        isOpen
        initial={PREFS}
        onClose={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("conserva los cierres que ya existían: el velo y el botón", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOpen();
    await user.click(
      screen.getByRole("button", { name: "Cerrar preferencias de lectura" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("dialog", { name: "Preferencias de lectura" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("no cambia la semántica de guardado: cada ajuste sigue emitiendo onChange", async () => {
    const user = userEvent.setup();
    const { onChange } = renderOpen();
    await user.click(screen.getByRole("button", { name: "Sepia" }));
    expect(onChange).toHaveBeenCalledWith({ ...PREFS, theme: "sepia" });
    await user.click(screen.getByRole("button", { name: "Sans" }));
    // The second call carries the first choice too: the sheet keeps its state.
    expect(onChange).toHaveBeenLastCalledWith({
      ...PREFS,
      theme: "sepia",
      font: "sans",
    });
  });

  it("abrir con el teclado y cerrar con Escape devuelve el foco a Aa", async () => {
    const user = userEvent.setup();

    // The whole round trip, driven only by keys: Tab to Aa, Enter to open,
    // Escape to close. The parent flips `isOpen` the way the reader does, so
    // the sheet really unmounts and the restore path really runs.
    function Reader() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            aria-label="Preferencias de lectura"
            onClick={() => setOpen(true)}
          >
            Aa
          </button>
          <ReaderPreferencesModal
            isOpen={open}
            initial={PREFS}
            onClose={() => setOpen(false)}
            onChange={vi.fn()}
          />
        </>
      );
    }

    render(<Reader />);
    const aa = screen.getByRole("button", { name: "Preferencias de lectura" });

    await user.tab();
    expect(document.activeElement).toBe(aa);
    await user.keyboard("{Enter}");

    const panel = screen.getByRole("dialog", {
      name: "Preferencias de lectura",
    });
    // Opening moved the keyboard into the sheet. That is also what makes a
    // listener on the dialog enough to catch Escape: focus starts inside, Tab
    // cannot leave, and the overlay covers the chapter, so there is no way to
    // be pressing keys at the page while this is open.
    expect(panel.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Preferencias de lectura" }),
    ).toBeNull();
    expect(document.activeElement).toBe(aa);
  });
});

/**
 * Tab and Shift+Tab, pressed for real.
 *
 * `userEvent.tab()` dispatches the keydown the component listens for and then
 * honours `preventDefault()`, so these walk the same path a reader's keyboard
 * does. Nothing here calls `focus()` to pretend a traversal happened: the
 * starting point of every wrap assertion is reached by pressing Tab.
 */
describe("ReaderPreferencesModal · trampa de foco", () => {
  /** Press Tab until `stop` has focus, or give up loudly. */
  async function tabUntil(
    user: ReturnType<typeof userEvent.setup>,
    stop: () => Element,
    limit = 20,
  ) {
    const visited: string[] = [];
    for (let i = 0; i < limit; i += 1) {
      if (document.activeElement === stop()) return visited;
      await user.tab();
      visited.push(describeActive());
    }
    throw new Error(
      `Tab never reached the target. Visited: ${visited.join(" → ")}`,
    );
  }

  const describeActive = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return "<body>";
    const label =
      el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName;
    return `${el.tagName.toLowerCase()}[${label || el.getAttribute("type") || ""}]`;
  };

  it("el foco entra en la hoja y Tab recorre sus controles en orden", async () => {
    const user = userEvent.setup();
    renderOpen();

    // Opening put the keyboard on the panel itself, not on a control.
    expect(document.activeElement).toBe(dialog().firstElementChild);

    for (const name of PANEL_CONTROLS) {
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("button", { name }));
    }
    // …and then the two sliders, which are the tail of the same list.
    await user.tab();
    expect(document.activeElement).toBe(screen.getAllByRole("slider")[0]);
    await user.tab();
    expect(document.activeElement).toBe(lastControl());
  });

  it("Tab en el último control vuelve al primero en vez de salir al capítulo", async () => {
    const user = userEvent.setup();
    renderOpen();

    await tabUntil(user, lastControl);
    expect(document.activeElement).toBe(lastControl());

    await user.tab();

    // Without the trap this would be `tras-el-dialogo`: that button is where
    // the document's own tab order goes next. Landing on × instead is the
    // evidence that the handler ran.
    expect(document.activeElement).toBe(firstControl());
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("Shift+Tab en el primer control va al último en vez de salir al capítulo", async () => {
    const user = userEvent.setup();
    renderOpen();

    await tabUntil(user, firstControl);
    expect(document.activeElement).toBe(firstControl());

    await user.tab({ shift: true });

    // Without the trap this would be the Aa button behind the overlay.
    expect(document.activeElement).toBe(lastControl());
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("Shift+Tab desde el panel recién abierto se queda dentro", async () => {
    const user = userEvent.setup();
    renderOpen();

    // No Tab yet: the keyboard is still on the panel, which is the state the
    // reader is in the instant the sheet opens. Going backwards from here is
    // the easiest way out of a half-built trap.
    expect(document.activeElement).toBe(dialog().firstElementChild);

    await user.tab({ shift: true });

    expect(document.activeElement).toBe(lastControl());
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("muchas pulsaciones, en los dos sentidos, nunca enfocan el fondo", async () => {
    const user = userEvent.setup();
    renderOpen();
    const outside = backgroundControls();
    const trail: string[] = [];

    for (let i = 0; i < 24; i += 1) {
      await user.tab();
      trail.push(describeActive());
      expect(dialog().contains(document.activeElement)).toBe(true);
      for (const el of outside) expect(document.activeElement).not.toBe(el);
    }
    for (let i = 0; i < 24; i += 1) {
      await user.tab({ shift: true });
      trail.push(describeActive());
      expect(dialog().contains(document.activeElement)).toBe(true);
      for (const el of outside) expect(document.activeElement).not.toBe(el);
    }

    // 48 presses over nine controls: both wraps were crossed several times.
    expect(trail).toHaveLength(48);
  });
});

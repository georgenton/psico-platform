import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
 * back, and the keystroke does not travel on to `document`, where the reader's
 * companion dock keeps its own Escape listener.
 */

const PREFS: ReaderPrefs = {
  theme: "system",
  font: "serif",
  fontSize: 18,
  lineHeight: 1.6,
};

/** The sheet as the reader meets it: opened from the Aa button. */
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
    </>,
  );
  return { ...view, onClose, onChange };
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
});
